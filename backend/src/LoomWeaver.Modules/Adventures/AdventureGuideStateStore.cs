using LoomWeaver.Domain;

namespace LoomWeaver.Modules.Adventures;

// Runtime Arcane Screen state. Seeds are empty; content is added by the GM and campaign data.
public static class AdventureGuideStateStore
{
    private static readonly object SyncLock = new();

    private static readonly Dictionary<string, string> NodeProgressStates = new(StringComparer.OrdinalIgnoreCase);

    private static readonly HashSet<string> SharedReadAloudAndSecretIds = new(StringComparer.OrdinalIgnoreCase);

    private static readonly HashSet<string> AwardedRewardKeys = new(StringComparer.OrdinalIgnoreCase);

    private static readonly List<AdventureSessionBeatItemDto> Beats = new();

    private static readonly List<AdventureGuideNpcItemDto> PopulatedNpcsAndHeroes = new();

    private static readonly Dictionary<string, AdventureAssignedBattlemapDto> AssignedMapsByScope = new(StringComparer.OrdinalIgnoreCase);

    private static readonly List<AdventurePlayEventDto> PlayEvents = new();

    public static ContextualAdventureGuideDto BuildGuide(
        int campaignId,
        bool isGm,
        string? scopeKind = null,
        string? scopeId = null,
        string? progressFilter = null)
    {
        lock (SyncLock)
        {
            var normScopeKind = NormalizeScopeKind(scopeKind, scopeId);
            var normScopeId = ResolveScopeId(normScopeKind, scopeId);
            var filter = string.IsNullOrWhiteSpace(progressFilter) ? "all" : progressFilter.Trim().ToLowerInvariant();

            var assignedMap = AssignedMapsByScope.TryGetValue(normScopeId, out var scopedMap)
                ? scopedMap
                : EmptyBattlemap();

            var visibleRegions = assignedMap.ClickableRegions
                .Where(r => isGm || r.Visibility != "gm" || SharedReadAloudAndSecretIds.Contains(r.RoomNodeId))
                .ToList();

            var allNpcs = PopulatedNpcsAndHeroes
                .Where(n => isGm || n.Visibility != "gm")
                .Select(n => n with { ProgressState = GetNodeState(n.NodeId, n.ProgressState) })
                .ToList();

            var filteredNpcs = filter == "all" ? allNpcs : allNpcs.Where(n => FilterMatches(n.ProgressState, filter)).ToList();

            return new ContextualAdventureGuideDto(
                CampaignId: campaignId,
                AdventureId: "",
                AdventureVersionId: "",
                AdventureTitle: "",
                ActiveScopeKind: normScopeKind,
                ActiveScopeId: normScopeId,
                ActiveSessionId: "",
                ActiveSessionNumber: 0,
                HeaderTitle: "",
                HeaderSubtitle: "",
                ArtworkUrl: assignedMap.ArtworkUrl,
                Epigraph: "",
                Summary: "",
                ImmediateSituation: "",
                SensoryDescription: "",
                ActiveAreaKey: null,
                Breadcrumbs: Array.Empty<AdventureBreadcrumbDto>(),
                AvailableSessions: Array.Empty<AdventureScopeOptionDto>(),
                AvailableLocations: Array.Empty<AdventureScopeOptionDto>(),
                AvailableRooms: Array.Empty<AdventureScopeOptionDto>(),
                ReadAloudBlocks: Array.Empty<AdventureReadAloudBlockDto>(),
                Exits: Array.Empty<AdventureRoomExitDto>(),
                SkillChecks: Array.Empty<AdventureSkillCheckDto>(),
                AssignedBattlemap: assignedMap with { ClickableRegions = visibleRegions },
                Beats: Beats.ToList(),
                KeyNpcs: filteredNpcs,
                Encounters: Array.Empty<AdventureGuideEncounterItemDto>(),
                CluesAndHazards: Array.Empty<AdventureGuideElementItemDto>(),
                TreasuresAndRewards: Array.Empty<AdventureGuideElementItemDto>(),
                Secrets: Array.Empty<string>(),
                NotesTabItems: Array.Empty<AdventureGuideElementItemDto>(),
                NpcsTabItems: allNpcs,
                PlacesTabItems: AdventureGuideSeedCatalog.GetPlacesTabItems(isGm, assignedMap, GetNodeState, SharedReadAloudAndSecretIds),
                LoreTabItems: AdventureGuideSeedCatalog.GetLoreTabItems(isGm),
                RecentPlayEvents: PlayEvents.Take(6).ToList()
            );
        }
    }

    public static void ToggleBeat(string beatId)
    {
        lock (SyncLock)
        {
            var idx = Beats.FindIndex(b => b.Id == beatId);
            if (idx < 0) return;
            var cur = Beats[idx];
            var nextDone = !cur.Done;
            Beats[idx] = cur with { Done = nextDone, ProgressState = nextDone ? "completed" : "unresolved" };
            PlayEvents.Insert(0, new($"evt-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}", "beat_checked", "GM",
                $"{(nextDone ? "Completed" : "Reopened")} Session Beat: {cur.Label} (Location secrets remain isolated)", "Just now"));
        }
    }

    public static void UpdateNodeState(string nodeId, string progressState, string? outcomeNotes)
    {
        lock (SyncLock)
        {
            var clean = string.IsNullOrWhiteSpace(progressState) ? "discovered" : progressState.Trim().ToLowerInvariant();
            NodeProgressStates[nodeId] = clean;
            PlayEvents.Insert(0, new($"evt-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}", "state_updated", "GM",
                $"Marked '{nodeId}' as {clean.ToUpperInvariant()}" + (string.IsNullOrWhiteSpace(outcomeNotes) ? "" : $" — {outcomeNotes}"), "Just now"));
        }
    }

    public static void GrantKnowledge(GrantAdventureKnowledgeRequest req)
    {
        lock (SyncLock)
        {
            SharedReadAloudAndSecretIds.Add(req.TargetId);
            NodeProgressStates[req.TargetId] = "discovered";
            var recipient = string.IsNullOrWhiteSpace(req.CharacterKey) ? "All Party" : req.CharacterKey;
            PlayEvents.Insert(0, new($"evt-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}", "knowledge_granted", "GM",
                $"Revealed '{req.TargetTitle}' to {recipient}", "Just now"));
        }
    }

    public static (bool NewlyAwarded, int XpAwarded, string Message) AwardReward(AwardAdventureRewardRequest req)
    {
        lock (SyncLock)
        {
            var key = string.IsNullOrWhiteSpace(req.IdempotencyKey) ? $"reward-{req.NodeId}" : req.IdempotencyKey;
            if (!AwardedRewardKeys.Add(key))
                return (false, 0, $"Reward '{req.CurrencyOrItemLabel}' was already awarded (idempotent ledger verified).");
            NodeProgressStates[req.NodeId] = "completed";
            var msg = $"Awarded +{req.XpAmount} XP & {req.CurrencyOrItemLabel} to the party.";
            PlayEvents.Insert(0, new($"evt-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}", "reward_awarded", "GM", msg, "Just now"));
            return (true, req.XpAmount, msg);
        }
    }

    public static AdventureGuideNpcItemDto RegisterCharacterOrNpc(
        int campaignId,
        string nodeId,
        string compositeKey,
        string name,
        string role,
        string disposition,
        string dispositionTone,
        string artworkUrl,
        string motive,
        string dialogue,
        string whyIncluded,
        string routeLink,
        string visibility)
    {
        lock (SyncLock)
        {
            var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var initials = parts.Length >= 2
                ? $"{char.ToUpperInvariant(parts[0][0])}{char.ToUpperInvariant(parts[1][0])}"
                : name.Length >= 2 ? name[..2].ToUpperInvariant() : "NP";

            var item = new AdventureGuideNpcItemDto(
                nodeId,
                compositeKey,
                name,
                role,
                disposition,
                dispositionTone,
                initials,
                dispositionTone == "crimson" ? "#e25c5c" : dispositionTone == "emerald" ? "#49e892" : "#d9b77a",
                string.IsNullOrWhiteSpace(artworkUrl) ? "" : artworkUrl,
                motive,
                dialogue,
                whyIncluded,
                "discovered",
                routeLink,
                visibility);

            PopulatedNpcsAndHeroes.RemoveAll(n => n.NodeId == nodeId || n.CompositeKey == compositeKey);
            PopulatedNpcsAndHeroes.Insert(0, item);
            NodeProgressStates[nodeId] = "discovered";
            PlayEvents.Insert(0, new AdventurePlayEventDto(
                $"evt-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                "npc_populated",
                "Studio",
                $"Populated '{name}' ({role}) into the Session & Location Guide",
                "Just now"));
            return item;
        }
    }

    public static AdventureAssignedBattlemapDto AssignBattlemap(AssignBattlemapToAdventureRequest req)
    {
        lock (SyncLock)
        {
            var locNodeId = req.LocationNodeId ?? "";
            var sesId = req.SessionId ?? "";
            var art = string.IsNullOrWhiteSpace(req.ArtworkUrl) ? "" : req.ArtworkUrl;

            var updated = new AdventureAssignedBattlemapDto(
                SceneKey: req.SceneKey,
                Title: string.IsNullOrWhiteSpace(req.SceneTitle) ? req.SceneKey : req.SceneTitle,
                SessionId: sesId,
                SessionTitle: "",
                LocationNodeId: locNodeId,
                LocationTitle: "",
                AreaKey: null,
                ArtworkUrl: art,
                RouteLink: $"/maps?scene={req.SceneKey}",
                VttRouteLink: $"/arcane-screen?scene={req.SceneKey}",
                ClickableRegions: Array.Empty<AdventureMapRegionChipDto>());

            if (!string.IsNullOrWhiteSpace(sesId)) AssignedMapsByScope[sesId] = updated;
            if (!string.IsNullOrWhiteSpace(locNodeId)) AssignedMapsByScope[locNodeId] = updated;
            PlayEvents.Insert(0, new AdventurePlayEventDto(
                $"evt-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                "map_assigned", "LoomMaps",
                $"Assigned Battlemap '{updated.Title}'",
                "Just now"));
            return updated;
        }
    }

    private static AdventureAssignedBattlemapDto EmptyBattlemap() => new(
        SceneKey: "",
        Title: "",
        SessionId: "",
        SessionTitle: "",
        LocationNodeId: "",
        LocationTitle: "",
        AreaKey: null,
        ArtworkUrl: "",
        RouteLink: "",
        VttRouteLink: "",
        ClickableRegions: Array.Empty<AdventureMapRegionChipDto>());

    private static string GetNodeState(string nodeId, string fallback) =>
        NodeProgressStates.TryGetValue(nodeId, out var st) ? st : fallback;

    private static bool FilterMatches(string state, string filter) =>
        filter == "all" || string.Equals(state, filter, StringComparison.OrdinalIgnoreCase);

    private static string NormalizeScopeKind(string? scopeKind, string? scopeId) =>
        !string.IsNullOrWhiteSpace(scopeKind) ? scopeKind.Trim().ToLowerInvariant()
        : scopeId?.StartsWith("node-room-", StringComparison.OrdinalIgnoreCase) == true ? "room"
        : scopeId?.StartsWith("node-loc-", StringComparison.OrdinalIgnoreCase) == true ? "location"
        : scopeId?.StartsWith("adv-", StringComparison.OrdinalIgnoreCase) == true ? "adventure"
        : "session";

    private static string ResolveScopeId(string scopeKind, string? scopeId) =>
        !string.IsNullOrWhiteSpace(scopeId) ? scopeId.Trim() : "";
}
