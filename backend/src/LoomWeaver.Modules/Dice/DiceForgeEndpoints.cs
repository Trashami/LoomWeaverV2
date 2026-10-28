using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using LoomWeaver.Domain;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Dice;

public static class DiceForgeEndpoints
{
    private static readonly object StateLock = new();
    private static int CurrentLoommarksBalance = 1250;

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

    private static DiceForgeLoadoutContract ActiveLoadout = new(
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

    private static readonly List<DiceForgeMilestoneRewardContract> Milestones = new()
    {
        new("milestone-character-studio", "Hero of Icrandor", "Complete a full character build in the Character Studio.", "skin", "skin-fey-emerald", "Edhellain Moonwood", true, false, 150),
        new("milestone-cinth-masquerade", "Velvet & Fangs Survivor", "Survive the Lord of Cinth's masquerade ambush.", "skin", "skin-vampire-bloodstone", "Cinth Crimson Bloodstone", true, false, 200),
        new("milestone-dwarven-delve", "Stone-Sense Delver", "Clear a subterranean encounter using Dwarven Stone-Sense.", "model", "model-dwarven-heavy", "Dwarven Heavy Forge-Cut 3D Model", true, false, 175),
        new("milestone-celtic-warden", "Highland Oathkeeper", "Complete 3 sessions as a party without a fallen companion.", "skin", "skin-celtic-knot", "Highland Relic Bronze", true, false, 150)
    };

    private static readonly List<DiceForgeUserPresetContract> SavedUserPresets = new();
    private static readonly List<DiceForgeMarketplacePresetContract> MarketplaceDicePresets = new();

    private static readonly ConcurrentQueue<DiceRollResponseContract> RecentCampaignRolls = new(new[]
    {
        new DiceRollResponseContract(
            "roll-seed-201", "1d20 + 8 (ADV)", "Fivi Slingshot Tooth Strike", 20, 1, "advantage",
            new[] { 14, 20 }, new[] { 20 }, 8, 28, true, false,
            "skin-obsidian-gold", "Solar Supernova", "SHA256:9F4A2C8E1B77D03E", DateTimeOffset.UtcNow.AddMinutes(-12)
        ),
        new DiceRollResponseContract(
            "roll-seed-200", "2d6 + 5", "Munk Runed Greatsword Cleave", 6, 2, "normal",
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
        new DiceSkinPresetContract("skin-nordic-stone", "Kildrid Runestone", "Carved Mountain Basalt", "#2b2f36", "#63d2ff", 0.12, 0.78, "Astral Singularity", "Basalt Fault Fracture", "Free"),
        new DiceSkinPresetContract("skin-gloss-resin", "Loom Emerald Resin", "Polished Tournament Resin", "#0f3828", "#49e892", 0.06, 0.18, "Solar Supernova", "Ashen Smolder", "Free"),
        new DiceSkinPresetContract("skin-engraved-steel", "Vandia Damascus Steel", "Brushed Damascus Steel", "#303640", "#49e892", 0.92, 0.26, "Solar Supernova", "Artificer Overload Spark", "Free"),
        new DiceSkinPresetContract("skin-astral-glass", "Astral Prism Glass", "Refractive Aether Crystal", "#1b3f5e", "#56e6ff", 0.14, 0.08, "Astral Singularity", "Void Rift Collapse", "Adventurer"),
        new DiceSkinPresetContract("skin-celtic-knot", "Highland Relic Bronze", "Cast Bronze + Filigree", "#1c261e", "#d9a74a", 0.74, 0.38, "Feywild Sylvan Bloom", "Ashen Smolder", "Campaign Reward"),
        new DiceSkinPresetContract("skin-arcane-glyph", "Anelith Glyph Stone", "Slate + Luminary Conduit", "#181326", "#38e8ff", 0.28, 0.42, "Astral Singularity", "Void Rift Collapse", "450 Loommarks"),
        new DiceSkinPresetContract("skin-fey-emerald", "Edhellain Moonwood", "Moonwood & Fey Sap", "#241710", "#2ee66b", 0.08, 0.56, "Feywild Sylvan Bloom", "Withered Bramble Blight", "Milestone Reward"),
        new DiceSkinPresetContract("skin-vampire-bloodstone", "Cinth Crimson Bloodstone", "Bloodstone & Court Silver", "#1f090d", "#ff3b5c", 0.42, 0.28, "Cinth Crimson Ascension", "Basalt Fault Fracture", "Campaign Reward"),
        new DiceSkinPresetContract("skin-clockwork-brass", "Cinth Artificer Brass", "Artificer Brass & Aether", "#2d2112", "#ffb340", 0.90, 0.24, "Aether Overclock", "Artificer Overload Spark", "Store / 600 Marks"),
        new DiceSkinPresetContract("skin-astral-void", "Astral Singularity", "Void Nebula Crystal", "#0b0718", "#c06cff", 0.32, 0.14, "Astral Singularity", "Void Rift Collapse", "750 Loommarks")
    };

    public static RouteGroupBuilder MapDiceForgeEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/dice-skins", (int campaignId) =>
            Results.Ok(GetCuratedSkins()));

        api.MapGet("/campaigns/{campaignId:int}/dice-forge/state", (int campaignId) =>
        {
            lock (StateLock)
            {
                return Results.Ok(BuildStateSnapshot(campaignId));
            }
        });

        api.MapPut("/campaigns/{campaignId:int}/dice-forge/loadout", (int campaignId, DiceForgeLoadoutContract loadout) =>
        {
            lock (StateLock)
            {
                ActiveLoadout = loadout;
                return Results.Ok(BuildStateSnapshot(campaignId));
            }
        });

        api.MapPost("/campaigns/{campaignId:int}/dice-forge/presets", (int campaignId, DiceForgeUserPresetContract preset) =>
        {
            lock (StateLock)
            {
                var idx = SavedUserPresets.FindIndex(p => string.Equals(p.Id, preset.Id, StringComparison.OrdinalIgnoreCase));
                if (idx >= 0)
                {
                    SavedUserPresets[idx] = preset;
                }
                else
                {
                    SavedUserPresets.Insert(0, preset);
                }
                return Results.Ok(SavedUserPresets.ToList());
            }
        });

        api.MapDelete("/campaigns/{campaignId:int}/dice-forge/presets/{presetId}", (int campaignId, string presetId) =>
        {
            lock (StateLock)
            {
                SavedUserPresets.RemoveAll(p => string.Equals(p.Id, presetId, StringComparison.OrdinalIgnoreCase));
                return Results.Ok(SavedUserPresets.ToList());
            }
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

                if (itemType == "model")
                {
                    UnlockedModels.Add(itemId);
                }
                else
                {
                    UnlockedSkins.Add(itemId);
                }

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

    private static DiceForgeUserStateContract BuildStateSnapshot(int campaignId) =>
        new(
            campaignId,
            CurrentLoommarksBalance,
            UnlockedSkins.ToList(),
            UnlockedModels.ToList(),
            Milestones.ToList(),
            ActiveLoadout,
            SavedUserPresets.ToList(),
            MarketplaceDicePresets.ToList()
        );

    private static string NormalizeRollMode(string? mode) =>
        mode?.Trim().ToLowerInvariant() switch
        {
            "advantage" => "advantage",
            "disadvantage" => "disadvantage",
            _ => "normal"
        };
}
