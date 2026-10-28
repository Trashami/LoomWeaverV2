using System.Text.Json;
namespace LoomWeaver.Modules.Maps.Features.WorldAtlas;

public sealed record AtlasMarker(string Id, string LocationKey, string Name, string Kind, double X, double Z, string Color, string Visibility);
public sealed record AtlasDocument(int SchemaVersion, string Id, int Revision, string Name, int Seed, int Resolution,
    double WidthKm, double HeightKm, double SeaLevel, double[] Heights, int[] Biomes, AtlasMarker[] Markers, string? PreviewDataUrl = null);
public sealed record AtlasSummary(string Id, string Name, int Revision);
public static class AtlasValidation
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static bool ValidKey(string? key) => key is { Length: > 0 and <= 64 } && key.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
    public static string? Error(AtlasDocument d)
    {
        if (d.PreviewDataUrl is not null && (d.PreviewDataUrl.Length > 2_000_000 || !d.PreviewDataUrl.StartsWith("data:image/png;base64,"))) return "Invalid atlas preview.";
        if (d.SchemaVersion != 1 || !ValidKey(d.Id) || d.Id.Length>58 || d.Revision < 0 || string.IsNullOrWhiteSpace(d.Name) || d.Name.Length > 160)
            return "Invalid atlas identity or version.";
        if (d.Resolution is < 32 or > 256 || d.Heights?.Length != (d.Resolution + 1) * (d.Resolution + 1)
            || d.Biomes?.Length != d.Heights.Length || d.Heights.Any(h => !double.IsFinite(h) || h is < -1 or > 3)
            || d.Biomes.Any(b => b is < 0 or > 6)) return "Invalid terrain samples.";
        if (!double.IsFinite(d.WidthKm) || d.WidthKm is < 10 or > 20000 || !double.IsFinite(d.HeightKm) || d.HeightKm is < 10 or > 20000
            || d.WidthKm/d.HeightKm is < .125 or > 8 || !double.IsFinite(d.SeaLevel) || d.SeaLevel is < -.8 or > 1) return "Invalid atlas scale or sea level.";
        if (d.Markers is null || d.Markers.Length > 500 || (d.Markers.Select(m => m?.LocationKey).Distinct().Count() != d.Markers.Length || d.Markers.Select(m => m?.Id).Distinct().Count() != d.Markers.Length))
            return "Invalid or duplicate location markers.";
        foreach (var m in d.Markers)
            if (m is null || !ValidKey(m.Id) || !ValidKey(m.LocationKey) || string.IsNullOrWhiteSpace(m.Name) || m.Name.Length > 160
                || m.Kind is not ("city" or "town" or "village" or "castle" or "ruin" or "landmark")
                || m.Visibility is not ("gm" or "players") || !double.IsFinite(m.X) || !double.IsFinite(m.Z) || Math.Abs(m.X) > 120 || Math.Abs(m.Z) > 120
                || m.Color is null || !System.Text.RegularExpressions.Regex.IsMatch(m.Color, "^#[0-9a-fA-F]{6}$")) return "Invalid location marker.";
        return null;
    }
}
