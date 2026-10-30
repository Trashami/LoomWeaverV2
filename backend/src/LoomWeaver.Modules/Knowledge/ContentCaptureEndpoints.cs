using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Infrastructure.Neo4j;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Knowledge;

public sealed record ContentCaptureRequest(
    string Intent,
    string? TemplateKey,
    string? TargetKind,
    string? TargetKey,
    string Title,
    string? BodyHtml,
    string? BodyText,
    string? Visibility,
    string? SourceRoute,
    string[]? LinkedCompositeKeys);

public static class GraphRelations
{
    // Types mirror reference/adventureGuide/adventure-editor.catalog.json relationships.
    public const string About = "ABOUT";
    public const string Mentions = "MENTIONS";
    public const string Contains = "CONTAINS";
    public const string Reveals = "REVEALS";
    public const string Supports = "SUPPORTS";
    public const string Contradicts = "CONTRADICTS";
    public const string LeadsTo = "LEADS_TO";
    public const string PartOfStory = "PART_OF_STORY";
    public const string Plans = "PLANS";
    public const string OccursAt = "OCCURS_AT";
    public const string HasClue = "HAS_CLUE";
    public const string References = "REFERENCES";

    public static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        About, Mentions, Contains, Reveals, Supports, Contradicts, LeadsTo,
        PartOfStory, Plans, OccursAt, HasClue, References
    };
}

public static class ContentCaptureEndpoints
{
    private static readonly HashSet<string> AllowedVisibility = new(StringComparer.OrdinalIgnoreCase) { "gm", "players", "public" };

    public static RouteGroupBuilder MapContentCaptureEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/campaigns/{campaignId:int}/content-captures", CreateCaptureAsync);
        api.MapGet("/campaigns/{campaignId:int}/content-captures", ListCapturesAsync);
        return api;
    }

    private static async Task<IResult> CreateCaptureAsync(
        int campaignId,
        ContentCaptureRequest req,
        HttpContext context,
        LoomWeaverMySqlRepository mysql,
        LoomWeaverNeo4jService neo4j,
        CancellationToken ct)
    {
        var access = await CampaignAccessResolver.ResolveAsync(context, campaignId, null, ct);
        if (!access.IsMember) return Results.Forbid();

        var title = req.Title?.Trim() ?? string.Empty;
        var intent = req.Intent?.Trim() ?? string.Empty;
        var visibility = string.IsNullOrWhiteSpace(req.Visibility) ? "gm" : req.Visibility.Trim().ToLowerInvariant();

        if (title.Length is < 1 or > 200)
            return Results.BadRequest(new { error = "A title (1-200 characters) is required." });
        if (intent.Length is < 1 or > 40)
            return Results.BadRequest(new { error = "An intent is required." });
        if (!AllowedVisibility.Contains(visibility))
            return Results.BadRequest(new { error = "Visibility must be gm, players, or public." });
        if (visibility == "gm" && !access.IsEffectiveGm)
            return Results.Forbid();

        var bodyHtml = req.BodyHtml ?? string.Empty;
        var bodyText = req.BodyText ?? string.Empty;
        if (bodyHtml.Length > 200_000 || bodyText.Length > 200_000)
            return Results.BadRequest(new { error = "Content is limited to 200,000 characters." });

        var captureKey = $"cap-{Guid.NewGuid():N}";
        var compositeKey = $"{campaignId}:Capture:{captureKey}";
        var neoVis = visibility == "gm" ? "gm" : "players";
        var sourceRoute = string.IsNullOrWhiteSpace(req.SourceRoute) ? "/create" : req.SourceRoute.Trim();
        var targetKey = req.TargetKey?.Trim() ?? string.Empty;
        var links = (req.LinkedCompositeKeys ?? [])
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Select(k => k.Trim())
            .Where(k => k.StartsWith($"{campaignId}:", StringComparison.Ordinal))
            .Distinct()
            .ToList();

        var linkRows = links.Select(k => (Key: k, Relation: GraphRelations.Mentions)).ToList();
        if (!string.IsNullOrWhiteSpace(targetKey) && !linkRows.Any(r => r.Key == targetKey))
        {
            linkRows.Add((Key: targetKey, Relation: GraphRelations.About));
        }

        await using (var db = await mysql.OpenConnectionAsync(ct))
        await using (var tx = await db.BeginTransactionAsync(ct))
        {
            await using (var insert = new MySqlCommand("""
                INSERT INTO lw_content_captures
                  (capture_key, campaign_id, intent, template_key, target_kind, target_key, title,
                   body_html, body_text, visibility, author_username, source_route, payload_json)
                VALUES
                  (@key, @cid, @intent, @template, @tkind, @tkey, @title,
                   @html, @text, @vis, @author, @route, @payload);
                """, db, tx))
            {
                insert.Parameters.AddWithValue("@key", captureKey);
                insert.Parameters.AddWithValue("@cid", campaignId);
                insert.Parameters.AddWithValue("@intent", intent);
                insert.Parameters.AddWithValue("@template", req.TemplateKey?.Trim() ?? string.Empty);
                insert.Parameters.AddWithValue("@tkind", req.TargetKind?.Trim() ?? string.Empty);
                insert.Parameters.AddWithValue("@tkey", targetKey);
                insert.Parameters.AddWithValue("@title", title);
                insert.Parameters.AddWithValue("@html", bodyHtml);
                insert.Parameters.AddWithValue("@text", bodyText);
                insert.Parameters.AddWithValue("@vis", visibility);
                insert.Parameters.AddWithValue("@author", access.Username);
                insert.Parameters.AddWithValue("@route", sourceRoute);
                insert.Parameters.AddWithValue("@payload", JsonSerializer.Serialize(new { req.Intent, req.TemplateKey, req.TargetKind, req.TargetKey, links }));
                await insert.ExecuteNonQueryAsync(ct);
            }

            foreach (var row in linkRows)
            {
                await using var link = new MySqlCommand("""
                    INSERT IGNORE INTO lw_content_capture_links (capture_key, linked_composite_key, relation)
                    VALUES (@key, @linked, @rel);
                    """, db, tx);
                link.Parameters.AddWithValue("@key", captureKey);
                link.Parameters.AddWithValue("@linked", row.Key);
                link.Parameters.AddWithValue("@rel", row.Relation);
                await link.ExecuteNonQueryAsync(ct);
            }

            await tx.CommitAsync(ct);
        }

        // The SQL row is the source of truth. Graph projection is best-effort and reported to the caller.
        var graphProjected = true;
        try
        {
            await neo4j.ProjectCharacterOrNpcNodeAsync(
                campaignId,
                new EntitySummaryDto(
                    compositeKey,
                    campaignId,
                    "Capture",
                    captureKey,
                    title,
                    intent,
                    Truncate(bodyText, 2000),
                    neoVis,
                    "approved",
                    sourceRoute),
                null,
                null,
                ct);

            var relIdx = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            foreach (var row in linkRows)
            {
                var (linkKey, relation) = (row.Key, row.Relation);
                await neo4j.ProjectEntityRelationshipAsync(
                    relIdx++,
                    campaignId,
                    compositeKey,
                    relation,
                    linkKey,
                    neoVis,
                    $"{intent} capture '{title}'",
                    1,
                    null,
                    null,
                    ct);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            graphProjected = false;
        }

        return Results.Ok(new
        {
            captureKey,
            compositeKey,
            intent,
            title,
            visibility,
            linkCount = linkRows.Count,
            graphProjected,
            savedAt = DateTimeOffset.UtcNow
        });
    }

    private static async Task<IResult> ListCapturesAsync(
        int campaignId,
        int? limit,
        HttpContext context,
        LoomWeaverMySqlRepository mysql,
        CancellationToken ct)
    {
        var access = await CampaignAccessResolver.ResolveAsync(context, campaignId, null, ct);
        if (!access.IsMember) return Results.Forbid();

        var take = Math.Clamp(limit ?? 20, 1, 100);
        var rows = new List<object>();
        await using var db = await mysql.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            SELECT capture_key, intent, template_key, target_kind, target_key, title,
                   visibility, author_username, source_route, created_at
            FROM lw_content_captures
            WHERE campaign_id = @cid
              AND (@isGm = 1 OR visibility <> 'gm')
            ORDER BY created_at DESC
            LIMIT @take;
            """, db);
        cmd.Parameters.AddWithValue("@cid", campaignId);
        cmd.Parameters.AddWithValue("@isGm", access.IsEffectiveGm ? 1 : 0);
        cmd.Parameters.AddWithValue("@take", take);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new
            {
                captureKey = reader.GetString(0),
                intent = reader.GetString(1),
                templateKey = reader.GetString(2),
                targetKind = reader.GetString(3),
                targetKey = reader.GetString(4),
                title = reader.GetString(5),
                visibility = reader.GetString(6),
                authorUsername = reader.GetString(7),
                sourceRoute = reader.GetString(8),
                createdAt = reader.GetDateTime(9)
            });
        }

        return Results.Ok(rows);
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max];
}
