using LoomWeaver.Domain;
using LoomWeaver.Modules.Knowledge;

namespace LoomWeaver.Modules.Adventures;

// Runtime Arcane Screen and Session Guide state. Seeds are empty; content is added by the GM and campaign data.
public static class AdventureGuideStateStore
{
    private static readonly object SyncLock = new();

    private static readonly Dictionary<string, string> NodeProgressStates = new(StringComparer.OrdinalIgnoreCase);

    private static readonly HashSet<string> SharedReadAloudAndSecretIds = new(StringComparer.OrdinalIgnoreCase);

    private static readonly HashSet<string> AwardedRewardKeys = new(StringComparer.OrdinalIgnoreCase);

    private static readonly List<AdventureSessionBeatItemDto> Beats = new();

    private static readonly List<AdventureGuideNpcItemDto> PopulatedNpcsAndHeroes = new();

    private static readonly Dictionary<string, AdventureAssignedBattlemapDto> AssignedMapsByScope = new(StringComparer.OrdinalIgnoreCase);

    private static readonly Dictionary<int, string> ActiveSessionByCampaign = new();

    private static readonly Dictionary<int, List<SessionAttachmentItemDto>> AttachmentsByCampaign = new();

    private static readonly List<AdventurePlayEventDto> PlayEvents = new();

    static AdventureGuideStateStore()
    {
        // Configured battlemaps for Sessions 1-3. Session 4 is unconfigured so GM can configure it in Map Studio.
        var map1 = new AdventureAssignedBattlemapDto(
            SceneKey: "sotm-seed-scene-edhellain-palace",
            Title: "Edhellain Palace Hall",
            SessionId: "sotm-seed-sess-01",
            SessionTitle: "Shadows Above the Throne",
            LocationNodeId: "node-loc-palace",
            LocationTitle: "Edhellain Palace",
            AreaKey: null,
            ArtworkUrl: "/assets/battlemaps/fortress-axeholm.jpg",
            RouteLink: "/maps?scene=sotm-seed-scene-edhellain-palace",
            VttRouteLink: "/arcane-screen?scene=sotm-seed-scene-edhellain-palace",
            ClickableRegions: Array.Empty<AdventureMapRegionChipDto>());
        AssignedMapsByScope["sotm-seed-sess-01"] = map1;
        AssignedMapsByScope["session-1"] = map1;
        AssignedMapsByScope["900029:sotm-seed-sess-01"] = map1;
        AssignedMapsByScope["900029:session-1"] = map1;

        var map2 = new AdventureAssignedBattlemapDto(
            SceneKey: "sotm-seed-scene-vandia-tavern",
            Title: "Knot & Knife Beach Road",
            SessionId: "sotm-seed-sess-02",
            SessionTitle: "The Knot & Knife",
            LocationNodeId: "node-loc-vandia",
            LocationTitle: "Vandia",
            AreaKey: null,
            ArtworkUrl: "/assets/battlemaps/coastal-cliff.jpg",
            RouteLink: "/maps?scene=sotm-seed-scene-vandia-tavern",
            VttRouteLink: "/arcane-screen?scene=sotm-seed-scene-vandia-tavern",
            ClickableRegions: Array.Empty<AdventureMapRegionChipDto>());
        AssignedMapsByScope["sotm-seed-sess-02"] = map2;
        AssignedMapsByScope["session-2"] = map2;
        AssignedMapsByScope["900029:sotm-seed-sess-02"] = map2;
        AssignedMapsByScope["900029:session-2"] = map2;

        var map3 = new AdventureAssignedBattlemapDto(
            SceneKey: "sotm-seed-scene-plains-of-red",
            Title: "Plains of Red",
            SessionId: "sotm-seed-sess-03",
            SessionTitle: "The Plains of Red",
            LocationNodeId: "node-loc-plains-of-red",
            LocationTitle: "Plains of Red",
            AreaKey: null,
            ArtworkUrl: "/assets/battlemaps/combat-caves.webp",
            RouteLink: "/maps?scene=sotm-seed-scene-plains-of-red",
            VttRouteLink: "/arcane-screen?scene=sotm-seed-scene-plains-of-red",
            ClickableRegions: Array.Empty<AdventureMapRegionChipDto>());
        AssignedMapsByScope["sotm-seed-sess-03"] = map3;
        AssignedMapsByScope["session-3"] = map3;
        AssignedMapsByScope["900029:sotm-seed-sess-03"] = map3;
        AssignedMapsByScope["900029:session-3"] = map3;
    }

    public static string GetActiveSessionId(int campaignId)
    {
        lock (SyncLock)
        {
            return ActiveSessionByCampaign.TryGetValue(campaignId, out var sId) ? sId : "";
        }
    }

    public static void SetActiveSessionId(int campaignId, string sessionId)
    {
        lock (SyncLock)
        {
            if (string.IsNullOrWhiteSpace(sessionId)) return;
            ActiveSessionByCampaign[campaignId] = sessionId.Trim();
        }
    }

    public static IReadOnlyList<SessionAttachmentItemDto> GetSessionAttachments(
        int campaignId,
        bool isGm,
        string? sessionId = null)
    {
        lock (SyncLock)
        {
            if (!AttachmentsByCampaign.TryGetValue(campaignId, out var list))
            {
                return Array.Empty<SessionAttachmentItemDto>();
            }
            return list
                .Where(a => (isGm || a.Visibility != "gm") &&
                            (string.IsNullOrWhiteSpace(sessionId) || string.Equals(a.SessionId, sessionId, StringComparison.OrdinalIgnoreCase)))
                .ToList();
        }
    }

    public static SessionAttachmentItemDto AttachElement(int campaignId, AttachSessionElementRequest req)
    {
        lock (SyncLock)
        {
            if (!AttachmentsByCampaign.TryGetValue(campaignId, out var list))
            {
                list = new List<SessionAttachmentItemDto>();
                AttachmentsByCampaign[campaignId] = list;
            }

            var sesId = string.IsNullOrWhiteSpace(req.SessionId) ? GetActiveSessionId(campaignId) : req.SessionId.Trim();
            var kind = string.IsNullOrWhiteSpace(req.ElementKind) ? "Lore" : req.ElementKind.Trim();
            var key = string.IsNullOrWhiteSpace(req.TargetKey)
                ? $"elem-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}"
                : req.TargetKey.Trim();
            var id = $"{sesId}:{kind}:{key}".ToLowerInvariant();
            var vis = string.Equals(req.Visibility, "gm", StringComparison.OrdinalIgnoreCase) ? "gm" : "players";

            var item = new SessionAttachmentItemDto(
                Id: id,
                SessionId: sesId,
                ElementKind: kind,
                TargetKey: key,
                Title: string.IsNullOrWhiteSpace(req.Title) ? "Attached Element" : req.Title.Trim(),
                Subtitle: string.IsNullOrWhiteSpace(req.Subtitle) ? kind : req.Subtitle.Trim(),
                Summary: string.IsNullOrWhiteSpace(req.Summary) ? $"Attached to {sesId}" : req.Summary.Trim(),
                RouteLink: string.IsNullOrWhiteSpace(req.RouteLink) ? "/sessions" : req.RouteLink.Trim(),
                Visibility: vis,
                QuestKind: req.QuestKind,
                ArtworkUrl: req.ArtworkUrl
            );

            list.RemoveAll(a => string.Equals(a.Id, id, StringComparison.OrdinalIgnoreCase));
            list.Insert(0, item);

            if (string.Equals(kind, "Map", StringComparison.OrdinalIgnoreCase))
            {
                AssignBattlemap(
                    new AssignBattlemapToAdventureRequest(
                        SceneKey: key,
                        SceneTitle: item.Title,
                        SessionId: sesId,
                        LocationNodeId: "",
                        ArtworkUrl: req.ArtworkUrl,
                        Biome: item.Subtitle, SessionTitle: item.Summary),
                    campaignId);
            }

            PlayEvents.Insert(0, new AdventurePlayEventDto(
                $"evt-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                "element_attached",
                "Sessions",
                $"Attached {kind} '{item.Title}' to {sesId}",
                "Just now"));

            return item;
        }
    }

    public static void DetachElement(int campaignId, string attachmentId)
    {
        lock (SyncLock)
        {
            if (AttachmentsByCampaign.TryGetValue(campaignId, out var list))
            {
                list.RemoveAll(a => string.Equals(a.Id, attachmentId, StringComparison.OrdinalIgnoreCase));
            }
        }
    }

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
            var activeSesId = GetActiveSessionId(campaignId);
            if (string.IsNullOrWhiteSpace(normScopeId) && !string.IsNullOrWhiteSpace(activeSesId))
            {
                normScopeId = activeSesId;
            }

            var filter = string.IsNullOrWhiteSpace(progressFilter) ? "all" : progressFilter.Trim().ToLowerInvariant();
            var isWholeGuide = string.Equals(normScopeKind, "adventure", StringComparison.OrdinalIgnoreCase);

            var assignedMap = ResolveAssignedBattlemap(campaignId, normScopeId, activeSesId);

            var visibleRegions = assignedMap.ClickableRegions
                .Where(r => isGm || r.Visibility != "gm" || SharedReadAloudAndSecretIds.Contains(r.RoomNodeId))
                .ToList();

            var allNpcs = PopulatedNpcsAndHeroes
                .Where(n => isGm || n.Visibility != "gm")
                .Select(n => n with { ProgressState = GetNodeState(n.NodeId, n.ProgressState) })
                .ToList();

            var filteredNpcs = filter == "all" ? allNpcs : allNpcs.Where(n => FilterMatches(n.ProgressState, filter)).ToList();

            var attachments = GetSessionAttachments(
                campaignId,
                isGm,
                isWholeGuide ? null : normScopeId);

            var loreEntries = WorldLoreCatalogStore.LoreByCampaign.TryGetValue(campaignId, out var campaignLore)
                ? campaignLore
                    .Where(l => !l.Archived && (isGm || l.Visibility != "gm"))
                    .Where(l => isWholeGuide || string.IsNullOrWhiteSpace(normScopeId) ||
                                string.Equals(l.SessionId, normScopeId, StringComparison.OrdinalIgnoreCase))
                    .Select(l => new AdventureGuideElementItemDto(
                        NodeId: $"lore-{l.Id}",
                        CompositeKey: l.CompositeKey,
                        ElementKind: string.IsNullOrWhiteSpace(l.QuestTitle) ? l.Category : $"{l.Category} · {l.QuestTitle}",
                        AreaKey: l.SessionId,
                        Title: l.Title,
                        Subtitle: l.Subtitle,
                        Summary: l.Excerpt,
                        ArtworkUrl: l.ArtworkUrl,
                        WhyIncluded: string.IsNullOrWhiteSpace(l.SessionLabel) ? "Campaign Lore" : $"Assigned to {l.SessionLabel}",
                        ProgressState: GetNodeState($"lore-{l.Id}", "discovered"),
                        RouteLink: "/world-lore",
                        Visibility: l.Visibility))
                    .ToList()
                : new List<AdventureGuideElementItemDto>();

            foreach (var att in attachments.Where(a => a.ElementKind.Equals("Lore", StringComparison.OrdinalIgnoreCase)))
            {
                if (!loreEntries.Any(x => x.CompositeKey == att.TargetKey || x.NodeId == $"lore-{att.TargetKey}"))
                {
                    loreEntries.Add(new AdventureGuideElementItemDto(
                        NodeId: $"att-{att.Id}",
                        CompositeKey: att.TargetKey,
                        ElementKind: "Lore",
                        AreaKey: att.SessionId,
                        Title: att.Title,
                        Subtitle: att.Subtitle,
                        Summary: att.Summary,
                        ArtworkUrl: att.ArtworkUrl ?? "/icrandor_world_dashboard.jpg",
                        WhyIncluded: $"Attached to {att.SessionId}",
                        ProgressState: "discovered",
                        RouteLink: att.RouteLink,
                        Visibility: att.Visibility));
                }
            }

            var questAndClueItems = attachments
                .Where(a => a.ElementKind is "Quest" or "SideQuest" or "Item" or "Handout")
                .Select(a => new AdventureGuideElementItemDto(
                    NodeId: $"att-{a.Id}",
                    CompositeKey: a.TargetKey,
                    ElementKind: a.ElementKind,
                    AreaKey: a.SessionId,
                    Title: a.Title,
                    Subtitle: a.Subtitle,
                    Summary: a.Summary,
                    ArtworkUrl: a.ArtworkUrl ?? "/icrandor_world_dashboard.jpg",
                    WhyIncluded: $"Attached to {a.SessionId}",
                    ProgressState: GetNodeState($"att-{a.Id}", "discovered"),
                    RouteLink: a.RouteLink,
                    Visibility: a.Visibility))
                .ToList();

            var encounterItems = attachments
                .Where(a => a.ElementKind is "Encounter" or "Monster")
                .Select(a => new AdventureGuideEncounterItemDto(
                    NodeId: $"att-{a.Id}",
                    CompositeKey: a.TargetKey,
                    Title: a.Title,
                    Subtitle: a.Subtitle,
                    Difficulty: a.ElementKind,
                    XpReward: 450,
                    Trigger: a.Summary,
                    TerrainNotes: assignedMap.Title,
                    TacticsSummary: $"Attached to {a.SessionId}",
                    AssignedSceneKey: assignedMap.SceneKey,
                    WhyIncluded: $"Attached to {a.SessionId}",
                    ProgressState: GetNodeState($"att-{a.Id}", "unresolved"),
                    RouteLink: a.RouteLink,
                    VttRouteLink: string.IsNullOrWhiteSpace(assignedMap.SceneKey) ? "/arcane-screen" : $"/arcane-screen?scene={assignedMap.SceneKey}",
                    Visibility: a.Visibility))
                .ToList();

            var npcAttachments = attachments
                .Where(a => a.ElementKind is "NPC" or "Character")
                .Select(a => new AdventureGuideNpcItemDto(
                    NodeId: $"att-{a.Id}",
                    CompositeKey: a.TargetKey,
                    Name: a.Title,
                    Role: a.Subtitle,
                    DispositionLabel: "Attached",
                    DispositionTone: "gold",
                    Initials: a.Title.Length >= 2 ? a.Title[..2].ToUpperInvariant() : "NP",
                    RingColor: "#d9b77a",
                    ArtworkUrl: a.ArtworkUrl ?? "/icrandor_world_dashboard.jpg",
                    Motive: a.Summary,
                    DialogueExcerpt: "",
                    WhyIncluded: $"Attached to {a.SessionId}",
                    ProgressState: "discovered",
                    RouteLink: a.RouteLink,
                    Visibility: a.Visibility))
                .ToList();

            var combinedNpcs = filteredNpcs.Concat(npcAttachments).ToList();

            return new ContextualAdventureGuideDto(
                CampaignId: campaignId,
                AdventureId: $"adv-{campaignId}",
                AdventureVersionId: "v2",
                AdventureTitle: isWholeGuide ? "Whole Campaign Adventure Guide" : "Current Session Guide",
                ActiveScopeKind: normScopeKind,
                ActiveScopeId: normScopeId,
                ActiveSessionId: string.IsNullOrWhiteSpace(normScopeId) ? activeSesId : normScopeId,
                ActiveSessionNumber: 0,
                HeaderTitle: isWholeGuide ? "Whole Campaign Adventure Guide" : (string.IsNullOrWhiteSpace(assignedMap.Title) ? "Active Session Guide" : assignedMap.Title),
                HeaderSubtitle: isWholeGuide ? "All Sessions, Quests, Lore & Encounters" : $"Session Scope · {normScopeId}",
                ArtworkUrl: assignedMap.ArtworkUrl,
                Epigraph: "",
                Summary: isWholeGuide
                    ? "Complete campaign guide spanning all sessions, maps, quests, side quests, lore entries, NPCs, and encounters."
                    : "Filtered strictly to content, maps, quests, lore, and encounters attached to the selected session.",
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
                KeyNpcs: combinedNpcs,
                Encounters: encounterItems,
                CluesAndHazards: questAndClueItems,
                TreasuresAndRewards: Array.Empty<AdventureGuideElementItemDto>(),
                Secrets: Array.Empty<string>(),
                NotesTabItems: questAndClueItems,
                NpcsTabItems: combinedNpcs,
                PlacesTabItems: AdventureGuideSeedCatalog.GetPlacesTabItems(isGm, assignedMap, GetNodeState, SharedReadAloudAndSecretIds),
                LoreTabItems: loreEntries,
                RecentPlayEvents: PlayEvents.Take(6).ToList()
            );
        }
    }

    private static AdventureAssignedBattlemapDto ResolveAssignedBattlemap(int campaignId, string scopeId, string activeSesId)
    {
        if (!string.IsNullOrWhiteSpace(scopeId))
        {
            if (AssignedMapsByScope.TryGetValue($"{campaignId}:{scopeId}", out var byCampScope)) return byCampScope;
            if (AssignedMapsByScope.TryGetValue(scopeId, out var byScope)) return byScope;
            if (AttachmentsByCampaign.TryGetValue(campaignId, out var campAttachments))
            {
                var mapAtt = campAttachments.FirstOrDefault(a =>
                    string.Equals(a.SessionId, scopeId, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(a.ElementKind, "Map", StringComparison.OrdinalIgnoreCase));
                if (mapAtt is not null && !string.IsNullOrWhiteSpace(mapAtt.TargetKey))
                {
                    return new AdventureAssignedBattlemapDto(
                        SceneKey: mapAtt.TargetKey,
                        Title: mapAtt.Title,
                        SessionId: scopeId,
                        SessionTitle: scopeId,
                        LocationNodeId: "",
                        LocationTitle: mapAtt.Subtitle ?? "Session Battlemap",
                        AreaKey: null,
                        ArtworkUrl: string.IsNullOrWhiteSpace(mapAtt.ArtworkUrl) ? "/battlemap-showcase.jpg" : mapAtt.ArtworkUrl,
                        RouteLink: $"/maps?scene={mapAtt.TargetKey}",
                        VttRouteLink: $"/arcane-screen?scene={mapAtt.TargetKey}",
                        ClickableRegions: Array.Empty<AdventureMapRegionChipDto>());
                }
            }
            if (scopeId.StartsWith("session-", StringComparison.OrdinalIgnoreCase) ||
                scopeId.StartsWith("sess-", StringComparison.OrdinalIgnoreCase))
            {
                return EmptyBattlemap();
            }
        }
        if (!string.IsNullOrWhiteSpace(activeSesId))
        {
            if (AssignedMapsByScope.TryGetValue($"{campaignId}:{activeSesId}", out var byActive)) return byActive;
            if (AssignedMapsByScope.TryGetValue(activeSesId, out var byActiveRaw)) return byActiveRaw;
        }
        if (AssignedMapsByScope.TryGetValue($"campaign:{campaignId}:latest", out var byLatest)) return byLatest;
        return EmptyBattlemap();
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
                $"{(nextDone ? "Completed" : "Reopened")} Session Beat: {cur.Label}", "Just now"));
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
                return (false, 0, $"Reward '{req.CurrencyOrItemLabel}' was already awarded.");
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

    public static AdventureAssignedBattlemapDto AssignBattlemap(AssignBattlemapToAdventureRequest req, int campaignId = 1)
    {
        lock (SyncLock)
        {
            var locNodeId = req.LocationNodeId ?? "";
            var sesId = req.SessionId ?? "";
            var art = string.IsNullOrWhiteSpace(req.ArtworkUrl) ? "/battlemap-showcase.jpg" : req.ArtworkUrl;

            var updated = new AdventureAssignedBattlemapDto(
                SceneKey: req.SceneKey,
                Title: string.IsNullOrWhiteSpace(req.SceneTitle) ? req.SceneKey : req.SceneTitle,
                SessionId: sesId,
                SessionTitle: !string.IsNullOrWhiteSpace(req.SessionTitle) ? req.SessionTitle.Trim() : sesId,
                LocationNodeId: locNodeId,
                LocationTitle: !string.IsNullOrWhiteSpace(req.LocationTitle) ? req.LocationTitle.Trim() : (!string.IsNullOrWhiteSpace(req.Biome) ? req.Biome.Trim() : "Campaign Battlemap"),
                AreaKey: null,
                ArtworkUrl: art,
                RouteLink: $"/maps?scene={req.SceneKey}",
                VttRouteLink: $"/arcane-screen?scene={req.SceneKey}",
                ClickableRegions: Array.Empty<AdventureMapRegionChipDto>());

            if (!string.IsNullOrWhiteSpace(sesId))
            {
                AssignedMapsByScope[sesId] = updated;
                AssignedMapsByScope[$"{campaignId}:{sesId}"] = updated;
                ActiveSessionByCampaign[campaignId] = sesId;
            }
            if (!string.IsNullOrWhiteSpace(locNodeId))
            {
                AssignedMapsByScope[locNodeId] = updated;
                AssignedMapsByScope[$"{campaignId}:{locNodeId}"] = updated;
            }
            AssignedMapsByScope[$"campaign:{campaignId}:latest"] = updated;

            PlayEvents.Insert(0, new AdventurePlayEventDto(
                $"evt-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                "map_assigned", "LoomMaps",
                $"Assigned Battlemap '{updated.Title}' to {sesId}",
                "Just now"));
            return updated;
        }
    }

    private static AdventureAssignedBattlemapDto EmptyBattlemap() => new(
        "", "", "", "", "", "", null, "", "", "", Array.Empty<AdventureMapRegionChipDto>());

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
