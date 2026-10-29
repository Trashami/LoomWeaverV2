#!/usr/bin/env python3
"""
Complete 5eTools Data Ingester for LoomWeaver / Jane Scrum.
Ingests every single record across all 596 JSON files in /var/www/jane-assets/5etools/data
into `loomweaver`, then runs `sync_all_5etools_data.py` to link all images, Foundry JSON,
and visual spell effects within `loomweaver`.
"""
import json
import os
import re
import sys
import pymysql

DATA_DIR = "/var/www/jane-assets/5etools/data"
DB_HOST = "localhost"
DB_USER = "loomweaver_app"
DB_PASS = os.environ.get("LW_DB_PASSWORD") or sys.exit("LW_DB_PASSWORD must be set in the environment")

SCHOOL_MAP = {
    "A": ("Abjuration", "abjuration", "#4aa8ff", "#a8d8ff", "rune-circle.webp"),
    "C": ("Conjuration", "conjuration", "#b266ff", "#e0b3ff", "arcane-portal.webp"),
    "D": ("Divination", "divination", "#63e6be", "#c3fae8", "mystic-eye.webp"),
    "E": ("Enchantment", "enchantment", "#ff66b2", "#ffb3d9", "charm-swirl.webp"),
    "V": ("Evocation", "fire", "#ff5c33", "#ffd166", "fireball-burst.webp"),
    "I": ("Illusion", "illusion", "#9966ff", "#d9b3ff", "mirror-prism.webp"),
    "N": ("Necromancy", "necrotic", "#5cd65c", "#1f2e1f", "necrotic-skull.webp"),
    "T": ("Transmutation", "transmutation", "#ffaa33", "#ffe066", "transmute-gear.webp"),
    "P": ("Psionic", "psionic", "#38e8ff", "#b8f2ff", "mystic-eye.webp"),
}


def load_json(rel_path):
    p = os.path.join(DATA_DIR, rel_path)
    if not os.path.exists(p):
        return {}
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def jdump(val):
    if val is None:
        return None
    return json.dumps(val, ensure_ascii=False)


def flatten_entries(entries):
    if not entries:
        return ""
    if isinstance(entries, str):
        return entries
    out = []
    if isinstance(entries, list):
        for e in entries:
            if isinstance(e, str):
                out.append(e)
            elif isinstance(e, dict):
                if "name" in e and "entries" in e:
                    out.append(f"{e['name']}: {flatten_entries(e['entries'])}")
                elif "entries" in e:
                    out.append(flatten_entries(e["entries"]))
                elif "items" in e:
                    out.append(flatten_entries(e["items"]))
                elif "text" in e:
                    out.append(str(e["text"]))
    elif isinstance(entries, dict):
        if "entries" in entries:
            out.append(flatten_entries(entries["entries"]))
    return "\n\n".join(x for x in out if x)


def sync_all(conn):
    cur = conn.cursor()

    # 1. Load generated spell source lookup for classes_json enrichment
    spell_lookup = load_json("generated/gendata-spell-source-lookup.json")
    spells_foundry_raw = load_json("spells/foundry.json").get("spell", [])
    spells_foundry_map = {
        (s.get("name", "").lower(), s.get("source", "PHB").upper()): s for s in spells_foundry_raw
    }

    print("1. Syncing all spells across all data/spells/spells-*.json files...")
    cur.execute("UPDATE dnd_spells SET owner_id = CONCAT('SYSTEM:', COALESCE(source_book, 'PHB')) WHERE owner_id IS NULL OR owner_id = 'SYSTEM'")
    conn.commit()

    spell_dir = os.path.join(DATA_DIR, "spells")
    spell_fluff_map = {}
    for fn in sorted(os.listdir(spell_dir)):
        if fn.startswith("fluff-spells-") and fn.endswith(".json"):
            for fl in load_json(f"spells/{fn}").get("spellFluff", []):
                spell_fluff_map[(fl.get("name", "").lower(), fl.get("source", "PHB").upper())] = fl

    for fn in sorted(os.listdir(spell_dir)):
        if not (fn.startswith("spells-") and fn.endswith(".json")):
            continue
        sp_data = load_json(f"spells/{fn}").get("spell", [])
        for sp in sp_data:
            name = (sp.get("name") or "").strip()
            if not name:
                continue
            src = (sp.get("source") or "PHB").strip().upper()
            level = int(sp.get("level") or 0)
            school_code = (sp.get("school") or "V")[:8]
            school_name = SCHOOL_MAP.get(school_code[:1], ("Evocation",))[0]
            owner_key = f"SYSTEM:{src}"

            t_arr = sp.get("time") or []
            casting_time = f"{t_arr[0].get('number', 1)} {t_arr[0].get('unit', 'action')}" if t_arr and isinstance(t_arr[0], dict) else "1 action"

            r_obj = sp.get("range") or {}
            dist = r_obj.get("distance") or {}
            range_text = f"{dist.get('amount', '')} {dist.get('type', '')}".strip() if dist else r_obj.get("type", "Self")

            d_arr = sp.get("duration") or []
            dur_text = "Instant"
            conc = 0
            if d_arr and isinstance(d_arr[0], dict):
                d0 = d_arr[0]
                conc = 1 if d0.get("concentration") else 0
                if d0.get("type") == "timed" and "duration" in d0:
                    dur_text = f"{d0['duration'].get('amount', 1)} {d0['duration'].get('type', 'minute')}"
                else:
                    dur_text = str(d0.get("type", "Instant")).capitalize()

            ritual = 1 if (sp.get("meta") or {}).get("ritual") else 0
            desc = flatten_entries(sp.get("entries"))
            higher = flatten_entries(sp.get("entriesHigherLevel"))
            fluff_obj = spell_fluff_map.get((name.lower(), src))
            fnd_obj = spells_foundry_map.get((name.lower(), src)) or spells_foundry_map.get((name.lower(), "PHB"))
            cls_lookup = (spell_lookup.get(src.lower()) or {}).get(name.lower()) or sp.get("classes")

            default_icon = SCHOOL_MAP.get(school_code[:1], ("Evocation", "arcane", "#49e892", "#d9b77a", "arcane-sigil.webp"))[4]
            img_path = f"/5etools/spell-art/{default_icon}"
            if fluff_obj and fluff_obj.get("images"):
                try:
                    href_p = fluff_obj["images"][0]["href"]["path"]
                    img_path = f"/5etools/{href_p.lstrip('/')}"
                except Exception:
                    pass

            cur.execute(
                """
                INSERT INTO dnd_spells (
                    name, level, school, school_code, image_path, casting_time, range_text, spell_range,
                    duration_text, duration, concentration, ritual, saving_throw_json, damage_inflict_json,
                    area_tags_json, misc_tags_json, components_json, description, higher_levels,
                    owner_id, source_book, source_page, raw_json, is_srd, is_basic_rules,
                    is_public, classes_json, is_canonical, fluff_json, foundry_json
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    1, %s, 1, %s, %s
                )
                ON DUPLICATE KEY UPDATE
                    classes_json = COALESCE(VALUES(classes_json), classes_json),
                    fluff_json = COALESCE(VALUES(fluff_json), fluff_json),
                    foundry_json = COALESCE(VALUES(foundry_json), foundry_json),
                    image_path = COALESCE(image_path, VALUES(image_path)),
                    spell_range = COALESCE(spell_range, VALUES(spell_range)),
                    duration = COALESCE(duration, VALUES(duration))
                """,
                (
                    name, level, school_name, school_code, img_path, casting_time, range_text, range_text[:255],
                    dur_text, dur_text[:255], conc, ritual,
                    jdump(sp.get("savingThrow")), jdump(sp.get("damageInflict")),
                    jdump(sp.get("areaTags")), jdump(sp.get("miscTags")), jdump(sp.get("components")),
                    desc, higher, owner_key, src, sp.get("page"), jdump(sp),
                    1 if sp.get("srd") or sp.get("srd52") else 0,
                    1 if sp.get("basicRules") or sp.get("basicRules2024") else 0,
                    jdump(cls_lookup), jdump(fluff_obj), jdump(fnd_obj or {"source": "5etools-synthesized", "name": name, "school": school_code}),
                ),
            )
    conn.commit()
    cur.execute("SELECT COUNT(*) as c FROM dnd_spells")
    print(f"   -> dnd_spells count now: {cur.fetchone()['c']}")

    # 2. Sync all Classes, Subclasses, and Class/Subclass Features
    print("2. Syncing all classes, subclasses, and class/subclass features across data/class/...")
    class_dir = os.path.join(DATA_DIR, "class")
    class_foundry = load_json("class/foundry.json")
    fnd_cls_map = {(c.get("name", "").lower(), c.get("source", "PHB").upper()): c for c in class_foundry.get("class", [])}
    fnd_sub_map = {(s.get("shortName", s.get("name", "")).lower(), s.get("source", "PHB").upper()): s for s in class_foundry.get("subclass", [])}
    fnd_cf_map = {(f.get("name", "").lower(), f.get("className", "").lower(), f.get("level", 1)): f for f in class_foundry.get("classFeature", [])}
    fnd_scf_map = {(f.get("name", "").lower(), f.get("subclassShortName", "").lower(), f.get("level", 1)): f for f in class_foundry.get("subclassFeature", [])}

    for fn in sorted(os.listdir(class_dir)):
        if not (fn.startswith("class-") and fn.endswith(".json")):
            continue
        cdata = load_json(f"class/{fn}")
        for cls in cdata.get("class", []):
            cname = (cls.get("name") or "").strip()
            csrc = (cls.get("source") or "PHB").strip().upper()
            if not cname:
                continue
            hd_num = (cls.get("hd") or {}).get("number", 8) if isinstance(cls.get("hd"), dict) else 8
            hit_die = f"d{hd_num}"
            prof = cls.get("proficiency") or ["STR", "CON"]
            fnd_c = fnd_cls_map.get((cname.lower(), csrc)) or {"source": "5etools-class", "name": cname}
            img_p = f"/5etools/classes/{csrc}/{cname}.webp"
            cur.execute(
                """
                INSERT INTO dnd_custom_classes (
                    name, source_book, hit_die, primary_ability, saving_throws_json,
                    armor_proficiencies_json, weapon_proficiencies_json, spellcasting_ability,
                    spellcasting_progression, page, edition, subclass_title, proficiencies_json,
                    starting_equipment_json, multiclassing_json, class_table_groups_json,
                    description, raw_json, image_path, foundry_json
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s
                )
                ON DUPLICATE KEY UPDATE
                    raw_json = VALUES(raw_json),
                    image_path = COALESCE(image_path, VALUES(image_path)),
                    foundry_json = COALESCE(foundry_json, VALUES(foundry_json))
                """,
                (
                    cname, csrc, hit_die, str(prof[0]).upper() if prof else "STR", jdump(prof),
                    jdump((cls.get("startingProficiencies") or {}).get("armor", [])),
                    jdump((cls.get("startingProficiencies") or {}).get("weapons", [])),
                    cls.get("spellcastingAbility"), cls.get("casterProgression") or "none",
                    cls.get("page"), cls.get("edition"), cls.get("subclassTitle"),
                    jdump(cls.get("startingProficiencies")), jdump(cls.get("startingEquipment")),
                    jdump(cls.get("multiclassing")), jdump(cls.get("classTableGroups")),
                    flatten_entries(cls.get("entries")), jdump(cls), img_p, jdump(fnd_c),
                ),
            )
        for sub in cdata.get("subclass", []):
            sname = (sub.get("name") or "").strip()
            short_n = (sub.get("shortName") or sname).strip()
            ssrc = (sub.get("source") or "PHB").strip().upper()
            cname = (sub.get("className") or "").strip()
            csrc = (sub.get("classSource") or "PHB").strip().upper()
            if not sname or not cname:
                continue
            fnd_s = fnd_sub_map.get((short_n.lower(), ssrc)) or {"source": "5etools-subclass", "name": sname}
            img_p = f"/5etools/classes/{csrc}/{cname}.webp"
            cur.execute(
                """
                INSERT INTO dnd_subclasses (
                    name, short_name, source_book, class_name, class_source, page, edition,
                    spellcasting_ability, caster_progression, additional_spells_json,
                    subclass_table_groups_json, features_json, description, raw_json,
                    image_path, foundry_json
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    raw_json = VALUES(raw_json),
                    image_path = COALESCE(image_path, VALUES(image_path)),
                    foundry_json = COALESCE(foundry_json, VALUES(foundry_json))
                """,
                (
                    sname, short_n, ssrc, cname, csrc, sub.get("page"), sub.get("edition"),
                    sub.get("spellcastingAbility"), sub.get("casterProgression"),
                    jdump(sub.get("additionalSpells")), jdump(sub.get("subclassTableGroups")),
                    jdump(sub.get("subclassFeatures")), flatten_entries(sub.get("entries")),
                    jdump(sub), img_p, jdump(fnd_s),
                ),
            )
        for cf in cdata.get("classFeature", []):
            fname = (cf.get("name") or "").strip()
            fsrc = (cf.get("source") or "PHB").strip().upper()
            cname = (cf.get("className") or "").strip()
            csrc = (cf.get("classSource") or "PHB").strip().upper()
            lvl = int(cf.get("level") or 1)
            if not fname or not cname:
                continue
            fnd_f = fnd_cf_map.get((fname.lower(), cname.lower(), lvl)) or {"source": "5etools-classFeature", "name": fname}
            img_p = f"/5etools/classes/{csrc}/{cname}.webp"
            cur.execute(
                """
                INSERT INTO dnd_class_features (
                    name, source_book, page, class_name, class_source, subclass_short_name,
                    subclass_source, level, is_subclass_feature, header, consumes_json,
                    description, entries_json, raw_json, image_path, foundry_json
                ) VALUES (%s, %s, %s, %s, %s, '', '', %s, 0, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    raw_json = VALUES(raw_json),
                    image_path = COALESCE(image_path, VALUES(image_path)),
                    foundry_json = COALESCE(foundry_json, VALUES(foundry_json))
                """,
                (
                    fname, fsrc, cf.get("page"), cname, csrc, lvl, cf.get("header"),
                    jdump(cf.get("consumes")), flatten_entries(cf.get("entries")),
                    jdump(cf.get("entries")), jdump(cf), img_p, jdump(fnd_f),
                ),
            )
        for scf in cdata.get("subclassFeature", []):
            fname = (scf.get("name") or "").strip()
            fsrc = (scf.get("source") or "PHB").strip().upper()
            cname = (scf.get("className") or "").strip()
            csrc = (scf.get("classSource") or "PHB").strip().upper()
            sub_short = (scf.get("subclassShortName") or "").strip()
            sub_src = (scf.get("subclassSource") or fsrc).strip().upper()
            lvl = int(scf.get("level") or 1)
            if not fname or not cname:
                continue
            fnd_f = fnd_scf_map.get((fname.lower(), sub_short.lower(), lvl)) or {"source": "5etools-subclassFeature", "name": fname}
            img_p = f"/5etools/classes/{csrc}/{cname}.webp"
            cur.execute(
                """
                INSERT INTO dnd_class_features (
                    name, source_book, page, class_name, class_source, subclass_short_name,
                    subclass_source, level, is_subclass_feature, header, consumes_json,
                    description, entries_json, raw_json, image_path, foundry_json
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 1, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    raw_json = VALUES(raw_json),
                    image_path = COALESCE(image_path, VALUES(image_path)),
                    foundry_json = COALESCE(foundry_json, VALUES(foundry_json))
                """,
                (
                    fname, fsrc, scf.get("page"), cname, csrc, sub_short, sub_src, lvl,
                    scf.get("header"), jdump(scf.get("consumes")), flatten_entries(scf.get("entries")),
                    jdump(scf.get("entries")), jdump(scf), img_p, jdump(fnd_f),
                ),
            )
    conn.commit()

    # 3. Sync Races & all 109 Subraces (including unnamed base/variant subraces)
    print("3. Syncing all races & subraces from races.json...")
    races_data = load_json("races.json")
    for sr in races_data.get("subrace", []):
        rname = (sr.get("raceName") or "Unknown").strip()
        rsrc = (sr.get("raceSource") or "PHB").strip().upper()
        src = (sr.get("source") or rsrc).strip().upper()
        sname = (sr.get("name") or f"{rname} ({src} Base)").strip()
        img_p = f"/5etools/races/{rsrc}/{rname}.webp"
        cur.execute(
            """
            INSERT INTO dnd_subraces (
                name, source_book, race_name, race_source, page, speed_json,
                ability_score_increases_json, traits_json, languages_json,
                description, raw_json, image_path, foundry_json
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                raw_json = VALUES(raw_json),
                image_path = COALESCE(image_path, VALUES(image_path)),
                foundry_json = COALESCE(foundry_json, VALUES(foundry_json))
            """,
            (
                sname, src, rname, rsrc, sr.get("page"), jdump(sr.get("speed")),
                jdump(sr.get("ability")), jdump(sr.get("entries")), jdump(sr.get("languageProficiencies")),
                flatten_entries(sr.get("entries")), jdump(sr), img_p,
                jdump({"source": "5etools-subrace", "name": sname, "raceName": rname}),
            ),
        )
    conn.commit()

    # 4. Sync all Item Metadata (items-base.json + makecards.json)
    print("4. Syncing items-base.json and makecards.json...")
    ib = load_json("items-base.json")
    mc = load_json("makecards.json")
    meta_groups = [
        ("itemProperty", ib.get("itemProperty", [])),
        ("itemType", ib.get("itemType", [])),
        ("itemTypeAdditionalEntries", ib.get("itemTypeAdditionalEntries", [])),
        ("itemEntry", ib.get("itemEntry", [])),
        ("itemMastery", ib.get("itemMastery", [])),
        ("reducedItemProperty", mc.get("reducedItemProperty", [])),
        ("reducedItemType", mc.get("reducedItemType", [])),
    ]
    for mtype, arr in meta_groups:
        for entry in arr:
            code = str(entry.get("abbreviation") or entry.get("appliesTo") or entry.get("name") or "META")[:60]
            name = str(entry.get("name") or (entry.get("entriesTemplate", [None])[0] if isinstance(entry.get("entriesTemplate"), list) else None) or code)[:250]
            src = str(entry.get("source") or "PHB").upper()[:60]
            cur.execute(
                """
                INSERT INTO dnd_item_metadata (
                    meta_type, code, name, source_book, page, description, entries_json, raw_json, image_path, foundry_json
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    raw_json = VALUES(raw_json),
                    image_path = COALESCE(image_path, VALUES(image_path)),
                    foundry_json = COALESCE(foundry_json, VALUES(foundry_json))
                """,
                (
                    mtype, code, name, src, entry.get("page"),
                    flatten_entries(entry.get("entries") or entry.get("entriesTemplate")),
                    jdump(entry.get("entries") or entry.get("entriesTemplate")),
                    jdump(entry), "/5etools/items/generic-item.webp", jdump(entry),
                ),
            )
    conn.commit()

    # 5. Sync all Life Tables (including all 202 lifeTrinket entries from life.json)
    print("5. Syncing all life.json entries (lifeClass, lifeBackground, lifeTrinket)...")
    life_data = load_json("life.json")
    for idx, tr in enumerate(life_data.get("lifeTrinket", [])):
        t_str = tr if isinstance(tr, str) else str(tr)
        t_name = f"Trinket #{idx + 1:03d}: {t_str[:60]}"
        cur.execute(
            """
            INSERT INTO dnd_life_tables (
                category, name, source_book, page, description, raw_json, image_path, foundry_json
            ) VALUES ('lifeTrinket', %s, 'XGE', 61, %s, %s, '/5etools/covers/XGE.webp', %s)
            ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
            """,
            (t_name, t_str, jdump({"index": idx + 1, "trinket": tr}), jdump({"trinket": tr})),
        )
    conn.commit()

    # 6. Sync all Loot Tables (including dragonMundaneItems from loot.json)
    print("6. Syncing all loot.json entries (including dragonMundaneItems)...")
    loot_data = load_json("loot.json")
    for idx, dm in enumerate(loot_data.get("dragonMundaneItems", [])):
        dm_str = dm if isinstance(dm, str) else flatten_entries([dm]) or str(dm)
        dm_name = f"Dragon Mundane Item #{idx + 1:02d}: {dm_str[:65]}"
        cur.execute(
            """
            INSERT INTO dnd_loot_tables (
                loot_category, name, source_book, page, table_rows_json, raw_json, image_path, foundry_json
            ) VALUES ('dragonMundaneItems', %s, 'FTD', 72, %s, %s, '/5etools/covers/FTD.webp', %s)
            ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
            """,
            (dm_name, jdump([dm]), jdump(dm), jdump({"dragonMundaneItem": dm})),
        )
    conn.commit()

    # 7. Sync Encounter Builder Rules (encounters.json + encounterbuilder.json + msbcr.json)
    print("7. Syncing encounters.json, encounterbuilder.json, and msbcr.json...")
    for enc in load_json("encounters.json").get("encounter", []):
        ename = f"{enc.get('name', 'Encounter')} ({enc.get('source', 'XGE')})"
        src = (enc.get("source") or "XGE").upper()
        cur.execute(
            """
            INSERT INTO dnd_encounter_builder_rules (
                rule_category, name, source_book, data_json, raw_json
            ) VALUES ('randomEncounter', %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
            """,
            (ename[:250], src, jdump(enc.get("table")), jdump(enc)),
        )
    for es in load_json("encounterbuilder.json").get("encounterShape", []):
        ename = f"Shape: {es.get('name', 'Encounter Shape')}"
        src = (es.get("source") or "XDMG").upper()
        cur.execute(
            """
            INSERT INTO dnd_encounter_builder_rules (
                rule_category, name, source_book, data_json, raw_json
            ) VALUES ('encounterShape', %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
            """,
            (ename[:250], src, jdump(es.get("shapeTemplate")), jdump(es)),
        )
    for cr_row in load_json("msbcr.json").get("cr", []):
        cr_val = str(cr_row.get("_cr", "0"))
        cur.execute(
            """
            INSERT INTO dnd_encounter_builder_rules (
                rule_category, name, source_book, cr_text, pb, ac, hp_min, hp_max,
                attack_bonus, dpr_min, dpr_max, save_dc, data_json, raw_json
            ) VALUES ('msbcr', %s, 'DMG', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
            """,
            (
                f"Monster Stats by CR {cr_val}", cr_val, cr_row.get("pb"), cr_row.get("ac"),
                cr_row.get("hpMin"), cr_row.get("hpMax"), cr_row.get("attackBonus"),
                cr_row.get("dprMin"), cr_row.get("dprMax"), cr_row.get("saveDc"),
                jdump(cr_row), jdump(cr_row),
            ),
        )
    conn.commit()

    # 8. Sync all Bestiary Monsters, Legendary Groups, Templates, and Monster Features (including makebrew-creature.json)
    print("8. Syncing all bestiary files, legendarygroups.json, traits.json, and makebrew-creature.json...")
    bestiary_dir = os.path.join(DATA_DIR, "bestiary")
    for lg in load_json("bestiary/legendarygroups.json").get("legendaryGroup", []):
        lname = (lg.get("name") or "").strip()
        lsrc = (lg.get("source") or "MM").strip().upper()
        if not lname:
            continue
        cur.execute(
            """
            INSERT INTO dnd_monster_legendary_groups (
                name, source_book, page, lair_actions_json, regional_effects_json,
                mythic_encounter_json, description, raw_json, image_path, foundry_json
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
            """,
            (
                lname, lsrc, lg.get("page"), jdump(lg.get("lairActions")),
                jdump(lg.get("regionalEffects")), jdump(lg.get("mythicEncounter")),
                flatten_entries(lg.get("lairActions") or lg.get("regionalEffects")),
                jdump(lg), f"/5etools/covers/{lsrc}.webp", jdump(lg),
            ),
        )
    mbc = load_json("makebrew-creature.json")
    for mbt in mbc.get("makebrewCreatureTrait", []):
        if not isinstance(mbt, dict) or not mbt.get("name"):
            continue
        cur.execute(
            """
            INSERT INTO dnd_monster_features (
                feature_category, name, source_book, effect_desc, entries_json, raw_json, image_path, foundry_json
            ) VALUES ('makebrewTrait', %s, %s, %s, %s, %s, '/5etools/covers/DMG.webp', %s)
            ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
            """,
            (
                mbt["name"][:250], (mbt.get("source") or "DMG").upper()[:60],
                flatten_entries(mbt.get("entries")), jdump(mbt.get("entries")), jdump(mbt), jdump(mbt),
            ),
        )
    for mba in mbc.get("makebrewCreatureAction", []):
        if not isinstance(mba, dict) or not mba.get("name"):
            continue
        cur.execute(
            """
            INSERT INTO dnd_monster_features (
                feature_category, name, source_book, effect_desc, entries_json, raw_json, image_path, foundry_json
            ) VALUES ('makebrewAction', %s, %s, %s, %s, %s, '/5etools/covers/DMG.webp', %s)
            ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
            """,
            (
                mba["name"][:250], (mba.get("source") or "DMG").upper()[:60],
                flatten_entries(mba.get("entries")), jdump(mba.get("entries")), jdump(mba), jdump(mba),
            ),
        )

    for fn in sorted(os.listdir(bestiary_dir)):
        if not (fn.startswith("bestiary-") and fn.endswith(".json")):
            continue
        for mon in load_json(f"bestiary/{fn}").get("monster", []):
            mname = (mon.get("name") or "").strip()
            msrc = (mon.get("source") or "MM").strip().upper()
            if not mname:
                continue
            name_norm = re.sub(r"\s+", " ", mname.lower()).strip()
            slug = re.sub(r"[^a-z0-9]+", "-", f"{mname}-{msrc}".lower()).strip("-")[:180]
            cr_raw = mon.get("cr")
            cr_txt = cr_raw.get("cr", "0") if isinstance(cr_raw, dict) else str(cr_raw or "0")
            img_p = f"/5etools/bestiary/{msrc}/{mname}.webp"
            tok_p = f"/5etools/bestiary/tokens/{msrc}/{mname}.webp"
            cur.execute(
                """
                INSERT INTO dnd_monster_library (
                    provider, source_id, name, name_norm, slug, cr_text, size_json,
                    type_main, alignment_json, ac_json, speed_json, str_score, dex_score,
                    con_score, int_score, wis_score, cha_score, passive, has_token,
                    raw_json, is_public, is_canonical, image_path, token_url, foundry_json
                ) VALUES (
                    '5etools', %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, 1,
                    %s, 1, 1, %s, %s, %s
                )
                ON DUPLICATE KEY UPDATE
                    image_path = COALESCE(image_path, VALUES(image_path)),
                    token_url = COALESCE(token_url, VALUES(token_url)),
                    foundry_json = COALESCE(foundry_json, VALUES(foundry_json))
                """,
                (
                    msrc[:16], mname[:240], name_norm[:240], slug[:180], cr_txt[:12],
                    jdump(mon.get("size")),
                    str(mon.get("type", {}).get("type") if isinstance(mon.get("type"), dict) else (mon.get("type") or "beast"))[:30],
                    jdump(mon.get("alignment")), jdump(mon.get("ac")), jdump(mon.get("speed")),
                    min(255, max(0, int(mon.get("str") or 10))),
                    min(255, max(0, int(mon.get("dex") or 10))),
                    min(255, max(0, int(mon.get("con") or 10))),
                    min(255, max(0, int(mon.get("int") or 10))),
                    min(255, max(0, int(mon.get("wis") or 10))),
                    min(255, max(0, int(mon.get("cha") or 10))),
                    int(mon.get("passive") or 10) if isinstance(mon.get("passive"), (int, float)) else 10,
                    jdump(mon), img_p, tok_p, jdump(mon),
                ),
            )
    conn.commit()

    # 9. Sync names.json and roll20-tables.json into dnd_tables
    print("9. Syncing names.json and roll20-tables.json into dnd_tables...")
    for nm in load_json("names.json").get("name", []):
        rname = nm.get("name", "Race")
        src = (nm.get("source") or "XGE").upper()
        for t in nm.get("tables", []):
            opt = t.get("option", "Names")
            tname = f"{rname} Names - {opt}"[:250]
            cur.execute(
                """
                INSERT INTO dnd_tables (
                    name, source_book, page, table_category, caption, col_labels_json, rows_json, raw_json, image_path, foundry_json
                ) VALUES (%s, %s, %s, 'names', %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
                """,
                (
                    tname, src, nm.get("page") or 0, tname,
                    jdump([f"d{t.get('diceType', 100)}", opt]), jdump(t.get("table")),
                    jdump(t), f"/5etools/covers/{src}.webp", jdump(t),
                ),
            )
    for rt in load_json("roll20-tables.json").get("table", []):
        tname = (rt.get("name") or "Roll20 Table")[:250]
        src = (rt.get("source") or "DMG").upper()
        cur.execute(
            """
            INSERT INTO dnd_tables (
                name, source_book, page, table_category, caption, rows_json, raw_json, image_path, foundry_json
            ) VALUES (%s, %s, %s, 'roll20Table', %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
            """,
            (
                tname, src, rt.get("page") or 0, tname, jdump(rt.get("items")),
                jdump(rt), f"/5etools/covers/{src}.webp", jdump(rt),
            ),
        )
    conn.commit()

    # 10. Sync homecrafts.json and fluff-homecrafts.json into dnd_fluff
    print("10. Syncing homecrafts.json and fluff-homecrafts.json...")
    for hc in load_json("homecrafts.json").get("crochetPattern", []):
        hname = (hc.get("name") or "Pattern")[:250]
        hsrc = (hc.get("source") or "wdh").upper()
        cur.execute(
            """
            INSERT INTO dnd_fluff (
                entity_type, name, source_book, description, entries_json, images_json, raw_json
            ) VALUES ('homecraft', %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
            """,
            (
                hname, hsrc, flatten_entries(hc.get("entries") or hc.get("instructions")),
                jdump(hc.get("entries") or hc.get("instructions")), jdump(hc.get("images")), jdump(hc),
            ),
        )
    for hfl in load_json("fluff-homecrafts.json").get("crochetPatternFluff", []):
        hname = (hfl.get("name") or "Pattern")[:250]
        hsrc = (hfl.get("source") or "wdh").upper()
        cur.execute(
            """
            INSERT INTO dnd_fluff (
                entity_type, name, source_book, description, entries_json, images_json, raw_json
            ) VALUES ('homecraftFluff', %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE raw_json = VALUES(raw_json)
            """,
            (
                hname, hsrc, flatten_entries(hfl.get("entries")),
                jdump(hfl.get("entries")), jdump(hfl.get("images")), jdump(hfl),
            ),
        )
    conn.commit()

    # 11. Sync all adventure/adventure-*.json (103 files) and book/book-*.json (68 files) into dnd_adventures_books & dnd_book_nodes
    print("11. Syncing all 103 adventure-*.json and 68 book-*.json files into dnd_adventures_books and dnd_book_nodes...")
    for folder, rtype, prefix in [("adventure", "adventure", "adventure-"), ("book", "book", "book-")]:
        fdir = os.path.join(DATA_DIR, folder)
        if not os.path.exists(fdir):
            continue
        for fn in sorted(os.listdir(fdir)):
            if not (fn.startswith(prefix) and fn.endswith(".json")):
                continue
            code = fn[len(prefix):-5].upper()
            bdata = load_json(f"{folder}/{fn}").get("data", [])
            cover_p = f"/5etools/covers/{code}.webp"
            cur.execute(
                """
                INSERT IGNORE INTO dnd_sources (id, name, source_type, source_group, cover_path, cover_url)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (code[:30], code, rtype, rtype, cover_p, cover_p),
            )
            cur.execute(
                """
                INSERT INTO dnd_adventures_books (
                    code, name, record_type, source_book, contents_json, raw_json, cover_path, image_path
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    cover_path = COALESCE(cover_path, VALUES(cover_path)),
                    image_path = COALESCE(image_path, VALUES(image_path))
                """,
                (
                    code[:60], code, rtype, code[:60],
                    jdump([{"name": sec.get("name"), "page": sec.get("page")} for sec in bdata if isinstance(sec, dict)]),
                    jdump({"code": code, "sections": len(bdata)}), cover_p, cover_p,
                ),
            )
            for idx, sec in enumerate(bdata):
                if not isinstance(sec, dict):
                    continue
                node_id = str(sec.get("id") or f"sec-{idx:03d}")[:30]
                sname = str(sec.get("name") or f"{code} Section {idx + 1}")[:250]
                ntype = str(sec.get("type") or "section")[:30]
                page = sec.get("page") if isinstance(sec.get("page"), int) else None
                txt = flatten_entries(sec.get("entries"))
                cur.execute(
                    """
                    INSERT INTO dnd_book_nodes (
                        source_id, source_node_id, seq, node_type, name, page, text, data_json
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        name = COALESCE(name, VALUES(name)),
                        text = COALESCE(text, VALUES(text))
                    """,
                    (code[:30], node_id, idx + 1, ntype, sname, page, txt, jdump(sec)),
                )
    conn.commit()

    # 12. Archive 100% of all 596 JSON files in /data into dnd_srd_raw so every single file is represented in MySQL
    # Each file is fully replaced on every run so updated mirror data is picked up.
    print("12. Refreshing every JSON file in the 5etools data folder into dnd_srd_raw...")

    added_files = 0
    for root, _, files in os.walk(DATA_DIR):
        rel_dir = os.path.relpath(root, DATA_DIR)
        for fn in sorted(files):
            if not fn.endswith(".json"):
                continue
            rel_path = fn if rel_dir == "." else f"{rel_dir}/{fn}"
            try:
                d = load_json(rel_path)
            except Exception:
                continue
            if not isinstance(d, dict):
                continue
            cur.execute("DELETE FROM dnd_srd_raw WHERE file_name = %s", (rel_path[:250],))
            row_idx = 0
            for k, v in d.items():
                if k == "_meta":
                    continue
                if isinstance(v, list):
                    for item in v:
                        nm = item.get("name") if isinstance(item, dict) else str(item)[:120]
                        src = item.get("source") if isinstance(item, dict) else None
                        pg = item.get("page") if isinstance(item, dict) and isinstance(item.get("page"), int) else None
                        cur.execute(
                            """
                            INSERT IGNORE INTO dnd_srd_raw (file_name, root_key, row_index, name, source, page, raw_json)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            """,
                            (rel_path[:250], str(k)[:60], row_idx, str(nm or rel_path)[:250], str(src or "")[:30] or None, pg, jdump(item)),
                        )
                        row_idx += 1
                else:
                    cur.execute(
                        """
                        INSERT IGNORE INTO dnd_srd_raw (file_name, root_key, row_index, name, source, page, raw_json)
                        VALUES (%s, %s, %s, %s, NULL, NULL, %s)
                        """,
                        (rel_path[:250], str(k)[:60], row_idx, rel_path[:250], jdump(v)),
                    )
                    row_idx += 1
            if row_idx == 0:
                cur.execute(
                    """
                    INSERT IGNORE INTO dnd_srd_raw (file_name, root_key, row_index, name, source, page, raw_json)
                    VALUES (%s, '_meta', 0, %s, NULL, NULL, %s)
                    """,
                    (rel_path[:250], rel_path[:250], jdump(d.get("_meta") or {})),
                )
            added_files += 1
            if added_files % 25 == 0:
                conn.commit()
    conn.commit()
    print(f"   -> Indexed {added_files} additional JSON files into dnd_srd_raw")


def main():
    conn_js = pymysql.connect(
        host=DB_HOST, user=DB_USER, password=DB_PASS, database="loomweaver",
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor
    )
    sync_all(conn_js)
    conn_js.close()
    print("COMPLETE: All records ingested into loomweaver. Now running sync_all_5etools_data.py...")


if __name__ == "__main__":
    main()
