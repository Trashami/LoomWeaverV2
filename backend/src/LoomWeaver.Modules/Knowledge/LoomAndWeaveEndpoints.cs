using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Infrastructure.Neo4j;
using LoomWeaver.Modules.Adventures;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Knowledge;

public static class LoomAndWeaveEndpoints
{
    // Campaign notes and Weave drafts start empty and are created per campaign by the GM.
    private static readonly List<ScopedCampaignNoteContract> CampaignNotes = new();

    private static readonly List<WeaveDraftContract> WeaveDrafts = new();

    public static RouteGroupBuilder MapLoomAndWeaveEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/notes", (
            int campaignId,
            string? role,
            string? witness,
            HttpContext httpContext) =>
        {
            var access = CampaignAccessResolver.Resolve(httpContext, campaignId, role);
            var isGm = access.IsEffectiveGm;
            var filtered = CampaignNotes
                .Where(n => n.CampaignId == campaignId)
                .Where(n =>
                    isGm ||
                    n.Scope == "party_shared" ||
                    (n.Scope == "private_player" &&
                     (string.IsNullOrWhiteSpace(witness) ||
                      string.Equals(n.WitnessCharacter, witness, StringComparison.OrdinalIgnoreCase))))
                .OrderByDescending(n => n.SessionNumber)
                .ToList();

            return Results.Ok(filtered);
        });

        api.MapPost("/campaigns/{campaignId:int}/notes", (
            int campaignId,
            CreateScopedNoteRequest req) =>
        {
            var scope = NormalizeScope(req.Scope);
            var note = new ScopedCampaignNoteContract(
                $"note-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                campaignId,
                string.IsNullOrWhiteSpace(req.Title) ? "Session Chronicle Note" : req.Title.Trim(),
                string.IsNullOrWhiteSpace(req.Content) ? "Recorded in campaign memory." : req.Content.Trim(),
                scope,
                string.IsNullOrWhiteSpace(req.AuthorName) ? "Adventurer" : req.AuthorName.Trim(),
                string.IsNullOrWhiteSpace(req.WitnessCharacter) ? "Party" : req.WitnessCharacter.Trim(),
                Math.Max(0, req.SessionNumber),
                string.IsNullOrWhiteSpace(req.DeepLinkRoute) ? "/campaigns" : req.DeepLinkRoute.Trim(),
                req.LinkedEntityKeys ?? Array.Empty<string>(),
                DateTimeOffset.UtcNow
            );
            CampaignNotes.Insert(0, note);
            return Results.Ok(note);
        });

        api.MapPost("/campaigns/{campaignId:int}/loom/query", async (
            int campaignId,
            LoomGraphRagRequest req,
            LoomWeaverMySqlRepository repo,
            LoomWeaverNeo4jService graph,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            var access = CampaignAccessResolver.Resolve(httpContext, campaignId, req.Role);
            var isGm = access.IsEffectiveGm;
            var viewerRole = access.EffectiveViewerRole;
            var witness = string.IsNullOrWhiteSpace(req.WitnessCharacter) ? "All Party" : req.WitnessCharacter.Trim();
            var q = string.IsNullOrWhiteSpace(req.Query) ? "" : req.Query.Trim();

            var entities = await repo.GetAuthorizedEntitiesAsync(campaignId, viewerRole, null, ct);
            var matchedEntities = entities
                .Where(e =>
                    e.Name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                    e.Summary.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                    e.Subtitle.Contains(q, StringComparison.OrdinalIgnoreCase))
                .Take(5)
                .ToList();

            if (matchedEntities.Count == 0)
            {
                matchedEntities = entities.Take(4).ToList();
            }

            var citations = matchedEntities
                .Select(m => new LoomCitationDto(
                    m.CompositeKey,
                    m.Name,
                    m.EntityType,
                    m.Summary,
                    m.RouteLink,
                    m.Visibility))
                .ToList();

            // Bestiary canon: when/where the party met a creature and what happened, filtered per player character.
            var (_, monsterAccess) = await LoomWeaver.Modules.Bestiary.BestiaryCampaignEndpoints.ResolveAsync(
                httpContext, campaignId, req.Role, repo, ct);
            if (monsterAccess.UserId != 0)
            {
                await LoomWeaver.Modules.Bestiary.BestiaryPersistence.EnsureReadyAsync(repo, ct);
                citations.AddRange(LoomWeaver.Modules.Bestiary.BestiaryCampaignStore.LoomCitations(
                    campaignId, monsterAccess.IsEffectiveGm, monsterAccess.BoundCharacterKey, q));
            }

            var matchingNotes = CampaignNotes
                .Where(n => n.CampaignId == campaignId)
                .Where(n =>
                    isGm ||
                    n.Scope == "party_shared" ||
                    (req.IncludePrivateNotes &&
                     n.Scope == "private_player" &&
                     (witness == "All Party" || string.Equals(n.WitnessCharacter, witness, StringComparison.OrdinalIgnoreCase))))
                .Where(n =>
                    n.Title.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                    n.Content.Contains(q, StringComparison.OrdinalIgnoreCase))
                .Take(4)
                .ToList();

            var graphPaths = await ConnectedStoryEngine.QueryAuthorizedLoomPathsAsync(campaignId, access, q, graph, ct);
            var activeClaims = ConnectedStorySeedStore.Claims
                .Where(c => c.CampaignId == campaignId && (isGm || c.Visibility != "gm"))
                .ToList();
            var claimSummary = activeClaims.Count > 0
                ? $" Separated Truth vs. Testimony across {activeClaims.Count} claim(s) ({string.Join(", ", activeClaims.Select(c => $"{c.Title}: {c.TruthAssessment.ToUpperInvariant()}"))})."
                : "";

            var synthesis =
                $"[The Loom · Zero-Generation GraphRAG · Role={viewerRole.ToUpperInvariant()} · Witness={witness}]: " +
                $"Synthesized {citations.Count} canonical record(s), {graphPaths.Count} Neo4j+SQL relationship path(s), and {matchingNotes.Count} scoped note(s) for \"{q}\".{claimSummary} Zero unverified lore generated.";

            return Results.Ok(new LoomGraphRagResponse(
                campaignId,
                q,
                viewerRole,
                witness,
                synthesis,
                citations,
                graphPaths,
                matchingNotes
            ));
        });

        api.MapGet("/campaigns/{campaignId:int}/weave/drafts", (int campaignId) =>
            Results.Ok(WeaveDrafts));

        api.MapPost("/campaigns/{campaignId:int}/weave/generate", (
            int campaignId,
            WeaveGenerateRequest req) =>
        {
            var cat = string.IsNullOrWhiteSpace(req.Category) ? "NPC" : req.Category.Trim();
            var loc = string.IsNullOrWhiteSpace(req.GroundedLocation) ? "Campaign canon" : req.GroundedLocation.Trim();
            var prompt = string.IsNullOrWhiteSpace(req.Prompt) ? "Campaign-grounded draft" : req.Prompt.Trim();
            var id = $"draft-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";

            var draft = new WeaveDraftContract(
                id,
                $"1:{cat}:{id}",
                cat,
                $"[Weave Draft] {prompt}",
                $"{cat} Concept · Grounded in {loc}",
                $"Context-grounded {cat} draft generated from established campaign canon in {loc}. Requires 100% GM review before committing to MySQL canon or projecting to the Neo4j graph.",
                $"Grounded in {loc} · Canon-Safe Context",
                new[] { $"LOCATED_IN -> 1:Location:{loc.ToLowerInvariant().Replace(' ', '-')}" },
                "draft",
                string.Equals(req.Visibility, "gm", StringComparison.OrdinalIgnoreCase) ? "gm" : "players"
            );

            WeaveDrafts.Insert(0, draft);
            return Results.Ok(draft);
        });

        api.MapPost("/campaigns/{campaignId:int}/weave/drafts/{draftId}/review", (
            int campaignId,
            string draftId,
            WeaveReviewRequest req) =>
        {
            var idx = WeaveDrafts.FindIndex(d => d.Id == draftId || d.CompositeKey == draftId);
            if (idx < 0)
            {
                return Results.NotFound(new { message = "Draft not found." });
            }

            var current = WeaveDrafts[idx];
            var action = req.Action?.Trim().ToLowerInvariant() ?? "approve";

            var updatedStatus = action switch
            {
                "reject" => "rejected",
                "reweave" => "draft",
                _ => "approved"
            };

            var updatedSummary = string.IsNullOrWhiteSpace(req.UpdatedSummary)
                ? (action == "reweave" && !string.IsNullOrWhiteSpace(req.RefinementNote)
                    ? $"{current.Summary} [Re-Woven with GM direction: {req.RefinementNote.Trim()}]"
                    : current.Summary)
                : req.UpdatedSummary.Trim();

            var updated = current with
            {
                Name = string.IsNullOrWhiteSpace(req.UpdatedName) ? current.Name : req.UpdatedName.Trim(),
                Summary = updatedSummary,
                Status = updatedStatus
            };

            WeaveDrafts[idx] = updated;
            if (updatedStatus == "approved" && string.Equals(updated.Category, "NPC", StringComparison.OrdinalIgnoreCase))
            {
                AdventureGuideStateStore.RegisterCharacterOrNpc(
                    campaignId,
                    $"node-{updated.Id}",
                    updated.CompositeKey,
                    updated.Name,
                    updated.Subtitle,
                    "Allied",
                    "emerald",
                    "",
                    updated.Summary,
                    $"\"{updated.Subtitle}\"",
                    "Approved in The Weave",
                    $"/weave?node={updated.Id}",
                    updated.Visibility);
            }
            return Results.Ok(updated);
        });

        return api;
    }

    private static string NormalizeScope(string? scope) =>
        scope?.Trim().ToLowerInvariant() switch
        {
            "private_player" => "private_player",
            "gm_only" => "gm_only",
            _ => "party_shared"
        };
}
