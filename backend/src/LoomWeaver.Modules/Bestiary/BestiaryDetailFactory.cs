using System.Text.Json;
using LoomWeaver.Domain;

namespace LoomWeaver.Modules.Bestiary;

/// <summary>
/// Builds full <see cref="BestiaryMonsterDetailDto"/> statblocks from either 5etools raw JSON (official compendium)
/// or a stored <see cref="SaveCustomMonsterRequest"/> (user-created custom monsters).
/// </summary>
public static class BestiaryDetailFactory
{
    private static readonly IReadOnlyList<BestiaryFeatureDto> NoFeatures = Array.Empty<BestiaryFeatureDto>();

    public static string BuildShortDescription(string size, string type, string alignment, string? signatureA, string? signatureB)
    {
        var lead = $"{size} {type}, {alignment}.";
        var sig = new[] { signatureA, signatureB }
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => BestiaryStatblockMapper.StripTags(s!))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        return sig.Count > 0 ? $"{lead} Signature: {string.Join(", ", sig)}." : lead;
    }

    public static BestiaryMonsterDetailDto FromRawJson(BestiaryMonsterSummaryDto summary, string? rawJson)
    {
        if (string.IsNullOrWhiteSpace(rawJson)) return Minimal(summary);
        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            var root = doc.RootElement;
            JsonElement Get(string name) => root.TryGetProperty(name, out var v) ? v : default;
            int Score(string name) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : 10;

            var (acValue, acLabel) = BestiaryStatblockMapper.ArmorClassFromJson(Get("ac"));
            var (hpValue, hpLabel) = BestiaryStatblockMapper.HitPointsFromJson(Get("hp"));
            var cr = BestiaryStatblockMapper.ChallengeFromJson(Get("cr"));
            var senses = BestiaryStatblockMapper.StringListFromJson(Get("senses"));
            var passive = root.TryGetProperty("passive", out var p) && p.ValueKind == JsonValueKind.Number ? p.GetInt32() : 10;
            var sensesLabel = string.IsNullOrWhiteSpace(senses) ? $"passive Perception {passive}" : $"{senses}, passive Perception {passive}";

            var traits = BestiaryStatblockMapper.FeaturesFromJson(Get("trait"));
            traits.AddRange(BestiaryStatblockMapper.SpellcastingFromJson(Get("spellcasting")));

            var resolvedSummary = summary with
            {
                ArmorClass = summary.ArmorClass > 0 ? summary.ArmorClass : acValue,
                HitPoints = summary.HitPoints > 1 ? summary.HitPoints : hpValue,
                ChallengeRating = string.IsNullOrWhiteSpace(summary.ChallengeRating) ? cr : summary.ChallengeRating
            };

            var lore = root.TryGetProperty("fluff", out var fluff) && fluff.TryGetProperty("entries", out var entries)
                ? BestiaryStatblockMapper.FlattenEntries(entries)
                : root.TryGetProperty("legendaryHeader", out var lh) ? BestiaryStatblockMapper.FlattenEntries(lh) : "";

            return new BestiaryMonsterDetailDto(
                resolvedSummary,
                BestiaryStatblockMapper.AlignmentFromJson(Get("alignment")),
                acLabel,
                hpLabel,
                BestiaryStatblockMapper.SpeedFromJson(Get("speed")),
                Score("str"), Score("dex"), Score("con"), Score("int"), Score("wis"), Score("cha"),
                BestiaryStatblockMapper.BonusMapFromJson(Get("save")),
                BestiaryStatblockMapper.BonusMapFromJson(Get("skill")),
                BestiaryStatblockMapper.DamageListFromJson(Get("resist"), "resist"),
                BestiaryStatblockMapper.DamageListFromJson(Get("immune"), "immune"),
                BestiaryStatblockMapper.DamageListFromJson(Get("conditionImmune"), "conditionImmune"),
                sensesLabel,
                BestiaryStatblockMapper.StringListFromJson(Get("languages")) is { Length: > 0 } langs ? langs : "-",
                BestiaryStatblockMapper.ExperienceForCr(resolvedSummary.ChallengeRating),
                traits,
                BestiaryStatblockMapper.FeaturesFromJson(Get("action")),
                BestiaryStatblockMapper.FeaturesFromJson(Get("bonus")),
                BestiaryStatblockMapper.FeaturesFromJson(Get("reaction")),
                BestiaryStatblockMapper.FeaturesFromJson(Get("legendary")),
                lore,
                BestiaryStatblockMapper.StringListFromJson(Get("environment"))
                    .Split(", ", StringSplitOptions.RemoveEmptyEntries),
                null
            );
        }
        catch (JsonException)
        {
            return Minimal(summary);
        }
    }

    public static BestiaryMonsterDetailDto FromCustom(BestiaryMonsterSummaryDto summary, SaveCustomMonsterRequest m, DateTimeOffset createdAt)
    {
        var acLabel = string.IsNullOrWhiteSpace(m.ArmorClassNote) ? $"{m.ArmorClass}" : $"{m.ArmorClass} ({m.ArmorClassNote.Trim()})";
        var hpLabel = string.IsNullOrWhiteSpace(m.HitDice) ? $"{m.HitPoints}" : $"{m.HitPoints} ({m.HitDice.Trim()})";
        return new BestiaryMonsterDetailDto(
            summary,
            Clean(m.Alignment, "unaligned"),
            acLabel,
            hpLabel,
            Clean(m.Speed, "30 ft."),
            m.Str, m.Dex, m.Con, m.Int, m.Wis, m.Cha,
            Clean(m.SavingThrows, ""),
            Clean(m.Skills, ""),
            Clean(m.DamageResistances, ""),
            Clean(m.DamageImmunities, ""),
            Clean(m.ConditionImmunities, ""),
            Clean(m.Senses, "passive Perception 10"),
            Clean(m.Languages, "-"),
            BestiaryStatblockMapper.ExperienceForCr(summary.ChallengeRating),
            m.Traits ?? NoFeatures,
            m.Actions ?? NoFeatures,
            m.BonusActions ?? NoFeatures,
            m.Reactions ?? NoFeatures,
            m.LegendaryActions ?? NoFeatures,
            Clean(m.LoreText, ""),
            Array.Empty<string>(),
            createdAt
        );
    }

    public static BestiaryMonsterDetailDto Minimal(BestiaryMonsterSummaryDto summary) => new(
        summary, "unaligned", summary.ArmorClass.ToString(), summary.HitPoints.ToString(), "30 ft.",
        10, 10, 10, 10, 10, 10, "", "", "", "", "", "passive Perception 10", "-",
        BestiaryStatblockMapper.ExperienceForCr(summary.ChallengeRating),
        NoFeatures, NoFeatures, NoFeatures, NoFeatures, NoFeatures, "", Array.Empty<string>(), null);

    private static string Clean(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
}
