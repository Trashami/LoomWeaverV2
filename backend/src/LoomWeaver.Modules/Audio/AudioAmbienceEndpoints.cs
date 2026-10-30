using LoomWeaver.Domain;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Audio;

public static class AudioAmbienceEndpoints
{
    private static string _activePresetId = "preset-ballroom";

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

    public static RouteGroupBuilder MapAudioAmbienceEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/audio-state", (int campaignId) =>
            Results.Ok(new AudioStateResponseContract(
                campaignId,
                _activePresetId,
                0.80,
                CuratedStems,
                CuratedPresets
            )));

        api.MapPost("/campaigns/{campaignId:int}/audio-state/transition", (int campaignId, AudioTransitionRequestContract req) =>
        {
            var target = CuratedPresets.FirstOrDefault(p => p.Id == req.PresetId) ?? CuratedPresets[0];
            _activePresetId = target.Id;

            return Results.Ok(new
            {
                campaignId,
                activePresetId = target.Id,
                presetName = target.Name,
                mood = target.Mood,
                crossfadeSeconds = Math.Clamp(req.CrossfadeSeconds <= 0 ? target.CrossfadeSeconds : req.CrossfadeSeconds, 0.2, 10.0),
                stemGains = target.StemGains,
                transitionedAt = DateTimeOffset.UtcNow
            });
        });

        return api;
    }
}
