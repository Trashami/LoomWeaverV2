using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Dice;

public static class DiceForgeEndpoints
{
    private static readonly object StateLock = new();
    private static int CurrentLoommarksBalance = 1250;

    private sealed class UserDicePreferenceMemory
    {
        public DiceForgeLoadoutContract ActiveLoadout { get; set; } = DefaultLoadout;
        public object? ActiveCustomConfig { get; set; }
        public List<DiceForgeUserPresetContract> SavedPresets { get; set; } = new();
    }

    private static readonly ConcurrentDictionary<long, UserDicePreferenceMemory> UserMemoryByAccount = new();

    private static readonly HashSet<string> UnlockedSkins = new(StringComparer.OrdinalIgnoreCase)
    {
        "skin-obsidian-gold",
        "skin-nordic-stone",
        "skin-gloss-resin",
        "skin-engraved-steel",
        "skin-astral-glass",
        "skin-hollow-dragon",
        "skin-dragon-eye"
    };

    private static readonly HashSet<string> UnlockedModels = new(StringComparer.OrdinalIgnoreCase)
    {
        "model-classic-chamfer",
        "model-sharp-gem",
        "model-custom-glb",
        "model-dragon-hollow",
        "model-dragon-eye"
    };

    private static readonly DiceForgeLoadoutContract DefaultLoadout = new(
        "skin-obsidian-gold",
        "model-classic-chamfer",
        "medium",
        "#14131a",
        "#ffd978",
        "#ffb830",
        0.85,
        0.35,
        0.22,
        true,
        true,
        "fx-solar-supernova",
        "fx-basalt-shatter",
        "sfx-stone-rattle"
    );

    private static DiceForgeLoadoutContract ActiveLoadout = DefaultLoadout;
    private static object? ActiveCustomConfigGlobal;

    private static readonly List<DiceForgeMilestoneRewardContract> Milestones = new()
    {
        new("milestone-character-studio", "Hero of the Realm", "Complete a full character build in the Character Studio.", "skin", "skin-fey-emerald", "Moonwood Grove", true, false, 150),
        new("milestone-cinth-masquerade", "Velvet & Fangs Survivor", "Survive the court masquerade ambush.", "skin", "skin-vampire-bloodstone", "Crimson Bloodstone", true, false, 200),
        new("milestone-dwarven-delve", "Stone-Sense Delver", "Clear a subterranean encounter using Dwarven Stone-Sense.", "model", "model-dwarven-heavy", "Dwarven Heavy Forge-Cut 3D Model", true, false, 175),
        new("milestone-celtic-warden", "Highland Oathkeeper", "Complete 3 sessions as a party without a fallen companion.", "skin", "skin-celtic-knot", "Highland Relic Bronze", true, false, 150)
    };

    private static readonly List<DiceForgeUserPresetContract> SavedUserPresets = new();
    private static readonly List<DiceForgeMarketplacePresetContract> MarketplaceDicePresets = new();

    private static readonly ConcurrentQueue<DiceRollResponseContract> RecentCampaignRolls = new(new[]
    {
        new DiceRollResponseContract(
            "roll-seed-201", "1d20 + 8 (ADV)", "Slingshot Tooth Strike", 20, 1, "advantage",
            new[] { 14, 20 }, new[] { 20 }, 8, 28, true, false,
            "skin-obsidian-gold", "Solar Supernova", "SHA256:9F4A2C8E1B77D03E", DateTimeOffset.UtcNow.AddMinutes(-12)
        ),
        new DiceRollResponseContract(
            "roll-seed-200", "2d6 + 5", "Runed Greatsword Cleave", 6, 2, "normal",
            new[] { 6, 5 }, new[] { 6, 5 }, 5, 16, false, false,
            "skin-nordic-stone", "Standard Impact", "SHA256:3D81B60A44E91C20", DateTimeOffset.UtcNow.AddMinutes(-18)
        ),
        new DiceRollResponseContract(
            "roll-seed-199", "1d20 + 7", "Dal Shadow-Step Perception Check", 20, 1, "normal",
            new[] { 18 }, new[] { 18 }, 7, 25, false, false,
            "skin-astral-glass", "Standard Impact", "SHA256:7C12E88FA0514B9B", DateTimeOffset.UtcNow.AddMinutes(-26)
        )
    });

    public static IReadOnlyList<DiceRollResponseContract> GetRecentRolls() =>
        RecentCampaignRolls.Reverse().Take(12).ToList();

    public static IReadOnlyList<DiceSkinPresetContract> GetCuratedSkins() => new[]
    {
        new DiceSkinPresetContract("skin-obsidian-gold", "Runed Obsidian & Molten Gold", "Volcanic Glass + Gold Inlay", "#14131a", "#e5b85c", 0.35, 0.22, "Solar Supernova", "Basalt Fault Fracture", "Free"),
        new DiceSkinPresetContract("skin-hollow-dragon", "Hollow Dragon Silver", "Sculpted Silver", "#707780", "#ecc56c", 1.0, 0.27, "Solar Supernova", "Artificer Overload Spark", "Free"),
        new DiceSkinPresetContract("skin-dragon-eye", "Emerald Dragon Eye", "Dragon Scale Steel", "#434b50", "#38eb88", 0.95, 0.33, "Solar Supernova", "Artificer Overload Spark", "Free"),
        new DiceSkinPresetContract("skin-nordic-stone", "Runestone", "Carved Mountain Basalt", "#2b2f36", "#63d2ff", 0.12, 0.78, "Astral Singularity", "Basalt Fault Fracture", "Free"),
        new DiceSkinPresetContract("skin-gloss-resin", "Loom Emerald Resin", "Polished Tournament Resin", "#0f3828", "#49e892", 0.06, 0.18, "Solar Supernova", "Ashen Smolder", "Free"),
        new DiceSkinPresetContract("skin-engraved-steel", "Damascus Steel", "Brushed Damascus Steel", "#303640", "#49e892", 0.92, 0.26, "Solar Supernova", "Artificer Overload Spark", "Free"),
        new DiceSkinPresetContract("skin-astral-glass", "Astral Prism Glass", "Refractive Aether Crystal", "#1b3f5e", "#56e6ff", 0.14, 0.08, "Astral Singularity", "Void Rift Collapse", "Adventurer"),
        new DiceSkinPresetContract("skin-celtic-knot", "Highland Relic Bronze", "Cast Bronze + Filigree", "#1c261e", "#d9a74a", 0.74, 0.38, "Feywild Sylvan Bloom", "Ashen Smolder", "Campaign Reward"),
        new DiceSkinPresetContract("skin-arcane-glyph", "Glyph Stone", "Slate + Luminary Conduit", "#181326", "#38e8ff", 0.28, 0.42, "Astral Singularity", "Void Rift Collapse", "450 Loommarks"),
        new DiceSkinPresetContract("skin-fey-emerald", "Moonwood", "Moonwood & Fey Sap", "#241710", "#2ee66b", 0.08, 0.56, "Feywild Sylvan Bloom", "Withered Bramble Blight", "Milestone Reward"),
        new DiceSkinPresetContract("skin-vampire-bloodstone", "Crimson Bloodstone", "Bloodstone & Court Silver", "#1f090d", "#ff3b5c", 0.42, 0.28, "Crimson Ascension", "Basalt Fault Fracture", "Campaign Reward"),
        new DiceSkinPresetContract("skin-clockwork-brass", "Artificer Brass", "Artificer Brass & Aether", "#2d2112", "#ffb340", 0.90, 0.24, "Aether Overclock", "Artificer Overload Spark", "Store / 600 Marks"),
        new DiceSkinPresetContract("skin-astral-void", "Astral Singularity", "Void Nebula Crystal", "#0b0718", "#c06cff", 0.32, 0.14, "Astral Singularity", "Void Rift Collapse", "750 Loommarks")
    };

    private static async Task EnsureTableAsync(MySqlConnection conn, CancellationToken ct)
    {
        const string ddl = """
            CREATE TABLE IF NOT EXISTS lw_user_dice_preferences (
              user_id BIGINT NOT NULL PRIMARY KEY,
              active_loadout_json LONGTEXT NOT NULL,
              active_custom_json LONGTEXT NULL,
              saved_presets_json LONGTEXT NOT NULL,
              updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """;
        await using var cmd = new MySqlCommand(ddl, conn);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<UserDicePreferenceMemory> LoadUserPreferencesAsync(
        long? userId,
        LoomWeaverMySqlRepository mysql,
        CancellationToken ct)
    {
        if (userId is null || userId <= 0)
        {
            lock (StateLock)
            {
                return new UserDicePreferenceMemory
                {
                    ActiveLoadout = ActiveLoadout,
                    ActiveCustomConfig = ActiveCustomConfigGlobal,
                    SavedPresets = SavedUserPresets.ToList()
                };
            }
        }

        var mem = UserMemoryByAccount.GetOrAdd(userId.Value, _ => new UserDicePreferenceMemory());
        try
        {
            await using var conn = await mysql.OpenConnectionAsync(ct);
            await EnsureTableAsync(conn, ct);
            await using var cmd = new MySqlCommand(
                "SELECT active_loadout_json, active_custom_json, saved_presets_json FROM lw_user_dice_preferences WHERE user_id=@u LIMIT 1",
                conn);
            cmd.Parameters.AddWithValue("@u", userId.Value);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var loadoutRaw = r.IsDBNull(0) ? null : r.GetString(0);
                var customRaw = r.IsDBNull(1) ? null : r.GetString(1);
                var presetsRaw = r.IsDBNull(2) ? null : r.GetString(2);

                if (!string.IsNullOrWhiteSpace(loadoutRaw))
                {
                    mem.ActiveLoadout = JsonSerializer.Deserialize<DiceForgeLoadoutContract>(loadoutRaw) ?? DefaultLoadout;
                }
                if (!string.IsNullOrWhiteSpace(customRaw))
                {
                    mem.ActiveCustomConfig = JsonDocument.Parse(customRaw).RootElement.Clone();
                }
                if (!string.IsNullOrWhiteSpace(presetsRaw))
                {
                    mem.SavedPresets = JsonSerializer.Deserialize<List<DiceForgeUserPresetContract>>(presetsRaw) ?? new();
                }
            }
        }
        catch
        {
            // Fallback to in-memory user preference cache when DB is unreachable
        }

        return mem;
    }

    private static async Task SaveUserPreferencesAsync(
        long? userId,
        UserDicePreferenceMemory mem,
        LoomWeaverMySqlRepository mysql,
        CancellationToken ct)
    {
        if (userId is null || userId <= 0) return;
        UserMemoryByAccount[userId.Value] = mem;
        try
        {
            await using var conn = await mysql.OpenConnectionAsync(ct);
            await EnsureTableAsync(conn, ct);
            const string sql = """
                INSERT INTO lw_user_dice_preferences (user_id, active_loadout_json, active_custom_json, saved_presets_json)
                VALUES (@u, @l, @c, @p)
                ON DUPLICATE KEY UPDATE
                  active_loadout_json = VALUES(active_loadout_json),
                  active_custom_json = VALUES(active_custom_json),
                  saved_presets_json = VALUES(saved_presets_json),
                  updated_at = CURRENT_TIMESTAMP;
                """;
            await using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@u", userId.Value);
            cmd.Parameters.AddWithValue("@l", JsonSerializer.Serialize(mem.ActiveLoadout));
            cmd.Parameters.AddWithValue("@c", mem.ActiveCustomConfig is not null ? JsonSerializer.Serialize(mem.ActiveCustomConfig) : DBNull.Value);
            cmd.Parameters.AddWithValue("@p", JsonSerializer.Serialize(mem.SavedPresets));
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch
        {
            // Keep in-memory state if DB write fails
        }
    }

    public static RouteGroupBuilder MapDiceForgeEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/dice-skins", (int campaignId) =>
            Results.Ok(GetCuratedSkins()));

        api.MapGet("/campaigns/{campaignId:int}/dice-forge/state", async (int campaignId, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            var mem = await LoadUserPreferencesAsync(u?.Id, mysql, ct);
            return Results.Ok(BuildStateSnapshot(campaignId, mem));
        });

        api.MapPut("/campaigns/{campaignId:int}/dice-forge/loadout", async (int campaignId, DiceForgeLoadoutContract loadout, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            var mem = await LoadUserPreferencesAsync(u?.Id, mysql, ct);
            lock (StateLock)
            {
                ActiveLoadout = loadout;
                if (loadout.CustomConfig is not null)
                {
                    ActiveCustomConfigGlobal = loadout.CustomConfig;
                }
            }
            mem.ActiveLoadout = loadout;
            if (loadout.CustomConfig is not null)
            {
                mem.ActiveCustomConfig = loadout.CustomConfig;
            }
            await SaveUserPreferencesAsync(u?.Id, mem, mysql, ct);
            return Results.Ok(BuildStateSnapshot(campaignId, mem));
        });

        api.MapPost("/campaigns/{campaignId:int}/dice-forge/presets", async (int campaignId, DiceForgeUserPresetContract preset, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            var mem = await LoadUserPreferencesAsync(u?.Id, mysql, ct);
            lock (StateLock)
            {
                var idx = SavedUserPresets.FindIndex(p => string.Equals(p.Id, preset.Id, StringComparison.OrdinalIgnoreCase));
                if (idx >= 0) SavedUserPresets[idx] = preset;
                else SavedUserPresets.Insert(0, preset);
                ActiveCustomConfigGlobal = preset.Config;
            }
            var uIdx = mem.SavedPresets.FindIndex(p => string.Equals(p.Id, preset.Id, StringComparison.OrdinalIgnoreCase));
            if (uIdx >= 0) mem.SavedPresets[uIdx] = preset;
            else mem.SavedPresets.Insert(0, preset);
            mem.ActiveCustomConfig = preset.Config;
            await SaveUserPreferencesAsync(u?.Id, mem, mysql, ct);
            return Results.Ok(mem.SavedPresets.ToList());
        });

        api.MapDelete("/campaigns/{campaignId:int}/dice-forge/presets/{presetId}", async (int campaignId, string presetId, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            var mem = await LoadUserPreferencesAsync(u?.Id, mysql, ct);
            lock (StateLock)
            {
                SavedUserPresets.RemoveAll(p => string.Equals(p.Id, presetId, StringComparison.OrdinalIgnoreCase));
            }
            mem.SavedPresets.RemoveAll(p => string.Equals(p.Id, presetId, StringComparison.OrdinalIgnoreCase));
            await SaveUserPreferencesAsync(u?.Id, mem, mysql, ct);
            return Results.Ok(mem.SavedPresets.ToList());
        });

        api.MapGet("/marketplace/dice-presets", () =>
        {
            lock (StateLock)
            {
                return Results.Ok(MarketplaceDicePresets.ToList());
            }
        });

        api.MapPost("/marketplace/dice-presets", (DiceForgeMarketplacePresetContract preset) =>
        {
            lock (StateLock)
            {
                MarketplaceDicePresets.Insert(0, preset);
                return Results.Ok(MarketplaceDicePresets.ToList());
            }
        });

        api.MapPost("/campaigns/{campaignId:int}/dice-forge/unlock", (int campaignId, DiceForgeUnlockRequestContract req) =>
        {
            lock (StateLock)
            {
                var itemType = (req.ItemType ?? "skin").Trim().ToLowerInvariant();
                var itemId = (req.ItemId ?? "").Trim();
                var method = (req.AcquisitionMethod ?? "reward").Trim().ToLowerInvariant();

                if (string.IsNullOrWhiteSpace(itemId))
                {
                    return Results.BadRequest(new { message = "ItemId is required." });
                }

                if (method == "reward")
                {
                    var idx = Milestones.FindIndex(m => string.Equals(m.TargetItemId, itemId, StringComparison.OrdinalIgnoreCase) || string.Equals(m.Id, itemId, StringComparison.OrdinalIgnoreCase));
                    if (idx >= 0)
                    {
                        var m = Milestones[idx];
                        if (!m.IsClaimed)
                        {
                            Milestones[idx] = m with { IsClaimed = true };
                            CurrentLoommarksBalance += m.BonusLoommarks;
                        }
                        itemId = m.TargetItemId;
                        itemType = m.TargetType;
                    }
                }
                else if (method == "loommarks")
                {
                    var cost = Math.Max(0, req.LoommarksCost ?? 450);
                    if (CurrentLoommarksBalance < cost)
                    {
                        return Results.Ok(new DiceForgeUnlockResponseContract(
                            false,
                            $"Insufficient Loommarks ({CurrentLoommarksBalance} available, {cost} required).",
                            CurrentLoommarksBalance,
                            UnlockedSkins.ToList(),
                            UnlockedModels.ToList(),
                            Milestones.ToList()
                        ));
                    }
                    CurrentLoommarksBalance -= cost;
                }

                if (itemType == "model") UnlockedModels.Add(itemId);
                else UnlockedSkins.Add(itemId);

                return Results.Ok(new DiceForgeUnlockResponseContract(
                    true,
                    $"Unlocked {itemId} via {method}.",
                    CurrentLoommarksBalance,
                    UnlockedSkins.ToList(),
                    UnlockedModels.ToList(),
                    Milestones.ToList()
                ));
            }
        });

        api.MapPost("/campaigns/{campaignId:int}/dice/roll", (int campaignId, DiceRollRequestContract req) =>
        {
            var sides = Math.Clamp(req.Sides <= 0 ? 20 : req.Sides, 2, 100);
            var count = Math.Clamp(req.Count <= 0 ? 1 : req.Count, 1, 20);
            var mode = NormalizeRollMode(req.RollMode);
            var skins = GetCuratedSkins();
            var skin = skins.FirstOrDefault(s => s.Id == req.SkinId) ?? skins[0];

            List<int> rawRolls = new();
            List<int> keptRolls = new();

            if (sides == 20 && count == 1 && (mode == "advantage" || mode == "disadvantage"))
            {
                var first = RandomNumberGenerator.GetInt32(1, 21);
                var second = RandomNumberGenerator.GetInt32(1, 21);
                rawRolls.Add(first);
                rawRolls.Add(second);
                keptRolls.Add(mode == "advantage" ? Math.Max(first, second) : Math.Min(first, second));
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

            var total = keptRolls.Sum() + req.Modifier;
            var isNat20 = sides == 20 && keptRolls.Contains(20);
            var isNat1 = sides == 20 && keptRolls.Contains(1);

            lock (StateLock)
            {
                CurrentLoommarksBalance += isNat20 ? 35 : 15;
            }

            var modeTag = mode == "advantage" ? " (ADV)" : mode == "disadvantage" ? " (DIS)" : "";
            var modTag = req.Modifier > 0 ? $" + {req.Modifier}" : req.Modifier < 0 ? $" - {Math.Abs(req.Modifier)}" : "";
            var formula = $"{count}d{sides}{modTag}{modeTag}";
            var label = string.IsNullOrWhiteSpace(req.Label) ? "Authoritative Polyhedral Roll" : req.Label.Trim();
            var shader = isNat20
                ? (req.Nat20EffectId ?? skin.Nat20ShaderName)
                : isNat1
                    ? (req.CritFailEffectId ?? skin.Nat1ShaderName)
                    : "Standard Impact";

            var timestamp = DateTimeOffset.UtcNow;
            var payload = $"{campaignId}:{formula}:{string.Join(',', rawRolls)}:{timestamp.ToUnixTimeMilliseconds()}";
            var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
            var digest = "SHA256:" + Convert.ToHexString(hashBytes)[..16];

            var response = new DiceRollResponseContract(
                $"roll-{timestamp.ToUnixTimeMilliseconds()}",
                formula, label, sides, count, mode, rawRolls, keptRolls,
                req.Modifier, total, isNat20, isNat1, skin.Id, shader, digest, timestamp
            );

            RecentCampaignRolls.Enqueue(response);
            while (RecentCampaignRolls.Count > 25)
            {
                RecentCampaignRolls.TryDequeue(out _);
            }

            return Results.Ok(response);
        });

        return api;
    }

    private static DiceForgeUserStateContract BuildStateSnapshot(int campaignId, UserDicePreferenceMemory mem)
    {
        lock (StateLock)
        {
            return new DiceForgeUserStateContract(
                campaignId,
                CurrentLoommarksBalance,
                UnlockedSkins.ToList(),
                UnlockedModels.ToList(),
                Milestones.ToList(),
                mem.ActiveLoadout,
                mem.SavedPresets.ToList(),
                MarketplaceDicePresets.ToList(),
                mem.ActiveCustomConfig ?? mem.ActiveLoadout.CustomConfig ?? ActiveCustomConfigGlobal
            );
        }
    }

    private static string NormalizeRollMode(string? mode) =>
        mode?.Trim().ToLowerInvariant() switch
        {
            "advantage" => "advantage",
            "disadvantage" => "disadvantage",
            _ => "normal"
        };
}
