using LoomWeaver.Domain;
using LoomWeaver.GameSystems;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Characters;
using MySqlConnector;

namespace LoomWeaver.Modules.Encounters;

public sealed record XpAwardOutcome(EncounterCompletionResultDto? Result, int StatusCode, string? Error);

/// <summary>Splits encounter XP across the campaign's real characters, once per encounter (idempotent ledger row).</summary>
public static class EncounterRewardService
{
    private const int DuplicateKeyError = 1062;
    private static readonly CharacterCalculationEngine Engine = new();

    public static async Task<XpAwardOutcome> AwardAsync(
        LoomWeaverMySqlRepository repo, int campaignId, string encounterId, int totalXp, string actor, CancellationToken ct)
    {
        if (totalXp is < 0 or > 1_000_000) return new(null, 400, "XP must be between 0 and 1,000,000.");

        var tokens = await CombatTokenStore.ListAsync(repo, campaignId, ct);
        var partyKeys = tokens.Where(t => t.Faction == "party").Select(t => CombatTokenStore.CharacterKeyOf(t.Key)).OfType<string>().ToHashSet();
        var party = (await CharacterStore.ListAsync(repo, campaignId, ct))
            .Where(c => partyKeys.Count == 0 || partyKeys.Contains(c.Sheet.CharacterKey)).ToList();
        if (party.Count == 0) return new(null, 409, "There are no characters to receive XP.");

        var perHero = totalXp / party.Count;
        await using (var db = await repo.OpenConnectionAsync(ct))
        await using (var tx = await db.BeginTransactionAsync(ct))
        {
            try
            {
                await using var award = new MySqlCommand("""
                    INSERT INTO lw_reward_awards (campaign_id, source_node_id, idempotency_key, reward_kind, xp_amount, summary)
                    VALUES (@c, @e, @k, 'xp', @xp, @s)
                    """, db, tx);
                award.Parameters.AddWithValue("@c", campaignId);
                award.Parameters.AddWithValue("@e", encounterId);
                award.Parameters.AddWithValue("@k", $"encounter:{campaignId}:{encounterId}:xp");
                award.Parameters.AddWithValue("@xp", totalXp);
                award.Parameters.AddWithValue("@s", $"Encounter {encounterId}: {perHero} XP to each of {party.Count} heroes");
                await award.ExecuteNonQueryAsync(ct);
            }
            catch (MySqlException ex) when (ex.Number == DuplicateKeyError)
            {
                return new(null, 409, "XP for this encounter was already awarded.");
            }

            await using var evt = new MySqlCommand(
                "INSERT INTO lw_play_events (campaign_id, event_kind, actor_label, summary) VALUES (@c, 'encounter_xp', @a, @s)", db, tx);
            evt.Parameters.AddWithValue("@c", campaignId);
            evt.Parameters.AddWithValue("@a", actor);
            evt.Parameters.AddWithValue("@s", $"Awarded {totalXp:N0} XP ({perHero:N0} each) for encounter {encounterId}");
            await evt.ExecuteNonQueryAsync(ct);
            await tx.CommitAsync(ct);
        }

        var levelUps = new List<string>();
        foreach (var hero in party)
        {
            var result = await CharacterStore.MutateAsync(repo, campaignId, hero.Sheet.CharacterKey, current =>
                CharacterMutation.Ok(Engine.RecalculateSheet(current.Sheet with { CurrentXp = current.Sheet.CurrentXp + perHero })), ct);
            if (result.Updated?.LevelUpEligible == true) levelUps.Add(result.Updated.Name);
        }

        return new(new EncounterCompletionResultDto(encounterId, totalXp, perHero, levelUps,
            $"Awarded {totalXp:N0} XP ({perHero:N0} per hero)." + (levelUps.Count > 0 ? $" Ready to level up: {string.Join(", ", levelUps)}." : "")), 200, null);
    }
}
