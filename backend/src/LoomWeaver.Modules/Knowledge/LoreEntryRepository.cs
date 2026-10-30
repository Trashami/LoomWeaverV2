using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Knowledge;

// lw_lore_entries is the durable lore store. WorldLoreCatalogStore.LoreByCampaign is a read cache hydrated from it.
public static class LoreEntryRepository
{
    private const string DefaultArtwork = "/icrandor_world_dashboard.jpg";

    private sealed record LorePayload(List<string>? Tags, List<string>? LinkedEntityKeys);

    public static async Task Hydrate(LoomWeaverMySqlRepository repo, int campaignId, CancellationToken ct)
    {
        var rows = new List<LoreEntryDto>();
        await using (var db = await repo.OpenConnectionAsync(ct))
        await using (var cmd = new MySqlCommand("""
            SELECT id, composite_key, title, subtitle, category, excerpt, content, artwork_url, visibility, archived,
              created_at, updated_at, payload_json
            FROM lw_lore_entries WHERE campaign_id=@c ORDER BY updated_at DESC
            """, db))
        {
            cmd.Parameters.AddWithValue("@c", campaignId);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var payload = r.IsDBNull(12) ? null : JsonSerializer.Deserialize<LorePayload>(r.GetString(12));
                var created = DateTime.SpecifyKind(r.GetDateTime(10), DateTimeKind.Utc);
                var updated = DateTime.SpecifyKind(r.GetDateTime(11), DateTimeKind.Utc);
                rows.Add(new LoreEntryDto(
                    r.GetString(0),
                    r.GetString(1),
                    campaignId,
                    r.GetString(2),
                    r.GetString(3),
                    r.GetString(4),
                    r.GetString(5),
                    r.GetString(6),
                    r.GetString(7),
                    payload?.Tags ?? [r.GetString(4)],
                    payload?.LinkedEntityKeys ?? [],
                    [],
                    r.GetString(8),
                    r.GetBoolean(9),
                    created.ToString("MMM d, yyyy"),
                    updated.ToString("MMM d, yyyy"),
                    new DateTimeOffset(updated).ToUnixTimeMilliseconds()));
            }
        }

        if (!WorldLoreCatalogStore.LoreByCampaign.TryGetValue(campaignId, out var list))
        {
            list = [];
            WorldLoreCatalogStore.LoreByCampaign[campaignId] = list;
        }

        foreach (var row in rows)
        {
            var idx = list.FindIndex(e => e.Id == row.Id);
            var resolved = idx >= 0 ? list[idx].ResolvedLinks : row.ResolvedLinks;
            var merged = row with { ResolvedLinks = resolved };
            if (idx >= 0) list[idx] = merged;
            else list.Add(merged);
        }

        list.Sort((a, b) => b.UpdatedAtUnixMs.CompareTo(a.UpdatedAtUnixMs));
    }

    /// <summary>Writes the entry to MySQL first, then updates the read cache. Throws if the id belongs to another campaign.</summary>
    public static async Task SaveAsync(LoomWeaverMySqlRepository repo, LoreEntryDto entry, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await using (var owner = new MySqlCommand("SELECT campaign_id FROM lw_lore_entries WHERE id=@id", db))
        {
            owner.Parameters.AddWithValue("@id", entry.Id);
            var existingCampaign = await owner.ExecuteScalarAsync(ct);
            if (existingCampaign is not null && Convert.ToInt32(existingCampaign) != entry.CampaignId)
            {
                throw new InvalidOperationException($"Lore id '{entry.Id}' already belongs to another campaign.");
            }
        }

        var payload = JsonSerializer.Serialize(new LorePayload(entry.Tags.ToList(), entry.LinkedEntityKeys.ToList()));
        await using (var cmd = new MySqlCommand("""
            INSERT INTO lw_lore_entries (id, campaign_id, composite_key, title, subtitle, category, excerpt, content,
              artwork_url, visibility, archived, payload_json)
            VALUES (@id, @cid, @ckey, @title, @sub, @cat, @excerpt, @content, @art, @vis, @arch, @payload)
            ON DUPLICATE KEY UPDATE composite_key=VALUES(composite_key), title=VALUES(title), subtitle=VALUES(subtitle),
              category=VALUES(category), excerpt=VALUES(excerpt), content=VALUES(content), artwork_url=VALUES(artwork_url),
              visibility=VALUES(visibility), archived=VALUES(archived), payload_json=VALUES(payload_json)
            """, db))
        {
            cmd.Parameters.AddWithValue("@id", Clip(entry.Id, 64));
            cmd.Parameters.AddWithValue("@cid", entry.CampaignId);
            cmd.Parameters.AddWithValue("@ckey", Clip(entry.CompositeKey, 160));
            cmd.Parameters.AddWithValue("@title", Clip(entry.Title, 160));
            cmd.Parameters.AddWithValue("@sub", Clip(entry.Subtitle, 200));
            cmd.Parameters.AddWithValue("@cat", Clip(entry.Category, 64));
            cmd.Parameters.AddWithValue("@excerpt", Clip(entry.Excerpt, 500));
            cmd.Parameters.AddWithValue("@content", entry.Content);
            cmd.Parameters.AddWithValue("@art", Clip(string.IsNullOrWhiteSpace(entry.ArtworkUrl) ? DefaultArtwork : entry.ArtworkUrl, 500));
            cmd.Parameters.AddWithValue("@vis", entry.Visibility == "gm" ? "gm" : "players");
            cmd.Parameters.AddWithValue("@arch", entry.Archived);
            cmd.Parameters.AddWithValue("@payload", payload);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        if (!WorldLoreCatalogStore.LoreByCampaign.TryGetValue(entry.CampaignId, out var list))
        {
            list = [];
            WorldLoreCatalogStore.LoreByCampaign[entry.CampaignId] = list;
        }

        var idx = list.FindIndex(e => e.Id == entry.Id);
        if (idx >= 0) list[idx] = entry;
        else list.Insert(0, entry);
    }

    private static string Clip(string value, int max) =>
        value.Length <= max ? value : value[..max];
}
