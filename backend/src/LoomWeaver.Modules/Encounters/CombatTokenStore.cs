using System.Security.Cryptography;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Characters;
using MySqlConnector;

namespace LoomWeaver.Modules.Encounters;

public sealed record CombatOutcome(CombatResolutionResultDto? Result, int StatusCode, string? Error)
{
    public static CombatOutcome Reject(int status, string error) => new(null, status, error);
}

/// <summary>Campaign-scoped combat state. Dice, hit-points and action economy are decided here, never by the client.</summary>
public static class CombatTokenStore
{
    private const string Columns =
        "token_key, name, role_label, faction, initiative, current_hp, max_hp, armor_class, pos_x, pos_z, color_hex, action_used, bonus_used, reaction_used, movement_feet";
    private static readonly int[] AllowedDie = [4, 6, 8, 10, 12, 20];

    public static int Roll(int sides) => RandomNumberGenerator.GetInt32(1, sides + 1);

    public static async Task<IReadOnlyList<VttTokenDto>> ListAsync(
        LoomWeaverMySqlRepository repo, int campaignId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        return await ReadAsync(db, null, campaignId, null, false, ct);
    }

    /// <summary>Lists tokens with CanControl set for the viewer: the GM controls every token, a player only their own character.</summary>
    public static async Task<IReadOnlyList<VttTokenDto>> ListForViewerAsync(
        LoomWeaverMySqlRepository repo, int campaignId, ResolvedCampaignAccess access, CancellationToken ct)
    {
        var tokens = await ListAsync(repo, campaignId, ct);
        if (access.IsAccountGm) return tokens.Select(t => t with { CanControl = true }).ToList();

        var owned = (await CharacterStore.ListAsync(repo, campaignId, ct))
            .Where(c => CharacterStudioEndpoints.IsOwnerOrBound(c, access))
            .Select(c => $"{campaignId}:Character:{c.Sheet.CharacterKey}")
            .ToHashSet(StringComparer.Ordinal);
        return tokens.Select(t => t with { CanControl = owned.Contains(t.Key) }).ToList();
    }

    public static async Task<int> SeedPartyAsync(
        LoomWeaverMySqlRepository repo, int campaignId, CancellationToken ct)
    {
        var characters = await CharacterStore.ListAsync(repo, campaignId, ct);
        await using var db = await repo.OpenConnectionAsync(ct);
        await using var tx = await db.BeginTransactionAsync(ct);
        await using (var clear = new MySqlCommand("DELETE FROM lw_combat_tokens WHERE campaign_id=@c", db, tx))
        {
            clear.Parameters.AddWithValue("@c", campaignId);
            await clear.ExecuteNonQueryAsync(ct);
        }

        var slot = 0;
        foreach (var c in characters.Select(x => x.Sheet))
        {
            var token = new VttTokenDto($"{campaignId}:Character:{c.CharacterKey}", c.Name, $"{c.ClassOrArchetype} · Party", "party",
                Roll(20) + c.InitiativeBonus, c.CurrentHp, c.MaxHp, c.ArmorClass, -6 + slot * 3, 0, "#49e892",
                false, false, false, c.SpeedFeet);
            await InsertAsync(db, tx, campaignId, token, ct);
            slot++;
        }

        await tx.CommitAsync(ct);
        return characters.Count;
    }

    public static async Task<VttTokenDto?> AddHostileAsync(
        LoomWeaverMySqlRepository repo, int campaignId, string name, string roleLabel, int hp, int ac, double x, double z, int speed,
        CancellationToken ct)
    {
        var token = new VttTokenDto($"{campaignId}:Encounter:{Guid.NewGuid():N}"[..40], name, roleLabel, "hostile",
            Roll(20), hp, hp, ac, x, z, "#ef5d72", false, false, false, speed);
        await using var db = await repo.OpenConnectionAsync(ct);
        await InsertAsync(db, null, campaignId, token, ct);
        return token;
    }

    public static async Task<CombatOutcome> AttackAsync(
        LoomWeaverMySqlRepository repo, int campaignId, ResolvedCampaignAccess access, CombatResolutionRequest req, CancellationToken ct)
    {
        if (req.DamageDiceCount is < 0 or > 20 || !AllowedDie.Contains(req.DamageDiceSides) ||
            req.DamageBonus is < -10 or > 50 || req.AttackBonus is < -5 or > 30 || req.RangeFeet is < 0 or > 600)
            return CombatOutcome.Reject(400, "The action values are out of range.");

        var charKey = CharacterKeyOf(req.AttackerKey);
        if (charKey is not null)
        {
            var stored = (await CharacterStore.ListAsync(repo, campaignId, ct)).FirstOrDefault(c => c.Sheet.CharacterKey == charKey);
            if (stored is null) return CombatOutcome.Reject(404, "That character does not exist in this campaign.");
            if (!access.IsAccountGm && !CharacterStudioEndpoints.IsOwnerOrBound(stored, access))
                return CombatOutcome.Reject(403, "You can only act with your own character.");
            req = ApplySheetLimits(req, stored.Sheet);
        }
        else if (!access.IsAccountGm)
        {
            return CombatOutcome.Reject(403, "You can only act with your own character.");
        }

        await using var db = await repo.OpenConnectionAsync(ct);
        await using var tx = await db.BeginTransactionAsync(ct);
        var tokens = await ReadAsync(db, tx, campaignId, [req.AttackerKey, req.TargetKey], true, ct);
        var attacker = tokens.FirstOrDefault(t => t.Key == req.AttackerKey);
        var target = tokens.FirstOrDefault(t => t.Key == req.TargetKey);
        if (attacker is null || target is null) return CombatOutcome.Reject(404, "Attacker or target is not in this encounter.");
        if (attacker.CurrentHp <= 0) return CombatOutcome.Reject(409, "A defeated combatant cannot act.");

        var slot = req.ActionSlot?.ToLowerInvariant() switch { "bonus" => "bonus_used", "reaction" => "reaction_used", _ => "action_used" };
        var used = slot switch { "bonus_used" => attacker.BonusUsed, "reaction_used" => attacker.ReactionUsed, _ => attacker.ActionUsed };
        if (used) return CombatOutcome.Reject(409, "That action has already been used this round.");

        var distance = Math.Round(Math.Sqrt(Math.Pow(attacker.X - target.X, 2) + Math.Pow(attacker.Z - target.Z, 2)) * 2.5, 1);
        var inRange = distance <= Math.Max(5, req.RangeFeet);
        var d20 = Roll(20);
        var crit = d20 == 20;
        var total = d20 + req.AttackBonus;
        var hit = inRange && (crit || (d20 != 1 && total >= target.ArmorClass));
        var damage = 0;
        if (hit)
        {
            var dice = crit ? req.DamageDiceCount * 2 : req.DamageDiceCount;
            for (var i = 0; i < dice; i++) damage += Roll(req.DamageDiceSides);
            damage = Math.Max(0, damage + req.DamageBonus);
        }

        var remaining = Math.Max(0, target.CurrentHp - damage);
        await ExecAsync(db, tx, $"UPDATE lw_combat_tokens SET {slot}=1, revision=revision+1 WHERE campaign_id=@c AND token_key=@k",
            campaignId, attacker.Key, ct);
        if (damage > 0)
        {
            await ExecAsync(db, tx, "UPDATE lw_combat_tokens SET current_hp=@hp, revision=revision+1 WHERE campaign_id=@c AND token_key=@k",
                campaignId, target.Key, ct, remaining);
            var targetChar = CharacterKeyOf(target.Key);
            if (targetChar is not null)
                await ExecAsync(db, tx, "UPDATE lw_characters SET current_hp=@hp, revision=revision+1 WHERE campaign_id=@c AND character_key=@k",
                    campaignId, targetChar, ct, remaining);
        }

        var log = !inRange ? $"{attacker.Name} cannot reach {target.Name} ({distance} ft)."
            : hit ? $"{attacker.Name} hit {target.Name} with {req.ActionName} ({d20}+{req.AttackBonus}={total} vs AC {target.ArmorClass}) for {damage}."
            : $"{attacker.Name} missed {target.Name} with {req.ActionName} ({d20}+{req.AttackBonus}={total} vs AC {target.ArmorClass}).";
        await using (var evt = new MySqlCommand(
            "INSERT INTO lw_play_events (campaign_id, event_kind, actor_label, summary) VALUES (@c, 'combat_attack', @a, @s)", db, tx))
        {
            evt.Parameters.AddWithValue("@c", campaignId);
            evt.Parameters.AddWithValue("@a", attacker.Name);
            evt.Parameters.AddWithValue("@s", log);
            await evt.ExecuteNonQueryAsync(ct);
        }

        await tx.CommitAsync(ct);
        return new CombatOutcome(new CombatResolutionResultDto(attacker.Key, target.Key, req.ActionName, distance, inRange, d20, total,
            target.ArmorClass, hit, crit, damage, remaining, remaining == 0, req.ParticlePresetId, log), 200, null);
    }

    public static string? CharacterKeyOf(string tokenKey)
    {
        var parts = tokenKey.Split(':');
        return parts.Length == 3 && parts[1] == "Character" ? parts[2] : null;
    }

    /// <summary>Character attacks use stats derived from the stored sheet; requested dice are capped to what the level allows.</summary>
    public static CombatResolutionRequest ApplySheetLimits(CombatResolutionRequest req, CharacterSheetDto sheet)
    {
        var mod = sheet.Abilities.Where(a => a.Code is "STR" or "DEX").Select(a => a.Modifier).DefaultIfEmpty(0).Max();
        var maxDice = Math.Min(12, 2 + sheet.Level / 2);
        return req with
        {
            AttackBonus = sheet.ProficiencyBonus + mod,
            DamageDiceCount = Math.Clamp(req.DamageDiceCount, 0, maxDice),
            DamageDiceSides = Math.Min(req.DamageDiceSides, 12),
            DamageBonus = Math.Clamp(req.DamageBonus, 0, Math.Max(0, mod + sheet.ProficiencyBonus)),
        };
    }

    private static async Task ExecAsync(MySqlConnection db, MySqlTransaction tx, string sql, int campaignId, string key,
        CancellationToken ct, int? hp = null)
    {
        await using var cmd = new MySqlCommand(sql, db, tx);
        cmd.Parameters.AddWithValue("@c", campaignId);
        cmd.Parameters.AddWithValue("@k", key);
        if (hp is not null) cmd.Parameters.AddWithValue("@hp", hp);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task InsertAsync(MySqlConnection db, MySqlTransaction? tx, int campaignId, VttTokenDto t, CancellationToken ct)
    {
        await using var cmd = new MySqlCommand($"""
            INSERT INTO lw_combat_tokens (campaign_id, {Columns})
            VALUES (@c, @k, @n, @r, @f, @i, @hp, @mhp, @ac, @x, @z, @col, 0, 0, 0, @mv)
            """, db, tx);
        cmd.Parameters.AddWithValue("@c", campaignId);
        cmd.Parameters.AddWithValue("@k", t.Key);
        cmd.Parameters.AddWithValue("@n", t.Name);
        cmd.Parameters.AddWithValue("@r", t.RoleLabel);
        cmd.Parameters.AddWithValue("@f", t.Faction);
        cmd.Parameters.AddWithValue("@i", t.Initiative);
        cmd.Parameters.AddWithValue("@hp", t.CurrentHp);
        cmd.Parameters.AddWithValue("@mhp", t.MaxHp);
        cmd.Parameters.AddWithValue("@ac", t.ArmorClass);
        cmd.Parameters.AddWithValue("@x", t.X);
        cmd.Parameters.AddWithValue("@z", t.Z);
        cmd.Parameters.AddWithValue("@col", t.ColorHex);
        cmd.Parameters.AddWithValue("@mv", t.MovementRemainingFeet);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<List<VttTokenDto>> ReadAsync(
        MySqlConnection db, MySqlTransaction? tx, int campaignId, string[]? keys, bool forUpdate, CancellationToken ct)
    {
        var filter = keys is null ? "" : " AND token_key IN (" + string.Join(",", keys.Select((_, i) => $"@k{i}")) + ")";
        await using var cmd = new MySqlCommand(
            $"SELECT {Columns} FROM lw_combat_tokens WHERE campaign_id=@c{filter} ORDER BY initiative DESC, token_key{(forUpdate ? " FOR UPDATE" : "")}",
            db, tx);
        cmd.Parameters.AddWithValue("@c", campaignId);
        for (var i = 0; keys is not null && i < keys.Length; i++) cmd.Parameters.AddWithValue($"@k{i}", keys[i]);
        var list = new List<VttTokenDto>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            list.Add(new VttTokenDto(r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetInt32(4), r.GetInt32(5),
                r.GetInt32(6), r.GetInt32(7), r.GetDouble(8), r.GetDouble(9), r.GetString(10), r.GetBoolean(11), r.GetBoolean(12),
                r.GetBoolean(13), r.GetInt32(14)));
        return list;
    }
}
