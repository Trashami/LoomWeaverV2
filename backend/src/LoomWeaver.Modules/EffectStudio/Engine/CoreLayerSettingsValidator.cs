using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace LoomWeaver.Modules.EffectStudio.Engine;

/// <summary>Allowlisted numeric settings and variants shared with the editor JSON catalog.</summary>
public static class CoreLayerSettingsValidator
{
    private static readonly JsonDocument Catalog = JsonDocument.Parse(
        Assembly.GetExecutingAssembly().GetManifestResourceStream("CoreLayerControls")
        ?? throw new InvalidOperationException("Missing core layer control catalog."));
    public static readonly Dictionary<string, string[]> Variants = Catalog.RootElement.GetProperty("variants")
        .EnumerateObject().ToDictionary(p => p.Name, p => p.Value.EnumerateArray().Select(v => v.GetString()!).ToArray());

    public static bool Valid(JsonElement layer)
    {
        var kind = layer.GetProperty("kind").GetString();
        foreach (var schema in Catalog.RootElement.GetProperty("rendererSettings").EnumerateObject())
        {
            if (!layer.TryGetProperty(schema.Name, out var settings)) continue;
            if (settings.ValueKind != JsonValueKind.Object ||
                !schema.Value.GetProperty("kinds").EnumerateArray().Any(k => k.GetString() == kind)) return false;
            var fields = schema.Value.GetProperty("fields");
            if (settings.EnumerateObject().Any(p => !fields.TryGetProperty(p.Name, out _))) return false;
            foreach (var field in fields.EnumerateObject())
            {
                if (!settings.TryGetProperty(field.Name, out var value)) return false;
                var rule = field.Value;
                if (rule.TryGetProperty("boolean", out _))
                { if (value.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false; }
                else if (rule.TryGetProperty("color", out _))
                { if (value.ValueKind != JsonValueKind.String || !Regex.IsMatch(value.GetString()!, "^#[0-9a-fA-F]{6}$")) return false; }
                else if (rule.TryGetProperty("values", out var values))
                { if (value.ValueKind != JsonValueKind.String || !values.EnumerateArray().Any(v => v.GetString() == value.GetString())) return false; }
                else if (value.ValueKind != JsonValueKind.Number || !value.TryGetDouble(out var n) ||
                    !double.IsFinite(n) || n < rule.GetProperty("min").GetDouble() || n > rule.GetProperty("max").GetDouble() ||
                    (rule.TryGetProperty("integer", out _) && n != Math.Truncate(n))) return false;
            }
        }
        return true;
    }
}
