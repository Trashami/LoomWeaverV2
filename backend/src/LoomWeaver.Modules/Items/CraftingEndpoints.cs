using System.Text.Json.Nodes;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using static LoomWeaver.Modules.Items.ItemRepository;

namespace LoomWeaver.Modules.Items;

public static class CraftingEndpoints
{
    public static void MapCraftingEndpoints(this IEndpointRouteBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/crafting/projects", async (int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await using var db = await OpenAsync(repo, ct);
            var member = await MemberAsync(db, campaignId, user.Id, ct);
            if (member is null) return Results.Forbid();

            var rows = await ReadCampaignAsync(db, "crafting_project", campaignId, ct);
            var now = DateTime.UtcNow;
            var updatedProjects = new List<JsonObject>();

            foreach (var proj in rows)
            {
                var status = Text(proj, "status");
                var completesAtStr = Text(proj, "completesAt");
                if (status == "pending" && DateTime.TryParse(completesAtStr, out var completesAt) && now >= completesAt)
                {
                    var charKey = Text(proj, "characterKey");
                    var roll = proj["craftCheckRoll"]?.GetValue<int>() ?? 10;
                    var mod = proj["craftModifier"]?.GetValue<int>() ?? 0;
                    var dc = proj["recipeDc"]?.GetValue<int>() ?? 10;
                    var checkTotal = proj["craftCheckTotal"]?.GetValue<int>() ?? (roll + mod);
                    var isSuccess = (roll == 20) || (checkTotal >= dc && roll != 1);

                    proj["autoCompletedAt"] = now.ToString("o");

                    if (isSuccess)
                    {
                        proj["status"] = "completed";
                        if (roll == 20) proj["isCritSuccess"] = true;

                        if (proj["outputItem"] is JsonObject output)
                        {
                            var equipment = new JsonObject
                            {
                                ["id"] = $"inv-{Guid.NewGuid():N}",
                                ["name"] = Text(output, "name"),
                                ["slot"] = string.IsNullOrWhiteSpace(Text(output, "slot")) ? "Gear" : Text(output, "slot"),
                                ["summary"] = (roll == 20) ? $"{Text(output, "summary")} (Masterwork Craft: Natural 20!)" : Text(output, "summary"),
                                ["bonusLabel"] = (roll == 20) ? $"{Text(output, "bonusLabel")} · Masterwork" : Text(output, "bonusLabel"),
                                ["equipped"] = false,
                                ["entitlement"] = "free",
                                ["icon"] = string.IsNullOrWhiteSpace(Text(output, "icon")) ? "inventory_2" : Text(output, "icon"),
                                ["weightLb"] = output["weightLb"]?.DeepClone() ?? (JsonNode)1.0,
                                ["valueGp"] = output["valueGp"]?.DeepClone() ?? (JsonNode)25.0,
                                ["rarity"] = string.IsNullOrWhiteSpace(Text(output, "rarity")) ? "Common" : Text(output, "rarity"),
                                ["source"] = (roll == 20) ? "Crafted (Masterwork)" : "Crafted Project"
                            };
                            var invRow = new JsonObject { ["id"] = Text(equipment, "id"), ["characterKey"] = CharacterKey(charKey), ["equipment"] = equipment };
                            await SaveAsync(db, "inventory", user.Id, campaignId, invRow, ct);
                        }
                    }
                    else
                    {
                        proj["status"] = "failed";
                        var cat = Text(proj, "category");
                        var mishap = GenerateCraftingMishapItem(cat, dc, checkTotal);
                        proj["mishapItem"] = mishap;
                        proj["failureReason"] = $"Check total {checkTotal} (d20: {roll} + {mod}) failed DC {dc}. Ruined materials yielded {Text(mishap, "name")}.";

                        var invRow = new JsonObject { ["id"] = Text(mishap, "id"), ["characterKey"] = CharacterKey(charKey), ["equipment"] = mishap };
                        await SaveAsync(db, "inventory", user.Id, campaignId, invRow, ct);
                    }

                    await SaveAsync(db, "crafting_project", user.Id, campaignId, proj, ct);
                }
                updatedProjects.Add(proj);
            }

            return Results.Ok(updatedProjects);
        });

        api.MapPost("/campaigns/{campaignId:int}/crafting/start", async (int campaignId, JsonObject req, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await using var db = await OpenAsync(repo, ct);
            var member = await MemberAsync(db, campaignId, user.Id, ct);
            if (member is null) return Results.Forbid();

            var charKey = Text(req, "characterKey");
            if (string.IsNullOrWhiteSpace(charKey) || !ItemAccessPolicy.CanManageCharacter(member.Value.Role, member.Value.Character, charKey))
                return Results.Forbid();

            var recipeName = Text(req, "recipeName");
            var recipeId = Text(req, "recipeId");
            var outputObj = req["outputItem"]?.AsObject() ?? new JsonObject();
            var outputName = Text(outputObj, "name");
            if (string.IsNullOrWhiteSpace(outputName)) outputName = recipeName;

            var durationMins = req["durationMinutes"]?.GetValue<int>() ?? 0;
            var now = DateTime.UtcNow;
            var completesAt = now.AddMinutes(durationMins);
            var isInstant = durationMins <= 0;
            var projectId = $"proj-{Guid.NewGuid():N}";

            var roll = req["craftCheckRoll"]?.GetValue<int>() ?? (new Random().Next(1, 21));
            var mod = req["craftModifier"]?.GetValue<int>() ?? 0;
            var dc = req["recipeDc"]?.GetValue<int>() ?? 10;
            var checkTotal = req["craftCheckTotal"]?.GetValue<int>() ?? (roll + mod);
            var isSuccess = (roll == 20) || (checkTotal >= dc && roll != 1);

            // Consume material items from character inventory
            var consumedList = req["materialsConsumed"]?.AsArray();
            if (consumedList is not null && consumedList.Count > 0)
            {
                var invRows = await ReadCampaignAsync(db, "inventory", campaignId, ct);
                var charItems = invRows.Where(r => Text(r, "characterKey") == CharacterKey(charKey)).ToList();

                foreach (var matNode in consumedList)
                {
                    if (matNode is not JsonObject mat) continue;
                    var matName = Text(mat, "name");
                    var neededCount = mat["count"]?.GetValue<int>() ?? 1;

                    for (int i = 0; i < neededCount; i++)
                    {
                        var matching = charItems.FirstOrDefault(r =>
                            r["equipment"] is JsonObject eq &&
                            Text(eq, "name").Equals(matName, StringComparison.OrdinalIgnoreCase));
                        if (matching is not null)
                        {
                            var invId = Text(matching, "id");
                            await DeleteAsync(db, invId, "inventory", ct);
                            charItems.Remove(matching);
                        }
                    }
                }
            }

            JsonObject? equipment = null;
            if (isInstant)
            {
                if (isSuccess)
                {
                    equipment = new JsonObject
                    {
                        ["id"] = $"inv-{Guid.NewGuid():N}",
                        ["name"] = outputName,
                        ["slot"] = string.IsNullOrWhiteSpace(Text(outputObj, "slot")) ? "Gear" : Text(outputObj, "slot"),
                        ["summary"] = (roll == 20) ? $"{Text(outputObj, "summary")} (Masterwork Craft: Natural 20!)" : Text(outputObj, "summary"),
                        ["bonusLabel"] = (roll == 20) ? $"{Text(outputObj, "bonusLabel")} · Masterwork" : Text(outputObj, "bonusLabel"),
                        ["equipped"] = false,
                        ["entitlement"] = "free",
                        ["icon"] = string.IsNullOrWhiteSpace(Text(outputObj, "icon")) ? "inventory_2" : Text(outputObj, "icon"),
                        ["weightLb"] = outputObj["weightLb"]?.DeepClone() ?? (JsonNode)1.0,
                        ["valueGp"] = outputObj["valueGp"]?.DeepClone() ?? (JsonNode)25.0,
                        ["rarity"] = string.IsNullOrWhiteSpace(Text(outputObj, "rarity")) ? "Common" : Text(outputObj, "rarity"),
                        ["source"] = (roll == 20) ? "Crafted (Masterwork)" : "Crafted"
                    };
                }
                else
                {
                    equipment = GenerateCraftingMishapItem(Text(req, "category"), dc, checkTotal);
                }
                var invRow = new JsonObject { ["id"] = Text(equipment, "id"), ["characterKey"] = CharacterKey(charKey), ["equipment"] = equipment };
                await SaveAsync(db, "inventory", user.Id, campaignId, invRow, ct);
            }

            var project = new JsonObject
            {
                ["id"] = projectId,
                ["campaignId"] = campaignId,
                ["characterKey"] = CharacterKey(charKey),
                ["characterName"] = Text(req, "characterName"),
                ["recipeId"] = recipeId,
                ["recipeName"] = recipeName,
                ["outputItemName"] = outputName,
                ["category"] = Text(req, "category"),
                ["status"] = isInstant ? (isSuccess ? "completed" : "failed") : "pending",
                ["durationMinutes"] = durationMins,
                ["startedAt"] = now.ToString("o"),
                ["completesAt"] = completesAt.ToString("o"),
                ["materialsConsumed"] = consumedList?.DeepClone(),
                ["outputItem"] = outputObj.DeepClone(),
                ["creatorAccountId"] = user.AccountId,
                ["creatorUsername"] = user.Username,
                ["craftCheckRoll"] = roll,
                ["craftModifier"] = mod,
                ["craftCheckTotal"] = checkTotal,
                ["recipeDc"] = dc,
                ["dcSkill"] = Text(req, "dcSkill")
            };

            if (isInstant && !isSuccess && equipment is not null)
            {
                project["mishapItem"] = equipment;
                project["failureReason"] = $"Check total {checkTotal} (d20: {roll} + {mod}) failed DC {dc}. Ruined materials yielded {Text(equipment, "name")}.";
            }

            await SaveAsync(db, "crafting_project", user.Id, campaignId, project, ct);
            return Results.Ok(new { project, equipmentAdded = equipment, isSuccess });
        });

        api.MapPost("/campaigns/{campaignId:int}/crafting/projects/{projectId}/approve", async (int campaignId, string projectId, JsonObject req, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await using var db = await OpenAsync(repo, ct);
            var member = await MemberAsync(db, campaignId, user.Id, ct);
            if (member is null) return Results.Forbid();

            var rows = await ReadCampaignAsync(db, "crafting_project", campaignId, ct);
            var project = rows.FirstOrDefault(r => Text(r, "id") == projectId);
            if (project is null) return Results.NotFound(new { error = "Project not found." });

            var charKey = Text(project, "characterKey");
            var completesAtStr = Text(project, "completesAt");
            var isExpired = DateTime.TryParse(completesAtStr, out var cTime) && DateTime.UtcNow >= cTime;
            if (member.Value.Role != "gm" && !isExpired && !ItemAccessPolicy.CanUseCharacter(member.Value.Character, charKey))
                return Results.Forbid();

            var outcome = Text(req, "outcome");
            if (string.IsNullOrWhiteSpace(outcome)) outcome = "auto";

            var roll = project["craftCheckRoll"]?.GetValue<int>() ?? 10;
            var mod = project["craftModifier"]?.GetValue<int>() ?? 0;
            var dc = project["recipeDc"]?.GetValue<int>() ?? 10;
            var checkTotal = project["craftCheckTotal"]?.GetValue<int>() ?? (roll + mod);

            bool isSuccess = outcome == "success" || (outcome == "auto" && ((roll == 20) || (checkTotal >= dc && roll != 1)));

            project["dmApprovedAt"] = DateTime.UtcNow.ToString("o");
            project["approvedBy"] = member.Value.Role == "gm" ? "Dungeon Master" : user.Username;
            if (req["notes"] is not null) project["dmNotes"] = Text(req, "notes");

            JsonObject equipment;
            if (isSuccess)
            {
                project["status"] = "completed";
                var outputObj = project["outputItem"]?.AsObject() ?? new JsonObject();
                equipment = new JsonObject
                {
                    ["id"] = $"inv-{Guid.NewGuid():N}",
                    ["name"] = Text(outputObj, "name"),
                    ["slot"] = string.IsNullOrWhiteSpace(Text(outputObj, "slot")) ? "Gear" : Text(outputObj, "slot"),
                    ["summary"] = Text(outputObj, "summary"),
                    ["bonusLabel"] = Text(outputObj, "bonusLabel"),
                    ["equipped"] = false,
                    ["entitlement"] = "free",
                    ["icon"] = string.IsNullOrWhiteSpace(Text(outputObj, "icon")) ? "inventory_2" : Text(outputObj, "icon"),
                    ["weightLb"] = outputObj["weightLb"]?.DeepClone() ?? (JsonNode)1.0,
                    ["valueGp"] = outputObj["valueGp"]?.DeepClone() ?? (JsonNode)25.0,
                    ["rarity"] = string.IsNullOrWhiteSpace(Text(outputObj, "rarity")) ? "Common" : Text(outputObj, "rarity"),
                    ["source"] = "Crafted Project"
                };
            }
            else
            {
                project["status"] = "failed";
                equipment = GenerateCraftingMishapItem(Text(project, "category"), dc, checkTotal);
                project["mishapItem"] = equipment;
                project["failureReason"] = $"Check total {checkTotal} failed DC {dc}. Ruined materials yielded {Text(equipment, "name")}.";
            }

            var invRow = new JsonObject { ["id"] = Text(equipment, "id"), ["characterKey"] = CharacterKey(charKey), ["equipment"] = equipment };
            await SaveAsync(db, "inventory", user.Id, campaignId, invRow, ct);
            await SaveAsync(db, "crafting_project", user.Id, campaignId, project, ct);

            return Results.Ok(new { project, equipmentAdded = equipment, isSuccess });
        });

        api.MapPost("/campaigns/{campaignId:int}/crafting/forage-harvest", async (int campaignId, JsonObject req, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await using var db = await OpenAsync(repo, ct);
            var member = await MemberAsync(db, campaignId, user.Id, ct);
            if (member is null) return Results.Forbid();

            var charKey = Text(req, "characterKey");
            if (string.IsNullOrWhiteSpace(charKey) || !ItemAccessPolicy.CanManageCharacter(member.Value.Role, member.Value.Character, charKey))
                return Results.Forbid();

            var itemsArray = req["items"]?.AsArray();
            if (itemsArray is null || itemsArray.Count == 0)
                return Results.BadRequest(new { error = "No items provided." });

            var added = new List<JsonObject>();
            foreach (var itemNode in itemsArray)
            {
                if (itemNode is not JsonObject it) continue;
                var count = it["count"]?.GetValue<int>() ?? 1;
                for (int i = 0; i < count; i++)
                {
                    var equipment = new JsonObject
                    {
                        ["id"] = $"inv-{Guid.NewGuid():N}",
                        ["name"] = Text(it, "name"),
                        ["slot"] = "Gear",
                        ["summary"] = Text(it, "description"),
                        ["bonusLabel"] = Text(it, "category"),
                        ["equipped"] = false,
                        ["entitlement"] = "free",
                        ["icon"] = "eco",
                        ["weightLb"] = it["weightLb"]?.DeepClone() ?? (JsonNode)0.25,
                        ["valueGp"] = it["valueGp"]?.DeepClone() ?? (JsonNode)1.0,
                        ["rarity"] = string.IsNullOrWhiteSpace(Text(it, "rarity")) ? "Common" : Text(it, "rarity"),
                        ["source"] = $"Foraged ({Text(req, "biome")})"
                    };
                    var row = new JsonObject { ["id"] = Text(equipment, "id"), ["characterKey"] = CharacterKey(charKey), ["equipment"] = equipment };
                    await SaveAsync(db, "inventory", user.Id, campaignId, row, ct);
                    added.Add(equipment);
                }
            }

            return Results.Ok(new { success = true, count = added.Count, items = added });
        });
    }

    private static JsonObject GenerateCraftingMishapItem(string category, int dc, int rollTotal)
    {
        var cat = (category ?? "").ToLowerInvariant();
        if (cat.Contains("herb") || cat.Contains("heal"))
        {
            return new JsonObject
            {
                ["id"] = $"inv-{Guid.NewGuid():N}",
                ["name"] = "Tainted Toxic Draft",
                ["slot"] = "Gear",
                ["summary"] = $"Noxious bubbling concoction produced from botched herbalism (Roll {rollTotal} vs DC {dc}). Inflicts Poisoned for 1 hour if ingested.",
                ["bonusLabel"] = "Poison Hazard",
                ["equipped"] = false,
                ["entitlement"] = "free",
                ["icon"] = "science",
                ["weightLb"] = 0.5,
                ["valueGp"] = 5.0,
                ["rarity"] = "Hazardous",
                ["source"] = "Crafting Mishap"
            };
        }
        if (cat.Contains("alchem"))
        {
            return new JsonObject
            {
                ["id"] = $"inv-{Guid.NewGuid():N}",
                ["name"] = "Volatile Caustic Slag",
                ["slot"] = "Gear",
                ["summary"] = $"Unstable smoldering residue from a failed chemical reaction (Roll {rollTotal} vs DC {dc}). Deals 1d6 acid/fire damage if dropped.",
                ["bonusLabel"] = "Acid Hazard",
                ["equipped"] = false,
                ["entitlement"] = "free",
                ["icon"] = "local_fire_department",
                ["weightLb"] = 1.0,
                ["valueGp"] = 6.0,
                ["rarity"] = "Hazardous",
                ["source"] = "Crafting Mishap"
            };
        }
        if (cat.Contains("smith"))
        {
            return new JsonObject
            {
                ["id"] = $"inv-{Guid.NewGuid():N}",
                ["name"] = "Brittle Shattered Slag",
                ["slot"] = "Gear",
                ["summary"] = $"Improperly quenched iron that cracked under stress (Roll {rollTotal} vs DC {dc}). Can be melted down as 5 gp scrap metal.",
                ["bonusLabel"] = "Scrap Metal",
                ["equipped"] = false,
                ["entitlement"] = "free",
                ["icon"] = "hardware",
                ["weightLb"] = 4.0,
                ["valueGp"] = 5.0,
                ["rarity"] = "Flawed",
                ["source"] = "Crafting Mishap"
            };
        }
        if (cat.Contains("arcane"))
        {
            return new JsonObject
            {
                ["id"] = $"inv-{Guid.NewGuid():N}",
                ["name"] = "Arcane Fallout Ash",
                ["slot"] = "Gear",
                ["summary"] = $"Scorched vellum soot emitting crackling sparks (Roll {rollTotal} vs DC {dc}). Touching it discharges 1d4 static shock.",
                ["bonusLabel"] = "Wild Magic Hazard",
                ["equipped"] = false,
                ["entitlement"] = "free",
                ["icon"] = "bolt",
                ["weightLb"] = 0.25,
                ["valueGp"] = 10.0,
                ["rarity"] = "Hazardous",
                ["source"] = "Crafting Mishap"
            };
        }
        if (cat.Contains("leather"))
        {
            return new JsonObject
            {
                ["id"] = $"inv-{Guid.NewGuid():N}",
                ["name"] = "Ruined Shriveled Hide",
                ["slot"] = "Gear",
                ["summary"] = $"Brittle, cracked hide ruined by flawed tannin ratios (Roll {rollTotal} vs DC {dc}). Worthless scrap.",
                ["bonusLabel"] = "Ruined Hide",
                ["equipped"] = false,
                ["entitlement"] = "free",
                ["icon"] = "content_cut",
                ["weightLb"] = 2.0,
                ["valueGp"] = 2.0,
                ["rarity"] = "Flawed",
                ["source"] = "Crafting Mishap"
            };
        }
        return new JsonObject
        {
            ["id"] = $"inv-{Guid.NewGuid():N}",
            ["name"] = "Spoiled Rancid Provisions",
            ["slot"] = "Gear",
            ["summary"] = $"Foul-smelling, spoiled concoction unfit for consumption (Roll {rollTotal} vs DC {dc}).",
            ["bonusLabel"] = "Spoiled Rations",
            ["equipped"] = false,
            ["entitlement"] = "free",
            ["icon"] = "restaurant",
            ["weightLb"] = 1.0,
            ["valueGp"] = 0.1,
            ["rarity"] = "Flawed",
            ["source"] = "Crafting Mishap"
        };
    }
}
