using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Infrastructure.Neo4j;
using LoomWeaver.Modules.Adventures;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Encounters;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Knowledge;

public static class LoomAndWeaveEndpoints
{
    private static readonly List<ScopedCampaignNoteContract> CampaignNotes = new();
    private static readonly object NotesLock = new();
    private static readonly List<WeaveDraftContract> WeaveDrafts = new();

    private static readonly HashSet<string> StopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "what", "who", "where", "when", "how", "much", "many", "did", "we", "get",
        "got", "after", "the", "and", "are", "for", "our", "from", "was", "were", "in"
    };

    public static void UpsertCanonicalNote(
        int campaignId,
        string noteId,
        string title,
        string content,
        int sessionNumber,
        string authorName,
        string deepLinkRoute)
    {
        var note = new ScopedCampaignNoteContract(
            noteId,
            campaignId,
            title,
            content,
            "party_shared",
            string.IsNullOrWhiteSpace(authorName) ? "Table Ledger" : authorName.Trim(),
            "All Party",
            Math.Max(1, sessionNumber),
            string.IsNullOrWhiteSpace(deepLinkRoute) ? "/arcane-screen" : deepLinkRoute.Trim(),
            Array.Empty<string>(),
            DateTimeOffset.UtcNow);
        lock (NotesLock)
        {
            var idx = CampaignNotes.FindIndex(n => n.Id == noteId && n.CampaignId == campaignId);
            if (idx >= 0) CampaignNotes[idx] = note;
            else CampaignNotes.Insert(0, note);
        }
    }

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
            List<ScopedCampaignNoteContract> filtered;
            lock (NotesLock)
            {
                filtered = CampaignNotes
                    .Where(n => n.CampaignId == campaignId)
                    .Where(n =>
                        isGm ||
                        n.Scope == "party_shared" ||
                        (n.Scope == "private_player" &&
                         (string.IsNullOrWhiteSpace(witness) ||
                          string.Equals(n.WitnessCharacter, witness, StringComparison.OrdinalIgnoreCase))))
                    .OrderByDescending(n => n.CreatedAt)
                    .ToList();
            }

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
            lock (NotesLock)
            {
                CampaignNotes.Insert(0, note);
            }
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
            var keywords = ExtractKeywords(q);

            var entities = await repo.GetAuthorizedEntitiesAsync(campaignId, viewerRole, null, ct);
            var matchedEntities = entities
                .Where(e => MatchesQuery(q, keywords, $"{e.Name} {e.Summary} {e.Subtitle}"))
                .Take(5)
                .ToList();

            if (matchedEntities.Count == 0)
            {
                matchedEntities = entities.Take(4).ToList();
            }

            var citations = new List<LoomCitationDto>();

            // Include Encounter & Loot Chronicle records first when matched
            var lootCitations = EncounterLootEndpoints.GetMatchingLoomCitations(campaignId, q);
            citations.AddRange(lootCitations);

            citations.AddRange(matchedEntities.Select(m => new LoomCitationDto(
                m.CompositeKey,
                m.Name,
                m.EntityType,
                m.Summary,
                m.RouteLink,
                m.Visibility)));

            var (_, monsterAccess) = await Bestiary.BestiaryCampaignEndpoints.ResolveAsync(
                httpContext, campaignId, req.Role, repo, ct);
            if (monsterAccess.UserId != 0)
            {
                await Bestiary.BestiaryPersistence.EnsureReadyAsync(repo, ct);
                citations.AddRange(Bestiary.BestiaryCampaignStore.LoomCitations(
                    campaignId, monsterAccess.IsEffectiveGm, monsterAccess.BoundCharacterKey, q));
            }

            List<ScopedCampaignNoteContract> matchingNotes;
            lock (NotesLock)
            {
                matchingNotes = CampaignNotes
                    .Where(n => n.CampaignId == campaignId)
                    .Where(n =>
                        isGm ||
                        n.Scope == "party_shared" ||
                        (req.IncludePrivateNotes &&
                         n.Scope == "private_player" &&
                         (witness == "All Party" || string.Equals(n.WitnessCharacter, witness, StringComparison.OrdinalIgnoreCase))))
                    .Where(n => MatchesQuery(q, keywords, $"{n.Title} {n.Content} session {n.SessionNumber}"))
                    .Take(4)
                    .ToList();
            }

            var graphPaths = await ConnectedStoryEngine.QueryAuthorizedLoomPathsAsync(campaignId, access, q, graph, ct);
            var activeClaims = ConnectedStorySeedStore.Claims
                .Where(c => c.CampaignId == campaignId && (isGm || c.Visibility != "gm"))
                .ToList();
            var claimSummary = activeClaims.Count > 0
                ? $" Separated Truth vs. Testimony across {activeClaims.Count} claim(s)."
                : "";

            var lootHighlight = lootCitations.Count > 0
                ? $" Direct Encounter & Loot Recall: {lootCitations[0].Excerpt}"
                : (matchingNotes.Count > 0 ? $" Note Recall: {matchingNotes[0].Content}" : "");

            var synthesis =
                $"[The Loom · Zero-Generation GraphRAG · Role={viewerRole.ToUpperInvariant()} · Witness={witness}]: " +
                $"Synthesized {citations.Count} canonical record(s), {graphPaths.Count} Neo4j+SQL relationship path(s), and {matchingNotes.Count} scoped note(s) for \"{q}\".{lootHighlight}{claimSummary} Zero unverified lore generated.";

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

    private static IReadOnlyList<string> ExtractKeywords(string query) =>
        query
            .Split([' ', '?', '!', ',', '.', ';', ':'], StringSplitOptions.RemoveEmptyEntries)
            .Select(w => w.Trim().ToLowerInvariant())
            .Where(w => (w.Length >= 3 || char.IsDigit(w[0])) && !StopWords.Contains(w))
            .Distinct()
            .ToArray();

    private static bool MatchesQuery(string rawQuery, IReadOnlyList<string> keywords, string targetText)
    {
        if (string.IsNullOrWhiteSpace(rawQuery)) return true;
        if (targetText.Contains(rawQuery, StringComparison.OrdinalIgnoreCase)) return true;
        return keywords.Count > 0 && keywords.Any(k => targetText.Contains(k, StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizeScope(string? scope) =>
        scope?.Trim().ToLowerInvariant() switch
        {
            "private_player" => "private_player",
            "gm_only" => "gm_only",
            _ => "party_shared"
        };
}
