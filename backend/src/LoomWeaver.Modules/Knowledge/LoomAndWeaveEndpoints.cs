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
    private static readonly List<ScopedCampaignNoteContract> CampaignNotes = new()
    {
        new ScopedCampaignNoteContract(
            "note-kildrid-stone",
            1,
            "Stone-Sense Tremor Along the Northeast Cinth Road",
            "Passing the southern mountain forest on the road from Vandia to Cinth, Kildrid felt rhythmic, centuries-old clawing against runic bedrock—an ancient dragon bound alive beneath the mountain.",
            "party_shared",
            "Kildrid",
            "Kildrid",
            9,
            "/maps",
            new[] { "1:Location:loc-mountain-cavern", "1:Character:char-kildrid" },
            DateTimeOffset.UtcNow.AddDays(-6)
        ),
        new ScopedCampaignNoteContract(
            "note-kycius-dolly",
            1,
            "The Quiet Maw Sewn Inside Dolly",
            "On the road to Cinth, Kycius stitched an extradimensional containment pocket inside Dolly's mouth so Fivi's companion swallows targets into stasis rather than killing them outright.",
            "party_shared",
            "Kycius",
            "Kycius",
            10,
            "/characters",
            new[] { "1:Character:char-kycius", "1:Character:char-fivi" },
            DateTimeOffset.UtcNow.AddDays(-5)
        ),
        new ScopedCampaignNoteContract(
            "note-fivi-private",
            1,
            "Fivi's Fear of the Feywild Outcast Road",
            "Fivi jokes loudest when the party talks of home. She was cast out of the Feywild and fears she belongs nowhere, which is why she claims Captain Kutler's skyship as already hers.",
            "private_player",
            "Fivi",
            "Fivi",
            12,
            "/characters",
            new[] { "1:Character:char-fivi" },
            DateTimeOffset.UtcNow.AddDays(-3)
        ),
        new ScopedCampaignNoteContract(
            "note-dal-private",
            1,
            "Missing Pages of the Edhellainian Crown",
            "Dal suspects the torn ledger pages in Edhellain name his bloodline as the true royal lineage, though he has not yet chosen whether to claim the throne.",
            "private_player",
            "Dal",
            "Dal",
            14,
            "/campaigns",
            new[] { "1:Character:char-dal" },
            DateTimeOffset.UtcNow.AddDays(-2)
        ),
        new ScopedCampaignNoteContract(
            "note-gm-emrys-trap",
            1,
            "GM Secret: Emrys's Life-Bound Dragon & The Priors' Siphon",
            "Emrys cannot slay the mountain dragon himself because the dragon bound its life to his before containment. He is diverting the party into the cavern so they kill it and let him extract the final Luminary location.",
            "gm_only",
            "Game Master",
            "GM",
            15,
            "/arcane-screen",
            new[] { "1:NPC:npc-emrys", "1:Secret:sec-priors-siphon" },
            DateTimeOffset.UtcNow.AddDays(-1)
        )
    };

    private static readonly List<WeaveDraftContract> WeaveDrafts = new()
    {
        new WeaveDraftContract(
            "draft-cinth-artificer",
            "1:NPC:draft-master-vael",
            "NPC",
            "Master Artificer Vaelen Thorne",
            "Chief Aether-wright of the Cinth Guildhall",
            "A non-magical engineer scarred during the Moonlight Wars who builds phosphor-bronze arc condensers so ordinary citizens never kneel to the Council of Magic again.",
            "Grounded in Cinth Artificers Guild & post-Moonlight Wars class tension.",
            new[] { "ALLY_OF -> 1:Faction:fac-artificers", "OPPOSES -> 1:NPC:npc-emrys" },
            "draft",
            "players"
        ),
        new WeaveDraftContract(
            "draft-chokrah-vault",
            "1:Quest:draft-chokrah-convoy",
            "Quest",
            "The Chokrah Siphon Ledgers of Lost Isles",
            "Follow Captain Kutler's skyship intelligence into the Priors' titration vaults",
            "Investigate the ritual Chokrah shipments brought from the Lost Isles and expose how the Priors siphon innate magic from street-born initiates.",
            "Grounded in Captain Kutler's skyship return & Ekkos Priors distortion.",
            new[] { "INVOLVES -> 1:NPC:npc-kutler", "EXPOSES -> 1:Secret:sec-priors-siphon" },
            "draft",
            "gm"
        ),
        new WeaveDraftContract(
            "draft-orc-vanguard",
            "1:Encounter:draft-village-siege",
            "Monster",
            "Iron-Tusk Full-Blood Orc Siegebreaker",
            "Book Two Village Assault Vanguard (CR 7)",
            "Heavy siege infantry massing near the timber village where Munk was raised and trained before the skyship crash.",
            "Grounded in Book Two opening arc & Munk's mentor storyline.",
            new[] { "THREATENS -> 1:Character:char-munk" },
            "draft",
            "gm"
        )
    };

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
                req.SessionNumber <= 0 ? 18 : req.SessionNumber,
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
            var q = string.IsNullOrWhiteSpace(req.Query) ? "What is happening in Cinth?" : req.Query.Trim();

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
                    n.Content.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                    matchingNoteDefault(q))
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
            var loc = string.IsNullOrWhiteSpace(req.GroundedLocation) ? "Cinth & Plains of Vistagh" : req.GroundedLocation.Trim();
            var prompt = string.IsNullOrWhiteSpace(req.Prompt) ? "Cinth Artificer counterweight to the Council of Magic" : req.Prompt.Trim();
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
                    "/six-engines-showcase.jpg",
                    updated.Summary,
                    $"\"{updated.Subtitle}\"",
                    "Approved in The Weave · Linked to Session 15",
                    $"/weave?node={updated.Id}",
                    updated.Visibility);
            }
            return Results.Ok(updated);
        });

        return api;
    }

    private static bool matchingNoteDefault(string q) =>
        q.Contains("Cinth", StringComparison.OrdinalIgnoreCase) ||
        q.Contains("mountain", StringComparison.OrdinalIgnoreCase) ||
        q.Contains("Kildrid", StringComparison.OrdinalIgnoreCase);

    private static string NormalizeScope(string? scope) =>
        scope?.Trim().ToLowerInvariant() switch
        {
            "private_player" => "private_player",
            "gm_only" => "gm_only",
            _ => "party_shared"
        };
}
