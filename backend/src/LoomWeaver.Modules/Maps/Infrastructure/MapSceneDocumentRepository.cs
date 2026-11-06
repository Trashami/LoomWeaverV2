using System.Text.Json;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Maps.Infrastructure;

public sealed record StoredMapSceneDocument(int Revision, JsonElement Document, string Visibility = "players");

public sealed record StoredMapSceneSummary(
    string SceneKey,
    string Name,
    int CampaignId,
    int Revision,
    int GridCols,
    int GridRows,
    string? FloorAlbedoUrl,
    string UpdatedBy,
    DateTime UpdatedAt);

public static class MapSceneDocumentRepository
{
    public static async Task<IReadOnlyList<StoredMapSceneSummary>> ListByCampaignAsync(
        LoomWeaverMySqlRepository mysql, int campaignId, CancellationToken ct)
    {
        var list = new List<StoredMapSceneSummary>();
        var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using var db = await mysql.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            SELECT
                scene_key,
                COALESCE(JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.name')), JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.studio.mapTitle')), scene_key) AS map_name,
                campaign_id,
                revision,
                COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.gridCols')) AS UNSIGNED), 50) AS grid_cols,
                COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.gridRows')) AS UNSIGNED), 50) AS grid_rows,
                JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.floorAlbedoUrl')) AS floor_url,
                COALESCE(updated_by, 'GM') AS updated_by,
                updated_at
            FROM lw_battlemap_scenes
            ORDER BY (campaign_id = @c) DESC, updated_at DESC, revision DESC
            LIMIT 50
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var sceneKey = reader.GetString(0);
            if (!seenKeys.Add(sceneKey)) continue;
            var rawName = reader.IsDBNull(1) ? sceneKey : reader.GetString(1);
            var name = string.IsNullOrWhiteSpace(rawName) || rawName == "null" ? sceneKey : rawName;
            var campId = reader.GetInt32(2);
            var rev = reader.GetInt32(3);
            var cols = reader.IsDBNull(4) ? 50 : Convert.ToInt32(reader.GetValue(4));
            var rows = reader.IsDBNull(5) ? 50 : Convert.ToInt32(reader.GetValue(5));
            var floorUrl = reader.IsDBNull(6) ? null : reader.GetString(6);
            if (floorUrl == "null") floorUrl = null;
            var updatedBy = reader.IsDBNull(7) ? "GM" : reader.GetString(7);
            var updatedAt = reader.IsDBNull(8) ? DateTime.UtcNow : reader.GetDateTime(8);
            list.Add(new StoredMapSceneSummary(
                sceneKey,
                name,
                campId,
                rev,
                cols > 0 ? cols : 50,
                rows > 0 ? rows : 50,
                floorUrl,
                updatedBy,
                updatedAt));
        }
        return list;
    }
    public static async Task<StoredMapSceneDocument?> LoadAsync(
        LoomWeaverMySqlRepository mysql, int campaignId, string sceneKey, CancellationToken ct)
    {
        await using var db = await mysql.OpenConnectionAsync(ct);
        await using (var cmd = new MySqlCommand("""
            SELECT revision, document_json, visibility
            FROM lw_battlemap_scenes WHERE campaign_id = @c AND scene_key = @s
            """, db))
        {
            cmd.Parameters.AddWithValue("@c", campaignId);
            cmd.Parameters.AddWithValue("@s", sceneKey);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
            {
                return new StoredMapSceneDocument(reader.GetInt32(0), JsonSerializer.Deserialize<JsonElement>(reader.GetString(1)), reader.GetString(2));
            }
        }

        await using (var fallbackCmd = new MySqlCommand("""
            SELECT revision, document_json, visibility
            FROM lw_battlemap_scenes WHERE scene_key = @s
            ORDER BY updated_at DESC, revision DESC
            LIMIT 1
            """, db))
        {
            fallbackCmd.Parameters.AddWithValue("@s", sceneKey);
            await using var fallbackReader = await fallbackCmd.ExecuteReaderAsync(ct);
            if (await fallbackReader.ReadAsync(ct))
            {
                return new StoredMapSceneDocument(fallbackReader.GetInt32(0), JsonSerializer.Deserialize<JsonElement>(fallbackReader.GetString(1)), fallbackReader.GetString(2));
            }
        }

        return null;
    }

    public static async Task<(string SceneKey, StoredMapSceneDocument Document)?> LoadLatestAsync(
        LoomWeaverMySqlRepository mysql, int campaignId, string? title, CancellationToken ct)
    {
        await using var db = await mysql.OpenConnectionAsync(ct);
        if (!string.IsNullOrWhiteSpace(title))
        {
            await using var byTitle = new MySqlCommand("""
                SELECT scene_key, revision, document_json, visibility
                FROM lw_battlemap_scenes
                WHERE JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.name')) = @t
                   OR JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.studio.mapTitle')) = @t
                ORDER BY (campaign_id = @c) DESC, updated_at DESC, revision DESC
                LIMIT 1
                """, db);
            byTitle.Parameters.AddWithValue("@c", campaignId);
            byTitle.Parameters.AddWithValue("@t", title.Trim());
            await using var r1 = await byTitle.ExecuteReaderAsync(ct);
            if (await r1.ReadAsync(ct))
            {
                return (
                    r1.GetString(0),
                    new StoredMapSceneDocument(r1.GetInt32(1), JsonSerializer.Deserialize<JsonElement>(r1.GetString(2)), r1.GetString(3))
                );
            }
        }

        await using var latest = new MySqlCommand("""
            SELECT scene_key, revision, document_json, visibility
            FROM lw_battlemap_scenes
            ORDER BY (campaign_id = @c) DESC, updated_at DESC, revision DESC
            LIMIT 1
            """, db);
        latest.Parameters.AddWithValue("@c", campaignId);
        await using var r2 = await latest.ExecuteReaderAsync(ct);
        if (await r2.ReadAsync(ct))
        {
            return (
                r2.GetString(0),
                new StoredMapSceneDocument(r2.GetInt32(1), JsonSerializer.Deserialize<JsonElement>(r2.GetString(2)), r2.GetString(3))
            );
        }
        return null;
    }

    public static async Task<int?> SaveAsync(
        LoomWeaverMySqlRepository mysql,
        int campaignId,
        string sceneKey,
        int expectedRevision,
        string documentJson,
        string updatedBy,
        CancellationToken ct)
    {
        await using var db = await mysql.OpenConnectionAsync(ct);
        await using var tx = await db.BeginTransactionAsync(ct);
        await using (var upsert = new MySqlCommand("""
            INSERT INTO lw_battlemap_scenes
                (campaign_id, scene_key, revision, document_json, updated_by)
            VALUES (@c, @s, 1, CAST(@d AS JSON), @u)
            ON DUPLICATE KEY UPDATE
                revision = revision + 1,
                document_json = CAST(@d AS JSON),
                updated_by = @u
            """, db, tx))
        {
            upsert.Parameters.AddWithValue("@c", campaignId);
            upsert.Parameters.AddWithValue("@s", sceneKey);
            upsert.Parameters.AddWithValue("@d", documentJson);
            upsert.Parameters.AddWithValue("@u", updatedBy);
            await upsert.ExecuteNonQueryAsync(ct);
        }

        int nextRevision = 1;
        await using (var revCmd = new MySqlCommand("""
            SELECT revision FROM lw_battlemap_scenes WHERE campaign_id = @c AND scene_key = @s
            """, db, tx))
        {
            revCmd.Parameters.AddWithValue("@c", campaignId);
            revCmd.Parameters.AddWithValue("@s", sceneKey);
            var revObj = await revCmd.ExecuteScalarAsync(ct);
            if (revObj is not null) nextRevision = Convert.ToInt32(revObj);
        }

        await using (var playEvent = new MySqlCommand("""
            INSERT INTO lw_play_events (campaign_id, event_kind, actor_label, summary, payload_json)
            VALUES (@c, 'map_scene_saved', @u, @summary, JSON_OBJECT('sceneKey', @s, 'revision', @r))
            """, db, tx))
        {
            playEvent.Parameters.AddWithValue("@c", campaignId);
            playEvent.Parameters.AddWithValue("@u", updatedBy);
            playEvent.Parameters.AddWithValue("@summary", $"Saved map scene '{sceneKey}' at revision {nextRevision}.");
            playEvent.Parameters.AddWithValue("@s", sceneKey);
            playEvent.Parameters.AddWithValue("@r", nextRevision);
            await playEvent.ExecuteNonQueryAsync(ct);
        }

        await tx.CommitAsync(ct);
        return nextRevision;
    }
}
