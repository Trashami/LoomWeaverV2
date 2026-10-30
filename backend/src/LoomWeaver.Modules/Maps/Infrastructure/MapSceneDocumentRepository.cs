using System.Text.Json;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Maps.Infrastructure;

public sealed record StoredMapSceneDocument(int Revision, JsonElement Document, string Visibility = "players");

public static class MapSceneDocumentRepository
{
    public static async Task<StoredMapSceneDocument?> LoadAsync(
        LoomWeaverMySqlRepository mysql, int campaignId, string sceneKey, CancellationToken ct)
    {
        await using var db = await mysql.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            SELECT revision, document_json, visibility
            FROM lw_battlemap_scenes WHERE campaign_id = @c AND scene_key = @s
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        cmd.Parameters.AddWithValue("@s", sceneKey);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct)
            ? new StoredMapSceneDocument(reader.GetInt32(0), JsonSerializer.Deserialize<JsonElement>(reader.GetString(1)), reader.GetString(2))
            : null;
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
        int nextRevision;
        if (expectedRevision == 0)
        {
            await using var insert = new MySqlCommand("""
                INSERT IGNORE INTO lw_battlemap_scenes
                    (campaign_id, scene_key, revision, document_json, updated_by)
                VALUES (@c, @s, 1, CAST(@d AS JSON), @u)
                """, db, tx);
            insert.Parameters.AddWithValue("@c", campaignId);
            insert.Parameters.AddWithValue("@s", sceneKey);
            insert.Parameters.AddWithValue("@d", documentJson);
            insert.Parameters.AddWithValue("@u", updatedBy);
            if (await insert.ExecuteNonQueryAsync(ct) != 1) return null;
            nextRevision = 1;
        }
        else
        {
            await using var update = new MySqlCommand("""
                UPDATE lw_battlemap_scenes
                SET revision = revision + 1, document_json = CAST(@d AS JSON), updated_by = @u
                WHERE campaign_id = @c AND scene_key = @s AND revision = @r
                """, db, tx);
            update.Parameters.AddWithValue("@d", documentJson);
            update.Parameters.AddWithValue("@u", updatedBy);
            update.Parameters.AddWithValue("@c", campaignId);
            update.Parameters.AddWithValue("@s", sceneKey);
            update.Parameters.AddWithValue("@r", expectedRevision);
            if (await update.ExecuteNonQueryAsync(ct) != 1) return null;
            nextRevision = expectedRevision + 1;
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
