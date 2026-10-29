using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Realtime;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.SignalR;
using MySqlConnector;

namespace LoomWeaver.Modules.Characters;

public sealed record CharacterSheetLiveStateDto(
    int CampaignId, bool IsSessionLive, string ActiveSessionId, string ActiveSessionTitle,
    bool IsEncounterLive, string ActiveEncounterId, string ActiveEncounterTitle, int ActiveRound);

public sealed record UpdateCharacterSheetLiveStateRequest(
    bool? IsSessionLive, string? ActiveSessionId, string? ActiveSessionTitle,
    bool? IsEncounterLive, string? ActiveEncounterId, string? ActiveEncounterTitle, int? ActiveRound);

public sealed record CharacterSheetRollActionRequest(
    string CharacterKey, string CharacterName, string Category, string ItemId, string ItemName,
    string ActionSlotCost, int? SpellSlotLevel, string? LimitedUseId, int DiceSides, int DiceCount,
    int Modifier, string? RollMode, string? TargetName, int? TargetAc, int? DamageDiceCount,
    int? DamageDiceSides, int? DamageBonus, string? DamageType, string? ReactionOutcome,
    int? DamageReducedBy, bool IsSessionLive, bool IsEncounterLive, string? SessionId, string? EncounterId, int? Round);

public sealed record CharacterSheetRollLogDto(
    string Id, int CampaignId, string CharacterKey, string CharacterName, string Category, string ItemName,
    string Formula, IReadOnlyList<int> RawRolls, int NaturalDie, int Modifier, int Total, bool IsNat20,
    bool IsCritFail, bool? Hit, int DamageDealt, int DamageReduced, bool WasInterrupted, bool WasDamageReduced,
    string ActionSlotConsumed, bool TrackedInSession, bool TrackedInEncounter, string SummaryMessage,
    string Sha256Digest, DateTimeOffset Timestamp);

public sealed record CharacterCombatTelemetrySnapshotDto(
    string CharacterKey, string CharacterName, int TotalSessionRolls, int Nat20Count, int CritFailCount,
    IReadOnlyDictionary<int, int> RollsByNumber, int LandedStrikes, int MissedStrikes, int AttacksInterrupted,
    int AttacksReducedDamage, int TotalDamageDealt, int TotalDamageReducedOrMitigated, int PeakSingleHit,
    int SpellsCastCount, int AbilitiesUsedCount);

public static class CharacterSheetLiveTelemetryEndpoints
{
    private static readonly object SyncLock = new();
    private static bool SchemaEnsured;

    private static readonly Dictionary<int, CharacterSheetLiveStateDto> LiveStateByCampaign = new()
    {
        [1] = new CharacterSheetLiveStateDto(
            1, true, "session-15", "Session 15 — Shadow Beneath the Ruined Chapel",
            true, "enc-ruined-chapel", "Ruined Chapel Courtyard Ambush", 2)
    };

    private static readonly ConcurrentDictionary<string, CharacterCombatTelemetrySnapshotDto> TelemetryByCharacter =
        new(StringComparer.OrdinalIgnoreCase);

    private static readonly ConcurrentQueue<CharacterSheetRollLogDto> RollLogs = new();

    static CharacterSheetLiveTelemetryEndpoints() => SeedInitialCharacterTelemetry();

    public static CharacterCombatTelemetrySnapshotDto GetCharacterTelemetry(string characterKey, string fallbackName = "Hero")
    {
        if (TelemetryByCharacter.TryGetValue(characterKey, out var found)) return found;
        var baseDist = new Dictionary<int, int>();
        for (var i = 1; i <= 20; i++) baseDist[i] = i is 20 ? 2 : i is 1 ? 1 : 3;
        return new CharacterCombatTelemetrySnapshotDto(
            characterKey, fallbackName, 57, 2, 1, baseDist, 18, 6, 2, 3, 245, 42, 34, 9, 14);
    }

    public static IReadOnlyList<CharacterCombatTelemetrySnapshotDto> GetAllTelemetry() =>
        TelemetryByCharacter.Values.ToList();

    public static void MapCharacterSheetLiveTelemetryEndpoints(this IEndpointRouteBuilder group)
    {
        group.MapGet("/campaigns/{campaignId:int}/character-sheet/live-state", (int campaignId, string? characterKey) =>
        {
            lock (SyncLock)
            {
                if (!LiveStateByCampaign.TryGetValue(campaignId, out var state))
                    state = LiveStateByCampaign[1] with { CampaignId = campaignId };

                var key = string.IsNullOrWhiteSpace(characterKey) ? "char-ciaran" : characterKey.Trim();
                var telemetry = GetCharacterTelemetry(key);
                var logs = RollLogs.Reverse().Where(l => l.CampaignId == campaignId || campaignId == 1).Take(25).ToList();
                return Results.Ok(new
                {
                    liveState = state,
                    telemetry,
                    allPartyTelemetry = TelemetryByCharacter.Values.ToList(),
                    recentLogs = logs
                });
            }
        });

        group.MapPost("/campaigns/{campaignId:int}/character-sheet/live-state", async (
            int campaignId,
            UpdateCharacterSheetLiveStateRequest req,
            HttpContext httpContext,
            LoomWeaverMySqlRepository mysql,
            IHubContext<TableRealtimeHub> hubContext,
            CancellationToken ct) =>
        {
            if (!CampaignAccessResolver.Resolve(httpContext, campaignId).IsAccountGm)
            {
                return Results.Json(
                    new { message = "Only the campaign GM can change live session state." },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            CharacterSheetLiveStateDto updated;
            lock (SyncLock)
            {
                if (!LiveStateByCampaign.TryGetValue(campaignId, out var current))
                    current = LiveStateByCampaign[1] with { CampaignId = campaignId };

                var nextSessionLive = req.IsSessionLive ?? current.IsSessionLive;
                var nextEncounterLive = nextSessionLive && (req.IsEncounterLive ?? current.IsEncounterLive);
                updated = current with
                {
                    IsSessionLive = nextSessionLive,
                    ActiveSessionId = string.IsNullOrWhiteSpace(req.ActiveSessionId) ? current.ActiveSessionId : req.ActiveSessionId.Trim(),
                    ActiveSessionTitle = string.IsNullOrWhiteSpace(req.ActiveSessionTitle) ? current.ActiveSessionTitle : req.ActiveSessionTitle.Trim(),
                    IsEncounterLive = nextEncounterLive,
                    ActiveEncounterId = string.IsNullOrWhiteSpace(req.ActiveEncounterId) ? current.ActiveEncounterId : req.ActiveEncounterId.Trim(),
                    ActiveEncounterTitle = string.IsNullOrWhiteSpace(req.ActiveEncounterTitle) ? current.ActiveEncounterTitle : req.ActiveEncounterTitle.Trim(),
                    ActiveRound = req.ActiveRound ?? current.ActiveRound
                };
                LiveStateByCampaign[campaignId] = updated;
            }

            var statusSummary =
                $"Session Live: {(updated.IsSessionLive ? "ON" : "OFF")} ({updated.ActiveSessionTitle}) · Encounter Live: {(updated.IsEncounterLive ? $"ON (Round {updated.ActiveRound})" : "OFF")}";
            var evt = TableRealtimeEndpoints.RecordEvent(
                campaignId, "live_session_state_changed", "Table Controller", statusSummary, JsonSerializer.Serialize(updated));
            await TableRealtimeHub.ReconcileCampaignConnectionsAsync(
                mysql, hubContext.Groups, campaignId, ct);
            await hubContext.Clients.Group($"campaign-{campaignId}").SendAsync("TableEventReceived", evt);
            return Results.Ok(updated);
        });

        group.MapPost("/campaigns/{campaignId:int}/character-sheet/roll-action", async (
            int campaignId,
            CharacterSheetRollActionRequest req,
            LoomWeaverMySqlRepository mysql,
            IHubContext<TableRealtimeHub> hubContext,
            CancellationToken ct) =>
        {
            var sides = Math.Clamp(req.DiceSides <= 0 ? 20 : req.DiceSides, 2, 100);
            var count = Math.Clamp(req.DiceCount <= 0 ? 1 : req.DiceCount, 1, 20);
            var mode = (req.RollMode ?? "normal").Trim().ToLowerInvariant();
            var rawRolls = new List<int>();
            var keptRolls = new List<int>();

            if (sides == 20 && count == 1 && (mode == "advantage" || mode == "disadvantage"))
            {
                var r1 = RandomNumberGenerator.GetInt32(1, 21);
                var r2 = RandomNumberGenerator.GetInt32(1, 21);
                rawRolls.AddRange([r1, r2]);
                keptRolls.Add(mode == "advantage" ? Math.Max(r1, r2) : Math.Min(r1, r2));
            }
            else
            {
                for (var i = 0; i < count; i++)
                {
                    var val = RandomNumberGenerator.GetInt32(1, sides + 1);
                    rawRolls.Add(val);
                    keptRolls.Add(val);
                }
            }

            var naturalDie = keptRolls.FirstOrDefault();
            var total = keptRolls.Sum() + req.Modifier;
            var isNat20 = sides == 20 && keptRolls.Contains(20);
            var isCritFail = sides == 20 && keptRolls.Contains(1);
            var category = (req.Category ?? "check").Trim().ToLowerInvariant();
            var targetAc = req.TargetAc ?? 15;
            var reactionOutcome = (req.ReactionOutcome ?? "none").Trim().ToLowerInvariant();
            var wasInterrupted = reactionOutcome == "interrupted";
            var wasDamageReduced = reactionOutcome == "reduced" || (req.DamageReducedBy ?? 0) > 0;

            bool? hit = null;
            var damageDealt = 0;
            var damageReduced = Math.Max(0, req.DamageReducedBy ?? 0);

            if (category is "attack" or "spell-attack")
            {
                hit = !wasInterrupted && (isNat20 || (!isCritFail && total >= targetAc));
                if (hit == true && (req.DamageDiceSides ?? 0) > 0)
                {
                    var dmgSides = Math.Clamp(req.DamageDiceSides ?? 8, 2, 20);
                    var dmgCount = Math.Clamp(req.DamageDiceCount ?? 1, 1, 16) * (isNat20 ? 2 : 1);
                    for (var i = 0; i < dmgCount; i++) damageDealt += RandomNumberGenerator.GetInt32(1, dmgSides + 1);
                    damageDealt = Math.Max(1, damageDealt + (req.DamageBonus ?? 0));
                    if (wasDamageReduced)
                    {
                        if (damageReduced == 0) damageReduced = Math.Max(1, damageDealt / 2);
                        damageDealt = Math.Max(0, damageDealt - damageReduced);
                    }
                }
            }
            else if (category == "damage")
            {
                hit = !wasInterrupted;
                damageDealt = Math.Max(0, total);
                if (wasInterrupted)
                {
                    damageReduced = damageDealt;
                    damageDealt = 0;
                }
                else if (wasDamageReduced)
                {
                    if (damageReduced == 0) damageReduced = Math.Max(1, damageDealt / 2);
                    damageDealt = Math.Max(0, damageDealt - damageReduced);
                }
            }

            CharacterSheetLiveStateDto liveState;
            lock (SyncLock)
            {
                if (!LiveStateByCampaign.TryGetValue(campaignId, out liveState!))
                    liveState = LiveStateByCampaign[1] with { CampaignId = campaignId };
            }

            var trackedInSession = req.IsSessionLive && liveState.IsSessionLive;
            var trackedInEncounter = trackedInSession && req.IsEncounterLive && liveState.IsEncounterLive;
            var modStr = req.Modifier > 0 ? $" + {req.Modifier}" : req.Modifier < 0 ? $" - {Math.Abs(req.Modifier)}" : "";
            var modeStr = mode == "advantage" ? " (ADV)" : mode == "disadvantage" ? " (DIS)" : "";
            var formula = $"{count}d{sides}{modStr}{modeStr}";
            var charKey = string.IsNullOrWhiteSpace(req.CharacterKey) ? "char-ciaran" : req.CharacterKey.Trim();
            var charName = string.IsNullOrWhiteSpace(req.CharacterName) ? "Ciarán Fiachra" : req.CharacterName.Trim();
            var itemName = string.IsNullOrWhiteSpace(req.ItemName) ? "Check" : req.ItemName.Trim();
            var slotCost = string.IsNullOrWhiteSpace(req.ActionSlotCost) ? "none" : req.ActionSlotCost.Trim();
            var outcomeBadge = isNat20 ? " [NAT 20!]" : isCritFail ? " [CRIT FAIL!]" : "";
            var combatSuffix = wasInterrupted
                ? $" -> INTERRUPTED vs {req.TargetName ?? "Target"}!"
                : hit == true
                    ? damageDealt > 0
                        ? $" -> HIT {req.TargetName ?? "Target"} (AC {targetAc}) for {damageDealt} {req.DamageType ?? ""} dmg{(wasDamageReduced ? $" ({damageReduced} reduced)" : "")}!"
                        : $" -> HIT {req.TargetName ?? "Target"} (AC {targetAc})!"
                    : hit == false
                        ? $" -> MISSED {req.TargetName ?? "Target"} (AC {targetAc})."
                        : "";
            var trackingTag = trackedInEncounter
                ? "[Tracked: Live Session + Live Encounter]"
                : trackedInSession ? "[Tracked: Live Session]" : "[Practice Roll: Session Offline]";
            var summaryMessage =
                $"{charName} rolled {itemName} ({formula}) = {total} [Natural {naturalDie}]{outcomeBadge}{combatSuffix} {trackingTag}";

            var now = DateTimeOffset.UtcNow;
            var hashInput = $"{campaignId}:{charKey}:{formula}:{naturalDie}:{total}:{now.ToUnixTimeMilliseconds()}";
            var digest = "SHA256:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(hashInput)))[..16];

            var logEntry = new CharacterSheetRollLogDto(
                $"cs-roll-{now.ToUnixTimeMilliseconds()}", campaignId, charKey, charName, category, itemName,
                formula, rawRolls, naturalDie, req.Modifier, total, isNat20, isCritFail, hit, damageDealt,
                damageReduced, wasInterrupted, wasDamageReduced, slotCost, trackedInSession, trackedInEncounter,
                summaryMessage, digest, now);

            RollLogs.Enqueue(logEntry);
            while (RollLogs.Count > 50) RollLogs.TryDequeue(out _);

            var updatedTelemetry = UpdateCharacterTelemetry(
                charKey, charName, category, naturalDie, isNat20, isCritFail, hit,
                damageDealt, damageReduced, wasInterrupted, wasDamageReduced, trackedInSession, trackedInEncounter);

            if (trackedInSession)
                await TryPersistRollToMySqlAsync(mysql, logEntry, liveState, ct);

            var evt = TableRealtimeEndpoints.RecordEvent(
                campaignId, trackedInEncounter ? "encounter_sheet_roll" : "session_sheet_roll",
                charName, summaryMessage, JsonSerializer.Serialize(logEntry));
            await TableRealtimeHub.ReconcileCampaignConnectionsAsync(
                mysql, hubContext.Groups, campaignId, ct);
            await hubContext.Clients.Group($"campaign-{campaignId}").SendAsync("TableEventReceived", evt);

            return Results.Ok(new { roll = logEntry, telemetry = updatedTelemetry, liveState });
        });
    }

    private static CharacterCombatTelemetrySnapshotDto UpdateCharacterTelemetry(
        string charKey, string charName, string category, int naturalDie, bool isNat20, bool isCritFail,
        bool? hit, int damageDealt, int damageReduced, bool wasInterrupted, bool wasDamageReduced,
        bool trackedInSession, bool trackedInEncounter)
    {
        var current = GetCharacterTelemetry(charKey, charName);
        if (!trackedInSession) return current;

        var nextDist = new Dictionary<int, int>(current.RollsByNumber);
        var clampedDie = Math.Clamp(naturalDie, 1, 20);
        nextDist[clampedDie] = nextDist.GetValueOrDefault(clampedDie, 0) + 1;

        var updated = new CharacterCombatTelemetrySnapshotDto(
            charKey, charName, current.TotalSessionRolls + 1,
            current.Nat20Count + (isNat20 ? 1 : 0),
            current.CritFailCount + (isCritFail ? 1 : 0),
            nextDist,
            current.LandedStrikes + (trackedInEncounter && hit == true ? 1 : 0),
            current.MissedStrikes + (trackedInEncounter && hit == false ? 1 : 0),
            current.AttacksInterrupted + (trackedInEncounter && wasInterrupted ? 1 : 0),
            current.AttacksReducedDamage + (trackedInEncounter && wasDamageReduced ? 1 : 0),
            current.TotalDamageDealt + (trackedInEncounter ? damageDealt : 0),
            current.TotalDamageReducedOrMitigated + (trackedInEncounter ? damageReduced : 0),
            trackedInEncounter ? Math.Max(current.PeakSingleHit, damageDealt) : current.PeakSingleHit,
            current.SpellsCastCount + (category.Contains("spell") ? 1 : 0),
            current.AbilitiesUsedCount + (category is "feature" or "combat-action" ? 1 : 0));

        TelemetryByCharacter[charKey] = updated;
        return updated;
    }

    private static async Task TryPersistRollToMySqlAsync(
        LoomWeaverMySqlRepository mysql, CharacterSheetRollLogDto roll,
        CharacterSheetLiveStateDto liveState, CancellationToken ct)
    {
        try
        {
            await using var db = await mysql.OpenConnectionAsync(ct);
            if (!SchemaEnsured)
            {
                await using var ddl = new MySqlCommand("""
                    CREATE TABLE IF NOT EXISTS lw_character_roll_telemetry (
                        id VARCHAR(64) PRIMARY KEY, campaign_id INT NOT NULL, session_id VARCHAR(64) NOT NULL,
                        encounter_id VARCHAR(64) NULL, character_key VARCHAR(80) NOT NULL, character_name VARCHAR(120) NOT NULL,
                        category VARCHAR(48) NOT NULL, item_name VARCHAR(160) NOT NULL, formula VARCHAR(80) NOT NULL,
                        natural_die INT NOT NULL, modifier INT NOT NULL, total_roll INT NOT NULL,
                        is_nat20 TINYINT(1) NOT NULL DEFAULT 0, is_crit_fail TINYINT(1) NOT NULL DEFAULT 0,
                        hit_landed TINYINT(1) NULL, damage_dealt INT NOT NULL DEFAULT 0, damage_reduced INT NOT NULL DEFAULT 0,
                        was_interrupted TINYINT(1) NOT NULL DEFAULT 0, was_damage_reduced TINYINT(1) NOT NULL DEFAULT 0,
                        action_slot_consumed VARCHAR(40) NOT NULL, tracked_in_encounter TINYINT(1) NOT NULL DEFAULT 0,
                        summary_message VARCHAR(500) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_lw_roll_char (campaign_id, character_key), INDEX idx_lw_roll_nat (campaign_id, natural_die)
                    );
                    """, db);
                await ddl.ExecuteNonQueryAsync(ct);
                SchemaEnsured = true;
            }

            await using var ins = new MySqlCommand("""
                INSERT INTO lw_character_roll_telemetry (
                    id, campaign_id, session_id, encounter_id, character_key, character_name,
                    category, item_name, formula, natural_die, modifier, total_roll,
                    is_nat20, is_crit_fail, hit_landed, damage_dealt, damage_reduced,
                    was_interrupted, was_damage_reduced, action_slot_consumed, tracked_in_encounter, summary_message
                ) VALUES (
                    @id, @cid, @sid, @eid, @ckey, @cname, @cat, @item, @form, @nat, @mod, @tot,
                    @n20, @cf, @hit, @dmg, @red, @intr, @wred, @slot, @tenc, @msg
                );
                """, db);
            ins.Parameters.AddWithValue("@id", roll.Id);
            ins.Parameters.AddWithValue("@cid", roll.CampaignId);
            ins.Parameters.AddWithValue("@sid", liveState.ActiveSessionId);
            ins.Parameters.AddWithValue("@eid", roll.TrackedInEncounter ? liveState.ActiveEncounterId : DBNull.Value);
            ins.Parameters.AddWithValue("@ckey", roll.CharacterKey);
            ins.Parameters.AddWithValue("@cname", roll.CharacterName);
            ins.Parameters.AddWithValue("@cat", roll.Category);
            ins.Parameters.AddWithValue("@item", roll.ItemName);
            ins.Parameters.AddWithValue("@form", roll.Formula);
            ins.Parameters.AddWithValue("@nat", roll.NaturalDie);
            ins.Parameters.AddWithValue("@mod", roll.Modifier);
            ins.Parameters.AddWithValue("@tot", roll.Total);
            ins.Parameters.AddWithValue("@n20", roll.IsNat20 ? 1 : 0);
            ins.Parameters.AddWithValue("@cf", roll.IsCritFail ? 1 : 0);
            ins.Parameters.AddWithValue("@hit", roll.Hit.HasValue ? (roll.Hit.Value ? 1 : 0) : DBNull.Value);
            ins.Parameters.AddWithValue("@dmg", roll.DamageDealt);
            ins.Parameters.AddWithValue("@red", roll.DamageReduced);
            ins.Parameters.AddWithValue("@intr", roll.WasInterrupted ? 1 : 0);
            ins.Parameters.AddWithValue("@wred", roll.WasDamageReduced ? 1 : 0);
            ins.Parameters.AddWithValue("@slot", roll.ActionSlotConsumed);
            ins.Parameters.AddWithValue("@tenc", roll.TrackedInEncounter ? 1 : 0);
            ins.Parameters.AddWithValue("@msg", roll.SummaryMessage);
            await ins.ExecuteNonQueryAsync(ct);
        }
        catch { }
    }

    private static void SeedInitialCharacterTelemetry()
    {
        var seeds = new (string Key, string Name, int Rolls, int N20, int N1, int Landed, int Missed, int Intr, int Red, int Dmg, int Mit, int Peak)[]
        {
            ("char-ciaran", "Ciarán Fiachra", 64, 5, 2, 22, 6, 4, 5, 318, 86, 42),
            ("char-dal", "Dallas (Dal)", 82, 9, 3, 31, 7, 3, 4, 486, 140, 46),
            ("char-fivi", "Fivi", 79, 11, 4, 27, 8, 5, 6, 418, 85, 44),
            ("char-kildrid", "Kildrid", 71, 5, 2, 21, 6, 6, 9, 342, 390, 58),
            ("char-kycius", "Kycius", 76, 8, 2, 28, 7, 4, 5, 452, 175, 39),
            ("char-munk", "Munk", 84, 10, 3, 35, 9, 2, 8, 614, 520, 46)
        };
        foreach (var s in seeds)
        {
            var dist = new Dictionary<int, int>();
            for (var n = 1; n <= 20; n++)
                dist[n] = n == 20 ? s.N20 : n == 1 ? s.N1 : Math.Max(1, (s.Rolls - s.N20 - s.N1) / 18 + (n % 3 == 0 ? 1 : 0));
            TelemetryByCharacter[s.Key] = new CharacterCombatTelemetrySnapshotDto(
                s.Key, s.Name, s.Rolls, s.N20, s.N1, dist,
                s.Landed, s.Missed, s.Intr, s.Red, s.Dmg, s.Mit, s.Peak, 14, 19);
        }
    }
}
