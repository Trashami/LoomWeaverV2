using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using LoomWeaver.Domain;

namespace LoomWeaver.Modules.Bestiary;

/// <summary>
/// Pure helpers that translate 5etools-style monster JSON (dnd_monster_library.raw_json) into readable statblock text.
/// No I/O; safe to unit test.
/// </summary>
public static partial class BestiaryStatblockMapper
{
    private static readonly IReadOnlyDictionary<string, int> XpByCr = new Dictionary<string, int>
    {
        ["0"] = 10, ["1/8"] = 25, ["1/4"] = 50, ["1/2"] = 100, ["1"] = 200, ["2"] = 450, ["3"] = 700,
        ["4"] = 1100, ["5"] = 1800, ["6"] = 2300, ["7"] = 2900, ["8"] = 3900, ["9"] = 5000, ["10"] = 5900,
        ["11"] = 7200, ["12"] = 8400, ["13"] = 10000, ["14"] = 11500, ["15"] = 13000, ["16"] = 15000,
        ["17"] = 18000, ["18"] = 20000, ["19"] = 22000, ["20"] = 25000, ["21"] = 33000, ["22"] = 41000,
        ["23"] = 50000, ["24"] = 62000, ["25"] = 75000, ["26"] = 90000, ["27"] = 105000, ["28"] = 120000,
        ["29"] = 135000, ["30"] = 155000
    };

    public static int ExperienceForCr(string? cr) =>
        XpByCr.TryGetValue((cr ?? "0").Trim(), out var xp) ? xp : 0;

    public static double CrToNumber(string? cr)
    {
        var c = (cr ?? "0").Trim();
        return c switch
        {
            "1/8" => 0.125,
            "1/4" => 0.25,
            "1/2" => 0.5,
            _ => double.TryParse(c, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : 0
        };
    }

    public static string SizeLabel(string? code) => (code ?? "M").Trim().ToUpperInvariant() switch
    {
        "T" => "Tiny",
        "S" => "Small",
        "M" => "Medium",
        "L" => "Large",
        "H" => "Huge",
        "G" => "Gargantuan",
        var other when other.Length > 1 => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(other.ToLowerInvariant()),
        _ => "Medium"
    };

    public static string SizeFromJson(JsonElement root)
    {
        if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() > 0 && root[0].ValueKind == JsonValueKind.String)
            return SizeLabel(root[0].GetString());
        if (root.ValueKind == JsonValueKind.String) return SizeLabel(root.GetString());
        return "Medium";
    }

    public static string TypeFromJson(JsonElement type)
    {
        if (type.ValueKind == JsonValueKind.String) return type.GetString() ?? "creature";
        if (type.ValueKind != JsonValueKind.Object) return "creature";

        var main = "creature";
        if (type.TryGetProperty("type", out var t))
        {
            if (t.ValueKind == JsonValueKind.String) main = t.GetString() ?? main;
            else if (t.ValueKind == JsonValueKind.Object && t.TryGetProperty("choose", out var choose))
                main = string.Join(" or ", choose.EnumerateArray().Select(x => x.GetString()).Where(x => !string.IsNullOrWhiteSpace(x)));
        }

        if (type.TryGetProperty("tags", out var tags) && tags.ValueKind == JsonValueKind.Array)
        {
            var tagTexts = tags.EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.String ? x.GetString() : x.TryGetProperty("tag", out var tg) ? tg.GetString() : null)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .ToList();
            if (tagTexts.Count > 0) main += $" ({string.Join(", ", tagTexts)})";
        }

        return main;
    }

    public static string AlignmentFromJson(JsonElement alignment)
    {
        if (alignment.ValueKind != JsonValueKind.Array || alignment.GetArrayLength() == 0) return "unaligned";
        if (alignment.EnumerateArray().Any(a => a.ValueKind != JsonValueKind.String)) return "varies";

        var codes = alignment.EnumerateArray().Select(a => (a.GetString() ?? "").ToUpperInvariant()).ToList();
        if (codes.Count == 1)
        {
            return codes[0] switch
            {
                "U" => "unaligned",
                "A" => "any alignment",
                "N" => "neutral",
                _ => AlignWord(codes[0])
            };
        }
        if (codes.Count >= 5) return "any alignment";
        return string.Join(" ", codes.Select(AlignWord));
    }

    private static string AlignWord(string code) => code switch
    {
        "L" => "lawful",
        "C" => "chaotic",
        "G" => "good",
        "E" => "evil",
        "N" or "NX" or "NY" => "neutral",
        "U" => "unaligned",
        "A" => "any",
        _ => code.ToLowerInvariant()
    };

    public static (int Value, string Label) ArmorClassFromJson(JsonElement ac)
    {
        if (ac.ValueKind != JsonValueKind.Array || ac.GetArrayLength() == 0) return (10, "10");
        var first = ac[0];
        if (first.ValueKind == JsonValueKind.Number) return (first.GetInt32(), first.GetInt32().ToString(CultureInfo.InvariantCulture));
        if (first.ValueKind != JsonValueKind.Object) return (10, "10");

        var value = first.TryGetProperty("ac", out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : 10;
        var label = value.ToString(CultureInfo.InvariantCulture);
        if (first.TryGetProperty("from", out var from) && from.ValueKind == JsonValueKind.Array)
        {
            var parts = from.EnumerateArray().Select(f => StripTags(f.GetString() ?? "")).Where(f => f.Length > 0).ToList();
            if (parts.Count > 0) label += $" ({string.Join(", ", parts)})";
        }
        return (value, label);
    }

    public static (int Value, string Label) HitPointsFromJson(JsonElement hp)
    {
        if (hp.ValueKind != JsonValueKind.Object) return (1, "1");
        if (hp.TryGetProperty("special", out var special)) return (1, StripTags(special.ToString()));
        var avg = hp.TryGetProperty("average", out var a) && a.ValueKind == JsonValueKind.Number ? a.GetInt32() : 1;
        var formula = hp.TryGetProperty("formula", out var f) ? f.GetString() : null;
        return (avg, string.IsNullOrWhiteSpace(formula) ? avg.ToString(CultureInfo.InvariantCulture) : $"{avg} ({formula})");
    }

    public static string SpeedFromJson(JsonElement speed)
    {
        if (speed.ValueKind != JsonValueKind.Object) return "30 ft.";
        var parts = new List<string>();
        foreach (var mode in new[] { "walk", "burrow", "climb", "fly", "swim" })
        {
            if (!speed.TryGetProperty(mode, out var v)) continue;
            string? text = v.ValueKind switch
            {
                JsonValueKind.Number => $"{v.GetInt32()} ft.",
                JsonValueKind.Object when v.TryGetProperty("number", out var n) =>
                    $"{n.GetInt32()} ft.{(v.TryGetProperty("condition", out var c) ? " " + StripTags(c.GetString() ?? "") : "")}",
                _ => null
            };
            if (text is null) continue;
            if (mode == "fly" && speed.TryGetProperty("canHover", out var hover) && hover.ValueKind == JsonValueKind.True) text += " (hover)";
            parts.Add(mode == "walk" ? text : $"{mode} {text}");
        }
        return parts.Count > 0 ? string.Join(", ", parts) : "30 ft.";
    }

    public static string BonusMapFromJson(JsonElement map)
    {
        if (map.ValueKind != JsonValueKind.Object) return "";
        return string.Join(", ", map.EnumerateObject()
            .Where(p => p.Value.ValueKind == JsonValueKind.String)
            .Select(p => $"{CultureInfo.InvariantCulture.TextInfo.ToTitleCase(p.Name)} {p.Value.GetString()}"));
    }

    public static string DamageListFromJson(JsonElement list, string nestedKey)
    {
        if (list.ValueKind != JsonValueKind.Array) return "";
        var parts = new List<string>();
        foreach (var entry in list.EnumerateArray())
        {
            if (entry.ValueKind == JsonValueKind.String)
            {
                parts.Add(entry.GetString() ?? "");
            }
            else if (entry.ValueKind == JsonValueKind.Object)
            {
                if (entry.TryGetProperty("special", out var sp)) { parts.Add(StripTags(sp.GetString() ?? "")); continue; }
                var inner = entry.TryGetProperty(nestedKey, out var n) ? DamageListFromJson(n, nestedKey) : "";
                var pre = entry.TryGetProperty("preNote", out var p) ? p.GetString() + " " : "";
                var note = entry.TryGetProperty("note", out var nt) ? " " + nt.GetString() : "";
                parts.Add($"{pre}{inner}{note}".Trim());
            }
        }
        return string.Join("; ", parts.Where(p => p.Length > 0));
    }

    public static string StringListFromJson(JsonElement list) =>
        list.ValueKind == JsonValueKind.Array
            ? string.Join(", ", list.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => StripTags(x.GetString() ?? "")))
            : "";

    public static string ChallengeFromJson(JsonElement cr) => cr.ValueKind switch
    {
        JsonValueKind.String => cr.GetString() ?? "0",
        JsonValueKind.Object when cr.TryGetProperty("cr", out var c) => c.GetString() ?? "0",
        JsonValueKind.Number => cr.GetRawText(),
        _ => "0"
    };

    public static List<BestiaryFeatureDto> FeaturesFromJson(JsonElement list)
    {
        var result = new List<BestiaryFeatureDto>();
        if (list.ValueKind != JsonValueKind.Array) return result;
        foreach (var f in list.EnumerateArray())
        {
            if (f.ValueKind != JsonValueKind.Object) continue;
            var name = f.TryGetProperty("name", out var n) ? StripTags(n.GetString() ?? "") : "";
            var text = f.TryGetProperty("entries", out var e) ? FlattenEntries(e) : "";
            if (name.Length == 0 && text.Length == 0) continue;
            result.Add(new BestiaryFeatureDto(name, text));
        }
        return result;
    }

    public static List<BestiaryFeatureDto> SpellcastingFromJson(JsonElement list)
    {
        var result = new List<BestiaryFeatureDto>();
        if (list.ValueKind != JsonValueKind.Array) return result;
        foreach (var sc in list.EnumerateArray())
        {
            if (sc.ValueKind != JsonValueKind.Object) continue;
            var sb = new StringBuilder();
            if (sc.TryGetProperty("headerEntries", out var header)) sb.Append(FlattenEntries(header));
            if (sc.TryGetProperty("will", out var will)) sb.Append($" At will: {StringListFromJson(will)}.");
            if (sc.TryGetProperty("daily", out var daily) && daily.ValueKind == JsonValueKind.Object)
            {
                foreach (var d in daily.EnumerateObject())
                    sb.Append($" {d.Name.TrimEnd('e')}/day{(d.Name.EndsWith('e') ? " each" : "")}: {StringListFromJson(d.Value)}.");
            }
            if (sc.TryGetProperty("spells", out var spells) && spells.ValueKind == JsonValueKind.Object)
            {
                foreach (var lvl in spells.EnumerateObject())
                {
                    var names = lvl.Value.TryGetProperty("spells", out var s) ? StringListFromJson(s) : "";
                    var slots = lvl.Value.TryGetProperty("slots", out var sl) && sl.ValueKind == JsonValueKind.Number ? $" ({sl.GetInt32()} slots)" : "";
                    sb.Append(lvl.Name == "0" ? $" Cantrips: {names}." : $" Level {lvl.Name}{slots}: {names}.");
                }
            }
            var name = sc.TryGetProperty("name", out var nm) ? StripTags(nm.GetString() ?? "Spellcasting") : "Spellcasting";
            result.Add(new BestiaryFeatureDto(name, sb.ToString().Trim()));
        }
        return result;
    }

    public static string FlattenEntries(JsonElement entries)
    {
        var parts = new List<string>();
        Flatten(entries, parts, 0);
        return string.Join(" ", parts.Where(p => p.Length > 0)).Trim();
    }

    private static void Flatten(JsonElement node, List<string> parts, int depth)
    {
        if (depth > 8) return;
        switch (node.ValueKind)
        {
            case JsonValueKind.String:
                parts.Add(StripTags(node.GetString() ?? ""));
                break;
            case JsonValueKind.Array:
                foreach (var child in node.EnumerateArray()) Flatten(child, parts, depth + 1);
                break;
            case JsonValueKind.Object:
                if (node.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String)
                    parts.Add(StripTags(name.GetString() ?? "").TrimEnd('.') + ".");
                if (node.TryGetProperty("entries", out var e)) Flatten(e, parts, depth + 1);
                if (node.TryGetProperty("entry", out var single)) Flatten(single, parts, depth + 1);
                if (node.TryGetProperty("items", out var items)) Flatten(items, parts, depth + 1);
                break;
        }
    }

    /// <summary>Converts 5etools inline tags ({@hit 4}, {@damage 1d6 + 2}, {@spell fireball|phb}) to plain text.</summary>
    public static string StripTags(string text)
    {
        if (string.IsNullOrEmpty(text) || !text.Contains("{@")) return text?.Trim() ?? "";
        var current = text;
        for (var pass = 0; pass < 5 && current.Contains("{@"); pass++)
        {
            current = InlineTagRegex().Replace(current, m => ReplaceTag(m.Groups[1].Value.ToLowerInvariant(), m.Groups[2].Value));
        }
        return current.Trim();
    }

    private static string ReplaceTag(string tag, string body)
    {
        var first = body.Split('|')[0].Trim();
        return tag switch
        {
            "hit" => first.StartsWith('-') ? first : $"+{first}",
            "h" => "Hit: ",
            "m" => "Miss: ",
            "hom" => "Hit or Miss: ",
            "atk" or "atkr" => AttackLabel(first),
            "dc" => $"DC {first}",
            "recharge" => string.IsNullOrWhiteSpace(first) ? "(Recharge 6)" : $"(Recharge {first}-6)",
            "chance" => $"{first} percent",
            _ => first
        };
    }

    private static string AttackLabel(string code) => code switch
    {
        "mw" or "m" => "Melee Weapon Attack:",
        "rw" or "r" => "Ranged Weapon Attack:",
        "mw,rw" or "m,r" => "Melee or Ranged Weapon Attack:",
        "ms" => "Melee Spell Attack:",
        "rs" => "Ranged Spell Attack:",
        "ms,rs" => "Melee or Ranged Spell Attack:",
        _ => "Attack:"
    };

    [GeneratedRegex(@"\{@(\w+)\s?([^{}]*)\}")]
    private static partial Regex InlineTagRegex();
}

