using LoomWeaver.Domain;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Marketplace;

public static class MarketplaceAndQuestEndpoints
{
    private static readonly List<MultiStepQuestContract> CampaignQuests = new()
    {
        new MultiStepQuestContract(
            "quest-cinth-masquerade",
            "Velvet & Fangs at the Cinth Masquerade",
            "Lord of Cinth & Artificers Guild Liaison",
            "Vandia Cliff-House & Plains of Red",
            "Grand Ballroom of Cinth",
            "Arrive in Cinth with the two Well of Life Luminaries concealed",
            2400,
            "active",
            new[] { "1:Clue:clue-chokrah-manifest", "1:NPC:npc-emrys" },
            new[]
            {
                new QuestStepContract("step-1", "Travel northeast from Vandia across the Plains of Red to Cinth", "Plains of Red", true),
                new QuestStepContract("step-2", "Befriend the Cinth Artificers Guild and inspect their non-magical defenses", "Cinth Guildhall", true),
                new QuestStepContract("step-3", "Attend the Lord of Cinth's masquerade and converse with Lord Emrys", "Cinth Ballroom", true),
                new QuestStepContract("step-4", "Repel the Crimson Covenant vampire ambush before the nobles are turned", "Cinth Ballroom", false)
            }
        ),
        new MultiStepQuestContract(
            "quest-shadow-mountain",
            "Shadow Beneath the Mountain",
            "Lord Emrys (Deceptive Diversion) & Kildrid's Stone Sense",
            "Cinth South Gate",
            "Runic Containment Cavern Beneath the Mountain",
            "Complete the Cinth Masquerade and begin the return road toward Vandia",
            4500,
            "active",
            new[] { "1:Location:loc-mountain-cavern", "1:Character:char-fivi" },
            new[]
            {
                new QuestStepContract("step-m1", "Trace the poisoned forest roots above the hundred-year runic prison", "Gwaedhellain Forest", true),
                new QuestStepContract("step-m2", "Survive the bound dragon's desperation assault inside the rune cavern", "Subterranean Vault", true),
                new QuestStepContract("step-m3", "Deliver the final tooth-loaded slingshot strike and witness Emrys's betrayal", "Runic Altar", false)
            }
        ),
        new MultiStepQuestContract(
            "quest-edhellain-crown",
            "Book Two: The Skyship Crash & Pages of Edhellain",
            "Captain Kutler & Munk's Village Mentor",
            "Vandia Sky-Dock",
            "Royal Archives of Edhellain",
            "Claim Kutler's skyship after the Lost Isles Chokrah briefing",
            3600,
            "active",
            new[] { "1:Character:char-munk", "1:Character:char-dal" },
            new[]
            {
                new QuestStepContract("step-b1", "Board Kutler's skyship (which Fivi immediately claims as hers)", "Vandia Sky-Dock", true),
                new QuestStepContract("step-b2", "Survive the mysterious skyship crash near Munk's childhood village and repel the full-blood orc siege", "Borderland Village", false),
                new QuestStepContract("step-b3", "Recover the missing pages in Edhellain confirming Dal's true royal lineage", "Edhellain Archives", false)
            }
        )
    };

    private static readonly List<MarketplaceCreatorModuleContract> CreatorModules = new()
    {
        new MarketplaceCreatorModuleContract(
            "mod-cinth-masquerade-pack",
            "Cinth Masquerade & Artificer District Campaign Module",
            "@TrashamiChronicles",
            "Adventure Module",
            24.00,
            20.40,
            3.60,
            "85% Creator ($20.40) / 15% Platform ($3.60)",
            1420,
            4.9,
            "Complete Book One Cinth act with 3D ballroom maps, vampire coven statblocks, Artificer Guild NPCs, and 4-stem waltz audio.",
            new[] { "3 Babylon.js Battlemaps", "9 Custom NPCs & Vampires", "4 Adaptive Audio Stems", "12 Graph Nodes" },
            true
        ),
        new MarketplaceCreatorModuleContract(
            "mod-shadow-mountain-raid",
            "Shadow of the Mountain — Runic Cavern & Dragon Boss Pack",
            "@TrashamiChronicles",
            "Boss Encounter",
            18.00,
            15.30,
            2.70,
            "85% Creator ($15.30) / 15% Platform ($2.70)",
            1185,
            5.0,
            "Multi-phase ancient bound dragon encounter with glowing containment runes, poisoned canopy scatter assets, and custom EffectBuilder timelines.",
            new[] { "Runic Cavern 3D Map", "Ancient Bound Dragon Boss", "5 Spell FX Timelines", "Runed Obsidian Dice Skin" },
            true
        ),
        new MarketplaceCreatorModuleContract(
            "mod-skyship-lost-isles",
            "Kutler's Skyship & Lost Isles Chokrah Investigation",
            "@IcrandorCartography",
            "Expansion Pack",
            16.00,
            13.60,
            2.40,
            "85% Creator ($13.60) / 15% Platform ($2.40)",
            890,
            4.8,
            "Steampunk-adjacent artificer skyship deck plans, Chokrah cargo manifests, and Book Two borderland village siege encounters.",
            new[] { "Multi-Deck Skyship Map", "Artificer Clockwork Brass Dice", "6 Homebrew Actions", "Skyship Wind Audio Preset" },
            false
        )
    };

    public static RouteGroupBuilder MapMarketplaceAndQuestEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/quests", (int campaignId) =>
            Results.Ok(CampaignQuests));

        api.MapPost("/campaigns/{campaignId:int}/quests/{questId}/steps/{stepId}/toggle", (
            int campaignId,
            string questId,
            string stepId) =>
        {
            var idx = CampaignQuests.FindIndex(q => q.Id == questId);
            if (idx < 0)
            {
                return Results.NotFound(new { message = "Quest not found." });
            }

            var quest = CampaignQuests[idx];
            var updatedSteps = quest.Steps
                .Select(s => s.StepId == stepId ? s with { Completed = !s.Completed } : s)
                .ToList();

            var allDone = updatedSteps.All(s => s.Completed);
            var updatedQuest = quest with
            {
                Steps = updatedSteps,
                Status = allDone ? "completed" : "active"
            };

            CampaignQuests[idx] = updatedQuest;

            return Results.Ok(new
            {
                quest = updatedQuest,
                awardedXp = allDone ? updatedQuest.XpReward : 0,
                message = allDone
                    ? $"Quest '{updatedQuest.Title}' completed! +{updatedQuest.XpReward} XP automatically awarded to the party."
                    : $"Updated objective '{stepId}' for '{updatedQuest.Title}'."
            });
        });

        api.MapGet("/marketplace/modules", () =>
            Results.Ok(CreatorModules));

        api.MapPost("/marketplace/modules/{moduleId}/import", (string moduleId) =>
        {
            var idx = CreatorModules.FindIndex(m => m.Id == moduleId);
            if (idx < 0)
            {
                return Results.NotFound(new { message = "Marketplace module not found." });
            }

            var updated = CreatorModules[idx] with
            {
                Installed = true,
                PopularityImports = CreatorModules[idx].PopularityImports + 1
            };
            CreatorModules[idx] = updated;

            return Results.Ok(new
            {
                module = updated,
                importedIntoCampaignId = 1,
                message = $"One-click imported '{updated.Title}' into Campaign #1 (85/15 creator split verified: ${updated.CreatorShareUsd:F2} to {updated.CreatorHandle})."
            });
        });

        api.MapGet("/campaigns/{campaignId:int}/export-package", (int campaignId) =>
        {
            return Results.Ok(new
            {
                schemaVersion = "loomweaver-package-v2.0",
                campaignId,
                campaignTitle = "Shadow of the Mountain — Book I & II Chronicle",
                exportedAt = DateTimeOffset.UtcNow,
                databaseSource = "loomweaver",
                neo4jNamespace = "loomweaver",
                royaltyStandard = "85/15 Creator Split",
                questsCount = CampaignQuests.Count,
                quests = CampaignQuests,
                installedModules = CreatorModules.Where(m => m.Installed).Select(m => m.Id).ToArray()
            });
        });

        return api;
    }
}
