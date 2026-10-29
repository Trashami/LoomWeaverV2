using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Characters;

public sealed record StoredCharacter(long Id, long? OwnerUserId, int Revision, CharacterSheetDto Sheet);

/// <summary>Outcome of a locked read-modify-write; <see cref="Updated"/> is null when rejected.</summary>
public sealed record CharacterMutation(CharacterSheetDto? Updated, int StatusCode, string? Error)
{
    public static CharacterMutation Ok(CharacterSheetDto sheet) => new(sheet, 200, null);
    public static CharacterMutation Reject(int statusCode, string error) => new(null, statusCode, error);
}

/// <summary>Typed, campaign-scoped persistence for characters (lw_characters and child tables).</summary>
public static class CharacterStore
{
    private const int DuplicateKeyError = 1062;

    public static async Task<IReadOnlyList<StoredCharacter>> ListAsync(
        LoomWeaverMySqlRepository repo, int campaignId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        return await ReadAsync(db, null, campaignId, null, false, ct);
    }

    public static async Task<StoredCharacter?> CreateAsync(
        LoomWeaverMySqlRepository repo, CharacterSheetDto sheet, long ownerUserId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await using var tx = await db.BeginTransactionAsync(ct);
        long id;
        try
        {
            await using var cmd = new MySqlCommand("""
                INSERT INTO lw_characters
                  (campaign_id, character_key, owner_user_id, name, ancestry, class_name, system_code, level, current_xp,
                   next_level_xp, max_hp, current_hp, armor_class, initiative_bonus, speed_feet, proficiency_bonus)
                VALUES (@c, @k, @o, @n, @a, @cl, @s, @lv, @xp, @nx, @mh, @ch, @ac, @ib, @sp, @pb);
                SELECT LAST_INSERT_ID();
                """, db, tx);
            Bind(cmd, sheet);
            cmd.Parameters.AddWithValue("@o", ownerUserId);
            id = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
        }
        catch (MySqlException ex) when (ex.Number == DuplicateKeyError)
        {
            return null;
        }

        await WriteChildrenAsync(db, tx, id, sheet, ct);
        await tx.CommitAsync(ct);
        return new StoredCharacter(id, ownerUserId, 1, sheet);
    }

    public static async Task<CharacterMutation> MutateAsync(
        LoomWeaverMySqlRepository repo, int campaignId, string characterKey,
        Func<StoredCharacter, CharacterMutation> mutate, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await using var tx = await db.BeginTransactionAsync(ct);
        var current = (await ReadAsync(db, tx, campaignId, characterKey, true, ct)).FirstOrDefault();
        if (current is null)
        {
            return CharacterMutation.Reject(404, $"Character '{characterKey}' not found.");
        }

        var result = mutate(current);
        if (result.Updated is null)
        {
            return result;
        }

        await using (var cmd = new MySqlCommand("""
            UPDATE lw_characters SET name=@n, ancestry=@a, class_name=@cl, system_code=@s, level=@lv, current_xp=@xp,
              next_level_xp=@nx, max_hp=@mh, current_hp=@ch, armor_class=@ac, initiative_bonus=@ib, speed_feet=@sp,
              proficiency_bonus=@pb, revision=revision+1
            WHERE id=@id;
            """, db, tx))
        {
            Bind(cmd, result.Updated);
            cmd.Parameters.AddWithValue("@id", current.Id);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        await WriteChildrenAsync(db, tx, current.Id, result.Updated, ct);
        await tx.CommitAsync(ct);
        return result;
    }

    private static void Bind(MySqlCommand cmd, CharacterSheetDto s)
    {
        cmd.Parameters.AddWithValue("@c", s.CampaignId);
        cmd.Parameters.AddWithValue("@k", s.CharacterKey);
        cmd.Parameters.AddWithValue("@n", s.Name);
        cmd.Parameters.AddWithValue("@a", s.AncestryOrClan);
        cmd.Parameters.AddWithValue("@cl", s.ClassOrArchetype);
        cmd.Parameters.AddWithValue("@s", s.SystemCode);
        cmd.Parameters.AddWithValue("@lv", s.Level);
        cmd.Parameters.AddWithValue("@xp", s.CurrentXp);
        cmd.Parameters.AddWithValue("@nx", s.NextLevelXp);
        cmd.Parameters.AddWithValue("@mh", s.MaxHp);
        cmd.Parameters.AddWithValue("@ch", s.CurrentHp);
        cmd.Parameters.AddWithValue("@ac", s.ArmorClass);
        cmd.Parameters.AddWithValue("@ib", s.InitiativeBonus);
        cmd.Parameters.AddWithValue("@sp", s.SpeedFeet);
        cmd.Parameters.AddWithValue("@pb", s.ProficiencyBonus);
    }

    private static async Task WriteChildrenAsync(
        MySqlConnection db, MySqlTransaction tx, long id, CharacterSheetDto sheet, CancellationToken ct)
    {
        foreach (var table in new[] { "lw_character_abilities", "lw_character_equipment", "lw_character_features" })
        {
            await using var del = new MySqlCommand($"DELETE FROM {table} WHERE character_id=@id;", db, tx);
            del.Parameters.AddWithValue("@id", id);
            await del.ExecuteNonQueryAsync(ct);
        }

        foreach (var a in sheet.Abilities)
        {
            await using var cmd = new MySqlCommand(
                "INSERT INTO lw_character_abilities (character_id, code, label, score) VALUES (@id, @c, @l, @s);", db, tx);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@c", a.Code);
            cmd.Parameters.AddWithValue("@l", a.Label);
            cmd.Parameters.AddWithValue("@s", a.Score);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        var order = 0;
        foreach (var e in sheet.Equipment)
        {
            await using var cmd = new MySqlCommand("""
                INSERT INTO lw_character_equipment
                  (character_id, item_id, name, slot, bonus_summary, ac_bonus, attack_bonus, equipped, sort_order)
                VALUES (@id, @i, @n, @s, @b, @ac, @at, @eq, @o);
                """, db, tx);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@i", e.Id);
            cmd.Parameters.AddWithValue("@n", e.Name);
            cmd.Parameters.AddWithValue("@s", e.Slot);
            cmd.Parameters.AddWithValue("@b", e.BonusSummary);
            cmd.Parameters.AddWithValue("@ac", e.AcBonus);
            cmd.Parameters.AddWithValue("@at", e.AttackBonus);
            cmd.Parameters.AddWithValue("@eq", e.Equipped);
            cmd.Parameters.AddWithValue("@o", order++);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        order = 0;
        foreach (var f in sheet.Features)
        {
            await using var cmd = new MySqlCommand(
                "INSERT INTO lw_character_features (character_id, sort_order, feature_text) VALUES (@id, @o, @t);", db, tx);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@o", order++);
            cmd.Parameters.AddWithValue("@t", f);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private static async Task<IReadOnlyList<StoredCharacter>> ReadAsync(
        MySqlConnection db, MySqlTransaction? tx, int campaignId, string? key, bool forUpdate, CancellationToken ct)
    {
        var keyFilter = key is null ? string.Empty : " AND c.character_key = @k";
        var rows = new List<(long Id, long? Owner, int Rev, CharacterSheetDto Sheet)>();
        await using (var cmd = new MySqlCommand($"""
            SELECT c.id, c.owner_user_id, c.revision, c.character_key, c.name, c.ancestry, c.class_name, c.system_code,
                   c.level, c.current_xp, c.next_level_xp, c.max_hp, c.current_hp, c.armor_class, c.initiative_bonus,
                   c.speed_feet, c.proficiency_bonus
            FROM lw_characters c WHERE c.campaign_id = @c{keyFilter} ORDER BY c.id{(forUpdate ? " FOR UPDATE" : "")};
            """, db, tx))
        {
            cmd.Parameters.AddWithValue("@c", campaignId);
            if (key is not null) cmd.Parameters.AddWithValue("@k", key);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var characterKey = r.GetString(3);
                var sheet = new CharacterSheetDto(
                    $"{campaignId}:Character:{characterKey}", characterKey, campaignId, r.GetString(4), r.GetString(5),
                    r.GetString(6), r.GetString(7), r.GetInt32(8), r.GetInt32(9), r.GetInt32(10),
                    r.GetInt32(9) >= r.GetInt32(10), r.GetInt32(11), r.GetInt32(12), r.GetInt32(13), r.GetInt32(14),
                    r.GetInt32(15), r.GetInt32(16), string.Empty, [], [], []);
                rows.Add((r.GetInt64(0), r.IsDBNull(1) ? null : r.GetInt64(1), r.GetInt32(2), sheet));
            }
        }

        var abilities = new Dictionary<long, List<AbilityScoreDto>>();
        var equipment = new Dictionary<long, List<EquipmentItemDto>>();
        var features = new Dictionary<long, List<string>>();
        await ReadChildAsync(db, tx, "lw_character_abilities", "code, label, score", "code", campaignId, key, ct,
            (id, r) => Add(abilities, id, new AbilityScoreDto(r.GetString(1), r.GetString(2), r.GetInt32(3), 0)));
        await ReadChildAsync(db, tx, "lw_character_equipment",
            "item_id, name, slot, bonus_summary, ac_bonus, attack_bonus, equipped", "sort_order", campaignId, key, ct,
            (id, r) => Add(equipment, id, new EquipmentItemDto(
                r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4), r.GetInt32(5), r.GetInt32(6), r.GetBoolean(7))));
        await ReadChildAsync(db, tx, "lw_character_features", "feature_text", "sort_order", campaignId, key, ct,
            (id, r) => Add(features, id, r.GetString(1)));

        return rows.Select(x => new StoredCharacter(x.Id, x.Owner, x.Rev, x.Sheet with
        {
            Abilities = abilities.GetValueOrDefault(x.Id) ?? [],
            Equipment = equipment.GetValueOrDefault(x.Id) ?? [],
            Features = features.GetValueOrDefault(x.Id) ?? [],
        })).ToList();
    }

    private static async Task ReadChildAsync(
        MySqlConnection db, MySqlTransaction? tx, string table, string columns, string orderBy,
        int campaignId, string? key, CancellationToken ct, Action<long, MySqlDataReader> read)
    {
        var keyFilter = key is null ? string.Empty : " AND c.character_key = @k";
        await using var cmd = new MySqlCommand($"""
            SELECT t.character_id, {string.Join(", ", columns.Split(", ").Select(col => "t." + col))}
            FROM {table} t JOIN lw_characters c ON c.id = t.character_id
            WHERE c.campaign_id = @c{keyFilter} ORDER BY t.character_id, t.{orderBy};
            """, db, tx);
        cmd.Parameters.AddWithValue("@c", campaignId);
        if (key is not null) cmd.Parameters.AddWithValue("@k", key);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            read(r.GetInt64(0), r);
        }
    }

    private static void Add<T>(Dictionary<long, List<T>> map, long id, T value)
    {
        if (!map.TryGetValue(id, out var list))
        {
            map[id] = list = new List<T>();
        }

        list.Add(value);
    }
}
