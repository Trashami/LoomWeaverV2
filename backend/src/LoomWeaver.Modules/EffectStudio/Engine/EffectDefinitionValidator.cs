using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace LoomWeaver.Modules.EffectStudio.Engine;

public static class EffectDefinitionValidator
{
    public static readonly Dictionary<string, string[]> Variants = CoreLayerSettingsValidator.Variants;

    private static readonly Dictionary<string, (double Min, double Max)> MotionBounds = new()
    {
        ["direction"] = (-180, 180), ["cone"] = (0, 360), ["speed"] = (0, 4), ["twirl"] = (-6, 6),
        ["turbulence"] = (0, 100), ["gravity"] = (-200, 200), ["drag"] = (0, 1), ["lifetime"] = (0.1, 1),
        ["trail"] = (0, 1), ["seed"] = (1, 9999)
    };

    private static readonly Dictionary<string, (double Min, double Max)> WhipBounds = new()
    {
        ["reach"] = (0.25, 1.5), ["backswing"] = (0, 2), ["height"] = (0.2, 2), ["curl"] = (0, 3),
        ["thorns"] = (0, 40), ["thornSize"] = (0, 20), ["windup"] = (5, 70), ["strike"] = (5, 70),
        ["hold"] = (0, 40), ["retract"] = (5, 70)
    };

    private static readonly string[] Easings = { "linear", "ease-in", "ease-out", "ease-in-out" };

    private static readonly Dictionary<string, (double Min, double Max)> MissileBounds = new()
    {
        ["rise"] = (10, 150), ["curve"] = (-160, 160), ["smokeLife"] = (100, 1500),
        ["smokeOpacity"] = (0, 1), ["smokeSpread"] = (1, 25), ["launchGap"] = (0, 300), ["impactSize"] = (3, 40)
    };

    private static readonly string[] AllowedRootProps =
    {
        "schemaVersion", "id", "name", "description", "spellName", "layers",
        "previewScene", "summon", "gameplay", "format", "exportedAt", "portable", "effect"
    };

    private static bool ScenePoint(JsonElement p) =>
        p.ValueKind == JsonValueKind.Object &&
        !p.EnumerateObject().Any(v => v.Name != "x" && v.Name != "y") &&
        Number(p, "x", 0.05, 0.95) && Number(p, "y", 0.12, 0.88);

    private static bool Text(JsonElement o, string key, int max, bool required = true) =>
        o.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String &&
        v.GetString()!.Length <= max && (!required || !string.IsNullOrWhiteSpace(v.GetString()));

    private static bool Number(JsonElement o, string key, double min, double max) =>
        o.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number &&
        v.TryGetDouble(out var n) && double.IsFinite(n) && n >= min && n <= max;

    public static JsonElement UnwrapStandaloneEnvelope(JsonElement e)
    {
        if (e.ValueKind == JsonValueKind.Object &&
            e.TryGetProperty("effect", out var inner) &&
            inner.ValueKind == JsonValueKind.Object)
        {
            return inner;
        }
        return e;
    }

    public static string NormalizeEffectJsonForCampaign(JsonElement rawElement, long? targetCampaignId, out string effectId, out string effectName)
    {
        var unwrapped = UnwrapStandaloneEnvelope(rawElement);
        var node = JsonNode.Parse(unwrapped.GetRawText()) as JsonObject
                   ?? throw new InvalidOperationException("Invalid effect JSON object.");

        node.Remove("format");
        node.Remove("exportedAt");
        node.Remove("portable");
        node.Remove("effect");

        effectId = node["id"]?.GetValue<string>()?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(effectId))
        {
            effectId = Guid.NewGuid().ToString();
            node["id"] = effectId;
        }

        effectName = node["name"]?.GetValue<string>()?.Trim() ?? "Imported Effect";
        node["name"] = effectName;

        if (node["summon"] is JsonObject summonObj)
        {
            if (targetCampaignId.HasValue && targetCampaignId.Value > 0)
            {
                summonObj["campaignId"] = targetCampaignId.Value;
            }
            else if (summonObj["campaignId"] is null)
            {
                summonObj["campaignId"] = 1;
            }
        }

        return node.ToJsonString();
    }

    public static bool Valid(JsonElement raw)
    {
        var e = UnwrapStandaloneEnvelope(raw);
        if (e.ValueKind != JsonValueKind.Object || e.GetRawText().Length > 64000 ||
            e.EnumerateObject().Any(p => !AllowedRootProps.Contains(p.Name))) return false;
        if (!Number(e, "schemaVersion", 1, 1) || !Text(e, "id", 80) || !Text(e, "name", 120) ||
            !Text(e, "spellName", 120, false) || !Text(e, "description", 2000, false) ||
            !e.TryGetProperty("layers", out var layers) || layers.ValueKind != JsonValueKind.Array ||
            layers.GetArrayLength() is < 1 or > 16) return false;

        if (e.TryGetProperty("previewScene", out var scene))
        {
            if (scene.ValueKind != JsonValueKind.Object ||
                scene.EnumerateObject().Any(p => p.Name is not ("caster" or "targets" or "targetMotion" or "walls" or "teleport")) ||
                !scene.TryGetProperty("caster", out var caster) || !ScenePoint(caster) ||
                !scene.TryGetProperty("targets", out var sceneTargets) || sceneTargets.ValueKind != JsonValueKind.Array ||
                sceneTargets.GetArrayLength() != 3 || sceneTargets.EnumerateArray().Any(p => !ScenePoint(p))) return false;
        }
        if (e.TryGetProperty("previewScene", out var teleportScene) && teleportScene.TryGetProperty("teleport", out var teleport))
        {
            if (teleport.ValueKind != JsonValueKind.Object ||
                teleport.EnumerateObject().Any(p => !new[] { "enabled", "vanishMs", "hiddenMs", "appearMs", "destination" }.Contains(p.Name)) ||
                !teleport.TryGetProperty("enabled", out var enabled) || enabled.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
                !Number(teleport, "vanishMs", 100, 2500) || !Number(teleport, "hiddenMs", 100, 5000) ||
                !Number(teleport, "appearMs", 100, 2500) || !teleport.TryGetProperty("destination", out var destination) ||
                !ScenePoint(destination)) return false;
        }
        if (e.TryGetProperty("summon", out var summon) && summon.ValueKind != JsonValueKind.Null)
        {
            if (summon.ValueKind != JsonValueKind.Object ||
                summon.EnumerateObject().Any(p => !new[] { "campaignId", "npcId", "name", "tokenUrl", "delay", "size" }.Contains(p.Name)) ||
                !Number(summon, "campaignId", 1, 9007199254740991) || !Number(summon, "npcId", 1, 9007199254740991) ||
                !Text(summon, "name", 120) || !Text(summon, "tokenUrl", 1000) ||
                !Regex.IsMatch(summon.GetProperty("tokenUrl").GetString()!, @"^/(uploads|assets|tokens|img|api/summon-assets)/[^?#\\]+$") ||
                summon.GetProperty("tokenUrl").GetString()!.Contains("..") ||
                !Number(summon, "delay", 0, 5000) || !Number(summon, "size", 0.25, 4)) return false;
        }
        if (e.TryGetProperty("gameplay", out var gameplay) && gameplay.ValueKind != JsonValueKind.Null)
        {
            if (gameplay.ValueKind != JsonValueKind.Object ||
                gameplay.EnumerateObject().Any(p => !new[] { "enabled", "move", "feet", "prone", "impactMs", "basis" }.Contains(p.Name)) ||
                !gameplay.TryGetProperty("enabled", out var ge) || ge.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
                !gameplay.TryGetProperty("prone", out var gp) || gp.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
                !Text(gameplay, "move", 10) || !new[] { "none", "push", "pull" }.Contains(gameplay.GetProperty("move").GetString()) ||
                !Number(gameplay, "feet", 5, 10) || !gameplay.GetProperty("feet").TryGetInt32(out var feet) || feet is not (5 or 10) ||
                !Number(gameplay, "impactMs", 0, 5000) || !Text(gameplay, "basis", 12) ||
                !new[] { "spell", "feature", "homebrew" }.Contains(gameplay.GetProperty("basis").GetString()) ||
                (gp.GetBoolean() && gameplay.GetProperty("basis").GetString() != "homebrew")) return false;
        }

        var ids = new HashSet<string>();
        foreach (var l in layers.EnumerateArray())
        {
            if (!ValidLayer(l, ids)) return false;
        }
        return true;
    }

    private static bool ValidLayer(JsonElement l, HashSet<string> ids)
    {
        var allowed = new[]
        {
            "id", "kind", "variant", "aura", "projectileCore", "skyProjectile", "skyBeam", "skyLightning", "particular", "lighting", "cinematic", "mageHand", "missile", "fireHit", "fireMaterial",
            "motion", "whip", "blendMode", "opacity", "easing", "opacityKeyframes", "offsetX", "offsetY",
            "color", "secondaryColor", "delay", "duration", "size", "intensity", "spread", "count", "enabled", "anchor"
        };
        if (l.ValueKind != JsonValueKind.Object || l.EnumerateObject().Any(p => !allowed.Contains(p.Name)) ||
            !Text(l, "id", 80) || !ids.Add(l.GetProperty("id").GetString()!) ||
            !Text(l, "kind", 20) || !Variants.TryGetValue(l.GetProperty("kind").GetString()!, out var variants)) return false;

        if (!CoreLayerSettingsValidator.Valid(l)) return false;
        foreach (var offset in new[] { "offsetX", "offsetY" })
            if (l.TryGetProperty(offset, out _) && !Number(l, offset, -200, 200)) return false;
        if (l.TryGetProperty("easing", out var easing) && (easing.ValueKind != JsonValueKind.String || !Easings.Contains(easing.GetString()))) return false;
        if (l.TryGetProperty("opacity", out _) && !Number(l, "opacity", 0, 1)) return false;
        if (l.TryGetProperty("blendMode", out var blend) && (blend.ValueKind != JsonValueKind.String ||
            !new[] { "normal", "add", "screen", "multiply", "overlay", "soft-light", "hard-light", "darken", "lighten", "difference" }.Contains(blend.GetString()))) return false;
        if (l.TryGetProperty("variant", out var variant) && (variant.ValueKind != JsonValueKind.String || !variants.Contains(variant.GetString()))) return false;
        if (l.TryGetProperty("motion", out var motion))
        {
            if (motion.ValueKind != JsonValueKind.Object || motion.EnumerateObject().Any(p => !MotionBounds.ContainsKey(p.Name))) return false;
            foreach (var (key, bounds) in MotionBounds) if (!Number(motion, key, bounds.Min, bounds.Max)) return false;
        }
        if (!Text(l, "anchor", 10) || !new[] { "caster", "target", "path" }.Contains(l.GetProperty("anchor").GetString())) return false;
        foreach (var color in new[] { "color", "secondaryColor" })
            if (!Text(l, color, 7) || !Regex.IsMatch(l.GetProperty(color).GetString()!, "^#[0-9a-fA-F]{6}$")) return false;
        if (!Number(l, "delay", 0, 5000) || !Number(l, "duration", 100, 5000) || !Number(l, "size", 1, 200) ||
            !Number(l, "intensity", 0, 1) || !Number(l, "spread", 0, 150) || !Number(l, "count", 1, 100) ||
            !l.TryGetProperty("enabled", out var en) || en.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
        return true;
    }
}
