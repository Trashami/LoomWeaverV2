#!/usr/bin/env python3
"""
Syncs all 5eTools spells, fluff-spells, foundry.json, sources.json, books.json, and actions.json
into MySQL (both `loomweaver` and `jane_scrum`) and populates `lw_engine_core_rules` so all spells
and actions are available in ActionBuilder (`actionbuilder.loom-weaver.com`) and the Encounter Engine.
"""
import glob
import io
import json
import os
import re
import tarfile
import lw_deploy_env as env

MYSQL_USER = "loomweaver_app"

LOCAL_5ETOOLS_DATA = r"c:\Users\JTromborg1\OneDrive\Documents\5e Tools\data"

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

NAME_TO_SCHOOL_CODE = {v[0].lower(): k for k, v in SCHOOL_MAP.items()}

KNOWN_NULL_SPELL_SOURCES = {
    "thunder step": "XGE",
    "summon fey": "TCE",
    "silvery barbs": "SCC",
    "motivational speech": "AI",
    "mold earth": "XGE",
    "guardian of nature": "XGE",
    "investiture of flame": "XGE",
    "investiture of ice": "XGE",
    "investiture of stone": "XGE",
    "investiture of wind": "XGE",
    "earth tremor": "XGE",
    "pyrotechnics": "XGE",
    "skywrite": "XGE",
    "thunderclap": "XGE",
    "warding wind": "XGE",
    "control flames": "XGE",
    "create bonfire": "XGE",
    "frostbite": "XGE",
    "gust": "XGE",
    "magic stone": "XGE",
    "shape water": "XGE",
    "absorb elements": "XGE",
    "beast bond": "XGE",
    "ice knife": "XGE",
    "earthbind": "XGE",
    "dust devil": "XGE",
    "catapult": "XGE",
    "control winds": "XGE",
    "bones of the earth": "XGE",
    "erupting earth": "XGE",
    "elemental bane": "XGE",
    "flame arrows": "XGE",
    "maelstrom": "XGE",
    "primordial ward": "XGE",
    "tidal wave": "XGE",
    "transmute rock": "XGE",
    "wall of water": "XGE",
    "watery sphere": "XGE",
    "whirlwind": "XGE",
    "immolation": "XGE",
    "storm sphere": "XGE",
    "vitriolic sphere": "XGE",
    "wall of sand": "XGE",
    "arcane hand": "PHB",
    "instant summons": "PHB",
    "black tentacles": "PHB",
    "secret chest": "PHB",
    "tiny hut": "PHB",
    "acid arrow": "PHB",
    "faithful hound": "PHB",
    "magnificent mansion": "PHB",
    "private sanctum": "PHB",
    "arcane sword": "PHB",
    "freezing sphere": "PHB",
    "resilient sphere": "PHB",
    "irresistible dance": "PHB",
    "telepathic bond": "PHB",
    "hideous laughter": "PHB",
    "floating disk": "PHB",
}


def strip_5e_tags(text: str) -> str:
    if not text:
        return ""
    def repl(m):
        inner = m.group(1)
        parts = inner.split("|")
        return parts[0]
    cleaned = re.sub(r"\{@[a-zA-Z0-9_]+ ([^}]+)\}", repl, text)
    return re.sub(r"\s+", " ", cleaned).strip()


def flatten_entries(entries) -> str:
    if not entries:
        return ""
    out = []
    if isinstance(entries, str):
        return strip_5e_tags(entries)
    if isinstance(entries, list):
        for e in entries:
            if isinstance(e, str):
                out.append(strip_5e_tags(e))
            elif isinstance(e, dict):
                name = e.get("name")
                sub = flatten_entries(e.get("entries") or e.get("items") or [])
                if name and sub:
                    out.append(f"{strip_5e_tags(str(name))}: {sub}")
                elif sub:
                    out.append(sub)
    return "\n\n".join(x for x in out if x)


def format_level_label(level: int) -> str:
    if level <= 0:
        return "Cantrip"
    if level == 1:
        return "1st-Level"
    if level == 2:
        return "2nd-Level"
    if level == 3:
        return "3rd-Level"
    return f"{level}th-Level"


def format_casting_time(time_arr) -> str:
    if not time_arr or not isinstance(time_arr, list):
        return "1 Action"
    t = time_arr[0] if time_arr else {}
    if not isinstance(t, dict):
        return "1 Action"
    num = t.get("number", 1)
    unit = str(t.get("unit", "action")).strip()
    unit_title = "Bonus Action" if unit.lower() == "bonus" else unit.title()
    cond = f" ({strip_5e_tags(str(t.get('condition')))})" if t.get("condition") else ""
    return f"{num} {unit_title}{cond}"


def format_range(rng) -> str:
    if not isinstance(rng, dict):
        return "Self"
    rtype = rng.get("type", "point")
    dist = rng.get("distance", {})
    if not isinstance(dist, dict):
        return str(rtype).title()
    dtype = dist.get("type", "self")
    amt = dist.get("amount")
    if dtype in ("self", "touch", "sight", "unlimited", "special"):
        if rtype not in ("point", "special") and amt:
            return f"Self ({amt}-foot {rtype})"
        return str(dtype).title()
    if amt:
        return f"{amt} {dtype}"
    return str(dtype).title()


def format_duration(dur_arr) -> tuple[str, bool]:
    if not dur_arr or not isinstance(dur_arr, list):
        return ("Instantaneous", False)
    d = dur_arr[0] if dur_arr else {}
    if not isinstance(d, dict):
        return ("Instantaneous", False)
    conc = bool(d.get("concentration", False))
    dtype = d.get("type", "instant")
    if dtype == "instant":
        return ("Instantaneous", False)
    if dtype == "permanent":
        return ("Until dispelled", conc)
    if dtype == "special":
        return ("Special", conc)
    sub = d.get("duration", {})
    amt = sub.get("amount", 1)
    unit = sub.get("type", "round")
    if amt != 1 and not str(unit).endswith("s"):
        unit = f"{unit}s"
    prefix = "Concentration, up to " if conc else ""
    return (f"{prefix}{amt} {unit}", conc)


def build_local_dataset():
    books = {}
    books_path = os.path.join(LOCAL_5ETOOLS_DATA, "books.json")
    if os.path.isfile(books_path):
        with open(books_path, "r", encoding="utf-8") as f:
            bdata = json.load(f)
            for b in bdata.get("book", []):
                bid = str(b.get("id") or b.get("source") or "").strip()
                if bid:
                    books[bid] = {
                        "id": bid,
                        "name": b.get("name", bid),
                        "source_type": "official",
                        "source_group": b.get("group", "core"),
                        "published": b.get("published"),
                        "author": b.get("author", "Wizards of the Coast"),
                        "cover_type": (b.get("cover") or {}).get("type"),
                        "cover_path": (b.get("cover") or {}).get("path"),
                    }

    # Ensure extra known sources exist
    extra_sources = {
        "PHB": "Player's Handbook (2014)",
        "XPHB": "Player's Handbook (2024)",
        "XGE": "Xanathar's Guide to Everything",
        "TCE": "Tasha's Cauldron of Everything",
        "FTD": "Fizban's Treasury of Dragons",
        "SCC": "Strixhaven: A Curriculum of Chaos",
        "EGW": "Explorer's Guide to Wildemount",
        "AAG": "Astral Adventurer's Guide",
        "AI": "Acquisitions Incorporated",
        "BMT": "The Book of Many Things",
        "EFA": "Eberron: Forge of the Artificer",
        "FRHoF": "Forgotten Realms: Heroes of Faerun",
        "GGR": "Guildmasters' Guide to Ravnica",
        "IDRotF": "Icewind Dale: Rime of the Frostmaiden",
        "LLK": "Lost Laboratory of Kwalish",
        "SatO": "Sigil and the Outlands",
        "AitFR-AVT": "Adventures in the Forgotten Realms: A Verdant Tomb",
        "EEPC": "Elemental Evil Player's Companion",
        "SCAG": "Sword Coast Adventurer's Guide",
        "SRD": "System Reference Document 5.1",
    }
    for sid, sname in extra_sources.items():
        if sid not in books:
            books[sid] = {
                "id": sid,
                "name": sname,
                "source_type": "official",
                "source_group": "supplement",
                "published": "2024-09-17" if sid == "XPHB" else "2014-08-19",
                "author": "Wizards of the Coast",
                "cover_type": "internal",
                "cover_path": f"book/{sid}.webp",
            }

    spells_dir = os.path.join(LOCAL_5ETOOLS_DATA, "spells")

    # 1. sources.json (class mappings)
    class_Lookup = {}
    sources_json_path = os.path.join(spells_dir, "sources.json")
    if os.path.isfile(sources_json_path):
        with open(sources_json_path, "r", encoding="utf-8") as f:
            sdata = json.load(f)
            for src_key, spell_map in sdata.items():
                if not isinstance(spell_map, dict):
                    continue
                for sp_name, cinfo in spell_map.items():
                    class_Lookup[(sp_name.lower(), src_key.upper())] = cinfo
                    if (sp_name.lower(), "*") not in class_Lookup:
                        class_Lookup[(sp_name.lower(), "*")] = cinfo

    # 2. foundry.json
    foundry_lookup = {}
    foundry_path = os.path.join(spells_dir, "foundry.json")
    if os.path.isfile(foundry_path):
        with open(foundry_path, "r", encoding="utf-8") as f:
            fdata = json.load(f)
            for item in fdata.get("spell", []):
                nm = str(item.get("name", "")).strip().lower()
                src = str(item.get("source", "")).strip().upper()
                if nm:
                    foundry_lookup[(nm, src)] = item
                    if (nm, "*") not in foundry_lookup:
                        foundry_lookup[(nm, "*")] = item

    # 3. fluff-spells-*.json
    fluff_lookup = {}
    for fp in sorted(glob.glob(os.path.join(spells_dir, "fluff-spells-*.json"))):
        with open(fp, "r", encoding="utf-8") as f:
            fldata = json.load(f)
            for item in fldata.get("spellFluff", []):
                nm = str(item.get("name", "")).strip().lower()
                src = str(item.get("source", "")).strip().upper()
                if nm:
                    fluff_lookup[(nm, src)] = item
                    if (nm, "*") not in fluff_lookup:
                        fluff_lookup[(nm, "*")] = item

    # 4. spells-*.json
    spells = []
    for sp_file in sorted(glob.glob(os.path.join(spells_dir, "spells-*.json"))):
        with open(sp_file, "r", encoding="utf-8") as f:
            spdata = json.load(f)
            for sp in spdata.get("spell", []):
                spells.append(sp)

    return books, class_Lookup, foundry_lookup, fluff_lookup, spells


def extract_fluff_info(sp_name: str, src: str, school_name: str, level_label: str, fluff_lookup: dict) -> tuple[str, str | None, str]:
    key_exact = (sp_name.lower(), src.upper())
    key_any = (sp_name.lower(), "*")
    fluff_obj = fluff_lookup.get(key_exact) or fluff_lookup.get(key_any)
    img_path = None
    lore_text = ""

    if fluff_obj:
        entries = fluff_obj.get("entries")
        if entries:
            lore_text = flatten_entries(entries)
        images = fluff_obj.get("images")
        if isinstance(images, list) and images:
            first_img = images[0]
            if isinstance(first_img, dict):
                href = first_img.get("href", {})
                if isinstance(href, dict) and href.get("path"):
                    img_path = f"/5etools/img/{href.get('path').lstrip('/')}"
        fluff_json_str = json.dumps(fluff_obj, ensure_ascii=False)
    else:
        lore_text = f"{sp_name} is a {level_label} {school_name} spell recorded in {src}."
        synth = {
            "name": sp_name,
            "source": src,
            "entries": [lore_text],
        }
        fluff_json_str = json.dumps(synth, ensure_ascii=False)

    return fluff_json_str, img_path, lore_text


def build_rule_dto_for_spell(
    spell_id_slug: str,
    name: str,
    level: int,
    school_code: str,
    school_name: str,
    source_book: str,
    casting_time: str,
    range_text: str,
    duration_text: str,
    concentration: bool,
    ritual: bool,
    save_ability: str | None,
    damage_formula: str,
    description: str,
    higher_levels: str,
    lore_text: str,
    class_names: list[str],
    foundry_item: dict | None,
) -> dict:
    level_label = format_level_label(level)
    spell_type_label = f"{level_label} {school_name}" + (" (Ritual)" if ritual else "")
    cost_lower = casting_time.lower()
    is_reaction = "reaction" in cost_lower
    is_bonus = "bonus" in cost_lower

    # Determine target label from Foundry data if available
    target_label = range_text
    if foundry_item and isinstance(foundry_item.get("system"), dict):
        ftarget = foundry_item["system"].get("target")
        if isinstance(ftarget, dict) and ftarget.get("type"):
            tval = ftarget.get("value") or ""
            tunits = ftarget.get("units") or ""
            ttype = ftarget.get("type") or ""
            target_label = f"{tval} {tunits} {ttype}".strip()

    # Determine AC bonus for defensive spells like Shield, Shield of Faith, Mage Armor, Haste, Barkskin
    ac_bonus = 0
    nl = name.lower()
    if nl == "shield":
        ac_bonus = 5
    elif nl in ("shield of faith", "haste"):
        ac_bonus = 2
    elif nl == "mage armor":
        ac_bonus = 3

    save_dc = 15 if save_ability else 0
    attack_or_save_label = (
        f"{save_ability.title()} Save (DC {save_dc})"
        if save_ability
        else ("Interrupts Attack Roll vs AC" if ac_bonus > 0 and is_reaction else "Spell Effect / Attack")
    )

    # Build concise summary combining rules text + fluff lore
    clean_desc = (description or "").strip()
    if len(clean_desc) > 420:
        clean_desc = clean_desc[:417].rstrip() + "..."
    if lore_text and lore_text not in clean_desc:
        clean_lore = lore_text[:180].rstrip() + ("..." if len(lore_text) > 180 else "")
        summary = f"{clean_desc} [Fluff: {clean_lore}]"
    else:
        summary = clean_desc or f"{spell_type_label} from {source_book}."

    # Build Trigger (When), Requirements (Has), Effects (Then) clauses
    if is_reaction:
        m = re.search(r"\(([^)]+)\)", casting_time)
        trig_token = m.group(1) if m else f"Reaction trigger for {name} occurs within {range_text}"
    elif is_bonus:
        trig_token = f"Caster uses a Bonus Action on their turn to cast {name}"
    else:
        trig_token = f"Caster takes the Magic action ({casting_time}) to cast {name}"

    req_tokens = []
    if is_reaction:
        req_tokens.append("Reaction available")
    elif is_bonus:
        req_tokens.append("Bonus Action available")
    else:
        req_tokens.append("Action available")

    if level > 0:
        req_tokens.append(f"Appropriate {level_label} spell slot available")
    if concentration:
        req_tokens.append("Concentration available")

    eff_tokens = [
        f"Spend required casting resources ({casting_time}" + (f" + {level_label} Spell Slot)" if level > 0 else ")"),
        f"Apply {name} ({damage_formula}) within {range_text} for {duration_text}",
    ]
    if higher_levels:
        hl_short = higher_levels[:140].rstrip() + ("..." if len(higher_levels) > 140 else "")
        eff_tokens.append(f"At Higher Levels: {hl_short}")

    scaling_tiers = [
        {
            "levelRange": "Cantrip" if level == 0 else f"Slot {level}",
            "diceOrValue": damage_formula,
            "label": f"Base ({level_label})",
            "summary": f"{spell_type_label} · {range_text} · {duration_text}",
        }
    ]
    if higher_levels:
        scaling_tiers.append(
            {
                "levelRange": f"Slot {min(9, level + 1)}-9" if level > 0 else "Levels 5/11/17",
                "diceOrValue": "Upcast / Cantrip Scaling",
                "label": "Higher Levels",
                "summary": higher_levels[:160],
            }
        )

    tags = ["Spell", source_book, school_name, level_label]
    if is_reaction:
        tags.append("Reaction")
    if concentration:
        tags.append("Concentration")
    if ritual:
        tags.append("Ritual")
    for cn in class_names[:4]:
        if cn not in tags:
            tags.append(cn)

    primary_method = (
        "ResolveShieldReactionWindow"
        if is_reaction and ac_bonus > 0
        else ("ResolveCounterspellContest" if "counterspell" in nl else "ResolveAreaSavingThrowSpell")
    )

    return {
        "id": spell_id_slug,
        "ruleCode": f"Spell.{re.sub(r'[^a-zA-Z0-9]', '', name)}.{source_book}",
        "name": name if source_book in ("PHB", "XGE", "TCE", "FTD", "SCC", "EGW") else f"{name} ({source_book})",
        "category": "Spells",
        "sourceLabel": f"Core SQL · {source_book}",
        "rulesetCode": "dnd5e-2024" if source_book == "XPHB" else "dnd5e-2014",
        "summary": summary,
        "actionCost": casting_time.split("(")[0].strip(),
        "actionType": f"{spell_type_label} ({source_book})",
        "rangeLabel": range_text,
        "targetLabel": target_label,
        "attackOrSaveLabel": attack_or_save_label,
        "damageOrEffectFormula": damage_formula,
        "saveDc": save_dc,
        "acBonus": ac_bonus,
        "durationLabel": duration_text,
        "requiresConcentration": concentration,
        "primaryClassName": "CombatRuleInterpreter",
        "primaryMethodName": primary_method,
        "sourceFilePath": f"5etools/data/spells/spells-{source_book.lower()}.json",
        "clauses": [
            {
                "id": f"{spell_id_slug}-when",
                "keyword": "When",
                "combiner": "ANY",
                "tokens": [trig_token],
                "boundClass": "SpellcastingResolutionService",
                "boundMethod": "validateSpellSlotAndComponents",
                "notes": f"Source: {source_book} · {spell_type_label}",
            },
            {
                "id": f"{spell_id_slug}-has",
                "keyword": "Has",
                "combiner": "ALL",
                "tokens": req_tokens,
                "boundClass": "CombatSessionStateService",
                "boundMethod": "consumeActionResource",
                "notes": "Casting requirements",
            },
            {
                "id": f"{spell_id_slug}-then",
                "keyword": "Then",
                "combiner": "ALL",
                "tokens": eff_tokens,
                "boundClass": "CombatRuleInterpreter",
                "boundMethod": primary_method,
                "notes": "Spell resolution",
            },
        ],
        "scalingTiers": scaling_tiers,
        "worksWith": class_names[:5] if class_names else ["Spellcasting"],
        "conflictsWith": ["Incapacitated", "Anti-Magic Field"],
        "tags": tags,
        "isCustomizedForCampaign": False,
        "isCoreEngineRule": True,
        "bypassesCoreRuleId": None,
        "bypassedByRuleId": None,
        "bypassedByRuleName": None,
        "updatedByUsername": "System",
        "updatedAt": "2026-10-27T00:00:00Z",
    }


def main():
    print("Loading local 5eTools dataset...")
    books, class_lookup, foundry_lookup, fluff_lookup, local_spells = build_local_dataset()
    print(
        f"Loaded {len(books)} source books, {len(local_spells)} spells, "
        f"{len(fluff_lookup)} fluff entries, {len(foundry_lookup)} foundry entries."
    )

    # Prepare normalized spell rows and Core Rule DTOs
    spell_rows = []
    core_rule_rows = {}
    seen_name_source = set()

    for sp in local_spells:
        name = str(sp.get("name", "")).strip()
        source_book = str(sp.get("source", "PHB")).strip()
        if not name:
            continue
        key = (name.lower(), source_book.upper())
        if key in seen_name_source:
            continue
        seen_name_source.add(key)

        if source_book not in books:
            books[source_book] = {
                "id": source_book,
                "name": source_book,
                "source_type": "official",
                "source_group": "supplement",
                "published": "2020-01-01",
                "author": "Wizards of the Coast",
                "cover_type": "internal",
                "cover_path": f"book/{source_book}.webp",
            }

        level = int(sp.get("level", 0))
        raw_school = str(sp.get("school", "V")).strip().upper()
        school_name, school_key, _ = SCHOOL_MAP.get(raw_school, ("Evocation", "evocation", ""))
        school_code = raw_school if raw_school in SCHOOL_MAP else "V"
        level_label = format_level_label(level)
        ritual = bool((sp.get("meta") or {}).get("ritual", False))
        spell_type = f"{level_label} {school_name}" + (" (Ritual)" if ritual else "")

        casting_time = format_casting_time(sp.get("time"))
        range_text = format_range(sp.get("range"))
        duration_text, concentration = format_duration(sp.get("duration"))

        saving_throws = sp.get("savingThrow") or []
        save_ability = saving_throws[0].title() if saving_throws else None
        dmg_types = sp.get("damageInflict") or []

        description = flatten_entries(sp.get("entries", []))
        higher_levels = flatten_entries(sp.get("entriesHigherLevel", []))

        # Extract dice formula from description if present
        dice_matches = list(dict.fromkeys(re.findall(r"\b\d+d\d+(?:\s*\+\s*\d+)?\b", description)))
        if dice_matches and dmg_types:
            damage_formula = f"{dice_matches[0]} {', '.join(dmg_types)} damage"
        elif dice_matches:
            damage_formula = f"{dice_matches[0]} ({school_name} effect)"
        elif dmg_types:
            damage_formula = f"{', '.join(dmg_types).title()} spell effect"
        elif nl := name.lower():
            if nl == "shield":
                damage_formula = "+5 AC until start of next turn; immune to Magic Missile"
            elif nl == "counterspell":
                damage_formula = "Interrupts spellcasting (CON save or spell fails)"
            else:
                damage_formula = f"{level_label} {school_name} effect"

        fluff_json_str, img_path, lore_text = extract_fluff_info(
            name, source_book, school_name, level_label, fluff_lookup
        )

        f_item = foundry_lookup.get((name.lower(), source_book.upper())) or foundry_lookup.get((name.lower(), "*"))
        foundry_json_str = json.dumps(f_item, ensure_ascii=False) if f_item else None

        c_info = class_lookup.get((name.lower(), source_book.upper())) or class_lookup.get((name.lower(), "*")) or {}
        class_list = []
        for c_entry in c_info.get("class", []) or []:
            if isinstance(c_entry, dict) and c_entry.get("name"):
                cn = str(c_entry["name"])
                if cn not in class_list:
                    class_list.append(cn)

        slug_name = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        slug_src = re.sub(r"[^a-z0-9]+", "-", source_book.lower()).strip("-")
        rule_id = f"spell-{slug_name}-{slug_src}"[:78]

        rule_dto = build_rule_dto_for_spell(
            spell_id_slug=rule_id,
            name=name,
            level=level,
            school_code=school_code,
            school_name=school_name,
            source_book=source_book,
            casting_time=casting_time,
            range_text=range_text,
            duration_text=duration_text,
            concentration=concentration,
            ritual=ritual,
            save_ability=save_ability,
            damage_formula=damage_formula,
            description=description,
            higher_levels=higher_levels,
            lore_text=lore_text,
            class_names=class_list,
            foundry_item=f_item,
        )
        core_rule_rows[rule_id] = rule_dto

        spell_rows.append(
            {
                "name": name,
                "level": level,
                "school": school_name,
                "school_code": school_code,
                "spell_type": spell_type,
                "image_path": img_path,
                "casting_time": casting_time,
                "range_text": range_text,
                "duration_text": duration_text,
                "concentration": 1 if concentration else 0,
                "ritual": 1 if ritual else 0,
                "save_ability": save_ability,
                "dice_json": json.dumps(dice_matches),
                "saving_throw_json": json.dumps(saving_throws),
                "damage_inflict_json": json.dumps(dmg_types),
                "scaling_level_dice_json": json.dumps(sp.get("scalingLevelDice")) if sp.get("scalingLevelDice") else None,
                "misc_tags_json": json.dumps(sp.get("miscTags") or []),
                "area_tags_json": json.dumps(sp.get("areaTags") or []),
                "components_json": json.dumps(sp.get("components") or {}),
                "description": description,
                "higher_levels": higher_levels,
                "source_book": source_book,
                "source_page": int(sp.get("page") or 0) if sp.get("page") else None,
                "raw_json": json.dumps(sp, ensure_ascii=False),
                "is_srd": 1 if sp.get("srd") or sp.get("srd52") else 0,
                "is_basic_rules": 1 if sp.get("basicRules") or sp.get("basicRules2024") else 0,
                "classes_json": json.dumps(class_list),
                "fluff_json": fluff_json_str,
                "foundry_json": foundry_json_str,
            }
        )

    print(f"Prepared {len(spell_rows)} canonical spell rows and {len(core_rule_rows)} ActionBuilder spell rules.")

    # Generate SQL script to run on server for both `jane_scrum` and `loomweaver`
    def sql_str(val):
        if val is None:
            return "NULL"
        s = str(val).replace("\\", "\\\\").replace("'", "\\'").replace("\r", "").replace("\n", "\\n")
        return f"'{s}'"

    sql_lines = [
        "SET NAMES utf8mb4;",
        "SET FOREIGN_KEY_CHECKS = 0;",
    ]

    for db_name in ("jane_scrum", "loomweaver"):
        sql_lines.append(f"USE `{db_name}`;")
        sql_lines.append(
            """
            CREATE TABLE IF NOT EXISTS `dnd_sources` (
              `id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
              `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
              `source_type` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `source_group` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `published` date DEFAULT NULL,
              `author` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `cover_type` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `cover_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """
        )
        sql_lines.append(
            """
            CREATE TABLE IF NOT EXISTS `dnd_spell_types` (
              `school_code` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
              `school_name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
              `spell_type_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
              `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
              `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`school_code`),
              UNIQUE KEY `uq_spell_type_name` (`school_name`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """
        )
        for scode, (sname, skey, sdesc) in SCHOOL_MAP.items():
            sql_lines.append(
                f"INSERT INTO `dnd_spell_types` (`school_code`, `school_name`, `spell_type_key`, `description`) "
                f"VALUES ({sql_str(scode)}, {sql_str(sname)}, {sql_str(skey)}, {sql_str(sdesc)}) "
                f"ON DUPLICATE KEY UPDATE `school_name`=VALUES(`school_name`), `description`=VALUES(`description`);"
            )

        for bid, b in books.items():
            pub = b.get("published")
            if pub and not re.match(r"^\d{4}-\d{2}-\d{2}$", str(pub)):
                pub = None
            sql_lines.append(
                f"INSERT INTO `dnd_sources` (`id`, `name`, `source_type`, `source_group`, `published`, `author`, `cover_type`, `cover_path`) "
                f"VALUES ({sql_str(bid)}, {sql_str(b.get('name'))}, {sql_str(b.get('source_type'))}, {sql_str(b.get('source_group'))}, "
                f"{sql_str(pub)}, {sql_str(b.get('author'))}, {sql_str(b.get('cover_type'))}, {sql_str(b.get('cover_path'))}) "
                f"ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `source_group`=VALUES(`source_group`), `author`=VALUES(`author`);"
            )

        sql_lines.append(
            """
            CREATE TABLE IF NOT EXISTS `dnd_spells` (
              `id` bigint unsigned NOT NULL AUTO_INCREMENT,
              `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
              `level` tinyint NOT NULL,
              `school` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `school_code` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `spell_type` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `image_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `casting_time` text COLLATE utf8mb4_unicode_ci,
              `range_text` text COLLATE utf8mb4_unicode_ci,
              `duration_text` text COLLATE utf8mb4_unicode_ci,
              `concentration` tinyint(1) NOT NULL DEFAULT '0',
              `ritual` tinyint(1) NOT NULL DEFAULT '0',
              `save_ability` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `dice_json` json DEFAULT NULL,
              `saving_throw_json` json DEFAULT NULL,
              `damage_inflict_json` json DEFAULT NULL,
              `scaling_level_dice_json` json DEFAULT NULL,
              `misc_tags_json` json DEFAULT NULL,
              `area_tags_json` json DEFAULT NULL,
              `scaling_json` json DEFAULT NULL,
              `components_json` json DEFAULT NULL,
              `description` mediumtext COLLATE utf8mb4_unicode_ci,
              `higher_levels` mediumtext COLLATE utf8mb4_unicode_ci,
              `is_homebrew` tinyint(1) NOT NULL DEFAULT '0',
              `author` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `owner_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              `source_book` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              `source_page` smallint DEFAULT NULL,
              `raw_json` json DEFAULT NULL,
              `is_srd` tinyint(1) NOT NULL DEFAULT '0',
              `is_basic_rules` tinyint(1) NOT NULL DEFAULT '0',
              `campaign_id` bigint DEFAULT NULL,
              `created_by_user_id` bigint DEFAULT NULL,
              `is_public` tinyint(1) NOT NULL DEFAULT '0',
              `classes_json` json DEFAULT NULL,
              `source_template_id` bigint DEFAULT NULL,
              `is_canonical` tinyint(1) NOT NULL DEFAULT '1',
              `fluff_json` longtext COLLATE utf8mb4_unicode_ci,
              `foundry_json` longtext COLLATE utf8mb4_unicode_ci,
              `campaign_scope_key` bigint GENERATED ALWAYS AS (coalesce(`campaign_id`,0)) STORED,
              PRIMARY KEY (`id`),
              UNIQUE KEY `uq_spell_name_owner` (`name`,`owner_id`),
              UNIQUE KEY `uq_spell_name_source` (`name`,`source_book`),
              KEY `idx_spells_source_book` (`source_book`),
              KEY `idx_spells_school_code` (`school_code`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """
        )

        # Ensure columns exist on existing dnd_spells table (mysql -f ignores duplicate column errors)
        sql_lines.append("ALTER TABLE `dnd_spells` ADD COLUMN `school_code` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL;")
        sql_lines.append("ALTER TABLE `dnd_spells` ADD COLUMN `spell_type` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL;")
        sql_lines.append("ALTER TABLE `dnd_spells` ADD COLUMN `foundry_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL;")

        # Clean up invalid row id=29 'Warlock' where school IS NULL and fix NULL source_book rows
        sql_lines.append("DELETE FROM `dnd_spells` WHERE `name` = 'Warlock' AND `school` IS NULL;")
        # Remove duplicate NULL source_book rows if a canonical row with source_book already exists
        sql_lines.append(
            """
            DELETE s1 FROM `dnd_spells` s1
            INNER JOIN `dnd_spells` s2 ON LOWER(s1.`name`) = LOWER(s2.`name`)
            WHERE s1.`source_book` IS NULL AND s2.`source_book` IS NOT NULL;
            """
        )
        for sp_lower, known_src in KNOWN_NULL_SPELL_SOURCES.items():
            sql_lines.append(
                f"UPDATE `dnd_spells` SET `source_book` = {sql_str(known_src)} WHERE LOWER(`name`) = {sql_str(sp_lower)} AND `source_book` IS NULL;"
            )
        sql_lines.append("UPDATE `dnd_spells` SET `source_book` = 'PHB' WHERE `source_book` IS NULL;")

        # Upsert all canonical spells
        for sr in spell_rows:
            sql_lines.append(
                f"INSERT INTO `dnd_spells` ("
                f"`name`, `level`, `school`, `school_code`, `spell_type`, `image_path`, `casting_time`, `range_text`, `duration_text`, "
                f"`concentration`, `ritual`, `save_ability`, `dice_json`, `saving_throw_json`, `damage_inflict_json`, "
                f"`scaling_level_dice_json`, `misc_tags_json`, `area_tags_json`, `components_json`, `description`, `higher_levels`, "
                f"`is_homebrew`, `author`, `owner_id`, `source_book`, `source_page`, `raw_json`, `is_srd`, `is_basic_rules`, "
                f"`is_public`, `classes_json`, `is_canonical`, `fluff_json`, `foundry_json`"
                f") VALUES ("
                f"{sql_str(sr['name'])}, {sr['level']}, {sql_str(sr['school'])}, {sql_str(sr['school_code'])}, {sql_str(sr['spell_type'])}, "
                f"{sql_str(sr['image_path'])}, {sql_str(sr['casting_time'])}, {sql_str(sr['range_text'])}, {sql_str(sr['duration_text'])}, "
                f"{sr['concentration']}, {sr['ritual']}, {sql_str(sr['save_ability'])}, {sql_str(sr['dice_json'])}, "
                f"{sql_str(sr['saving_throw_json'])}, {sql_str(sr['damage_inflict_json'])}, {sql_str(sr['scaling_level_dice_json'])}, "
                f"{sql_str(sr['misc_tags_json'])}, {sql_str(sr['area_tags_json'])}, {sql_str(sr['components_json'])}, "
                f"{sql_str(sr['description'])}, {sql_str(sr['higher_levels'])}, 0, 'Wizards of the Coast', NULL, "
                f"{sql_str(sr['source_book'])}, {sr['source_page'] if sr['source_page'] is not None else 'NULL'}, "
                f"{sql_str(sr['raw_json'])}, {sr['is_srd']}, {sr['is_basic_rules']}, 1, {sql_str(sr['classes_json'])}, 1, "
                f"{sql_str(sr['fluff_json'])}, {sql_str(sr['foundry_json'])}"
                f") ON DUPLICATE KEY UPDATE "
                f"`school`=VALUES(`school`), `school_code`=VALUES(`school_code`), `spell_type`=VALUES(`spell_type`), "
                f"`image_path`=COALESCE(VALUES(`image_path`), `image_path`), `source_book`=COALESCE(`source_book`, VALUES(`source_book`)), "
                f"`classes_json`=COALESCE(VALUES(`classes_json`), `classes_json`), "
                f"`fluff_json`=COALESCE(VALUES(`fluff_json`), `fluff_json`), "
                f"`foundry_json`=COALESCE(VALUES(`foundry_json`), `foundry_json`);"
            )

        # Normalize any remaining school/school_code/spell_type/fluff_json on legacy rows
        for scode, (sname, _, _) in SCHOOL_MAP.items():
            sql_lines.append(
                f"UPDATE `dnd_spells` SET `school` = {sql_str(sname)}, `school_code` = {sql_str(scode)} "
                f"WHERE LOWER(`school`) = {sql_str(sname.lower())};"
            )
        sql_lines.append(
            """
            UPDATE `dnd_spells`
            SET `spell_type` = CONCAT(
                CASE `level`
                    WHEN 0 THEN 'Cantrip'
                    WHEN 1 THEN '1st-Level'
                    WHEN 2 THEN '2nd-Level'
                    WHEN 3 THEN '3rd-Level'
                    ELSE CONCAT(`level`, 'th-Level')
                END,
                ' ',
                COALESCE(`school`, 'Evocation'),
                IF(`ritual` = 1, ' (Ritual)', '')
            )
            WHERE `spell_type` IS NULL;
            """
        )
        sql_lines.append(
            """
            UPDATE `dnd_spells`
            SET `fluff_json` = JSON_OBJECT('name', `name`, 'source', COALESCE(`source_book`, 'PHB'), 'entries', JSON_ARRAY(CONCAT(`name`, ' is a ', COALESCE(`spell_type`, 'spell'), ' from ', COALESCE(`source_book`, 'PHB'), '.')))
            WHERE `fluff_json` IS NULL;
            """
        )

        # Create/Replace view `v_dnd_spells_with_source` linking dnd_spells -> dnd_sources and dnd_spell_types
        sql_lines.append(
            f"""
            CREATE OR REPLACE VIEW `{db_name}`.`v_dnd_spells_with_source` AS
            SELECT
                sp.*,
                s.`name` AS `source_name`,
                s.`source_type` AS `source_type`,
                s.`source_group` AS `source_group`,
                s.`published` AS `source_published`,
                s.`author` AS `source_author`,
                st.`school_name` AS `linked_school_name`,
                st.`spell_type_key` AS `linked_spell_type_key`,
                st.`description` AS `linked_school_description`
            FROM `{db_name}`.`dnd_spells` sp
            LEFT JOIN `{db_name}`.`dnd_sources` s
                ON (sp.`source_book` COLLATE utf8mb4_unicode_ci) = (s.`id` COLLATE utf8mb4_unicode_ci)
            LEFT JOIN `{db_name}`.`dnd_spell_types` st
                ON (sp.`school_code` COLLATE utf8mb4_unicode_ci) = (st.`school_code` COLLATE utf8mb4_unicode_ci);
            """
        )

    # Populate `loomweaver.lw_engine_core_rules` with all spells
    sql_lines.append("USE `loomweaver`;")
    for rid, rdto in core_rule_rows.items():
        rjson = json.dumps(rdto, ensure_ascii=False)
        sql_lines.append(
            f"INSERT INTO `lw_engine_core_rules` (`rule_id`, `rule_code`, `name`, `category`, `ruleset_code`, `is_locked`, `rule_json`) "
            f"VALUES ({sql_str(rid)}, {sql_str(rdto['ruleCode'])}, {sql_str(rdto['name'])}, {sql_str(rdto['category'])}, "
            f"{sql_str(rdto['rulesetCode'])}, 1, {sql_str(rjson)}) "
            f"ON DUPLICATE KEY UPDATE `rule_code`=VALUES(`rule_code`), `name`=VALUES(`name`), `category`=VALUES(`category`), `rule_json`=VALUES(`rule_json`);"
        )

    sql_lines.append("SET FOREIGN_KEY_CHECKS = 1;")
    full_sql = "\n".join(sql_lines)

    print("Connecting to the production server to execute SQL migration "
          f"({len(sql_lines)} statements)...")
    ssh = env.connect()
    env.require("LW_DB_PASSWORD")
    cnf = "/tmp/.lw_mysql_app.cnf"
    env.put_mysql_cnf(ssh, cnf, MYSQL_USER, env.DB_PASSWORD)

    sftp = ssh.open_sftp()
    with sftp.file("/tmp/sync_5etools_spells.sql", "w") as rf:
        rf.write(full_sql)
    sftp.close()

    cmd = f"mysql --defaults-extra-file={cnf} -f < /tmp/sync_5etools_spells.sql && rm -f /tmp/sync_5etools_spells.sql"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    print("MYSQL OUT:", out)
    if err.strip():
        print("MYSQL STDERR:", err)

    verify_q = """
    SELECT 'jane_scrum.dnd_spells' AS tbl, COUNT(*) AS total, SUM(CASE WHEN source_book IS NULL THEN 1 ELSE 0 END) AS null_src, SUM(CASE WHEN fluff_json IS NULL THEN 1 ELSE 0 END) AS null_fluff FROM jane_scrum.dnd_spells
    UNION ALL
    SELECT 'loomweaver.dnd_spells', COUNT(*), SUM(CASE WHEN source_book IS NULL THEN 1 ELSE 0 END), SUM(CASE WHEN fluff_json IS NULL THEN 1 ELSE 0 END) FROM loomweaver.dnd_spells
    UNION ALL
    SELECT 'loomweaver.dnd_sources', COUNT(*), 0, 0 FROM loomweaver.dnd_sources
    UNION ALL
    SELECT 'loomweaver.dnd_spell_types', COUNT(*), 0, 0 FROM loomweaver.dnd_spell_types
    UNION ALL
    SELECT 'loomweaver.lw_engine_core_rules', COUNT(*), 0, 0 FROM loomweaver.lw_engine_core_rules;
    """
    stdin, stdout, stderr = ssh.exec_command(f"mysql --defaults-extra-file={cnf} -e \"{verify_q}\"")
    print("VERIFICATION:")
    print(stdout.read().decode("utf-8", errors="replace"))
    env.run(ssh, f"rm -f {cnf}", check=False)
    ssh.close()


if __name__ == "__main__":
    main()
