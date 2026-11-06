using System.Collections.Concurrent;
using LoomWeaver.Domain;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Audio;

public static class AudioAmbienceEndpoints
{
    private static string _activePresetId = "preset-ballroom";
    private static string _activeTrackId = "track-the-longest-journey";
    private static string _activePlaylistId = "playlist-campaign-overworld";
    private static double _masterVolume = 0.80;

    private static readonly ConcurrentDictionary<int, List<GmPlaylistContract>> CampaignPlaylists = new();
    private static readonly ConcurrentDictionary<int, List<GmMusicTriggerContract>> CampaignTriggers = new();

    private static readonly IReadOnlyList<MusicTrackContract> CuratedTracks = new[]
    {
        new MusicTrackContract(
            "track-dnd-acoustic-loop",
            "D&D Acoustic Tavern & Road Loop",
            "ebunny",
            "Session & Tavern",
            "/assets/music-library/ebunny-dnd-acoustic-loop-622875.mp3",
            138,
            "Warm Acoustic Lute & Campfire Rest"
        ),
        new MusicTrackContract(
            "track-the-longest-journey",
            "The Longest Journey",
            "Alexander Nakarada",
            "Campaign Theme",
            "/assets/music-library/nakaradaalexander-the-longest-journey-408735.mp3",
            422,
            "Epic Overland Chronicle & Horizon Travel"
        ),
        new MusicTrackContract(
            "track-woods-of-imagination",
            "Woods of Imagination",
            "Alexander Nakarada",
            "Session & Exploration",
            "/assets/music-library/nakaradaalexander-woods-of-imagination-139004.mp3",
            171,
            "Mystic Woodland, Feywild & Ancient Lore"
        ),
        new MusicTrackContract(
            "track-here-be-dragons",
            "Here Be Dragons",
            "Tim Kulig",
            "Battlemap & Boss",
            "/assets/music-library/tim_kulig_free_music-here-be-dragons-127810.mp3",
            307,
            "Mythic Dragon Lair & High-Stakes Boss Encounter"
        ),
        new MusicTrackContract(
            "track-in-pursuit-of-a-pirate",
            "In Pursuit of a Pirate",
            "Tim Kulig",
            "Battlemap & Skirmish",
            "/assets/music-library/tim_kulig_free_music-in-pursuit-of-a-pirate-127812.mp3",
            98,
            "Swashbuckling Skyship Chase & Ambush"
        ),
        new MusicTrackContract(
            "track-challenge-of-the-goliath",
            "The Challenge of the Goliath",
            "Tim Kulig",
            "Battlemap & Combat",
            "/assets/music-library/tim_kulig_free_music-the-challenge-of-the-golliath-154943.mp3",
            254,
            "Heavy Tactical Battlemap & Initiative Clash"
        )
    };

    private static List<GmPlaylistContract> CreateDefaultPlaylists() =>
    [
        new GmPlaylistContract(
            "playlist-campaign-overworld",
            "Campaign Chronicle & World Map",
            "Default campaign soundtrack when entering the campaign dashboard, world lore, and overland travel.",
            ["track-the-longest-journey", "track-woods-of-imagination", "track-dnd-acoustic-loop"],
            true
        ),
        new GmPlaylistContract(
            "playlist-session-start",
            "Session Opening & Tavern Gathering",
            "Triggered automatically when a session starts or switches to the active table session.",
            ["track-dnd-acoustic-loop", "track-woods-of-imagination", "track-the-longest-journey"],
            true
        ),
        new GmPlaylistContract(
            "playlist-battlemap-combat",
            "Live Battlemap & Tactical Combat",
            "Triggered automatically when a battlemap goes live on the VTT or is published to the active encounter.",
            ["track-challenge-of-the-goliath", "track-here-be-dragons", "track-in-pursuit-of-a-pirate"],
            true
        )
    ];

    private static List<GmMusicTriggerContract> CreateDefaultTriggers() =>
    [
        new GmMusicTriggerContract(
            "trig-campaign-default",
            "campaign",
            "*",
            "Any Campaign (Campaign Theme)",
            "playlist-campaign-overworld",
            "track-the-longest-journey",
            true,
            2.4
        ),
        new GmMusicTriggerContract(
            "trig-session-default",
            "session",
            "*",
            "When Any Session Starts / Goes Active",
            "playlist-session-start",
            "track-dnd-acoustic-loop",
            true,
            2.0
        ),
        new GmMusicTriggerContract(
            "trig-battlemap-default",
            "battlemap",
            "*",
            "When Any Battlemap Goes Live on VTT",
            "playlist-battlemap-combat",
            "track-challenge-of-the-goliath",
            true,
            1.5
        ),
        new GmMusicTriggerContract(
            "trig-battlemap-dragon",
            "battlemap",
            "scene-shadow-mountain",
            "Shadow of the Mountain — Dragon Cavern Battlemap",
            "playlist-battlemap-combat",
            "track-here-be-dragons",
            true,
            1.5
        )
    ];

    private static readonly IReadOnlyList<AudioStemContract> CuratedStems = new[]
    {
        new AudioStemContract("stem-drone", "Sub-Bass Cathedral Drone", "Foundation Pad", "sine", 65.41, 0.72),
        new AudioStemContract("stem-harmony", "Nocturne Strings & Glass Harp", "Exploration Melody", "triangle", 196.00, 0.64),
        new AudioStemContract("stem-tension", "Runic Heartbeat & Low Brass", "Intrigue / Threat", "sawtooth", 98.00, 0.35),
        new AudioStemContract("stem-combat", "War Drums & Clockwork Anvil", "Combat Percussion", "square", 130.81, 0.10)
    };

    private static readonly IReadOnlyList<AudioScenePresetContract> CuratedPresets = new[]
    {
        new AudioScenePresetContract(
            "preset-ballroom",
            "Masquerade Ballroom",
            "Intrigue & Velvet Tension",
            108,
            "C Minor",
            "Chamber strings and subtle glass harp layered over a dormant vampiric heartbeat.",
            2.4,
            new Dictionary<string, double>
            {
                ["stem-drone"] = 0.55,
                ["stem-harmony"] = 0.82,
                ["stem-tension"] = 0.48,
                ["stem-combat"] = 0.08
            }
        ),
        new AudioScenePresetContract(
            "preset-shadow-mountain",
            "Shadow Beneath the Mountain",
            "Mythic Dread & Ancient Runes",
            64,
            "D Phrygian",
            "Deep tectonic sub-bass and scraping runic resonance echoing from the bound dragon's cavern.",
            3.2,
            new Dictionary<string, double>
            {
                ["stem-drone"] = 0.92,
                ["stem-harmony"] = 0.28,
                ["stem-tension"] = 0.85,
                ["stem-combat"] = 0.22
            }
        ),
        new AudioScenePresetContract(
            "preset-blood-waltz-combat",
            "Crimson Covenant Ambush",
            "Active Tactical Combat",
            142,
            "F Minor",
            "Full combat percussion and aggressive low brass driving high-stakes initiative turns.",
            1.5,
            new Dictionary<string, double>
            {
                ["stem-drone"] = 0.78,
                ["stem-harmony"] = 0.45,
                ["stem-tension"] = 0.90,
                ["stem-combat"] = 0.95
            }
        ),
        new AudioScenePresetContract(
            "preset-skyship-horizon",
            "Skyship Over the Harbor",
            "High Adventure & Wind",
            118,
            "G Dorian",
            "Soaring artificer turbine hum and open-sky harmonic chords across the Bay of Forgotten Treasures.",
            2.8,
            new Dictionary<string, double>
            {
                ["stem-drone"] = 0.48,
                ["stem-harmony"] = 0.90,
                ["stem-tension"] = 0.20,
                ["stem-combat"] = 0.30
            }
        )
    };

    private static IReadOnlyList<MusicTrackContract> DiscoverTracks()
    {
        var list = CuratedTracks.ToList();
        var knownUrls = new HashSet<string>(list.Select(t => t.Url), StringComparer.OrdinalIgnoreCase);

        var candidates = new[]
        {
            "/var/www/loomweaver/assets/music-library",
            @"C:\map assets\music-library"
        };

        var dir = candidates.FirstOrDefault(Directory.Exists);
        if (dir is not null)
        {
            foreach (var file in Directory.EnumerateFiles(dir, "*.mp3"))
            {
                var fileName = Path.GetFileName(file);
                var url = $"/assets/music-library/{fileName}";
                if (knownUrls.Contains(url)) continue;

                var stem = Path.GetFileNameWithoutExtension(fileName)
                    .Replace('_', ' ')
                    .Replace('-', ' ');
                list.Add(new MusicTrackContract(
                    $"track-{Path.GetFileNameWithoutExtension(fileName).ToLowerInvariant()}",
                    stem,
                    "GM Music Library",
                    "Custom Upload",
                    url,
                    180,
                    "Custom Campaign Soundtrack"
                ));
            }
        }

        return list;
    }

    public static RouteGroupBuilder MapAudioAmbienceEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/audio-state", (int campaignId) =>
        {
            var playlists = CampaignPlaylists.GetOrAdd(campaignId, _ => CreateDefaultPlaylists());
            var triggers = CampaignTriggers.GetOrAdd(campaignId, _ => CreateDefaultTriggers());
            var tracks = DiscoverTracks();

            return Results.Ok(new AudioStateResponseContract(
                campaignId,
                _activePresetId,
                _masterVolume,
                CuratedStems,
                CuratedPresets,
                _activeTrackId,
                _activePlaylistId,
                tracks,
                playlists,
                triggers
            ));
        });

        api.MapPost("/campaigns/{campaignId:int}/audio-state/transition", (int campaignId, AudioTransitionRequestContract req) =>
        {
            var tracks = DiscoverTracks();
            if (!string.IsNullOrWhiteSpace(req.TrackId))
            {
                var foundTrack = tracks.FirstOrDefault(t => t.Id == req.TrackId);
                if (foundTrack is not null)
                {
                    _activeTrackId = foundTrack.Id;
                }
            }
            if (!string.IsNullOrWhiteSpace(req.PlaylistId))
            {
                _activePlaylistId = req.PlaylistId;
            }

            var target = CuratedPresets.FirstOrDefault(p => p.Id == req.PresetId) ?? CuratedPresets[0];
            _activePresetId = target.Id;

            var activeTrack = tracks.FirstOrDefault(t => t.Id == _activeTrackId) ?? tracks[0];

            return Results.Ok(new
            {
                campaignId,
                activePresetId = target.Id,
                activeTrackId = activeTrack.Id,
                activePlaylistId = _activePlaylistId,
                trackTitle = activeTrack.Title,
                trackUrl = activeTrack.Url,
                presetName = target.Name,
                mood = activeTrack.Mood,
                crossfadeSeconds = Math.Clamp(req.CrossfadeSeconds <= 0 ? 2.0 : req.CrossfadeSeconds, 0.2, 10.0),
                stemGains = target.StemGains,
                transitionedAt = DateTimeOffset.UtcNow
            });
        });

        api.MapPost("/campaigns/{campaignId:int}/audio-state/playlists", (int campaignId, GmMusicSaveRequestContract req) =>
        {
            if (!string.IsNullOrWhiteSpace(req.ActiveTrackId))
                _activeTrackId = req.ActiveTrackId;
            if (!string.IsNullOrWhiteSpace(req.ActivePlaylistId))
                _activePlaylistId = req.ActivePlaylistId;
            if (req.MasterVolume.HasValue)
                _masterVolume = Math.Clamp(req.MasterVolume.Value, 0.0, 1.0);
            if (req.Playlists is not null && req.Playlists.Count > 0)
                CampaignPlaylists[campaignId] = req.Playlists.ToList();
            if (req.Triggers is not null)
                CampaignTriggers[campaignId] = req.Triggers.ToList();

            var playlists = CampaignPlaylists.GetOrAdd(campaignId, _ => CreateDefaultPlaylists());
            var triggers = CampaignTriggers.GetOrAdd(campaignId, _ => CreateDefaultTriggers());

            return Results.Ok(new
            {
                campaignId,
                activeTrackId = _activeTrackId,
                activePlaylistId = _activePlaylistId,
                masterVolume = _masterVolume,
                playlists,
                triggers,
                savedAt = DateTimeOffset.UtcNow
            });
        });

        return api;
    }
}
