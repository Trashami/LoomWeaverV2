using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Modules.EffectStudio.Domain;

namespace LoomWeaver.Modules.EffectStudio.Engine;

public sealed class EffectTimelineValidationEngine
{
    private readonly List<EffectStudioDocumentDto> _documents = SeedDefaultDocuments();

    public IReadOnlyList<EffectStudioDocumentDto> GetDocumentsForCampaign(int campaignId) =>
        _documents.Where(d => d.CampaignId == campaignId || d.CampaignId == 1).ToList();

    public EffectStudioDocumentDto GetOrDefaultDocument(string? id)
    {
        if (!string.IsNullOrWhiteSpace(id))
        {
            var found = _documents.FirstOrDefault(d => string.Equals(d.Id, id, StringComparison.OrdinalIgnoreCase));
            if (found is not null) return found;
        }
        return _documents[0];
    }

    public EffectStudioDocumentDto ValidateAndSave(SaveEffectStudioDocumentRequest req)
    {
        var duration = Math.Clamp(req.TotalDurationSeconds <= 0 ? 5.0 : req.TotalDurationSeconds, 1.0, 30.0);
        var p = req.ActiveProperties;

        var normalizedProps = new EffectEmitterCardDto(
            Id: string.IsNullOrWhiteSpace(p.Id) ? "fx-energy-column" : p.Id,
            Name: string.IsNullOrWhiteSpace(p.Name) ? "Energy Column" : p.Name.Trim(),
            Category: string.IsNullOrWhiteSpace(p.Category) ? "Beams & Volumes" : p.Category,
            EmitterType: string.IsNullOrWhiteSpace(p.EmitterType) ? "Energy Column" : p.EmitterType,
            Shape: string.IsNullOrWhiteSpace(p.Shape) ? "Cylinder Pillar" : p.Shape,
            Radius: Math.Round(Math.Clamp(p.Radius, 0.5, 16.0), 2),
            Height: Math.Round(Math.Clamp(p.Height, 0.2, 20.0), 2),
            EmissionRate: Math.Clamp(p.EmissionRate, 5, 1200),
            LifetimeSeconds: Math.Round(Math.Clamp(p.LifetimeSeconds, 0.2, 12.0), 2),
            Speed: Math.Round(Math.Clamp(p.Speed, 0.1, 15.0), 2),
            SpreadDegrees: Math.Round(Math.Clamp(p.SpreadDegrees, 0.0, 180.0), 1),
            MaterialName: string.IsNullOrWhiteSpace(p.MaterialName) ? "Golden Light" : p.MaterialName,
            ColorPrimaryHex: string.IsNullOrWhiteSpace(p.ColorPrimaryHex) ? "#fcd34d" : p.ColorPrimaryHex,
            ColorSecondaryHex: string.IsNullOrWhiteSpace(p.ColorSecondaryHex) ? "#fffbeb" : p.ColorSecondaryHex,
            SizeMin: Math.Round(Math.Clamp(p.SizeMin, 0.05, 4.0), 2),
            SizeMax: Math.Round(Math.Clamp(Math.Max(p.SizeMin + 0.1, p.SizeMax), 0.1, 8.0), 2),
            OpacityPercent: Math.Clamp(p.OpacityPercent, 5, 100),
            BlendMode: string.IsNullOrWhiteSpace(p.BlendMode) ? "Additive" : p.BlendMode,
            CastLight: p.CastLight,
            LightIntensity: Math.Round(Math.Clamp(p.LightIntensity, 0.0, 5.0), 2),
            ReceiveShadows: p.ReceiveShadows,
            PreviewAccentHex: string.IsNullOrWhiteSpace(p.PreviewAccentHex) ? "#f59e0b" : p.PreviewAccentHex,
            AppearanceId: p.AppearanceId ?? "Radiant",
            Count: p.Count ?? 1,
            Scale: p.Scale ?? 1.0,
            BurstVariant: p.BurstVariant,
            SigilPattern: p.SigilPattern
        );

        var normalizedTracks = (req.Tracks?.Count > 0 ? req.Tracks : DefaultTracks())
            .Select((t, idx) => new EffectTimelineTrackDto(
                Id: string.IsNullOrWhiteSpace(t.Id) ? $"trk-{idx + 1}" : t.Id,
                Label: string.IsNullOrWhiteSpace(t.Label) ? $"Layer {idx + 1}" : t.Label.Trim(),
                TrackType: string.IsNullOrWhiteSpace(t.TrackType) ? "Energy Column" : t.TrackType,
                Visible: t.Visible,
                Expanded: t.Expanded,
                StartTimeSeconds: Math.Round(Math.Clamp(t.StartTimeSeconds, 0.0, duration - 0.1), 2),
                EndTimeSeconds: Math.Round(Math.Clamp(Math.Max(t.StartTimeSeconds + 0.2, t.EndTimeSeconds), 0.2, duration), 2),
                ColorHex: string.IsNullOrWhiteSpace(t.ColorHex) ? "#f59e0b" : t.ColorHex,
                AccentHex: string.IsNullOrWhiteSpace(t.AccentHex) ? "#fef08a" : t.AccentHex,
                EmitterId: string.IsNullOrWhiteSpace(t.EmitterId) ? normalizedProps.Id : t.EmitterId,
                Anchor: t.Anchor ?? "target",
                AppearanceId: t.AppearanceId ?? normalizedProps.AppearanceId,
                Scale: t.Scale ?? 1.0,
                Count: t.Count ?? 1,
                OpacityPercent: t.OpacityPercent ?? 90,
                AnimationModifier: t.AnimationModifier
            ))
            .ToList();

        var canonStatus = string.Equals(req.ViewerRole, "gm", StringComparison.OrdinalIgnoreCase)
            ? "approved"
            : "draft";

        var id = string.IsNullOrWhiteSpace(req.Id) || req.Id == "fx-unnamed-default"
            ? $"fx-custom-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}"
            : req.Id;

        var saved = new EffectStudioDocumentDto(
            Id: id,
            CampaignId: req.CampaignId <= 0 ? 1 : req.CampaignId,
            Name: string.IsNullOrWhiteSpace(req.Name) ? "Unnamed Effect" : req.Name.Trim(),
            Subtitle: string.IsNullOrWhiteSpace(req.Subtitle) ? "Custom Visual Effect" : req.Subtitle.Trim(),
            StatusLabel: "Saved",
            ActiveCameraPreset: string.IsNullOrWhiteSpace(req.ActiveCameraPreset) ? "Isometric" : req.ActiveCameraPreset,
            TotalDurationSeconds: duration,
            ActiveEmitterId: string.IsNullOrWhiteSpace(req.ActiveEmitterId) ? normalizedProps.Id : req.ActiveEmitterId,
            ActiveProperties: normalizedProps,
            MotionAndForces: req.MotionAndForces ?? DefaultMotionForces(),
            Tracks: normalizedTracks,
            CanonStatus: canonStatus,
            UpdatedAt: DateTimeOffset.UtcNow.ToString("O")
        );

        var existingIdx = _documents.FindIndex(d => string.Equals(d.Id, saved.Id, StringComparison.OrdinalIgnoreCase));
        if (existingIdx >= 0) _documents[existingIdx] = saved;
        else _documents.Insert(0, saved);

        return saved;
    }

    public EffectInGameTestResultDto SimulateInGameTest(EffectInGameTestRequest req)
    {
        var doc = GetOrDefaultDocument(req.EffectId);
        var activeTracks = doc.Tracks.Where(t => t.Visible).ToList();
        var distFeet = Math.Round(Math.Sqrt(req.TargetX * req.TargetX + req.TargetZ * req.TargetZ) * 5.0, 1);
        var particleTotal = (int)Math.Round(
            doc.ActiveProperties.EmissionRate * doc.ActiveProperties.LifetimeSeconds * Math.Max(1, activeTracks.Count * 0.65)
        );
        if (req.ReducedMotion) particleTotal = Math.Min(particleTotal, 48);

        var lux = doc.ActiveProperties.CastLight
            ? Math.Round(doc.ActiveProperties.LightIntensity * doc.ActiveProperties.Radius * 12.5, 1)
            : 0.0;

        var summary =
            $"[In-Game VTT Test] Triggered '{doc.Name}' from {req.CasterTokenKey} at ({req.TargetX:F1}, {req.TargetZ:F1}) · " +
            $"{activeTracks.Count} explicit timeline layers · {particleTotal} GPU particles · Radius {doc.ActiveProperties.Radius:F1}m.";

        return new EffectInGameTestResultDto(
            EffectId: doc.Id,
            EffectName: doc.Name,
            CasterTokenKey: req.CasterTokenKey,
            TargetTokenKey: req.TargetTokenKey,
            DistanceFeet: distFeet,
            SimulatedParticlesSpawned: particleTotal,
            DynamicLightPeakLux: lux,
            TriggeredTrackLabels: activeTracks.Select(t => $"{t.Label} ({t.StartTimeSeconds:F1}s-{t.EndTimeSeconds:F1}s)").ToList(),
            CombatLogSummary: summary,
            Timestamp: DateTimeOffset.UtcNow.ToString("O")
        );
    }

    public EffectExportBundleDto BuildExportBundle(string? effectId)
    {
        var doc = GetOrDefaultDocument(effectId);
        var json = JsonSerializer.Serialize(doc);
        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(json));
        var checksum = Convert.ToHexString(hashBytes)[..16].ToLowerInvariant();

        return new EffectExportBundleDto(
            BundleFormat: "loomweaver.effect-studio.v2",
            Version: "2.0.0",
            ExportedAt: DateTimeOffset.UtcNow.ToString("O"),
            Effect: doc,
            Checksum: checksum
        );
    }

    private static List<EffectStudioDocumentDto> SeedDefaultDocuments()
    {
        var energyCol = EffectEmitterCatalog.GetAllEmitters()
            .First(e => e.Id == "fx-energy-column");

        return
        [
            new EffectStudioDocumentDto(
                Id: "fx-unnamed-default",
                CampaignId: 1,
                Name: "Unnamed Effect",
                Subtitle: "Custom Visual Effect",
                StatusLabel: "Not Saved",
                ActiveCameraPreset: "Isometric",
                TotalDurationSeconds: 5.0,
                ActiveEmitterId: "fx-energy-column",
                ActiveProperties: energyCol,
                MotionAndForces: DefaultMotionForces(),
                Tracks: DefaultTracks(),
                CanonStatus: "approved",
                UpdatedAt: DateTimeOffset.UtcNow.ToString("O")
            ),
            new EffectStudioDocumentDto(
                Id: "fx-anelith-sun-spire",
                CampaignId: 1,
                Name: "Golden Rune Vortex",
                Subtitle: "Sidhe Ard Creation Remnant · Radiant AoE",
                StatusLabel: "Saved",
                ActiveCameraPreset: "Isometric",
                TotalDurationSeconds: 5.0,
                ActiveEmitterId: "fx-energy-column",
                ActiveProperties: energyCol with { Radius = 4.5, EmissionRate = 160, LightIntensity = 1.6 },
                MotionAndForces: DefaultMotionForces(),
                Tracks: DefaultTracks(),
                CanonStatus: "approved",
                UpdatedAt: DateTimeOffset.UtcNow.ToString("O")
            )
        ];
    }

    private static EffectMotionForceConfigDto DefaultMotionForces() => new(
        GravityY: 1.35,
        VortexStrength: 2.8,
        SpiralFrequency: 2.4,
        DragCoefficient: 0.18,
        EnableCollision: true,
        BounceRestitution: 0.35,
        AttachedModelKey: "mdl-arcane-staff-orb",
        SoundCueId: "sfx-celestial-choir-swell",
        SoundVolumePercent: 85
    );

    private static IReadOnlyList<EffectTimelineTrackDto> DefaultTracks() =>
    [
        new("trk-light-beam", "Light Beam", "Energy Column", true, false, 0.0, 3.3, "#d97706", "#fde047", "fx-energy-column", "target", "Radiant", 1.1, 1, 95, "Fade / Pulse"),
        new("trk-rising-particles", "Rising Particles", "Sparks / Embers", true, false, 0.52, 2.8, "#b45309", "#fcd34d", "fx-sparks-embers", "target", "Radiant", 1.0, 42, 90, "Rotate / Orbit"),
        new("trk-rune-circle", "Rune Circle", "Magic Circle", true, false, 0.06, 3.58, "#1e3a5f", "#60a5fa", "fx-magic-circle", "target", "Radiant", 1.15, 1, 92, "Rotate / Orbit"),
        new("trk-dust", "Dust", "Smoke / Mist", true, false, 0.34, 4.12, "#4c3b71", "#a78bfa", "fx-smoke-mist", "target", "Shadow", 1.0, 1, 68, "Grow / Shrink"),
        new("trk-sound", "Sound", "Sound", true, false, 0.0, 4.18, "#7e22ce", "#c084fc", "fx-sound", "target", "Spectral", 1.0, 1, 100, "Fade / Pulse")
    ];
}
