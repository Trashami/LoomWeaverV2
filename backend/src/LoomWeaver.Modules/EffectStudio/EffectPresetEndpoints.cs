using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Actions;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.EffectStudio;

/// <summary>
/// VTT effect presets built from the campaign effect library (lw_campaign_effects). Documents whose root
/// "visibility" is "gm" are hidden from players. The hardcoded seed is returned only when the library has no rows.
/// </summary>
public static class EffectPresetEndpoints
{
    private const string FallbackPrimary = "#d4a853";
    private const string FallbackSecondary = "#2ed39a";
    private const int MysqlTableMissing = 1146;

    public static void MapEffectPresetEndpoints(this IEndpointRouteBuilder group)
    {
        group.MapGet("/campaigns/{campaignId:int}/effects/presets", async (
            int campaignId, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsMember) return Results.StatusCode(403);

            var (presets, hasLibraryRows) = await LoadPresetsAsync(mysql, campaignId, access.IsEffectiveGm, ct);
            return Results.Ok(hasLibraryRows ? presets : ActionAndEffectEndpoints.SeedEffects());
        });
    }

    private static async Task<(List<EffectTimelinePresetDto> Presets, bool HasLibraryRows)> LoadPresetsAsync(
        LoomWeaverMySqlRepository mysql, int campaignId, bool viewerIsGm, CancellationToken ct)
    {
        var presets = new List<EffectTimelinePresetDto>();
        var rowCount = 0;
        try
        {
            await using var db = await mysql.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand(
                "SELECT document_json FROM lw_campaign_effects WHERE campaign_id = @cid ORDER BY updated_at DESC LIMIT 100", db);
            cmd.Parameters.AddWithValue("@cid", campaignId);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                rowCount++;
                var preset = ParseVisiblePreset(reader.GetString(0), viewerIsGm);
                if (preset is not null) presets.Add(preset);
            }
        }
        catch (MySqlException ex) when (ex.Number == MysqlTableMissing)
        {
            return (presets, false);
        }

        return (presets, rowCount > 0);
    }

    private static EffectTimelinePresetDto? ParseVisiblePreset(string json, bool viewerIsGm)
    {
        try
        {
            using var raw = JsonDocument.Parse(json);
            var root = raw.RootElement;
            if (!viewerIsGm && root.TryGetProperty("visibility", out var visibility)
                && visibility.ValueKind == JsonValueKind.String
                && string.Equals(visibility.GetString(), "gm", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var doc = root.Deserialize<EffectStudioDocumentDto>(new JsonSerializerOptions(JsonSerializerDefaults.Web));
            return doc is null ? null : ToPreset(doc);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static EffectTimelinePresetDto ToPreset(EffectStudioDocumentDto doc)
    {
        var tracks = (doc.Tracks ?? []).OrderBy(t => t.StartTimeSeconds).ToList();
        var props = doc.ActiveProperties;
        var latestEndSeconds = tracks.Count == 0 ? 0 : tracks.Max(t => t.EndTimeSeconds);
        var durationMs = (int)Math.Round(Math.Max(doc.TotalDurationSeconds, latestEndSeconds) * 1000);
        var keyframes = tracks
            .Select(t => $"{(int)Math.Round(t.StartTimeSeconds * 1000)}ms: {t.Label}")
            .ToList();
        var hint = string.Join(' ', new[] { doc.ActiveEmitterId, props?.EmitterType, props?.Shape }
            .Concat(tracks.Select(t => $"{t.TrackType} {t.EmitterId}")));

        return new EffectTimelinePresetDto(
            doc.Id,
            doc.Name,
            TrajectoryFor(hint),
            props?.ColorPrimaryHex ?? FallbackPrimary,
            props?.ColorSecondaryHex ?? FallbackSecondary,
            Math.Max(0, props?.Count ?? props?.EmissionRate ?? 0),
            Math.Max(0, durationMs),
            keyframes);
    }

    private static string TrajectoryFor(string hint)
    {
        var text = hint.ToLowerInvariant();
        if (text.Contains("beam") || text.Contains("column") || text.Contains("pillar")) return "beam";
        if (text.Contains("cone")) return "cone";
        if (text.Contains("sigil") || text.Contains("ring") || text.Contains("rune") || text.Contains("ground") || text.Contains("decal")) return "sigil";
        return "arc";
    }
}
