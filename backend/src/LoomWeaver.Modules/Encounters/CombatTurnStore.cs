using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Characters;
using MySqlConnector;

namespace LoomWeaver.Modules.Encounters;

public sealed record CombatStateDto(int Round, string? ActiveTokenKey, int Revision);

public sealed record CombatStepOutcome(object? Body, int StatusCode, string? Error);

/// <summary>Turn order, round counter and movement. Every rule is enforced here; clients only request.</summary>
public static class CombatTurnStore
{
    private const double FeetPerCell = 2.5;

    public static async Task<CombatStateDto> GetStateAsync(LoomWeaverMySqlRepository repo, int campaignId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        return await ReadStateAsync(db, null, campaignId, ct);
    }

    public static async Task<CombatStepOutcome> MoveAsync(
        LoomWeaverMySqlRepository repo, int campaignId, ResolvedCampaignAccess access, string tokenKey, double x, double z, CancellationToken ct)
    {
        if (!double.IsFinite(x) || !double.IsFinite(z) || Math.Abs(x) > 500 || Math.Abs(z) > 500)
            return new(null, 400, "Invalid position.");
        if (!await CanControlAsync(repo, campaignId, access, tokenKey, ct))
            return new(null, 403, "You can only move your own character.");

        await using var db = await repo.OpenConnectionAsync(ct);
        await using var tx = await db.BeginTransactionAsync(ct);
        var state = await ReadStateAsync(db, tx, campaignId, ct);
        await using var read = new MySqlCommand(
            "SELECT pos_x, pos_z, movement_feet, current_hp FROM lw_combat_tokens WHERE campaign_id=@c AND token_key=@k FOR UPDATE", db, tx);
        read.Parameters.AddWithValue("@c", campaignId);
        read.Parameters.AddWithValue("@k", tokenKey);
        double ox, oz;
        int remaining, hp;
        await using (var r = await read.ExecuteReaderAsync(ct))
        {
            if (!await r.ReadAsync(ct)) return new(null, 404, "Token not found.");
            ox = r.GetDouble(0); oz = r.GetDouble(1); remaining = r.GetInt32(2); hp = r.GetInt32(3);
        }

        if (hp <= 0) return new(null, 409, "A defeated combatant cannot move.");
        var inCombat = state.ActiveTokenKey is not null;
        if (inCombat && !access.IsAccountGm && state.ActiveTokenKey != tokenKey)
            return new(null, 409, "It is not that combatant's turn.");

        var cost = Math.Sqrt(Math.Pow(x - ox, 2) + Math.Pow(z - oz, 2)) * FeetPerCell;
        if (inCombat && !access.IsAccountGm && cost > remaining + 0.01)
            return new(null, 409, $"Only {remaining} ft of movement remains.");

        var left = inCombat && !access.IsAccountGm ? Math.Max(0, remaining - (int)Math.Ceiling(cost)) : remaining;
        await using var update = new MySqlCommand(
            "UPDATE lw_combat_tokens SET pos_x=@x, pos_z=@z, movement_feet=@m, revision=revision+1 WHERE campaign_id=@c AND token_key=@k", db, tx);
        update.Parameters.AddWithValue("@x", x);
        update.Parameters.AddWithValue("@z", z);
        update.Parameters.AddWithValue("@m", left);
        update.Parameters.AddWithValue("@c", campaignId);
        update.Parameters.AddWithValue("@k", tokenKey);
        await update.ExecuteNonQueryAsync(ct);
        await tx.CommitAsync(ct);
        return new(new { tokenKey, x, z, movementRemainingFeet = left }, 200, null);
    }

    public static async Task<CombatStepOutcome> NextTurnAsync(
        LoomWeaverMySqlRepository repo, int campaignId, ResolvedCampaignAccess access, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await using var tx = await db.BeginTransactionAsync(ct);
        var state = await ReadStateAsync(db, tx, campaignId, ct);
        var order = new List<string>();
        await using (var list = new MySqlCommand(
            "SELECT token_key FROM lw_combat_tokens WHERE campaign_id=@c AND current_hp > 0 ORDER BY initiative DESC, token_key FOR UPDATE", db, tx))
        {
            list.Parameters.AddWithValue("@c", campaignId);
            await using var r = await list.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct)) order.Add(r.GetString(0));
        }

        if (order.Count == 0) return new(null, 409, "There are no active combatants.");
        if (!access.IsAccountGm)
        {
            var active = state.ActiveTokenKey;
            if (active is null || !await CanControlAsync(repo, campaignId, access, active, ct))
                return new(null, 403, "Only the GM or the active combatant's player can end the turn.");
        }

        var index = state.ActiveTokenKey is null ? -1 : order.IndexOf(state.ActiveTokenKey);
        var next = (index + 1) % order.Count;
        var newRound = state.ActiveTokenKey is null || next <= index ? (state.ActiveTokenKey is null ? state.Round : state.Round + 1) : state.Round;
        var reset = state.ActiveTokenKey is null || next <= index;
        if (reset)
        {
            await using var all = new MySqlCommand(
                "UPDATE lw_combat_tokens SET action_used=0, bonus_used=0, reaction_used=0, revision=revision+1 WHERE campaign_id=@c", db, tx);
            all.Parameters.AddWithValue("@c", campaignId);
            await all.ExecuteNonQueryAsync(ct);
        }

        await using (var move = new MySqlCommand(
            "UPDATE lw_combat_tokens SET movement_feet=speed_feet WHERE campaign_id=@c AND token_key=@k", db, tx))
        {
            move.Parameters.AddWithValue("@c", campaignId);
            move.Parameters.AddWithValue("@k", order[next]);
            await move.ExecuteNonQueryAsync(ct);
        }

        await using (var save = new MySqlCommand("""
            INSERT INTO lw_combat_state (campaign_id, round_number, active_token_key) VALUES (@c, @r, @k)
            ON DUPLICATE KEY UPDATE round_number=@r, active_token_key=@k, revision=revision+1
            """, db, tx))
        {
            save.Parameters.AddWithValue("@c", campaignId);
            save.Parameters.AddWithValue("@r", newRound);
            save.Parameters.AddWithValue("@k", order[next]);
            await save.ExecuteNonQueryAsync(ct);
        }

        await tx.CommitAsync(ct);
        return new(new CombatStateDto(newRound, order[next], state.Revision + 1), 200, null);
    }

    public static async Task ResetAsync(LoomWeaverMySqlRepository repo, int campaignId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("DELETE FROM lw_combat_state WHERE campaign_id=@c", db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<bool> CanControlAsync(
        LoomWeaverMySqlRepository repo, int campaignId, ResolvedCampaignAccess access, string tokenKey, CancellationToken ct)
    {
        if (!access.IsMember) return false;
        if (access.IsAccountGm) return true;
        if (CombatTokenStore.CharacterKeyOf(tokenKey) is not { } key) return false;
        var mine = (await CharacterStore.ListAsync(repo, campaignId, ct)).FirstOrDefault(c => c.Sheet.CharacterKey == key);
        return mine is not null && CharacterStudioEndpoints.IsOwnerOrBound(mine, access);
    }

    private static async Task<CombatStateDto> ReadStateAsync(MySqlConnection db, MySqlTransaction? tx, int campaignId, CancellationToken ct)
    {
        await using var cmd = new MySqlCommand(
            "SELECT round_number, active_token_key, revision FROM lw_combat_state WHERE campaign_id=@c", db, tx);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct)
            ? new CombatStateDto(r.GetInt32(0), r.IsDBNull(1) ? null : r.GetString(1), r.GetInt32(2))
            : new CombatStateDto(1, null, 0);
    }
}
