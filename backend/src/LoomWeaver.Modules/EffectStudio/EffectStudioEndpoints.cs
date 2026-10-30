using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.EffectStudio.Domain;
using LoomWeaver.Modules.EffectStudio.Engine;
using LoomWeaver.Modules.EffectStudio.Infrastructure;
using LoomWeaver.Modules.Realtime;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.EffectStudio;

public static class EffectStudioEndpoints
{
    private static readonly EffectTimelineValidationEngine Engine = new();

    public static RouteGroupBuilder MapEffectStudioEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/effects/health", async (LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var repo = new EffectStudioMySqlRepository(mysql, Engine);
            await repo.EnsureSchemaAndSeedAsync(ct);
            return Results.Ok(new
            {
                status = "ok",
                service = "effectbuilder",
                version = 14,
                surfaceLighting = true,
                normalMappedPreview = true,
                spellTemplates = 25,
                cinematicCones = true,
                gameplayRiders = true,
                cinematicMaterials = true,
                summonTokens = true,
                styles = 130,
                effectKinds = 26,
                extractedCoreLayers = 17,
                spellIconTiles = 24,
                blendModes = 10,
                opacityKeyframes = true,
                ambientPresets = 43,
                texturedFireball = true,
                shaderFireHit = true,
                magicMissile = true,
                standaloneExportImport = true,
                mysqlBacked = true,
                emittersLoaded = EffectEmitterCatalog.GetAllEmitters().Count,
                timestamp = DateTimeOffset.UtcNow
            });
        });

        api.MapEffectLibraryAndAssignmentEndpoints();
        api.MapEffectMarketplaceAndCatalogEndpoints();
        api.MapEffectPresetEndpoints();

        api.MapGet("/effects/studio", async (
            int? campaignId,
            string? effectId,
            string? viewerRole,
            string? username,
            string? boundCharacter,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var repo = new EffectStudioMySqlRepository(mysql, Engine);
            var cid = campaignId.GetValueOrDefault(1);
            var campaigns = await mysql.GetCampaignsAsync(ct);
            var activeCampaign = campaigns.FirstOrDefault(c => c.Id == cid) ?? campaigns[0];
            var emitters = EffectEmitterCatalog.GetAllEmitters();
            var documents = await repo.GetCampaignEffectsAsync(activeCampaign.Id, ct);
            var activeDoc = documents.FirstOrDefault(d =>
                !string.IsNullOrWhiteSpace(effectId) &&
                string.Equals(d.Id, effectId, StringComparison.OrdinalIgnoreCase))
                ?? Engine.GetOrDefaultDocument(effectId);

            var characters = await repo.GetAuthorizedCharactersAsync(
                activeCampaign.Id,
                viewerRole ?? "gm",
                username ?? "GeoJason",
                boundCharacter ?? "GM",
                ct);
            var assignments = await repo.GetCampaignAssignmentsAsync(activeCampaign.Id, ct);

            return Results.Ok(new
            {
                campaigns,
                activeCampaign,
                authorizedCharacters = characters,
                assignments,
                emitters,
                documents,
                activeDocument = activeDoc
            });
        });

        api.MapGet("/effects/campaigns/{campaignId:int}/context", async (
            int campaignId,
            string? viewerRole,
            string? username,
            string? boundCharacter,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var repo = new EffectStudioMySqlRepository(mysql, Engine);
            var campaigns = await mysql.GetCampaignsAsync(ct);
            var activeCampaign = campaigns.FirstOrDefault(c => c.Id == campaignId) ?? campaigns[0];
            var characters = await repo.GetAuthorizedCharactersAsync(
                activeCampaign.Id,
                viewerRole ?? "gm",
                username ?? "GeoJason",
                boundCharacter ?? "GM",
                ct);
            var assignments = await repo.GetCampaignAssignmentsAsync(activeCampaign.Id, ct);
            var documents = await repo.GetCampaignEffectsAsync(activeCampaign.Id, ct);

            return Results.Ok(new
            {
                activeCampaign,
                authorizedCharacters = characters,
                assignments,
                documents
            });
        });

        api.MapPost("/effects/campaigns/{campaignId:int}/push", async (
            int campaignId,
            PushEffectToCampaignRequest req,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var repo = new EffectStudioMySqlRepository(mysql, Engine);
            try
            {
                var normalizedReq = req with { CampaignId = campaignId <= 0 ? req.CampaignId : campaignId };
                var response = await repo.PushEffectToCampaignAsync(normalizedReq, ct);
                TableRealtimeEndpoints.RecordEvent(
                    response.Assignment.CampaignId,
                    "effect_pushed_to_campaign",
                    "EffectBuilder Studio",
                    response.Message,
                    "{}"
                );
                return Results.Ok(response);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Results.Json(new { error = ex.Message }, statusCode: StatusCodes.Status403Forbidden);
            }
        });

        api.MapGet("/effects/emitters", (string? category, string? q) =>
        {
            var all = EffectEmitterCatalog.GetAllEmitters();
            var filtered = all.Where(e =>
                (string.IsNullOrWhiteSpace(category) ||
                 string.Equals(category, "All Categories", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(e.Category, category, StringComparison.OrdinalIgnoreCase)) &&
                (string.IsNullOrWhiteSpace(q) ||
                 e.Name.Contains(q.Trim(), StringComparison.OrdinalIgnoreCase) ||
                 e.Category.Contains(q.Trim(), StringComparison.OrdinalIgnoreCase) ||
                 e.MaterialName.Contains(q.Trim(), StringComparison.OrdinalIgnoreCase))
            ).ToList();

            return Results.Ok(filtered);
        });

        api.MapPost("/effects/save", async (
            SaveEffectStudioDocumentRequest req,
            string? username,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var repo = new EffectStudioMySqlRepository(mysql, Engine);
            var saved = await repo.SaveEffectAsync(req, username, ct);
            TableRealtimeEndpoints.RecordEvent(
                saved.CampaignId,
                "effect_saved",
                "EffectBuilder Studio",
                $"Saved visual effect '{saved.Name}' ({saved.Tracks.Count} tracks, {saved.ActiveProperties.EmissionRate} pts/s).",
                "{}"
            );
            return Results.Ok(saved);
        });

        api.MapPost("/effects/test-in-game", (EffectInGameTestRequest req) =>
        {
            var result = Engine.SimulateInGameTest(req);
            TableRealtimeEndpoints.RecordEvent(
                1,
                "effect_tested",
                "EffectBuilder In-Game Test",
                result.CombatLogSummary,
                "{}"
            );
            return Results.Ok(result);
        });

        api.MapGet("/effects/{effectId}/export", (string effectId) =>
        {
            var bundle = Engine.BuildExportBundle(effectId);
            return Results.Ok(bundle);
        });

        return api;
    }
}
