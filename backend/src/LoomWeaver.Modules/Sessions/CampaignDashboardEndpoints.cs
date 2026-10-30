using System.Collections.Concurrent;
using System.Text.Json;
using LoomWeaver.Infrastructure.MySql;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Sessions;

public sealed record DashboardPrepItemDto(
    string Id,
    string Label,
    bool Completed,
    string RouteLink,
    bool GmOnly);

public sealed record DashboardUpcomingSessionDto(
    string SessionId,
    int SessionNumber,
    string Title,
    string ArtworkUrl,
    string ScheduledDateLabel,
    string ScheduledTimeLabel,
    string LocationTitle,
    string LocationRegion,
    string PrepStatusLabel,
    int CompletedPrepCount,
    int TotalPrepCount,
    IReadOnlyList<DashboardPrepItemDto> Checklist);

public sealed record DashboardActivityItemDto(
    string Id,
    string Title,
    string EntityType,
    string Description,
    string RelativeTime,
    string RouteLink,
    string CompositeKey,
    string Visibility);

public sealed record DashboardNoteItemDto(
    string Id,
    string Title,
    string Excerpt,
    string RelativeTime,
    string RouteLink,
    string CompositeKey,
    string Visibility);

public sealed record DashboardQuestThreadDto(
    string Id,
    string Title,
    string Summary,
    string CategoryBadge,
    string BadgeTone,
    string RouteLink,
    string CompositeKey,
    string Visibility);

public sealed record DashboardPartyMemberDto(
    string Id,
    string CompositeKey,
    string Name,
    string ClassAndAncestry,
    int HpCurrent,
    int HpMax,
    string ResourceLabel,
    int Ac,
    bool Online,
    string AvatarInitials,
    string RingColor,
    bool LevelUpEligible,
    string RouteLink);

public sealed record DashboardAlertItemDto(
    string Id,
    string Title,
    string Description,
    string Category,
    string Tone,
    string RouteLink,
    bool Read,
    bool GmOnly);

public sealed record DashboardSessionBeatDto(
    string Id,
    string Label,
    bool Done);

public sealed record DashboardGuideNpcDto(
    string CompositeKey,
    string Name,
    string Role,
    string DispositionLabel,
    string DispositionTone,
    string Initials,
    string RingColor);

public sealed record DashboardSessionGuideDto(
    string HeaderTitle,
    string ArtworkUrl,
    string Epigraph,
    string Summary,
    IReadOnlyList<DashboardSessionBeatDto> Beats,
    IReadOnlyList<DashboardGuideNpcDto> KeyNpcs,
    IReadOnlyList<string> Secrets);

public sealed record CampaignDashboardResponseDto(
    int CampaignId,
    string CampaignName,
    string SessionState,
    string ActTitle,
    string ActSubtitle,
    string SessionBadgeLabel,
    string SessionBadgeSubtitle,
    string LastActivityLabel,
    string NarrativeSummary,
    string HeroArtworkUrl,
    DashboardUpcomingSessionDto UpcomingSession,
    IReadOnlyList<DashboardActivityItemDto> RecentActivity,
    IReadOnlyList<DashboardNoteItemDto> RecentNotes,
    IReadOnlyList<DashboardQuestThreadDto> ActiveQuests,
    IReadOnlyList<DashboardPartyMemberDto> PartyMembers,
    string PartyHealthTitle,
    string PartyHealthSubtitle,
    IReadOnlyList<DashboardAlertItemDto> Alerts,
    DashboardSessionGuideDto SessionGuide);

public static class CampaignDashboardEndpoints
{
    private const string DefaultArtwork = "/combat-caves.jpg";
    private static readonly string[] RingColors = ["#d9b77a", "#49e892", "#2ee66b", "#c08a4b"];

    // Checklist, beat, and alert state is held in memory per campaign, matching the previous behavior.
    private static readonly ConcurrentDictionary<string, bool> PrepState = new();
    private static readonly ConcurrentDictionary<string, bool> BeatState = new();
    private static readonly ConcurrentDictionary<string, bool> AlertState = new();

    public static RouteGroupBuilder MapCampaignDashboardEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/dashboard", GetDashboardAsync);

        api.MapPost("/campaigns/{campaignId:int}/dashboard/prep/{itemId}/toggle",
            (int campaignId, string itemId, string? role, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
                ToggleAsync(PrepState, campaignId, itemId, role, mysql, ct, toggle: true));

        api.MapPost("/campaigns/{campaignId:int}/dashboard/beats/{beatId}/toggle",
            (int campaignId, string beatId, string? role, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
                ToggleAsync(BeatState, campaignId, beatId, role, mysql, ct, toggle: true));

        api.MapPost("/campaigns/{campaignId:int}/dashboard/alerts/{alertId}/acknowledge",
            (int campaignId, string alertId, string? role, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
                ToggleAsync(AlertState, campaignId, alertId, role, mysql, ct, toggle: false));

        return api;
    }

    private static async Task<IResult> GetDashboardAsync(
        int campaignId, string? role, LoomWeaverMySqlRepository mysql, CancellationToken ct)
    {
        var isGm = string.Equals(role, "gm", StringComparison.OrdinalIgnoreCase);
        await using var db = await mysql.OpenConnectionAsync(ct);
        var dashboard = await BuildAsync(db, campaignId, isGm, ct);
        return dashboard is null ? Results.NotFound() : Results.Ok(dashboard);
    }

    private static async Task<IResult> ToggleAsync(
        ConcurrentDictionary<string, bool> state,
        int campaignId,
        string itemId,
        string? role,
        LoomWeaverMySqlRepository mysql,
        CancellationToken ct,
        bool toggle)
    {
        var key = $"{campaignId}:{itemId}";
        if (toggle)
        {
            state.AddOrUpdate(key, true, (_, value) => !value);
        }
        else
        {
            state[key] = true;
        }

        return await GetDashboardAsync(campaignId, role, mysql, ct);
    }

    private static async Task<CampaignDashboardResponseDto?> BuildAsync(
        MySqlConnection db, int campaignId, bool isGm, CancellationToken ct)
    {
        var campaign = await ReadCampaignAsync(db, campaignId, ct);
        if (campaign is null)
        {
            return null;
        }

        var session = await ReadCurrentSessionAsync(db, campaignId, campaign.CurrentSessionNumber, ct);
        var party = await ReadPartyAsync(db, campaignId, ct);
        var events = await ReadRecentEventsAsync(db, campaignId, ct);

        var sessionNumber = session?.Number ?? campaign.CurrentSessionNumber;
        var sessionKey = session?.Id ?? $"session-{sessionNumber}";
        var artwork = session?.Artwork ?? DefaultArtwork;

        var checklist = (session?.Objectives ?? [])
            .Select((text, index) =>
            {
                var id = $"obj-{index}";
                var completed = PrepState.TryGetValue($"{campaignId}:{id}", out var done) && done;
                return new DashboardPrepItemDto(id, text, completed, "/campaigns", false);
            })
            .Where(item => isGm || !item.GmOnly)
            .ToList();
        var completedPrep = checklist.Count(item => item.Completed);

        var beats = (session?.StoppingPoints ?? [])
            .Select((text, index) =>
            {
                var id = $"beat-{index}";
                var done = BeatState.TryGetValue($"{campaignId}:{id}", out var value) && value;
                return new DashboardSessionBeatDto(id, text, done);
            })
            .ToList();

        var hurt = party.Count(member => member.CurrentHp < member.MaxHp);
        var levelUpReady = party.Count(member => member.CurrentXp >= member.NextXp);
        var partyMembers = party
            .Select((member, index) => new DashboardPartyMemberDto(
                member.Key,
                $"{campaignId}:PlayerCharacter:{member.Key}",
                member.Name,
                string.Join(" ", new[] { member.Ancestry, member.ClassName }.Where(s => !string.IsNullOrWhiteSpace(s))),
                member.CurrentHp,
                member.MaxHp,
                $"HP {member.CurrentHp}/{member.MaxHp}",
                member.ArmorClass,
                false,
                Initials(member.Name),
                RingColors[index % RingColors.Length],
                member.CurrentXp >= member.NextXp,
                "/characters"))
            .ToList();

        var activity = events
            .Select(evt => new DashboardActivityItemDto(
                $"event-{evt.Id}",
                HumanizeKind(evt.Kind),
                evt.Kind,
                evt.Summary,
                RelativeTime(evt.CreatedAt),
                "/campaigns",
                $"{campaignId}:Event:{evt.Id}",
                "players"))
            .ToList();

        return new CampaignDashboardResponseDto(
            (int)campaign.Id,
            campaign.Name,
            session?.State ?? "planned",
            campaign.CurrentAct,
            campaign.WorldName,
            $"Session {sessionNumber}",
            session?.Title ?? "No session scheduled",
            events.Count > 0 ? RelativeTime(events[0].CreatedAt) : "No activity yet",
            session?.Summary ?? campaign.Subtitle,
            artwork,
            new DashboardUpcomingSessionDto(
                sessionKey,
                sessionNumber,
                session?.Title ?? $"Session {sessionNumber}",
                artwork,
                session?.ScheduledLabel ?? string.Empty,
                string.Empty,
                campaign.LocationName,
                campaign.WorldName,
                PrepStatusLabel(checklist.Count, completedPrep),
                completedPrep,
                checklist.Count,
                checklist),
            activity,
            [],
            [],
            partyMembers,
            partyMembers.Count == 0 ? "No party members yet" : hurt == 0 ? "All party members are healthy" : $"{hurt} party member(s) below full HP",
            $"{partyMembers.Count} characters · {levelUpReady} ready to level up",
            [],
            new DashboardSessionGuideDto(
                $"SESSION {sessionNumber} — {(session?.Title ?? "NOT SCHEDULED").ToUpperInvariant()}",
                artwork,
                session?.Epigraph ?? string.Empty,
                session?.Summary ?? string.Empty,
                beats,
                [],
                []));
    }

    private static async Task<CampaignRow?> ReadCampaignAsync(MySqlConnection db, int campaignId, CancellationToken ct)
    {
        await using var cmd = new MySqlCommand("""
            SELECT id, name, subtitle, current_act, current_session_number, current_location_name, world_name
            FROM lw_campaigns WHERE id = @c
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        return new CampaignRow(
            reader.GetInt64(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetInt32(4),
            reader.GetString(5),
            reader.GetString(6));
    }

    private static async Task<SessionRow?> ReadCurrentSessionAsync(
        MySqlConnection db, int campaignId, int currentSessionNumber, CancellationToken ct)
    {
        await using var cmd = new MySqlCommand("""
            SELECT session_id, session_number, title, session_state, scheduled_date_label, epigraph,
                   summary, artwork_url, objectives_json, stopping_points_json
            FROM lw_sessions
            WHERE campaign_id = @c
            ORDER BY (session_number = @current) DESC, session_number DESC
            LIMIT 1
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        cmd.Parameters.AddWithValue("@current", currentSessionNumber);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        return new SessionRow(
            reader.GetString(0),
            reader.GetInt32(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.GetString(5),
            reader.GetString(6),
            reader.GetString(7),
            ParseList(reader, 8),
            ParseList(reader, 9));
    }

    private static async Task<List<PartyRow>> ReadPartyAsync(MySqlConnection db, int campaignId, CancellationToken ct)
    {
        var party = new List<PartyRow>();
        await using var cmd = new MySqlCommand("""
            SELECT character_key, name, ancestry, class_name, current_xp, next_level_xp,
                   current_hp, max_hp, armor_class
            FROM lw_characters
            WHERE campaign_id = @c
            ORDER BY name
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            party.Add(new PartyRow(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetInt32(4),
                reader.GetInt32(5),
                reader.GetInt32(6),
                reader.GetInt32(7),
                reader.GetInt32(8)));
        }

        return party;
    }

    private static async Task<List<EventRow>> ReadRecentEventsAsync(MySqlConnection db, int campaignId, CancellationToken ct)
    {
        var events = new List<EventRow>();
        await using var cmd = new MySqlCommand("""
            SELECT id, event_kind, summary, created_at
            FROM lw_play_events
            WHERE campaign_id = @c
            ORDER BY created_at DESC, id DESC
            LIMIT 10
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            events.Add(new EventRow(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetDateTime(3)));
        }

        return events;
    }

    private static IReadOnlyList<string> ParseList(MySqlDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return [];
        }

        return JsonSerializer.Deserialize<string[]>(reader.GetString(ordinal)) ?? [];
    }

    private static string PrepStatusLabel(int total, int completed) =>
        total == 0 ? "No prep items"
        : completed == 0 ? "Not Started"
        : completed >= total ? "Ready"
        : "Prep In Progress";

    private static string Initials(string name)
    {
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length switch
        {
            0 => "?",
            1 => parts[0][..1].ToUpperInvariant(),
            _ => $"{parts[0][0]}{parts[^1][0]}".ToUpperInvariant(),
        };
    }

    private static string HumanizeKind(string kind) =>
        string.Join(" ", kind.Split(['_', '-', '.'], StringSplitOptions.RemoveEmptyEntries)
            .Select(word => char.ToUpperInvariant(word[0]) + word[1..]));

    private static string RelativeTime(DateTime createdAt)
    {
        var span = DateTime.UtcNow - DateTime.SpecifyKind(createdAt, DateTimeKind.Utc);
        if (span.TotalMinutes < 1) return "just now";
        if (span.TotalHours < 1) return $"{(int)span.TotalMinutes}m ago";
        if (span.TotalDays < 1) return $"{(int)span.TotalHours}h ago";
        return $"{(int)span.TotalDays}d ago";
    }

    private sealed record CampaignRow(
        long Id, string Name, string Subtitle, string CurrentAct,
        int CurrentSessionNumber, string LocationName, string WorldName);

    private sealed record SessionRow(
        string Id, int Number, string Title, string State, string ScheduledLabel, string Epigraph,
        string Summary, string Artwork, IReadOnlyList<string> Objectives, IReadOnlyList<string> StoppingPoints);

    private sealed record PartyRow(
        string Key, string Name, string Ancestry, string ClassName, int CurrentXp, int NextXp,
        int CurrentHp, int MaxHp, int ArmorClass);

    private sealed record EventRow(long Id, string Kind, string Summary, DateTime CreatedAt);
}
