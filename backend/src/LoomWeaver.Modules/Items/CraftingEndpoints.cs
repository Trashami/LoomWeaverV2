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
                    proj["status"] = "completed";
                    proj["autoCompletedAt"] = now.ToString("o");
                    await SaveAsync(db, "crafting_project", user.Id, campaignId, proj, ct);

                    // Auto-deposit crafted equipment into character inventory if not already present
                    var charKey = Text(proj, "characterKey");
                    if (proj["outputItem"] is JsonObject output)
                    {
                        var equipment = new JsonObject
                        {
                            ["id"] = $"inv-{Guid.NewGuid():N}",
                            ["name"] = Text(output, "name"),
                            ["slot"] = string.IsNullOrWhiteSpace(Text(output, "slot")) ? "Gear" : Text(output, "slot"),
                            ["summary"] = Text(output, "summary"),
                            ["bonusLabel"] = Text(output, "bonusLabel"),
                            ["equipped"] = false,
                            ["entitlement"] = "free",
                            ["icon"] = string.IsNullOrWhiteSpace(Text(output, "icon")) ? "inventory_2" : Text(output, "icon"),
                            ["weightLb"] = output["weightLb"]?.DeepClone() ?? (JsonNode)1.0,
                            ["valueGp"] = output["valueGp"]?.DeepClone() ?? (JsonNode)25.0,
                            ["rarity"] = string.IsNullOrWhiteSpace(Text(output, "rarity")) ? "Common" : Text(output, "rarity"),
                            ["source"] = "Crafted Project"
                        };
                        var invRow = new JsonObject { ["id"] = Text(equipment, "id"), ["characterKey"] = CharacterKey(charKey), ["equipment"] = equipment };
                        await SaveAsync(db, "inventory", user.Id, campaignId, invRow, ct);
                    }
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

                    // Match item by name
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
                equipment = new JsonObject
                {
                    ["id"] = $"inv-{Guid.NewGuid():N}",
                    ["name"] = outputName,
                    ["slot"] = string.IsNullOrWhiteSpace(Text(outputObj, "slot")) ? "Gear" : Text(outputObj, "slot"),
                    ["summary"] = Text(outputObj, "summary"),
                    ["bonusLabel"] = Text(outputObj, "bonusLabel"),
                    ["equipped"] = false,
                    ["entitlement"] = "free",
                    ["icon"] = string.IsNullOrWhiteSpace(Text(outputObj, "icon")) ? "inventory_2" : Text(outputObj, "icon"),
                    ["weightLb"] = outputObj["weightLb"]?.DeepClone() ?? (JsonNode)1.0,
                    ["valueGp"] = outputObj["valueGp"]?.DeepClone() ?? (JsonNode)25.0,
                    ["rarity"] = string.IsNullOrWhiteSpace(Text(outputObj, "rarity")) ? "Common" : Text(outputObj, "rarity"),
                    ["source"] = "Crafted"
                };
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
                ["status"] = isInstant ? "completed" : "pending",
                ["durationMinutes"] = durationMins,
                ["startedAt"] = now.ToString("o"),
                ["completesAt"] = completesAt.ToString("o"),
                ["materialsConsumed"] = consumedList?.DeepClone(),
                ["outputItem"] = outputObj.DeepClone(),
                ["creatorAccountId"] = user.AccountId,
                ["creatorUsername"] = user.Username,
                ["craftCheckRoll"] = req["craftCheckRoll"]?.DeepClone()
            };

            await SaveAsync(db, "crafting_project", user.Id, campaignId, project, ct);
            return Results.Ok(new { project, equipmentAdded = equipment });
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
            // Only GM or player with elapsed time can approve/complete
            var completesAtStr = Text(project, "completesAt");
            var isExpired = DateTime.TryParse(completesAtStr, out var cTime) && DateTime.UtcNow >= cTime;
            if (member.Value.Role != "gm" && !isExpired && !ItemAccessPolicy.CanUseCharacter(member.Value.Character, charKey))
                return Results.Forbid();

            project["status"] = "completed";
            project["dmApprovedAt"] = DateTime.UtcNow.ToString("o");
            project["approvedBy"] = member.Value.Role == "gm" ? "Dungeon Master" : user.Username;
            if (req["notes"] is not null) project["dmNotes"] = Text(req, "notes");

            var outputObj = project["outputItem"]?.AsObject() ?? new JsonObject();
            var equipment = new JsonObject
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
            var invRow = new JsonObject { ["id"] = Text(equipment, "id"), ["characterKey"] = CharacterKey(charKey), ["equipment"] = equipment };
            await SaveAsync(db, "inventory", user.Id, campaignId, invRow, ct);
            await SaveAsync(db, "crafting_project", user.Id, campaignId, project, ct);

            return Results.Ok(new { project, equipmentAdded = equipment });
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
}
