using LoomWeaver.Infrastructure.MySql;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Maps.Features.ModelManifest;

public sealed record ModelVariantDto(string Quality, string Url, long ByteSize);

public sealed record ModelManifestEntryDto(string BaseName, string DisplayName, IReadOnlyList<ModelVariantDto> Variants);

public static class ModelManifestEndpoint
{
    private const string PublicRoot = "/map-assets/";
    private const int MissingTableError = 1146;

    public static void MapModelManifestEndpoints(this IEndpointRouteBuilder group)
    {
        // Only unrestricted models are listed; purchased/locked models need an entitlement-checked route.
        group.MapGet("/maps/assets/model-manifest", async (LoomWeaverMySqlRepository repo, CancellationToken ct) =>
            Results.Ok(new { models = await ReadAsync(repo, ct) }));
    }

    internal static string? ToPublicUrl(string storageRef)
    {
        var path = storageRef.Replace('\\', '/').TrimStart('/');
        if (path.Length == 0 || path.Contains("..", StringComparison.Ordinal) || path.Contains("://", StringComparison.Ordinal))
        {
            return null;
        }

        return PublicRoot + string.Join('/', path.Split('/').Select(Uri.EscapeDataString));
    }

    private static async Task<IReadOnlyList<ModelManifestEntryDto>> ReadAsync(LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var models = new Dictionary<string, (string Display, List<ModelVariantDto> Variants)>(StringComparer.OrdinalIgnoreCase);
        try
        {
            await using var db = await repo.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand("""
                SELECT m.base_name, m.display_name, v.quality, v.storage_ref, v.byte_size
                FROM lw_asset_models m
                JOIN lw_asset_model_variants v ON v.base_name = m.base_name
                WHERE m.entitlement IN ('free', 'included')
                ORDER BY m.base_name, v.quality;
                """, db);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var url = ToPublicUrl(reader.GetString(3));
                if (url is null)
                {
                    continue;
                }

                var baseName = reader.GetString(0);
                if (!models.TryGetValue(baseName, out var entry))
                {
                    entry = (reader.GetString(1), new List<ModelVariantDto>());
                    models[baseName] = entry;
                }

                entry.Variants.Add(new ModelVariantDto(reader.GetString(2), url, reader.GetInt64(4)));
            }
        }
        catch (MySqlException ex) when (ex.Number == MissingTableError)
        {
            // Migration 20261030_asset_model_variants.sql has not been applied yet.
            return Array.Empty<ModelManifestEntryDto>();
        }

        return models.Select(kv => new ModelManifestEntryDto(kv.Key, kv.Value.Display, kv.Value.Variants)).ToList();
    }
}
