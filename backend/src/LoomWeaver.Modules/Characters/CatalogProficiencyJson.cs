using System.Globalization;
using System.Text.Json;

namespace LoomWeaver.Modules.Characters;

// Flattens 5etools proficiency JSON ([{"history": true}]) and homebrew string arrays (["History"])
// into one JSON string array for the character creator. The database keeps the raw 5etools form.
internal static class CatalogProficiencyJson
{
    public static string ToStringArray(string? raw)
    {
        var names = new List<string>();
        if (!string.IsNullOrWhiteSpace(raw))
        {
            try
            {
                using var doc = JsonDocument.Parse(raw);
                Collect(doc.RootElement, names);
            }
            catch (JsonException)
            {
                return "[]";
            }
        }

        return JsonSerializer.Serialize(names.Distinct(StringComparer.OrdinalIgnoreCase));
    }

    private static void Collect(JsonElement element, List<string> names)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray()) Collect(item, names);
                break;
            case JsonValueKind.String:
                AddName(element.GetString(), names);
                break;
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    if (property.Value.ValueKind == JsonValueKind.True) AddName(property.Name, names);
                }
                break;
        }
    }

    private static void AddName(string? value, List<string> names)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return;
        names.Add(CultureInfo.InvariantCulture.TextInfo.ToTitleCase(trimmed));
    }
}
