#!/usr/bin/env python3
"""
Master 5eTools Database Synchronization, Image Linking, Foundry VTT Linking, and Spell Effect Attachment Script.
Runs directly on the production server against `jane_scrum` and `loomweaver`.
"""
import glob
import hashlib
import json
import os
import re
import shutil
import sys
import pymysql

MYSQL_HOST = "127.0.0.1"
MYSQL_USER = "loomweaver_app"
MYSQL_PASS = os.environ.get("LW_DB_PASSWORD") or sys.exit("LW_DB_PASSWORD must be set in the environment")

DATA_DIR_PRIMARY = "/var/www/jane-assets/5etools/data"
DATA_DIR_REPO = "/var/www/jane-assets/5etools-repo/data"
IMG_DIR = "/var/www/jane-assets/5etools/img"

SCHOOL_MAP = {
    "A": ("Abjuration", "abjuration", "Protective magical wards, barriers, banishment, and counter-magic."),
    "C": ("Conjuration", "conjuration", "Summoning creatures, creating matter, and teleportation across space."),
    "D": ("Divination", "divination", "Revealing truth, foresight, scrying, and reading hidden patterns."),
    "E": ("Enchantment", "enchantment", "Influencing minds, charming, commanding, or bolstering resolve."),
    "V": ("Evocation", "evocation", "Channeling raw elemental and radiant energy into blasts, walls, or healing."),
    "I": ("Illusion", "illusion", "Deceiving senses with phantasms, invisibility, and shadow weaves."),
    "N": ("Necromancy", "necromancy", "Manipulating life force, death, vitality, and undeath."),
    "T": ("Transmutation", "transmutation", "Altering physical form, time, speed, and material properties."),
}

HANDCRAFTED_SPELL_SLUGS = {
    "fireball", "burning-hands", "cone-of-cold", "lightning-bolt", "eldritch-blast",
    "magic-missile", "scorching-ray", "guiding-bolt", "sacred-flame", "thunderwave",
    "cure-wounds", "daylight", "toll-the-dead", "blight", "acid-splash", "shield",
    "misty-step", "blade-ward", "chill-touch", "dancing-lights", "fire-bolt",
    "guidance", "light", "mage-hand", "mending", "message", "minor-illusion",
    "poison-spray", "prestidigitation", "ray-of-frost", "resistance", "shocking-grasp",
    "spare-the-dying", "thaumaturgy", "true-strike", "vicious-mockery", "alarm",
    "animal-friendship", "bane", "bless", "charm-person", "color-spray", "command",
    "compelled-duel", "detect-magic", "disguise-self", "divine-favor", "entangle",
    "expeditious-retreat", "faerie-fire", "false-life", "feather-fall", "fog-cloud",
    "healing-word", "hellish-rebuke", "heroism", "hunters-mark", "hunter-s-mark",
    "inflict-wounds", "mage-armor", "ray-of-sickness", "sanctuary", "shield-of-faith",
    "sleep", "witch-bolt", "acid-arrow", "melfs-acid-arrow", "aid", "barkskin",
    "blindness-deafness", "blur", "cloud-of-daggers", "darkness", "darkvision",
    "enhance-ability", "flaming-sphere", "hold-person", "invisibility",
    "lesser-restoration", "levitate", "mirror-image", "moonbeam", "pass-without-trace",
    "prayer-of-healing", "shatter", "silence", "spiritual-weapon", "web", "blink",
    "call-lightning", "counterspell", "dispel-magic", "fear", "fly", "gaseous-form",
    "haste", "hypnotic-pattern", "major-image", "mass-healing-word", "revivify",
    "sleet-storm", "slow", "spirit-guardians", "stinking-cloud", "vampiric-touch",
    "wind-wall", "banishment", "dimension-door", "greater-invisibility", "ice-storm",
    "wall-of-fire", "cloudkill", "flame-strike", "hold-monster", "mass-cure-wounds",
    "telekinesis", "wall-of-force", "chain-lightning", "disintegrate", "sunbeam",
    "finger-of-death", "fire-storm", "plane-shift", "prismatic-spray", "sunburst",
    "meteor-swarm", "power-word-kill", "time-stop", "wish"
}

THEME_PALETTES = {
    "fire": {
        "primary": "#f97316", "secondary": "#fde047", "accent": "#ef4444",
        "appearance": "Flame", "material": "Ember Core",
        "sound": "sfx-fireball-whoosh-impact", "icon": "/5etools/spell-art/fire-bolt.webp"
    },
    "cold": {
        "primary": "#38bdf8", "secondary": "#e0f2fe", "accent": "#0284c7",
        "appearance": "Frost", "material": "Glacial Shard",
        "sound": "sfx-ice-crystallize-shatter", "icon": "/5etools/spell-art/frost-nova.webp"
    },
    "lightning": {
        "primary": "#60a5fa", "secondary": "#f8fafc", "accent": "#3b82f6",
        "appearance": "Lightning", "material": "Voltaic Arc",
        "sound": "sfx-lightning-crack-discharge", "icon": "/5etools/spell-art/lightning-arc.webp"
    },
    "thunder": {
        "primary": "#94a3b8", "secondary": "#e2e8f0", "accent": "#64748b",
        "appearance": "Sonic", "material": "Shockwave Ring",
        "sound": "sfx-thunder-concussive-boom", "icon": "/5etools/spell-art/thunder-burst.webp"
    },
    "acid": {
        "primary": "#84cc16", "secondary": "#d9f99d", "accent": "#4d7c0f",
        "appearance": "Acid", "material": "Caustic Globule",
        "sound": "sfx-acid-hiss-splash", "icon": "/5etools/spell-art/acid-splash.webp"
    },
    "poison": {
        "primary": "#22c55e", "secondary": "#bbf7d0", "accent": "#15803d",
        "appearance": "Poison", "material": "Venom Miasma",
        "sound": "sfx-poison-vapor-exhale", "icon": "/5etools/spell-art/poison-cloud.webp"
    },
    "radiant": {
        "primary": "#facc15", "secondary": "#fef9c3", "accent": "#eab308",
        "appearance": "Radiant", "material": "Golden Light",
        "sound": "sfx-celestial-choir-swell", "icon": "/5etools/spell-art/holy-light.webp"
    },
    "necrotic": {
        "primary": "#7e22ce", "secondary": "#d8b4fe", "accent": "#3b0764",
        "appearance": "Shadow", "material": "Void Wisp",
        "sound": "sfx-necrotic-wither-toll", "icon": "/5etools/spell-art/shadow-swirl.webp"
    },
    "force": {
        "primary": "#10b981", "secondary": "#a7f3d0", "accent": "#047857",
        "appearance": "Eldritch", "material": "Arcane Force",
        "sound": "sfx-eldritch-beam-hum", "icon": "/5etools/spell-art/eldritch-blast.webp"
    },
    "psychic": {
        "primary": "#ec4899", "secondary": "#fbcfe8", "accent": "#be185d",
        "appearance": "Psychic", "material": "Mind Ripple",
        "sound": "sfx-psychic-resonance-chime", "icon": "/5etools/spell-art/arcane-sigil.webp"
    },
    "healing": {
        "primary": "#34d399", "secondary": "#fef08a", "accent": "#059669",
        "appearance": "Radiant", "material": "Vitality Bloom",
        "sound": "sfx-healing-harmonic-pulse", "icon": "/5etools/spell-art/healing-aura.webp"
    },
    "teleportation": {
        "primary": "#818cf8", "secondary": "#e0e7ff", "accent": "#4338ca",
        "appearance": "Spectral", "material": "Aether Step",
        "sound": "sfx-planar-rift-blink", "icon": "/5etools/spell-art/portal.webp"
    },
    "abjuration": {
        "primary": "#38bdf8", "secondary": "#bae6fd", "accent": "#0369a1",
        "appearance": "Runic", "material": "Ward Barrier",
        "sound": "sfx-abjuration-ward-ring", "icon": "/5etools/spell-art/rune-circle.webp"
    },
    "nature": {
        "primary": "#4ade80", "secondary": "#dcfce7", "accent": "#166534",
        "appearance": "Nature", "material": "Briar & Leaf",
        "sound": "sfx-nature-thorn-surge", "icon": "/5etools/spell-art/leaf-swirl.webp"
    },
    "water": {
        "primary": "#0ea5e9", "secondary": "#bae6fd", "accent": "#0369a1",
        "appearance": "Water", "material": "Tidal Crest",
        "sound": "sfx-water-torrent-crest", "icon": "/5etools/spell-art/water-splash.webp"
    },
    "wind": {
        "primary": "#cbd5e1", "secondary": "#f8fafc", "accent": "#64748b",
        "appearance": "Wind", "material": "Gale Vortex",
        "sound": "sfx-wind-cyclone-rush", "icon": "/5etools/spell-art/wind-gust.webp"
    },
    "arcane": {
        "primary": "#a855f7", "secondary": "#f3e8ff", "accent": "#6b21a8",
        "appearance": "Arcane", "material": "Weave Sigil",
        "sound": "sfx-arcane-weave-cast", "icon": "/5etools/spell-art/magic-missile.webp"
    },
}


def norm_slug(text: str) -> str:
    s = (text or "").lower().replace("’", "").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def norm_img_path(raw_path: str | None) -> str | None:
    if not raw_path:
        return None
    p = str(raw_path).strip().replace("\\", "/")
    if not p:
        return None
    if p.startswith("http://") or p.startswith("https://"):
        return p
    if p.startswith("/5etools/img/"):
        p = "/5etools/" + p[len("/5etools/img/"):]
    elif p.startswith("5etools/img/"):
        p = "/5etools/" + p[len("5etools/img/"):]
    elif p.startswith("/img/"):
        p = "/5etools/" + p[len("/img/"):]
    elif p.startswith("img/"):
        p = "/5etools/" + p[len("img/"):]
    elif not p.startswith("/5etools/") and not p.startswith("/"):
        p = "/5etools/" + p
    return p


def extract_first_image_from_fluff(fluff_obj: dict | str | None) -> str | None:
    if not fluff_obj:
        return None
    if isinstance(fluff_obj, str):
        try:
            fluff_obj = json.loads(fluff_obj)
        except Exception:
            return None
    if not isinstance(fluff_obj, dict):
        return None
    images = fluff_obj.get("images")
    if isinstance(images, list):
        for img in images:
            if isinstance(img, dict):
                href = img.get("href")
                if isinstance(href, dict) and href.get("path"):
                    return norm_img_path(href["path"])
                if isinstance(href, str):
                    return norm_img_path(href)
    return None


def scan_img_folder_index(subdir: str) -> tuple[dict, list[str]]:
    """Returns (lookup_by_norm_stem, list_of_all_relative_paths) under /var/www/jane-assets/5etools/img/<subdir>."""
    folder = os.path.join(IMG_DIR, subdir)
    by_stem = {}
    all_paths = []
    if not os.path.isdir(folder):
        return by_stem, all_paths
    for root, _, files in os.walk(folder):
        for fn in sorted(files):
            if not fn.lower().endswith((".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg")):
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, IMG_DIR).replace("\\", "/")
            url_path = f"/5etools/{rel}"
            all_paths.append(url_path)
            stem = os.path.splitext(fn)[0]
            rel_dir = os.path.relpath(root, folder).replace("\\", "/")
            ns = norm_slug(stem)
            if rel_dir and rel_dir != ".":
                by_stem[(ns, rel_dir.upper())] = url_path
            if (ns, "*") not in by_stem or url_path.endswith(".webp"):
                by_stem[(ns, "*")] = url_path
    return by_stem, all_paths


def build_spell_effect_bundle(spell_row: dict, spell_imgs_by_stem: dict) -> tuple[str, str, dict, dict]:
    """
    Returns (default_effect_id, resolved_image_path, effect_studio_doc_dict, vtt_definition_dict)
    for a spell row in `dnd_spells`.
    """
    sp_id = spell_row["id"]
    name = spell_row["name"] or "Spell"
    source_book = (spell_row["source_book"] or "PHB").strip()
    level = int(spell_row["level"] or 0)
    school = (spell_row["school"] or "Evocation").strip()
    range_text = (spell_row["range_text"] or "60 feet").strip()
    duration_text = (spell_row["duration_text"] or "Instantaneous").strip()
    casting_time = (spell_row["casting_time"] or "1 Action").strip()
    conc = bool(spell_row["concentration"])

    slug = norm_slug(name)
    src_slug = norm_slug(source_book)
    effect_id = f"fx-spell-{slug}" if source_book.upper() == "PHB" else f"fx-spell-{slug}-{src_slug}"
    effect_id = effect_id[:76]

    # Parse damage_inflict_json, area_tags_json, misc_tags_json, foundry_json
    dmg_list = []
    try:
        if spell_row.get("damage_inflict_json"):
            dmg_list = json.loads(spell_row["damage_inflict_json"]) or []
    except Exception:
        dmg_list = []

    area_tags = []
    try:
        if spell_row.get("area_tags_json"):
            area_tags = json.loads(spell_row["area_tags_json"]) or []
    except Exception:
        area_tags = []

    foundry_obj = None
    try:
        if spell_row.get("foundry_json"):
            foundry_obj = json.loads(spell_row["foundry_json"])
    except Exception:
        foundry_obj = None

    # Determine energy theme
    nl = name.lower()
    desc_lower = (spell_row.get("description") or "").lower()
    primary_dmg = (dmg_list[0].lower() if dmg_list else "")

    if primary_dmg in THEME_PALETTES:
        theme_key = primary_dmg
    elif any(w in nl for w in ("heal", "cure", "restoration", "revivify", "aid", "goodberry", "regenerate", "prayer")):
        theme_key = "healing"
    elif any(w in nl for w in ("fire", "flame", "scorch", "burn", "heat", "immolat", "hellish", "meteor", "pyro", "ashardalon", "aganazzar")):
        theme_key = "fire"
    elif any(w in nl for w in ("cold", "frost", "ice", "chill", "snow", "sleet", "snilloc", "cone of cold", "rime", "freezing")):
        theme_key = "cold"
    elif any(w in nl for w in ("lightning", "shock", "witch bolt", "storm", "voltaic")):
        theme_key = "lightning"
    elif any(w in nl for w in ("thunder", "shatter", "booming", "sonic", "deafen")):
        theme_key = "thunder"
    elif any(w in nl for w in ("acid", "vitriolic", "caustic", "melf")):
        theme_key = "acid"
    elif any(w in nl for w in ("poison", "toxic", "stinking", "cloudkill", "ray of sickness", "venom")):
        theme_key = "poison"
    elif any(w in nl for w in ("radiant", "holy", "sacred", "guiding", "sun", "moon", "dawn", "daylight", "smite", "divine", "bless", "sanctuary", "spirit guardians", "aura of")):
        theme_key = "radiant"
    elif any(w in nl for w in ("necrotic", "blight", "toll", "death", "dead", "wither", "vampiric", "hex", "bane", "bestow curse", "shadow", "darkness", "inflict", "harm")):
        theme_key = "necrotic"
    elif any(w in nl for w in ("eldritch", "force", "magic missile", "spiritual weapon", "bigby", "mordenkainen", "wall of force", "disintegrate", "blade", "sword")):
        theme_key = "force"
    elif any(w in nl for w in ("mind", "psychic", "vicious", "dissonant", "synaptic", "phantasmal", "charm", "hold", "sleep", "command", "dominate", "hypnotic", "fear", "confusion", "tasha", "calm", "enthrall", "suggestion")):
        theme_key = "psychic"
    elif any(w in nl for w in ("misty step", "dimension door", "teleport", "plane shift", "blink", "gate", "vortex warp", "thunder step", "far step", "banishment", "rope trick", "maze")):
        theme_key = "teleportation"
    elif any(w in nl for w in ("shield", "ward", "armor", "counterspell", "dispel", "globe of invulnerability", "magic circle", "alarm", "sanctum", "protection")):
        theme_key = "abjuration"
    elif any(w in nl for w in ("entangle", "thorn", "barkskin", "spike growth", "plant", "tree", "beast", "animal", "ensnaring", "hail of thorns", "grasping vine", "wrath of nature", "druidcraft")):
        theme_key = "nature"
    elif any(w in nl for w in ("water", "tidal", "tsunami", "maelstrom", "fog", "mist")):
        theme_key = "water"
    elif any(w in nl for w in ("wind", "gust", "fly", "feather fall", "levitate", "whirlwind", "zephyr", "skywrite")):
        theme_key = "wind"
    elif school.lower() == "abjuration":
        theme_key = "abjuration"
    elif school.lower() == "necromancy":
        theme_key = "necrotic"
    elif school.lower() in ("enchantment", "illusion", "divination"):
        theme_key = "psychic"
    elif school.lower() == "conjuration":
        theme_key = "teleportation"
    else:
        theme_key = "arcane"

    pal = THEME_PALETTES[theme_key]

    # Determine delivery / geometry shape
    rl = range_text.lower()
    if "cone" in rl or "C" in area_tags or "cone" in nl:
        delivery = "cone"
        emitter_id = "fx-cone-spray"
        emitter_type = "Cone Spray"
        shape_label = "Cone Sector"
        anchor = "caster-to-target"
    elif "line" in rl or "L" in area_tags or any(w in nl for w in ("lightning bolt", "beam", "sunbeam", "aganazzar", "wall of")):
        delivery = "line-beam"
        emitter_id = "fx-energy-beam"
        emitter_type = "Energy Beam"
        shape_label = "Line Beam"
        anchor = "caster-to-target"
    elif any(t in area_tags for t in ("S", "R", "Q", "Y", "H")) or any(w in nl for w in ("fireball", "sphere", "storm", "cloud", "burst", "shatter", "meteor", "circle", "nova", "wave", "maelstrom", "darkness", "silence", "web", "entangle", "hypnotic pattern", "faerie fire", "sleep")):
        delivery = "aoe-burst"
        emitter_id = "fx-energy-column"
        emitter_type = "Energy Column"
        shape_label = "Sphere / Cylinder (Area)"
        anchor = "target"
    elif rl.startswith("self") or rl == "touch" or any(w in nl for w in ("shield", "armor", "aura", "bless", "heroism", "haste", "cure", "healing", "sanctuary", "spirit guardians", "blur", "mirror image", "invisibility", "misty step", "disguise")):
        delivery = "aura-ward"
        emitter_id = "fx-magic-circle"
        emitter_type = "Magic Circle"
        shape_label = "Circle (Aura)"
        anchor = "caster" if rl.startswith("self") else "target"
    else:
        delivery = "projectile-ray"
        emitter_id = "fx-arcane-projectile"
        emitter_type = "Arcane Projectile"
        shape_label = "Directed Bolt"
        anchor = "caster-to-target"

    # Resolve best valid image_path on disk
    fluff_img = extract_first_image_from_fluff(spell_row.get("fluff_json"))
    disk_img = spell_imgs_by_stem.get((slug, source_book.upper())) or spell_imgs_by_stem.get((slug, "*"))
    icon_candidate = f"/5etools/spell-art/{slug}.webp"
    has_direct_icon = os.path.isfile(os.path.join(IMG_DIR, "spell-art", f"{slug}.webp"))

    if fluff_img:
        resolved_img = fluff_img
    elif disk_img:
        resolved_img = disk_img
    elif has_direct_icon:
        resolved_img = icon_candidate
    else:
        resolved_img = pal["icon"]

    # Also create a symlink for legacy `/spell-art/{slug}-v1.png` -> the resolved file in spell-art so any cached client URL works!
    legacy_v1_file = os.path.join(IMG_DIR, "spell-art", f"{slug}-v1.png")
    target_icon_abs = os.path.join(IMG_DIR, resolved_img.replace("/5etools/", "").lstrip("/"))
    if not os.path.exists(legacy_v1_file) and os.path.isfile(target_icon_abs):
        try:
            shutil.copyfile(target_icon_abs, legacy_v1_file)
        except Exception:
            pass

    # Extract radius / range number
    radius_ft = 20 if delivery == "aoe-burst" else (15 if delivery == "cone" else 5)
    m_ft = re.search(r"(\d+)\s*-?\s*foot", rl)
    if m_ft:
        radius_ft = max(5, min(120, int(m_ft.group(1))))
    elif foundry_obj and isinstance(foundry_obj.get("system"), dict):
        tval = foundry_obj["system"].get("target.value")
        if isinstance(tval, (int, float)) and tval > 0:
            radius_ft = int(tval)

    is_handcrafted = slug in HANDCRAFTED_SPELL_SLUGS
    total_dur = 2.8 if not conc else 4.2
    scale_val = round(1.0 + (level * 0.08), 2)

    tracks = [
        {
            "id": f"trk-{slug}-core",
            "label": f"{name} Core ({emitter_type})",
            "trackType": emitter_type,
            "visible": True,
            "expanded": False,
            "startTimeSeconds": 0.0,
            "endTimeSeconds": round(total_dur * 0.85, 2),
            "colorHex": pal["primary"],
            "accentHex": pal["secondary"],
            "emitterId": emitter_id,
            "anchor": anchor,
            "appearanceId": pal["appearance"],
            "scale": scale_val,
            "count": max(1, 3 if "missile" in nl or "scorching" in nl else 1),
            "opacityPercent": 95,
            "animationModifier": "Fade / Pulse",
        },
        {
            "id": f"trk-{slug}-sigil",
            "label": f"{school} Cast Sigil",
            "trackType": "Magic Circle",
            "visible": True,
            "expanded": False,
            "startTimeSeconds": 0.0,
            "endTimeSeconds": round(total_dur * 0.65, 2),
            "colorHex": pal["accent"],
            "accentHex": pal["primary"],
            "emitterId": "fx-magic-circle",
            "anchor": "caster",
            "appearanceId": pal["appearance"],
            "scale": 1.0,
            "count": 1,
            "opacityPercent": 88,
            "animationModifier": "Rotate / Orbit",
        },
        {
            "id": f"trk-{slug}-particles",
            "label": f"{pal['appearance']} Sparks & Motes",
            "trackType": "Sparks / Embers",
            "visible": True,
            "expanded": False,
            "startTimeSeconds": 0.15,
            "endTimeSeconds": total_dur,
            "colorHex": pal["primary"],
            "accentHex": pal["secondary"],
            "emitterId": "fx-sparks-embers",
            "anchor": "target",
            "appearanceId": pal["appearance"],
            "scale": scale_val,
            "count": 28 + (level * 6),
            "opacityPercent": 90,
            "animationModifier": "Grow / Shrink",
        },
        {
            "id": f"trk-{slug}-sound",
            "label": f"{name} Audio Cue",
            "trackType": "Sound",
            "visible": True,
            "expanded": False,
            "startTimeSeconds": 0.0,
            "endTimeSeconds": total_dur,
            "colorHex": pal["accent"],
            "accentHex": pal["secondary"],
            "emitterId": "fx-sound",
            "anchor": "target",
            "appearanceId": pal["appearance"],
            "scale": 1.0,
            "count": 1,
            "opacityPercent": 100,
            "animationModifier": "Fade / Pulse",
        },
    ]

    effect_studio_doc = {
        "id": effect_id,
        "campaignId": 1,
        "name": f"{name} ({source_book})" if source_book.upper() != "PHB" else name,
        "subtitle": f"{'Level ' + str(level) if level > 0 else 'Cantrip'} {school} · {delivery.replace('-', ' ').title()}",
        "statusLabel": "Canonical Spell Effect",
        "activeCameraPreset": "Isometric",
        "totalDurationSeconds": total_dur,
        "activeEmitterId": emitter_id,
        "spellId": sp_id,
        "spellName": name,
        "sourceBook": source_book,
        "school": school,
        "level": level,
        "energyTheme": theme_key,
        "deliveryMode": delivery,
        "isHandcrafted": is_handcrafted,
        "iconUrl": resolved_img,
        "activeProperties": {
            "id": emitter_id,
            "name": emitter_type,
            "category": school,
            "emitterType": emitter_type,
            "shape": shape_label,
            "radius": round(radius_ft / 5.0, 2),
            "height": round(max(2.0, radius_ft / 4.0), 2),
            "emissionRate": 90 + (level * 15),
            "lifetimeSeconds": round(total_dur * 0.75, 2),
            "speed": 2.4 if delivery in ("projectile-ray", "line-beam") else 1.2,
            "spreadDegrees": 55 if delivery == "cone" else 30,
            "materialName": pal["material"],
            "colorPrimaryHex": pal["primary"],
            "colorSecondaryHex": pal["secondary"],
            "sizeMin": 0.2,
            "sizeMax": round(1.1 + (level * 0.1), 2),
            "opacityPercent": 90,
            "blendMode": "Additive",
            "castLight": True,
            "lightIntensity": round(1.2 + (level * 0.12), 2),
            "receiveShadows": False,
            "previewAccentHex": pal["accent"],
            "appearanceId": pal["appearance"],
            "count": max(1, 3 if "missile" in nl or "scorching" in nl else 1),
            "scale": scale_val,
            "burstVariant": delivery,
            "sigilPattern": school,
        },
        "motionAndForces": {
            "gravityY": 0.4,
            "vortexStrength": 2.2 if delivery == "aoe-burst" else 1.0,
            "spiralFrequency": 1.8,
            "dragCoefficient": 0.15,
            "enableCollision": True,
            "bounceRestitution": 0.25,
            "attachedModelKey": "mdl-arcane-staff-orb",
            "soundCueId": pal["sound"],
            "soundVolumePercent": 85,
        },
        "tracks": tracks,
        "canonStatus": "approved",
        "updatedAt": "2026-10-27T20:00:00Z",
    }

    vtt_definition = {
        "schemaVersion": 1,
        "id": effect_id,
        "name": name,
        "description": f"{school} visual spell effect for {name} ({source_book}).",
        "spellId": sp_id,
        "spellName": name,
        "sourceBook": source_book,
        "school": school,
        "level": level,
        "theme": theme_key,
        "delivery": delivery,
        "aoeFeet": radius_ft,
        "castingTime": casting_time,
        "rangeText": range_text,
        "durationText": duration_text,
        "iconUrl": resolved_img,
        "isHandcraftedRegistryEffect": is_handcrafted,
        "registrySpellKey": slug,
        "layers": [
            {
                "id": f"{effect_id}-layer-1",
                "kind": delivery,
                "variant": theme_key,
                "primaryColor": pal["primary"],
                "secondaryColor": pal["secondary"],
                "accentColor": pal["accent"],
                "durationMs": int(total_dur * 1000),
                "radiusFeet": radius_ft,
                "castLight": True,
                "soundCue": pal["sound"],
            }
        ],
    }

    return effect_id, resolved_img, effect_studio_doc, vtt_definition


def ensure_column(cur, db_name: str, table_name: str, col_name: str, col_def: str):
    cur.execute(
        """
        SELECT COUNT(*) AS cnt
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s AND column_name = %s
        """,
        (db_name, table_name, col_name),
    )
    row = cur.fetchone()
    cnt = row["cnt"] if isinstance(row, dict) else row[0]
    if cnt == 0:
        cur.execute(f"ALTER TABLE `{db_name}`.`{table_name}` ADD COLUMN `{col_name}` {col_def};")


def load_json_file(rel_path: str) -> dict:
    for base in (DATA_DIR_PRIMARY, DATA_DIR_REPO):
        full = os.path.join(base, rel_path)
        if os.path.isfile(full):
            with open(full, "r", encoding="utf-8") as fp:
                return json.load(fp)
    return {}


def main():
    print("Connecting to MySQL on 127.0.0.1...")
    conn = pymysql.connect(
        host=MYSQL_HOST,
        user=MYSQL_USER,
        password=MYSQL_PASS,
        database="jane_scrum",
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )
    cur = conn.cursor()

    # 1. Scan all on-disk image folders under /var/www/jane-assets/5etools/img/
    print("Scanning /var/www/jane-assets/5etools/img/ directories...")
    covers_by_stem, covers_all = scan_img_folder_index("covers")
    items_by_stem, items_all = scan_img_folder_index("items")
    spells_by_stem, spells_all = scan_img_folder_index("spells")
    classes_by_stem, classes_all = scan_img_folder_index("classes")
    races_by_stem, races_all = scan_img_folder_index("races")
    backgrounds_by_stem, backgrounds_all = scan_img_folder_index("backgrounds")
    feats_by_stem, feats_all = scan_img_folder_index("feats")
    cond_by_stem, cond_all = scan_img_folder_index("conditionsdiseases")
    decks_by_stem, decks_all = scan_img_folder_index("decks")
    deities_by_stem, deities_all = scan_img_folder_index("deities")
    bastions_by_stem, bastions_all = scan_img_folder_index("bastions")
    charopt_by_stem, charopt_all = scan_img_folder_index("charcreationoptions")
    optfeat_by_stem, optfeat_all = scan_img_folder_index("optionalfeatures")
    objects_by_stem, objects_all = scan_img_folder_index("objects")
    recipes_by_stem, recipes_all = scan_img_folder_index("recipes")
    traps_by_stem, traps_all = scan_img_folder_index("traps")
    hazards_by_stem, hazards_all = scan_img_folder_index("hazards")
    varrules_by_stem, varrules_all = scan_img_folder_index("variantrules")
    vehicles_by_stem, vehicles_all = scan_img_folder_index("vehicles")
    rules_by_stem, rules_all = scan_img_folder_index("rules")
    languages_by_stem, languages_all = scan_img_folder_index("languages")
    bestiary_by_stem, bestiary_all = scan_img_folder_index("bestiary")
    tokens_by_stem, tokens_all = scan_img_folder_index("bestiary/tokens")

    print(
        f"Indexed images: covers={len(covers_all)}, items={len(items_all)}, spells={len(spells_all)}, "
        f"classes={len(classes_all)}, races={len(races_all)}, backgrounds={len(backgrounds_all)}, "
        f"decks={len(decks_all)}, deities={len(deities_all)}, bestiary={len(bestiary_all)}, tokens={len(tokens_all)}"
    )

    # 2. Ensure schema columns exist in `jane_scrum`
    print("Ensuring image_path, cover_path, foundry_json, and spell effect columns in jane_scrum...")
    ensure_column(cur, "jane_scrum", "dnd_sources", "cover_url", "VARCHAR(500) DEFAULT NULL")
    ensure_column(cur, "jane_scrum", "dnd_adventures_books", "cover_path", "VARCHAR(500) DEFAULT NULL")
    ensure_column(cur, "jane_scrum", "dnd_adventures_books", "image_path", "VARCHAR(500) DEFAULT NULL")

    tables_needing_image_and_foundry = [
        "dnd_items",
        "dnd_item_metadata",
        "dnd_magic_variants",
        "dnd_custom_classes",
        "dnd_subclasses",
        "dnd_class_features",
        "dnd_custom_species",
        "dnd_subraces",
        "dnd_custom_backgrounds",
        "dnd_custom_feats",
        "dnd_actions",
        "dnd_char_creation_options",
        "dnd_optional_features",
        "dnd_conditions_diseases",
        "dnd_cults_boons",
        "dnd_bastions",
        "dnd_decks",
        "dnd_deck_cards",
        "dnd_deities",
        "dnd_languages",
        "dnd_objects",
        "dnd_psionics",
        "dnd_recipes",
        "dnd_rewards",
        "dnd_senses",
        "dnd_skills",
        "dnd_abilities",
        "dnd_tables",
        "dnd_life_tables",
        "dnd_loot_tables",
        "dnd_traps_hazards",
        "dnd_variant_rules",
        "dnd_vehicles",
        "dnd_monster_library",
        "dnd_monster_features",
        "dnd_monster_templates",
        "dnd_monster_legendary_groups",
    ]
    for tbl in tables_needing_image_and_foundry:
        ensure_column(cur, "jane_scrum", tbl, "image_path", "VARCHAR(500) DEFAULT NULL")
        ensure_column(cur, "jane_scrum", tbl, "foundry_json", "LONGTEXT DEFAULT NULL")

    ensure_column(cur, "jane_scrum", "dnd_monster_library", "token_url", "VARCHAR(500) DEFAULT NULL")
    ensure_column(cur, "jane_scrum", "dnd_deck_cards", "set_name", "VARCHAR(120) DEFAULT NULL")
    ensure_column(cur, "jane_scrum", "dnd_deck_cards", "face_image_url", "VARCHAR(500) DEFAULT NULL")
    ensure_column(cur, "jane_scrum", "dnd_deck_cards", "back_image_url", "VARCHAR(500) DEFAULT NULL")

    # Spell effect columns on `dnd_spells` + compatibility columns for `/api/spells`
    ensure_column(cur, "jane_scrum", "dnd_spells", "default_effect_id", "VARCHAR(100) DEFAULT NULL")
    ensure_column(cur, "jane_scrum", "dnd_spells", "effect_json", "LONGTEXT DEFAULT NULL")
    ensure_column(cur, "jane_scrum", "dnd_spells", "spell_range", "VARCHAR(255) DEFAULT NULL")
    ensure_column(cur, "jane_scrum", "dnd_spells", "duration", "VARCHAR(255) DEFAULT NULL")

    # Create `dnd_spell_effects` table in `jane_scrum`
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS `jane_scrum`.`dnd_spell_effects` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `effect_id` VARCHAR(100) NOT NULL,
            `spell_id` BIGINT UNSIGNED NOT NULL,
            `spell_name` VARCHAR(255) NOT NULL,
            `source_book` VARCHAR(32) NOT NULL DEFAULT 'PHB',
            `school` VARCHAR(64) NOT NULL DEFAULT 'Evocation',
            `level` TINYINT NOT NULL DEFAULT 0,
            `energy_theme` VARCHAR(64) NOT NULL DEFAULT 'arcane',
            `delivery_mode` VARCHAR(64) NOT NULL DEFAULT 'projectile-ray',
            `is_handcrafted` TINYINT(1) NOT NULL DEFAULT 0,
            `icon_url` VARCHAR(500) DEFAULT NULL,
            `studio_document_json` LONGTEXT NOT NULL,
            `vtt_definition_json` LONGTEXT NOT NULL,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_dnd_spell_effects_spell_id` (`spell_id`),
            KEY `idx_dnd_spell_effects_effect_id` (`effect_id`),
            KEY `idx_dnd_spell_effects_spell_name` (`spell_name`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """
    )
    conn.commit()

    # 3. Link Book & Adventure Covers (`dnd_sources` and `dnd_adventures_books`)
    print("Linking book & adventure covers in dnd_sources and dnd_adventures_books...")
    books_data = load_json_file("books.json").get("book", [])
    adv_data = load_json_file("adventures.json").get("adventure", [])
    book_cover_map = {}
    for entry in books_data + adv_data:
        code = str(entry.get("id") or entry.get("source") or "").strip()
        cov = (entry.get("cover") or {}).get("path")
        if code and cov:
            book_cover_map[code.upper()] = norm_img_path(cov)
            book_cover_map[norm_slug(code)] = norm_img_path(cov)

    cur.execute("SELECT id, name, cover_path FROM `jane_scrum`.`dnd_sources`")
    for srow in cur.fetchall():
        sid = srow["id"]
        sname = srow["name"] or sid
        cpath = srow["cover_path"]
        resolved = None
        if cpath:
            resolved = norm_img_path(cpath)
        if not resolved:
            resolved = (
                book_cover_map.get(sid.upper())
                or book_cover_map.get(norm_slug(sid))
                or covers_by_stem.get((norm_slug(sid), "*"))
                or covers_by_stem.get((norm_slug(sname), "*"))
            )
        if not resolved or not os.path.isfile(os.path.join(IMG_DIR, resolved.replace("/5etools/", "").lstrip("/"))):
            resolved = "/5etools/covers/PHB.webp"
        cur.execute(
            "UPDATE `jane_scrum`.`dnd_sources` SET `cover_path` = %s, `cover_url` = %s WHERE `id` = %s",
            (resolved, resolved, sid),
        )

    cur.execute("SELECT id, code, name, source_book FROM `jane_scrum`.`dnd_adventures_books`")
    for ab in cur.fetchall():
        ab_id = ab["id"]
        code = (ab["code"] or ab["source_book"] or "").strip()
        src = (ab["source_book"] or code).strip()
        resolved = (
            book_cover_map.get(code.upper())
            or book_cover_map.get(src.upper())
            or covers_by_stem.get((norm_slug(code), "*"))
            or covers_by_stem.get((norm_slug(src), "*"))
            or "/5etools/covers/PHB.webp"
        )
        if not os.path.isfile(os.path.join(IMG_DIR, resolved.replace("/5etools/", "").lstrip("/"))):
            resolved = "/5etools/covers/PHB.webp"
        cur.execute(
            "UPDATE `jane_scrum`.`dnd_adventures_books` SET `cover_path` = %s, `image_path` = %s WHERE `id` = %s",
            (resolved, resolved, ab_id),
        )
    conn.commit()

    # 4. Link Foundry VTT Data across all categories
    print("Loading all Foundry VTT JSON files...")
    foundry_items_raw = load_json_file("foundry-items.json")
    foundry_items_map = {}
    for it in foundry_items_raw.get("item", []) + foundry_items_raw.get("magicvariant", []):
        nm = norm_slug(it.get("name", ""))
        src = (it.get("source") or "").upper()
        if nm:
            foundry_items_map[(nm, src)] = json.dumps(it, ensure_ascii=False)
            foundry_items_map.setdefault((nm, "*"), json.dumps(it, ensure_ascii=False))

    foundry_class_raw = load_json_file("class/foundry.json")
    foundry_class_map = {}
    foundry_subclass_map = {}
    foundry_classfeat_map = {}
    for c in foundry_class_raw.get("class", []):
        nm = norm_slug(c.get("name", ""))
        src = (c.get("source") or "").upper()
        if nm:
            foundry_class_map[(nm, src)] = json.dumps(c, ensure_ascii=False)
            foundry_class_map.setdefault((nm, "*"), json.dumps(c, ensure_ascii=False))
    for sc in foundry_class_raw.get("subclass", []):
        nm = norm_slug(sc.get("name", ""))
        src = (sc.get("source") or "").upper()
        if nm:
            foundry_subclass_map[(nm, src)] = json.dumps(sc, ensure_ascii=False)
            foundry_subclass_map.setdefault((nm, "*"), json.dumps(sc, ensure_ascii=False))
    for cf in foundry_class_raw.get("classFeature", []) + foundry_class_raw.get("subclassFeature", []):
        nm = norm_slug(cf.get("name", ""))
        cn = norm_slug(cf.get("className", ""))
        if nm:
            foundry_classfeat_map[(nm, cn)] = json.dumps(cf, ensure_ascii=False)
            foundry_classfeat_map.setdefault((nm, "*"), json.dumps(cf, ensure_ascii=False))

    foundry_feats_raw = load_json_file("foundry-feats.json")
    foundry_feats_map = {}
    for ft in foundry_feats_raw.get("feat", []):
        nm = norm_slug(ft.get("name", ""))
        src = (ft.get("source") or "").upper()
        if nm:
            foundry_feats_map[(nm, src)] = json.dumps(ft, ensure_ascii=False)
            foundry_feats_map.setdefault((nm, "*"), json.dumps(ft, ensure_ascii=False))

    foundry_races_raw = load_json_file("foundry-races.json")
    foundry_races_map = {}
    for rc in foundry_races_raw.get("race", []) + foundry_races_raw.get("raceFeature", []):
        nm = norm_slug(rc.get("raceName") or rc.get("name") or "")
        src = (rc.get("raceSource") or rc.get("source") or "").upper()
        if nm:
            foundry_races_map[(nm, src)] = json.dumps(rc, ensure_ascii=False)
            foundry_races_map.setdefault((nm, "*"), json.dumps(rc, ensure_ascii=False))

    foundry_actions_raw = load_json_file("foundry-actions.json")
    foundry_actions_map = {}
    for ac in foundry_actions_raw.get("action", []):
        nm = norm_slug(ac.get("name", ""))
        src = (ac.get("source") or "").upper()
        if nm:
            foundry_actions_map[(nm, src)] = json.dumps(ac, ensure_ascii=False)
            foundry_actions_map.setdefault((nm, "*"), json.dumps(ac, ensure_ascii=False))

    foundry_opt_raw = load_json_file("foundry-optionalfeatures.json")
    foundry_opt_map = {}
    for op in foundry_opt_raw.get("optionalfeature", []):
        nm = norm_slug(op.get("name", ""))
        src = (op.get("source") or "").upper()
        if nm:
            foundry_opt_map[(nm, src)] = json.dumps(op, ensure_ascii=False)
            foundry_opt_map.setdefault((nm, "*"), json.dumps(op, ensure_ascii=False))

    foundry_rewards_raw = load_json_file("foundry-rewards.json")
    foundry_rewards_map = {}
    for rw in foundry_rewards_raw.get("reward", []):
        nm = norm_slug(rw.get("name", ""))
        src = (rw.get("source") or "").upper()
        if nm:
            foundry_rewards_map[(nm, src)] = json.dumps(rw, ensure_ascii=False)
            foundry_rewards_map.setdefault((nm, "*"), json.dumps(rw, ensure_ascii=False))

    foundry_vehicles_raw = load_json_file("foundry-vehicles.json")
    foundry_vehicles_map = {}
    for vh in foundry_vehicles_raw.get("vehicle", []) + foundry_vehicles_raw.get("vehicleUpgrade", []):
        nm = norm_slug(vh.get("name", ""))
        src = (vh.get("source") or "").upper()
        if nm:
            foundry_vehicles_map[(nm, src)] = json.dumps(vh, ensure_ascii=False)
            foundry_vehicles_map.setdefault((nm, "*"), json.dumps(vh, ensure_ascii=False))

    foundry_bestiary_raw = load_json_file("bestiary/foundry.json")
    foundry_bestiary_map = {}
    for mn in foundry_bestiary_raw.get("monster", []):
        nm = norm_slug(mn.get("name", ""))
        src = (mn.get("source") or "").upper()
        if nm:
            foundry_bestiary_map[(nm, src)] = json.dumps(mn, ensure_ascii=False)
            foundry_bestiary_map.setdefault((nm, "*"), json.dumps(mn, ensure_ascii=False))

    # 5. Update `dnd_items`, `dnd_magic_variants`, `dnd_item_metadata`
    print("Updating dnd_items, dnd_magic_variants, and dnd_item_metadata with images & Foundry data...")
    ITEM_TYPE_FALLBACK_IMG = {
        "M": "/5etools/items/DMG/Longsword.webp",
        "R": "/5etools/items/DMG/Oathbow.webp",
        "S": "/5etools/items/DMG/Animated Shield.webp",
        "LA": "/5etools/items/DMG/Glamoured Studded Leather.webp",
        "MA": "/5etools/items/DMG/Elven Chain.webp",
        "HA": "/5etools/items/DMG/Dwarven Plate.webp",
        "P": "/5etools/items/DMG/Potion of Healing.webp",
        "SC": "/5etools/items/DMG/Spell Scroll.webp",
        "RD": "/5etools/items/DMG/Immovable Rod.webp",
        "RG": "/5etools/items/DMG/Ring of Protection.webp",
        "WD": "/5etools/items/DMG/Wand of Magic Missiles.webp",
        "ST": "/5etools/items/DMG/Staff of Power.webp",
    }
    default_item_img = items_all[0] if items_all else "/5etools/covers/DMG.webp"
    for k, cand in list(ITEM_TYPE_FALLBACK_IMG.items()):
        if not os.path.isfile(os.path.join(IMG_DIR, cand.replace("/5etools/", "").lstrip("/"))):
            ITEM_TYPE_FALLBACK_IMG[k] = default_item_img

    cur.execute("SELECT id, name, source_id, item_type, image_path, fluff_json, properties_json FROM `jane_scrum`.`dnd_items`")
    for row in cur.fetchall():
        iid = row["id"]
        nm = row["name"] or ""
        src = (row["source_id"] or "DMG").upper()
        itype = (row["item_type"] or "").strip()
        ns = norm_slug(nm)

        # Resolve image
        img = norm_img_path(row["image_path"]) if row["image_path"] else None
        if not img:
            img = extract_first_image_from_fluff(row["fluff_json"])
        if not img:
            img = items_by_stem.get((ns, src)) or items_by_stem.get((ns, "*"))
        if not img:
            # Try base name before comma/parenthesis
            base_ns = norm_slug(nm.split(",")[0].split("(")[0])
            img = items_by_stem.get((base_ns, src)) or items_by_stem.get((base_ns, "*"))
        if not img:
            img = ITEM_TYPE_FALLBACK_IMG.get(itype, default_item_img)

        fjson = foundry_items_map.get((ns, src)) or foundry_items_map.get((ns, "*"))
        if not fjson:
            fjson = json.dumps(
                {
                    "name": nm,
                    "source": src,
                    "type": "equipment" if itype in ("LA", "MA", "HA", "S", "RG") else ("weapon" if itype in ("M", "R") else "loot"),
                    "img": img,
                    "system": {"itemType": itype, "source": src},
                },
                ensure_ascii=False,
            )
        cur.execute(
            "UPDATE `jane_scrum`.`dnd_items` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s",
            (img, fjson, iid),
        )

    cur.execute("SELECT id, name, source_book, fluff_json FROM `jane_scrum`.`dnd_magic_variants`") if False else None
    cur.execute("SELECT id, name, source_book FROM `jane_scrum`.`dnd_magic_variants`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "DMG").upper()
        img = items_by_stem.get((ns, src)) or items_by_stem.get((ns, "*")) or default_item_img
        fjson = foundry_items_map.get((ns, src)) or foundry_items_map.get((ns, "*")) or json.dumps({"name": row["name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_magic_variants` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    cur.execute("UPDATE `jane_scrum`.`dnd_item_metadata` SET `image_path` = %s WHERE `image_path` IS NULL", (default_item_img,))
    conn.commit()


    # 6. Update Classes, Subclasses, Class Features, Species, Subraces, Backgrounds, Feats, Actions, Conditions, Decks, Deities, etc.
    print("Linking images & Foundry data for classes, subclasses, features, species, backgrounds, feats, decks, deities, bestiary...")

    default_class_img = classes_all[0] if classes_all else "/5etools/covers/PHB.webp"
    cur.execute("SELECT id, name, source_book, fluff_json FROM `jane_scrum`.`dnd_custom_classes`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = (
            extract_first_image_from_fluff(row["fluff_json"])
            or classes_by_stem.get((ns, src))
            or classes_by_stem.get((ns, "*"))
            or default_class_img
        )
        fjson = foundry_class_map.get((ns, src)) or foundry_class_map.get((ns, "*")) or json.dumps({"name": row["name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_custom_classes` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    cur.execute("SELECT id, name, short_name, class_name, source_book, fluff_json FROM `jane_scrum`.`dnd_subclasses`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        sns = norm_slug(row["short_name"] or "")
        cns = norm_slug(row["class_name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = (
            extract_first_image_from_fluff(row["fluff_json"])
            or classes_by_stem.get((ns, src))
            or classes_by_stem.get((ns, "*"))
            or classes_by_stem.get((sns, "*"))
            or classes_by_stem.get((cns, "*"))
            or default_class_img
        )
        fjson = foundry_subclass_map.get((ns, src)) or foundry_subclass_map.get((ns, "*")) or json.dumps({"name": row["name"], "className": row["class_name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_subclasses` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    cur.execute("SELECT id, name, class_name, source_book FROM `jane_scrum`.`dnd_class_features`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        cns = norm_slug(row["class_name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = classes_by_stem.get((cns, src)) or classes_by_stem.get((cns, "*")) or default_class_img
        fjson = foundry_classfeat_map.get((ns, cns)) or foundry_classfeat_map.get((ns, "*")) or json.dumps({"name": row["name"], "className": row["class_name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_class_features` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    default_race_img = races_all[0] if races_all else "/5etools/covers/PHB.webp"
    cur.execute("SELECT id, name, source_book, fluff_json FROM `jane_scrum`.`dnd_custom_species`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = (
            extract_first_image_from_fluff(row["fluff_json"])
            or races_by_stem.get((ns, src))
            or races_by_stem.get((ns, "*"))
            or default_race_img
        )
        fjson = foundry_races_map.get((ns, src)) or foundry_races_map.get((ns, "*")) or json.dumps({"name": row["name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_custom_species` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    cur.execute("SELECT id, name, race_name, source_book, fluff_json FROM `jane_scrum`.`dnd_subraces`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        rns = norm_slug(row["race_name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = (
            extract_first_image_from_fluff(row["fluff_json"])
            or races_by_stem.get((ns, src))
            or races_by_stem.get((ns, "*"))
            or races_by_stem.get((rns, "*"))
            or default_race_img
        )
        fjson = foundry_races_map.get((ns, src)) or foundry_races_map.get((rns, "*")) or json.dumps({"name": row["name"], "raceName": row["race_name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_subraces` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    default_bg_img = backgrounds_all[0] if backgrounds_all else "/5etools/covers/PHB.webp"
    cur.execute("SELECT id, name, source_book, fluff_json FROM `jane_scrum`.`dnd_custom_backgrounds`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = (
            extract_first_image_from_fluff(row["fluff_json"])
            or backgrounds_by_stem.get((ns, src))
            or backgrounds_by_stem.get((ns, "*"))
            or default_bg_img
        )
        fjson = json.dumps({"name": row["name"], "source": src, "type": "background", "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_custom_backgrounds` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    default_feat_img = feats_all[0] if feats_all else "/5etools/covers/PHB.webp"
    cur.execute("SELECT id, name, source_book, fluff_json FROM `jane_scrum`.`dnd_custom_feats`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = (
            extract_first_image_from_fluff(row["fluff_json"])
            or feats_by_stem.get((ns, src))
            or feats_by_stem.get((ns, "*"))
            or default_feat_img
        )
        fjson = foundry_feats_map.get((ns, src)) or foundry_feats_map.get((ns, "*")) or json.dumps({"name": row["name"], "source": src, "type": "feat", "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_custom_feats` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    default_rule_img = rules_all[0] if rules_all else "/5etools/covers/PHB.webp"
    cur.execute("SELECT id, name, source_book, foundry_json FROM `jane_scrum`.`dnd_actions`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = rules_by_stem.get((ns, "*")) or default_rule_img
        fjson = row["foundry_json"] or foundry_actions_map.get((ns, src)) or foundry_actions_map.get((ns, "*")) or json.dumps({"name": row["name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_actions` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    default_cond_img = cond_all[0] if cond_all else default_rule_img
    cur.execute("SELECT id, name, source_book, fluff_json FROM `jane_scrum`.`dnd_conditions_diseases`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = extract_first_image_from_fluff(row["fluff_json"]) or cond_by_stem.get((ns, src)) or cond_by_stem.get((ns, "*")) or default_cond_img
        fjson = json.dumps({"name": row["name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_conditions_diseases` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    default_charopt_img = charopt_all[0] if charopt_all else default_rule_img
    cur.execute("SELECT id, name, source_book, fluff_json FROM `jane_scrum`.`dnd_char_creation_options`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = extract_first_image_from_fluff(row["fluff_json"]) or charopt_by_stem.get((ns, src)) or charopt_by_stem.get((ns, "*")) or default_charopt_img
        fjson = json.dumps({"name": row["name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_char_creation_options` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    default_optfeat_img = optfeat_all[0] if optfeat_all else default_feat_img
    cur.execute("SELECT id, name, source_book, fluff_json, foundry_json FROM `jane_scrum`.`dnd_optional_features`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = extract_first_image_from_fluff(row["fluff_json"]) or optfeat_by_stem.get((ns, src)) or optfeat_by_stem.get((ns, "*")) or default_optfeat_img
        fjson = row["foundry_json"] or foundry_opt_map.get((ns, src)) or foundry_opt_map.get((ns, "*")) or json.dumps({"name": row["name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_optional_features` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    # Decks & Cards
    default_deck_img = decks_all[0] if decks_all else "/5etools/covers/BMT.webp"
    deck_back_lookup = {}
    cur.execute("SELECT id, name, source_book, back_image_json FROM `jane_scrum`.`dnd_decks`")
    for row in cur.fetchall():
        did = row["id"]
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "DMG").upper()
        img = None
        if row["back_image_json"]:
            try:
                bobj = json.loads(row["back_image_json"])
                if isinstance(bobj, dict):
                    href = bobj.get("href") or bobj
                    if isinstance(href, dict) and href.get("path"):
                        img = norm_img_path(href["path"])
            except Exception:
                pass
        if not img:
            img = decks_by_stem.get((ns, src)) or decks_by_stem.get((ns, "*")) or default_deck_img
        deck_back_lookup[did] = img
        cur.execute("UPDATE `jane_scrum`.`dnd_decks` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, json.dumps({"name": row["name"], "source": src, "img": img}), did))

    cur.execute("SELECT id, deck_id, name, deck_name, source_book, face_image_json FROM `jane_scrum`.`dnd_deck_cards`")
    for row in cur.fetchall():
        cid = row["id"]
        did = row["deck_id"]
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "DMG").upper()
        face_img = None
        if row["face_image_json"]:
            try:
                fobj = json.loads(row["face_image_json"])
                if isinstance(fobj, dict):
                    href = fobj.get("href") or fobj
                    if isinstance(href, dict) and href.get("path"):
                        face_img = norm_img_path(href["path"])
            except Exception:
                pass
        if not face_img:
            face_img = decks_by_stem.get((ns, src)) or decks_by_stem.get((ns, "*")) or deck_back_lookup.get(did, default_deck_img)
        back_img = deck_back_lookup.get(did, default_deck_img)
        cur.execute(
            """
            UPDATE `jane_scrum`.`dnd_deck_cards`
            SET `image_path` = %s, `face_image_url` = %s, `back_image_url` = %s, `set_name` = COALESCE(`set_name`, `deck_name`)
            WHERE `id` = %s
            """,
            (face_img, face_img, back_img, cid),
        )

    # Deities
    default_deity_img = deities_all[0] if deities_all else "/5etools/covers/PHB.webp"
    cur.execute("SELECT id, name, source_book, symbol_img_json FROM `jane_scrum`.`dnd_deities`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "PHB").upper()
        img = None
        if row["symbol_img_json"]:
            try:
                sobj = json.loads(row["symbol_img_json"])
                if isinstance(sobj, dict):
                    href = sobj.get("href") or sobj
                    if isinstance(href, dict) and href.get("path"):
                        img = norm_img_path(href["path"])
            except Exception:
                pass
        if not img:
            img = deities_by_stem.get((ns, src)) or deities_by_stem.get((ns, "*")) or default_deity_img
        cur.execute("UPDATE `jane_scrum`.`dnd_deities` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, json.dumps({"name": row["name"], "source": src, "img": img}), row["id"]))

    # Bastions, Objects, Recipes, Rewards, Traps/Hazards, Variant Rules, Vehicles, Languages, Cults, Psionics
    default_bastion_img = bastions_all[0] if bastions_all else "/5etools/covers/XDMG.webp"
    cur.execute("SELECT id, name, source_book, fluff_json FROM `jane_scrum`.`dnd_bastions`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        img = extract_first_image_from_fluff(row["fluff_json"]) or bastions_by_stem.get((ns, "*")) or default_bastion_img
        cur.execute("UPDATE `jane_scrum`.`dnd_bastions` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, json.dumps({"name": row["name"], "img": img}), row["id"]))

    default_obj_img = objects_all[0] if objects_all else "/5etools/covers/DMG.webp"
    cur.execute("SELECT id, name, source_book, fluff_json FROM `jane_scrum`.`dnd_objects`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        img = extract_first_image_from_fluff(row["fluff_json"]) or objects_by_stem.get((ns, "*")) or default_obj_img
        cur.execute("UPDATE `jane_scrum`.`dnd_objects` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, json.dumps({"name": row["name"], "img": img}), row["id"]))

    default_recipe_img = recipes_all[0] if recipes_all else "/5etools/covers/HF.webp"
    cur.execute("SELECT id, name, source_book, fluff_json FROM `jane_scrum`.`dnd_recipes`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        img = extract_first_image_from_fluff(row["fluff_json"]) or recipes_by_stem.get((ns, "*")) or default_recipe_img
        cur.execute("UPDATE `jane_scrum`.`dnd_recipes` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, json.dumps({"name": row["name"], "img": img}), row["id"]))

    cur.execute("SELECT id, name, source_book, fluff_json, foundry_json FROM `jane_scrum`.`dnd_rewards`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "DMG").upper()
        img = extract_first_image_from_fluff(row["fluff_json"]) or default_item_img
        fjson = row["foundry_json"] or foundry_rewards_map.get((ns, src)) or foundry_rewards_map.get((ns, "*")) or json.dumps({"name": row["name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_rewards` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    default_trap_img = (traps_all + hazards_all + [default_rule_img])[0]
    cur.execute("SELECT id, name, source_book, fluff_json FROM `jane_scrum`.`dnd_traps_hazards`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        img = extract_first_image_from_fluff(row["fluff_json"]) or traps_by_stem.get((ns, "*")) or hazards_by_stem.get((ns, "*")) or default_trap_img
        cur.execute("UPDATE `jane_scrum`.`dnd_traps_hazards` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, json.dumps({"name": row["name"], "img": img}), row["id"]))

    default_varrule_img = varrules_all[0] if varrules_all else default_rule_img
    cur.execute("SELECT id, name, source_book FROM `jane_scrum`.`dnd_variant_rules`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        img = varrules_by_stem.get((ns, "*")) or rules_by_stem.get((ns, "*")) or default_varrule_img
        cur.execute("UPDATE `jane_scrum`.`dnd_variant_rules` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, json.dumps({"name": row["name"], "img": img}), row["id"]))

    default_veh_img = vehicles_all[0] if vehicles_all else "/5etools/covers/GoS.webp"
    cur.execute("SELECT id, name, source_book, fluff_json, foundry_json FROM `jane_scrum`.`dnd_vehicles`")
    for row in cur.fetchall():
        ns = norm_slug(row["name"] or "")
        src = (row["source_book"] or "GoS").upper()
        img = extract_first_image_from_fluff(row["fluff_json"]) or vehicles_by_stem.get((ns, src)) or vehicles_by_stem.get((ns, "*")) or default_veh_img
        fjson = row["foundry_json"] or foundry_vehicles_map.get((ns, src)) or foundry_vehicles_map.get((ns, "*")) or json.dumps({"name": row["name"], "source": src, "img": img})
        cur.execute("UPDATE `jane_scrum`.`dnd_vehicles` SET `image_path` = %s, `foundry_json` = %s WHERE `id` = %s", (img, fjson, row["id"]))

    default_lang_img = languages_all[0] if languages_all else default_rule_img
    cur.execute("UPDATE `jane_scrum`.`dnd_languages` SET `image_path` = COALESCE(`image_path`, %s)", (default_lang_img,))
    cur.execute("UPDATE `jane_scrum`.`dnd_cults_boons` SET `image_path` = COALESCE(`image_path`, %s)", (default_deity_img,))
    cur.execute("UPDATE `jane_scrum`.`dnd_psionics` SET `image_path` = COALESCE(`image_path`, %s)", ("/5etools/spell-art/arcane-sigil.webp",))
    cur.execute("UPDATE `jane_scrum`.`dnd_senses` SET `image_path` = COALESCE(`image_path`, %s)", (default_rule_img,))
    cur.execute("UPDATE `jane_scrum`.`dnd_skills` SET `image_path` = COALESCE(`image_path`, %s)", (default_rule_img,))
    cur.execute("UPDATE `jane_scrum`.`dnd_abilities` SET `image_path` = COALESCE(`image_path`, %s)", (default_rule_img,))
    cur.execute("UPDATE `jane_scrum`.`dnd_tables` SET `image_path` = COALESCE(`image_path`, %s)", (default_rule_img,))
    cur.execute("UPDATE `jane_scrum`.`dnd_life_tables` SET `image_path` = COALESCE(`image_path`, %s)", (default_rule_img,))
    cur.execute("UPDATE `jane_scrum`.`dnd_loot_tables` SET `image_path` = COALESCE(`image_path`, %s)", (default_item_img,))

    # Bestiary / Monsters (`dnd_monster_library` and `dnd_monster_library_fluff_images`)
    print("Updating dnd_monster_library images, tokens, and Foundry VTT JSON...")
    cur.execute("UPDATE `jane_scrum`.`dnd_monster_library_fluff_images` SET `url` = CONCAT('/5etools/', TRIM(LEADING '/' FROM `path`)) WHERE `path` IS NOT NULL AND (`url` IS NULL OR `url` NOT LIKE '/5etools/%')")
    default_monster_img = bestiary_all[0] if bestiary_all else "/5etools/covers/MM.webp"
    default_token_img = tokens_all[0] if tokens_all else default_monster_img

    cur.execute("SELECT id, name, source_id, fluff_json FROM `jane_scrum`.`dnd_monster_library`")
    for row in cur.fetchall():
        mid = row["id"]
        nm = row["name"] or ""
        src = (row["source_id"] or "MM").upper()
        ns = norm_slug(nm)
        tok = tokens_by_stem.get((ns, src)) or tokens_by_stem.get((ns, "*")) or default_token_img
        img = (
            extract_first_image_from_fluff(row["fluff_json"])
            or bestiary_by_stem.get((ns, src))
            or bestiary_by_stem.get((ns, "*"))
            or tok
        )
        fjson = foundry_bestiary_map.get((ns, src)) or foundry_bestiary_map.get((ns, "*")) or json.dumps({"name": nm, "source": src, "img": img, "prototypeToken": {"texture": {"src": tok}}})
        cur.execute(
            "UPDATE `jane_scrum`.`dnd_monster_library` SET `image_path` = %s, `token_url` = %s, `foundry_json` = %s WHERE `id` = %s",
            (img, tok, fjson, mid),
        )
    conn.commit()


    # 7. Attach Spell Effects & Resolved Images & Foundry VTT Data to EVERY Spell in `dnd_spells`
    print("Attaching spell effects, images, and Foundry data to all spells in dnd_spells...")
    foundry_spells_raw = load_json_file("spells/foundry.json")
    foundry_spells_map = {}
    for sp in foundry_spells_raw.get("spell", []):
        nm = norm_slug(sp.get("name", ""))
        src = (sp.get("source") or "").upper()
        if nm:
            foundry_spells_map[(nm, src)] = json.dumps(sp, ensure_ascii=False)
            foundry_spells_map.setdefault((nm, "*"), json.dumps(sp, ensure_ascii=False))

    # Ensure unique index on `loomweaver.lw_campaign_effects` (`campaign_id`, `effect_id`) or clean up by effect_id
    cur.execute(
        """
        SELECT id, name, level, school, school_code, spell_type, image_path,
               casting_time, range_text, duration_text, concentration, ritual,
               save_ability, dice_json, saving_throw_json, damage_inflict_json,
               area_tags_json, misc_tags_json, description, higher_levels,
               source_book, fluff_json, foundry_json
        FROM `jane_scrum`.`dnd_spells`
        ORDER BY id ASC
        """
    )
    all_spells = cur.fetchall()
    print(f"Processing {len(all_spells)} spells in jane_scrum.dnd_spells...")

    # Clear previous spell-auto effects in lw_campaign_effects to avoid duplicates before re-inserting
    cur.execute("DELETE FROM `loomweaver`.`lw_campaign_effects` WHERE `effect_id` LIKE 'fx-spell-%'")
    cur.execute("DELETE FROM `loomweaver`.`lw_campaign_effect_assignments` WHERE `character_key` = 'compendium-default'")

    for srow in all_spells:
        sp_id = srow["id"]
        nm = srow["name"] or "Spell"
        src = (srow["source_book"] or "PHB").strip()
        ns = norm_slug(nm)

        effect_id, resolved_img, studio_doc, vtt_def = build_spell_effect_bundle(srow, spells_by_stem)
        studio_json = json.dumps(studio_doc, ensure_ascii=False)
        vtt_json = json.dumps(vtt_def, ensure_ascii=False)

        fjson = srow["foundry_json"] or foundry_spells_map.get((ns, src.upper())) or foundry_spells_map.get((ns, "*"))
        if not fjson:
            fjson = json.dumps(
                {
                    "name": nm,
                    "source": src,
                    "type": "spell",
                    "img": resolved_img,
                    "system": {
                        "level": srow["level"],
                        "school": (srow["school_code"] or "V").lower(),
                        "target": {"type": studio_doc["deliveryMode"], "value": vtt_def["aoeFeet"], "units": "ft"},
                        "loomweaverEffectId": effect_id,
                    },
                },
                ensure_ascii=False,
            )

        # Update `jane_scrum.dnd_spells`
        cur.execute(
            """
            UPDATE `jane_scrum`.`dnd_spells`
            SET `image_path` = %s,
                `default_effect_id` = %s,
                `effect_json` = %s,
                `foundry_json` = %s,
                `spell_range` = COALESCE(`range_text`, '60 feet'),
                `duration` = COALESCE(`duration_text`, 'Instantaneous')
            WHERE `id` = %s
            """,
            (resolved_img, effect_id, studio_json, fjson, sp_id),
        )

        # Upsert `jane_scrum.dnd_spell_effects`
        cur.execute(
            """
            INSERT INTO `jane_scrum`.`dnd_spell_effects`
                (`effect_id`, `spell_id`, `spell_name`, `source_book`, `school`, `level`,
                 `energy_theme`, `delivery_mode`, `is_handcrafted`, `icon_url`,
                 `studio_document_json`, `vtt_definition_json`)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                `effect_id` = VALUES(`effect_id`),
                `spell_name` = VALUES(`spell_name`),
                `source_book` = VALUES(`source_book`),
                `school` = VALUES(`school`),
                `level` = VALUES(`level`),
                `energy_theme` = VALUES(`energy_theme`),
                `delivery_mode` = VALUES(`delivery_mode`),
                `is_handcrafted` = VALUES(`is_handcrafted`),
                `icon_url` = VALUES(`icon_url`),
                `studio_document_json` = VALUES(`studio_document_json`),
                `vtt_definition_json` = VALUES(`vtt_definition_json`)
            """,
            (
                effect_id,
                sp_id,
                nm,
                src,
                srow["school"] or "Evocation",
                int(srow["level"] or 0),
                studio_doc["energyTheme"],
                studio_doc["deliveryMode"],
                1 if studio_doc["isHandcrafted"] else 0,
                resolved_img,
                studio_json,
                vtt_json,
            ),
        )

        # Upsert `jane_scrum.mw_effect_library` and `mw_effect_assignments`
        cur.execute(
            """
            INSERT INTO `jane_scrum`.`mw_effect_library` (`user_id`, `effect_id`, `definition_json`)
            VALUES (0, %s, %s)
            ON DUPLICATE KEY UPDATE `definition_json` = VALUES(`definition_json`)
            """,
            (effect_id, vtt_json),
        )
        spell_key = ns if src.upper() == "PHB" else f"{ns}-{norm_slug(src)}"
        cur.execute(
            """
            INSERT INTO `jane_scrum`.`mw_effect_assignments`
                (`campaign_id`, `character_id`, `spell_key`, `spell_name`, `definition_json`)
            VALUES (0, 0, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                `spell_name` = VALUES(`spell_name`),
                `definition_json` = VALUES(`definition_json`)
            """,
            (spell_key[:120], nm, vtt_json),
        )

        # Insert into `loomweaver.lw_campaign_effects` and `lw_campaign_effect_assignments`
        cur.execute(
            """
            INSERT INTO `loomweaver`.`lw_campaign_effects`
                (`campaign_id`, `effect_id`, `name`, `subtitle`, `emitter_id`, `canon_status`,
                 `owner_username`, `owner_role`, `document_json`)
            VALUES (1, %s, %s, %s, %s, 'approved', 'System', 'gm', %s)
            """,
            (
                effect_id,
                studio_doc["name"],
                studio_doc["subtitle"],
                studio_doc["activeEmitterId"],
                studio_json,
            ),
        )
        cur.execute(
            """
            INSERT INTO `loomweaver`.`lw_campaign_effect_assignments`
                (`campaign_id`, `campaign_name`, `character_key`, `character_name`,
                 `spell_key`, `spell_name`, `effect_id`, `effect_name`,
                 `assigned_by_username`, `assigned_by_role`, `document_json`)
            VALUES (1, 'System Compendium', 'compendium-default', 'Compendium Default',
                    %s, %s, %s, %s, 'System', 'gm', %s)
            """,
            (
                spell_key[:80],
                nm,
                effect_id,
                studio_doc["name"],
                studio_json,
            ),
        )

    conn.commit()
    print("All spells updated and linked to visual spell effects!")

    # 8. Populate `dnd_entity_images` and normalize `dnd_fluff` image paths in `jane_scrum`
    print("Populating dnd_entity_images and normalizing dnd_fluff image paths...")
    cur.execute("SELECT id, images_json FROM `jane_scrum`.`dnd_fluff` WHERE `images_json` IS NOT NULL AND `images_json` != '[]'")
    for frow in cur.fetchall():
        fid = frow["id"]
        raw_imgs = frow["images_json"]
        if "/5etools/" not in raw_imgs and '"path":' in raw_imgs:
            updated_imgs = re.sub(r'"path"\s*:\s*"(?!/5etools/)([^"]+)"', r'"path": "/5etools/\1"', raw_imgs)
            cur.execute("UPDATE `jane_scrum`.`dnd_fluff` SET `images_json` = %s WHERE `id` = %s", (updated_imgs, fid))
    conn.commit()

    # 9. Update `v_dnd_compendium_master_catalog` and all `v_dnd_*` views in `jane_scrum`
    print("Updating v_dnd_* views in jane_scrum to include image_path, default_effect_id, and foundry_json...")
    cur.execute(
        """
        CREATE OR REPLACE VIEW `jane_scrum`.`v_dnd_spells_with_source` AS
        SELECT
            sp.*,
            s.`name` AS `source_name`,
            s.`source_type` AS `source_type`,
            s.`source_group` AS `source_group`,
            s.`published` AS `source_published`,
            s.`author` AS `source_author`,
            s.`cover_path` AS `source_cover_path`,
            st.`school_name` AS `linked_school_name`,
            st.`spell_type_key` AS `linked_spell_type_key`,
            st.`description` AS `linked_school_description`
        FROM `jane_scrum`.`dnd_spells` sp
        LEFT JOIN `jane_scrum`.`dnd_sources` s
            ON (sp.`source_book` COLLATE utf8mb4_unicode_ci) = (s.`id` COLLATE utf8mb4_unicode_ci)
        LEFT JOIN `jane_scrum`.`dnd_spell_types` st
            ON (sp.`school_code` COLLATE utf8mb4_unicode_ci) = (st.`school_code` COLLATE utf8mb4_unicode_ci);
        """
    )

    cur.execute(
        """
        CREATE OR REPLACE VIEW `jane_scrum`.`v_dnd_items_with_source` AS
        SELECT
            i.`id`, i.`name`, i.`source_id`, i.`page`, i.`item_type`, i.`rarity`,
            i.`weight`, i.`value_gp`, i.`requires_attunement`, i.`properties_json`,
            i.`image_path`, i.`foundry_json`, i.`fluff_json`, i.`description`,
            i.`is_homebrew`, i.`owner_id`, i.`created_at`, i.`updated_at`,
            i.`campaign_id`, i.`created_by_user_id`, i.`is_public`,
            s.`name` AS `source_name`, s.`source_type` AS `source_type`,
            s.`source_group` AS `source_group`, s.`published` AS `source_published`,
            s.`author` AS `source_author`, s.`cover_path` AS `source_cover_path`
        FROM `jane_scrum`.`dnd_items` i
        LEFT JOIN `jane_scrum`.`dnd_sources` s
            ON (i.`source_id` COLLATE utf8mb4_unicode_ci) = (s.`id` COLLATE utf8mb4_unicode_ci);
        """
    )
    conn.commit()

    # 10. Clone / Synchronize ALL `dnd_*`, `cm_*`, `mw_effect*` tables and `v_dnd_*` views into `loomweaver`
    print("Synchronizing all dnd_*, cm_*, and mw_effect* tables into `loomweaver` schema...")
    cur.execute("SET FOREIGN_KEY_CHECKS = 0;")
    cur.execute(
        """
        SELECT table_name AS tbl_name
        FROM information_schema.tables
        WHERE table_schema = 'jane_scrum'
          AND table_type = 'BASE TABLE'
          AND (table_name LIKE 'dnd_%' OR table_name LIKE 'cm_%' OR table_name LIKE 'mw_effect%')
        ORDER BY table_name
        """
    )
    base_tables = [list(r.values())[0] for r in cur.fetchall()]

    for tbl in base_tables:
        print(f"  Syncing table `loomweaver`.`{tbl}`...")
        cur.execute(f"DROP TABLE IF EXISTS `loomweaver`.`{tbl}`;")
        cur.execute(f"CREATE TABLE `loomweaver`.`{tbl}` LIKE `jane_scrum`.`{tbl}`;")
        # Check if table has generated columns; if so, insert only non-generated columns
        cur.execute(
            """
            SELECT column_name AS col_name
            FROM information_schema.columns
            WHERE table_schema = 'jane_scrum'
              AND table_name = %s
              AND extra NOT LIKE '%%GENERATED%%'
            ORDER BY ordinal_position
            """,
            (tbl,),
        )
        cols = [f"`{list(c.values())[0]}`" for c in cur.fetchall()]
        col_list = ", ".join(cols)
        cur.execute(f"INSERT INTO `loomweaver`.`{tbl}` ({col_list}) SELECT {col_list} FROM `jane_scrum`.`{tbl}`;")

    conn.commit()

    # Recreate all views in `loomweaver`
    print("Recreating all v_dnd_* and compendium views in `loomweaver`...")
    cur.execute(
        """
        SELECT table_name AS v_name
        FROM information_schema.views
        WHERE table_schema = 'jane_scrum'
          AND (table_name LIKE 'v_dnd_%' OR table_name LIKE 'v_%compendium%' OR table_name = 'cm_items')
        ORDER BY table_name
        """
    )
    view_names = [list(r.values())[0] for r in cur.fetchall()]
    # Ensure v_dnd_monster_library_with_fluff is created before v_dnd_monster_library_with_fluff_spicy
    if "v_dnd_monster_library_with_fluff" in view_names and "v_dnd_monster_library_with_fluff_spicy" in view_names:
        view_names.remove("v_dnd_monster_library_with_fluff")
        view_names.insert(0, "v_dnd_monster_library_with_fluff")

    for vname in view_names:
        cur.execute(f"SHOW CREATE VIEW `jane_scrum`.`{vname}`")
        vrow = cur.fetchone()
        create_sql = vrow.get("Create View") or list(vrow.values())[1]
        # Strip DEFINER clause and replace `jane_scrum`. with `loomweaver`.
        create_sql = re.sub(r"DEFINER=`[^`]+`@`[^`]+`\s+", "", create_sql)
        create_sql = create_sql.replace("CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW", "CREATE OR REPLACE VIEW")
        create_sql = create_sql.replace("CREATE VIEW", "CREATE OR REPLACE VIEW")
        create_sql = create_sql.replace("`jane_scrum`.", "`loomweaver`.")
        create_sql = create_sql.replace(f"VIEW `{vname}`", f"VIEW `loomweaver`.`{vname}`")
        try:
            cur.execute(create_sql)
        except Exception as ex:
            print(f"  Warning creating view {vname}: {ex}")

    cur.execute("SET FOREIGN_KEY_CHECKS = 1;")
    conn.commit()
    cur.close()
    conn.close()
    print("=== MASTER 5ETOOLS SYNC COMPLETE ===")


if __name__ == "__main__":
    main()
