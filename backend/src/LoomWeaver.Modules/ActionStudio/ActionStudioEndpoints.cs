using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.ActionStudio.Domain;
using LoomWeaver.Modules.ActionStudio.Engine;
using LoomWeaver.Modules.ActionStudio.Infrastructure;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Realtime;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.ActionStudio;

public static class ActionStudioEndpoints
{
    private static readonly CombatRuleEngineInterpreter Interpreter = new();

    public static RouteGroupBuilder MapActionStudioEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/actions/health", async (LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var repo = new ActionStudioMySqlRepository(mysql);
            await repo.EnsureSchemaAsync(ct);
            return Results.Ok(new
            {
                status = "ok",
                service = "actionbuilder",
                version = 2,
                clauseKeywords = ActionEngineSymbolCatalog.GetClauseKeywords(),
                engineClasses = ActionEngineSymbolCatalog.GetEngineSymbols().Select(s => s.ClassName).ToArray(),
                defaultRulesCount = ActionRuleCatalog.GetDefaultRules().Count,
                dmCampaignScoped = true,
                playerAccessBlockedWithoutOwnCampaign = true,
                timestamp = DateTimeOffset.UtcNow
            });
        });

        api.MapGet("/actions/context", async (
            int? campaignId,
            string? accountId,
            HttpContext httpCtx,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var user = ResolveStudioUser(httpCtx, accountId);
            var repo = new ActionStudioMySqlRepository(mysql);
            var ctx = await repo.BuildStudioContextAsync(user, campaignId, ct);
            return Results.Ok(ctx);
        });

        api.MapGet("/actions/symbols", () =>
            Results.Ok(new
            {
                clauseKeywords = ActionEngineSymbolCatalog.GetClauseKeywords(),
                tokenSuggestions = ActionEngineSymbolCatalog.GetTokenSuggestions(),
                engineSymbols = ActionEngineSymbolCatalog.GetEngineSymbols()
            }));

        api.MapPost("/actions/campaigns/{campaignId:int}/apply-rule", async (
            int campaignId,
            ApplyCampaignRuleRequest req,
            string? accountId,
            HttpContext httpCtx,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var user = ResolveStudioUser(httpCtx, accountId);
            var repo = new ActionStudioMySqlRepository(mysql);
            try
            {
                var targetCid = campaignId > 0 ? campaignId : req.CampaignId;
                var result = await repo.ApplyRuleToCampaignAsync(user, targetCid, req.Rule, ct);
                TableRealtimeEndpoints.RecordEvent(
                    result.CampaignId,
                    "campaign_rule_applied",
                    user.DisplayName,
                    result.Message,
                    "{}"
                );
                return Results.Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Results.Json(new { error = ex.Message }, statusCode: StatusCodes.Status403Forbidden);
            }
        });

        api.MapPost("/actions/campaigns/{campaignId:int}/reset-rule", async (
            int campaignId,
            ResetCampaignRuleRequest req,
            string? accountId,
            HttpContext httpCtx,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var user = ResolveStudioUser(httpCtx, accountId);
            var repo = new ActionStudioMySqlRepository(mysql);
            try
            {
                var targetCid = campaignId > 0 ? campaignId : req.CampaignId;
                var updatedRules = await repo.DeleteCustomRuleAsync(user, targetCid, req.RuleId, ct);
                return Results.Ok(new
                {
                    success = true,
                    message = $"Deleted custom action '{req.RuleId}' from campaign #{targetCid}.",
                    rules = updatedRules
                });
            }
            catch (InvalidOperationException ex)
            {
                return Results.Json(new { error = ex.Message }, statusCode: StatusCodes.Status400BadRequest);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Results.Json(new { error = ex.Message }, statusCode: StatusCodes.Status403Forbidden);
            }
        });

        api.MapPost("/actions/campaigns/{campaignId:int}/delete-custom-rule", async (
            int campaignId,
            ResetCampaignRuleRequest req,
            string? accountId,
            HttpContext httpCtx,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var user = ResolveStudioUser(httpCtx, accountId);
            var repo = new ActionStudioMySqlRepository(mysql);
            try
            {
                var targetCid = campaignId > 0 ? campaignId : req.CampaignId;
                var updatedRules = await repo.DeleteCustomRuleAsync(user, targetCid, req.RuleId, ct);
                return Results.Ok(new
                {
                    success = true,
                    message = $"Deleted custom action '{req.RuleId}' from campaign #{targetCid}.",
                    rules = updatedRules
                });
            }
            catch (InvalidOperationException ex)
            {
                return Results.Json(new { error = ex.Message }, statusCode: StatusCodes.Status400BadRequest);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Results.Json(new { error = ex.Message }, statusCode: StatusCodes.Status403Forbidden);
            }
        });

        api.MapPost("/actions/campaigns/create-dm-campaign", async (
            CreateDmCampaignQuickRequest req,
            string? accountId,
            HttpContext httpCtx,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var user = ResolveStudioUser(httpCtx, accountId);
            var repo = new ActionStudioMySqlRepository(mysql);
            var created = await repo.CreateQuickDmCampaignAsync(user, req, ct);
            // The creator becomes the campaign GM in the canonical membership table.
            await CampaignMembershipStore.UpsertAsync(mysql, created.Id, user, "gm", ct: ct);
            var studioContext = await repo.BuildStudioContextAsync(user, created.Id, ct);
            return Results.Ok(studioContext);
        });

        api.MapPost("/actions/evaluate-logic", (EvaluateRuleLogicRequest req) =>
        {
            var response = Interpreter.Evaluate(req);
            return Results.Ok(response);
        });

        api.MapPost("/actions/encounter-step", async (
            EncounterAttackStepRequest req,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var repo = new ActionStudioMySqlRepository(mysql);
            var pipeline = new EncounterReactionPipelineService(repo);
            var result = await pipeline.ExecuteAttackStepAsync(req, ct);
            return Results.Ok(result);
        });

        return api;
    }

    /// <summary>
    /// The studio always acts as the authenticated caller. The legacy accountId parameter is
    /// ignored (CampaignAccessMiddleware strips it) so one account can never impersonate another.
    /// </summary>
    private static StoredUserRecord ResolveStudioUser(HttpContext ctx, string? explicitAccountId)
    {
        _ = explicitAccountId;
        return AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx)
               ?? throw new UnauthorizedAccessException("Sign in to use the ActionBuilder studio.");
    }
}
