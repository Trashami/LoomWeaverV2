#!/usr/bin/env python3
"""Load the unloaded top-level 5etools JSON files into the loomweaver database.

The JSON files are the source of truth. Each entry is upserted by (name, source_book)
so row ids stay stable across re-runs. Dict and list fields go to <field>_json columns,
the full entry is kept in raw_json, and any JSON field without a column gets one added.
Rows missing from the JSON are reset to NULL in the columns this loader owns.

Also loads:
  - fluff-*.json entries into fluff_json on the matching rows
  - spells/sources.json into dnd_spell_source_lookup (spell -> class/classVariant relations)

Not loaded here, on purpose:
  - life.json: already in dnd_life_tables (lifeClass, lifeBackground, lifeTrinket).
  - decks.json: loaded by scripts/load_5etools_decks.py (dnd_decks, dnd_deck_cards, dnd_deck_card_refs).
  - items.json: dnd_items is already populated.
  - monsterfeatures.json: sample data with no source field.
  - books.json: source metadata (cover, author, published) is already in dnd_sources.

Writes only official rows (is_canonical = 1, owner_id NULL). Custom rows owned by users are never touched.

Apply scripts/migrations/20261103_dnd_5etools_extras.sql before the first run.

Usage:
  python scripts/sync_5etools_extras_to_sql.py --data-dir <path>/data
  python scripts/sync_5etools_extras_to_sql.py --data-dir <path>/data --dry-run

Environment: LW_DB_PASSWORD (required), LW_DB_HOST (default localhost), LW_DB_USER (default loomweaver_app).
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import pymysql

DEFAULT_DATA_DIR = "/var/www/jane-assets/5etools/data"
DB_NAME = "loomweaver"
KEY_COLUMNS = {"id", "name", "source_book", "page"}
SCOPE_CACHE = {}

# 5etools top-level JSON key -> loomweaver table.
ENTITY_TABLES = {
    "action": "dnd_actions",
    "background": "dnd_backgrounds",
    "facility": "dnd_bastions",
    "charoption": "dnd_char_creation_options",
    "condition": "dnd_conditions_diseases",
    "disease": "dnd_conditions_diseases",
    "status": "dnd_conditions_diseases",
    "cult": "dnd_cults_boons",
    "boon": "dnd_cults_boons",

    "deity": "dnd_deities",
    "feat": "dnd_feats",
    "language": "dnd_languages",
    "languageScript": "dnd_languages",
    "magicvariant": "dnd_magic_variants",
    "object": "dnd_objects",
    "optionalfeature": "dnd_optional_features",
    "psionic": "dnd_psionics",
    "recipe": "dnd_recipes",
    "reward": "dnd_rewards",
    "sense": "dnd_senses",
    "skill": "dnd_skills",
    "table": "dnd_tables",
    "trap": "dnd_traps_hazards",
    "hazard": "dnd_traps_hazards",
    "variantrule": "dnd_variant_rules",
    "vehicle": "dnd_vehicles",
    "vehicleUpgrade": "dnd_vehicles",
}

# Files this loader reads as entity sources. Foundry/Roll20 files are excluded on purpose.
ENTITY_FILES = [
    "actions.json", "backgrounds.json", "bastions.json", "charcreationoptions.json",
    "conditionsdiseases.json", "cultsboons.json", "deities.json", "feats.json",
    "languages.json", "magicvariants.json", "objects.json",
    "optionalfeatures.json", "psionics.json", "recipes.json", "rewards.json", "senses.json",
    "skills.json", "tables.json", "trapshazards.json", "variantrules.json", "vehicles.json",
]

# Data columns the loader never derives from a JSON field.
RESERVED = {"id", "name", "source_book", "page", "raw_json", "fluff_json", "created_at", "updated_at"}
IDENT_RE = re.compile(r"^[a-z][a-z0-9_]{0,62}$")
TYPE_RANK = {"BIGINT": 1, "DOUBLE": 2, "MEDIUMTEXT": 3, "LONGTEXT": 4}
SPELL_RELATIONS = ("class", "classVariant")


def qi(identifier):
    """Backtick-quote an identifier that has already been validated."""
    if not IDENT_RE.match(identifier):
        raise ValueError(f"unsafe identifier: {identifier!r}")
    return f"`{identifier}`"


def snake(key):
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key).replace("-", "_").lower()


def field_column(key, value):
    """Return the column for a JSON field, or None if it is handled elsewhere or unsafe.

    Dict and list values get a _json suffix so they match the existing *_json columns.
    """
    if key in ("name", "source", "page"):
        return None
    col = snake(key)
    if isinstance(value, (dict, list)):
        col = f"{col}_json"
    if not IDENT_RE.match(col) or col in RESERVED:
        return None
    return col


def column_type(value):
    if isinstance(value, (dict, list)):
        return "LONGTEXT"
    if isinstance(value, str):
        return "MEDIUMTEXT"
    if isinstance(value, float):
        return "DOUBLE"
    if isinstance(value, (bool, int)):
        return "BIGINT"
    return None


def to_db(value):
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, bool):
        return int(value)
    return value


def wanted_columns(entries):
    """Map each column used by these entries to the widest SQL type it needs."""
    types = {}
    for entry in entries:
        for key, value in entry.items():
            col = field_column(key, value)
            t = column_type(value) if value is not None else None
            if col is None or t is None:
                continue
            if col not in types or TYPE_RANK[t] > TYPE_RANK[types[col]]:
                types[col] = t
    return types


def read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def collect_entities(data_dir):
    """Return {table: {(name, source): entry}} plus a count of entries skipped for missing name/source."""
    by_table = defaultdict(dict)
    skipped_no_key = 0
    for filename in ENTITY_FILES:
        path = data_dir / filename
        if not path.exists():
            print(f"  [missing file] {filename}")
            continue
        data = read_json(path)
        for key, table in ENTITY_TABLES.items():
            entries = data.get(key)
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if key == "magicvariant" and "source" not in entry:
                    # Magic variants keep their source and page under "inherits".
                    inherits = entry.get("inherits") or {}
                    entry = {**entry, "source": inherits.get("source"), "page": inherits.get("page")}
                name, source = entry.get("name"), entry.get("source")
                if not isinstance(name, str) or not isinstance(source, str):
                    skipped_no_key += 1
                    continue
                by_table[table][(name, source)] = entry
    return by_table, skipped_no_key


def existing_tables(cur):
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()")
    return {row[0] for row in cur.fetchall()}


def existing_columns(cur, table):
    cur.execute(f"SHOW COLUMNS FROM {qi(table)}")
    return {row[0] for row in cur.fetchall()}


def ensure_columns(cur, table, wanted, report):
    cur.execute(f"SHOW COLUMNS FROM {qi(table)}")
    have = {row[0]: row for row in cur.fetchall()}
    added, relaxed = [], []
    for col, sql_type in sorted(wanted.items()):
        if col not in have:
            cur.execute(f"ALTER TABLE {qi(table)} ADD COLUMN {qi(col)} {sql_type} NULL")
            added.append(col)
        elif have[col][2] == "NO" and col not in KEY_COLUMNS:
            # Source JSON does not guarantee every field, so loader-written data columns must accept NULL.
            cur.execute(f"ALTER TABLE {qi(table)} MODIFY COLUMN {qi(col)} {have[col][1]} NULL")
            relaxed.append(col)
    if added:
        report.append(f"{table}: added columns {', '.join(added)}")
    if relaxed:
        report.append(f"{table}: relaxed NOT NULL on {', '.join(relaxed)}")


def unique_identity(cur, table, available):
    """Pick the live table's unique index that the loader can fully or partly populate, so upserts match the same row the DB enforces."""
    cur.execute(
        "SELECT index_name, column_name FROM information_schema.statistics "
        "WHERE table_schema = DATABASE() AND table_name = %s AND non_unique = 0 AND index_name <> 'PRIMARY' "
        "ORDER BY index_name, seq_in_index",
        (table,),
    )
    indexes = defaultdict(list)
    for index_name, column_name in cur.fetchall():
        indexes[index_name].append(column_name)
    best = ["name", "source_book"]
    for cols in indexes.values():
        usable = [c for c in cols if c in available]
        if "name" in usable and "source_book" in usable and len(usable) > len(best):
            best = usable
    return best


def official_scope(cur, table):
    if table not in SCOPE_CACHE:
        cur.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = %s",
            (table,),
        )
        columns = {row[0] for row in cur.fetchall()}
        SCOPE_CACHE[table] = " AND is_canonical = 1 AND owner_id IS NULL" if {"is_canonical", "owner_id"} <= columns else ""
    return SCOPE_CACHE[table]


def upsert_entity(cur, table, identity, columns, values):
    where = " AND ".join(f"{qi(c)} <=> %s" for c in identity) + official_scope(cur, table)
    cur.execute(f"SELECT id FROM {qi(table)} WHERE {where} LIMIT 1", [values[c] for c in identity])
    found = cur.fetchone()
    if found:
        assignments = ", ".join(f"{qi(c)} = %s" for c in columns)
        cur.execute(
            f"UPDATE {qi(table)} SET {assignments} WHERE id = %s",
            [values[c] for c in columns] + [found[0]],
        )
        return "updated"
    col_sql = ", ".join(qi(c) for c in ["name", "source_book", "page"] + columns)
    placeholders = ", ".join(["%s"] * (3 + len(columns)))
    cur.execute(
        f"INSERT INTO {qi(table)} ({col_sql}) VALUES ({placeholders})",
        [values["name"], values["source_book"], values["page"]] + [values[c] for c in columns],
    )
    return "inserted"


def load_entities(cur, by_table, known_sources, tables, report):
    stats = {}
    unknown_sources = defaultdict(int)
    for table, rows in sorted(by_table.items()):
        if table not in tables:
            report.append(f"{table}: table missing, skipped {len(rows)} entries (run the migration)")
            continue
        loadable = {}
        for (name, source), entry in rows.items():
            if source not in known_sources:
                unknown_sources[source] += 1
                continue
            loadable[(name, source)] = entry
        if not loadable:
            continue

        wanted = wanted_columns(loadable.values())
        ensure_columns(cur, table, wanted, report)
        columns = sorted(wanted)
        identity = unique_identity(cur, table, set(columns) | {"name", "source_book", "page"})
        counts = {"inserted": 0, "updated": 0}

        for (name, source), entry in loadable.items():
            values = {c: None for c in columns}
            for key, value in entry.items():
                col = field_column(key, value)
                if col in values and value is not None:
                    values[col] = to_db(value)
            page = entry.get("page")
            page = page if isinstance(page, int) else None
            values.update(name=name, source_book=source, page=page)
            values["raw_json"] = json.dumps(entry, ensure_ascii=False)
            counts[upsert_entity(cur, table, identity, columns + ["raw_json"], values)] += 1
        stats[table] = counts
    return stats, unknown_sources


def load_fluff(cur, data_dir, tables, report):
    matched = defaultdict(int)
    unmatched = defaultdict(int)
    for path in sorted(data_dir.glob("fluff-*.json")):
        for key, entries in read_json(path).items():
            if not key.endswith("Fluff") or not isinstance(entries, list):
                continue
            table = ENTITY_TABLES.get(key[: -len("Fluff")])
            if table is None or table not in tables:
                continue
            ensure_columns(cur, table, {"fluff_json": "LONGTEXT"}, report)
            for entry in entries:
                name, source = entry.get("name"), entry.get("source")
                if not isinstance(name, str) or not isinstance(source, str):
                    continue
                where = " WHERE name = %s AND source_book = %s" + official_scope(cur, table)
                cur.execute(f"SELECT COUNT(*) FROM {qi(table)}{where}", (name, source))
                found = cur.fetchone()[0]
                if found:
                    cur.execute(
                        f"UPDATE {qi(table)} SET fluff_json = %s{where}",
                        (json.dumps(entry, ensure_ascii=False), name, source),
                    )
                (matched if found else unmatched)[table] += 1
    return matched, unmatched


def load_spell_sources(cur, data_dir, known_sources, tables, report):
    path = data_dir / "spells" / "sources.json"
    if not path.exists():
        report.append("spells/sources.json missing, spell relations skipped")
        return 0, {}
    if "dnd_spell_source_lookup" not in tables or "dnd_spells" not in tables:
        report.append("dnd_spell_source_lookup or dnd_spells missing, spell relations skipped")
        return 0, {}

    cur.execute("SELECT id, name, source_book FROM dnd_spells")
    spell_ids = {(source, name): sid for sid, name, source in cur.fetchall()}

    inserted = 0
    unknown_sources = defaultdict(int)
    for spell_source, spells in read_json(path).items():
        if spell_source not in known_sources:
            unknown_sources[spell_source] += 1
            continue
        cur.execute("DELETE FROM dnd_spell_source_lookup WHERE spell_source = %s", (spell_source,))
        for spell_name, relations in spells.items():
            spell_id = spell_ids.get((spell_source, spell_name))
            for relation_type in SPELL_RELATIONS:
                for related in relations.get(relation_type) or []:
                    related_name, related_source = related.get("name"), related.get("source")
                    if not related_name or not related_source:
                        continue
                    cur.execute(
                        "INSERT IGNORE INTO dnd_spell_source_lookup "
                        "(spell_source, spell_name, spell_id, relation_type, related_name, related_source) "
                        "VALUES (%s, %s, %s, %s, %s, %s)",
                        (spell_source, spell_name, spell_id, relation_type, related_name, related_source),
                    )
                    inserted += cur.rowcount
    return inserted, unknown_sources


def print_summary(title, lines):
    print(f"\n{title}")
    for line in lines:
        print(f"  {line}")


def run_dry(data_dir):
    by_table, skipped = collect_entities(data_dir)
    lines = [f"{table}: {len(rows)} entries" for table, rows in sorted(by_table.items())]
    print_summary("Dry run: entries found per table", lines)
    print(f"  skipped without name/source: {skipped}")



def run_load(data_dir):
    password = os.environ.get("LW_DB_PASSWORD")
    if not password:
        sys.exit("LW_DB_PASSWORD must be set in the environment")

    by_table, skipped = collect_entities(data_dir)
    report = []
    conn = pymysql.connect(
        host=os.environ.get("LW_DB_HOST", "localhost"),
        user=os.environ.get("LW_DB_USER", "loomweaver_app"),
        password=password,
        database=DB_NAME,
        charset="utf8mb4",
        autocommit=False,
    )
    try:
        with conn.cursor() as cur:
            tables = existing_tables(cur)
            cur.execute("SELECT id FROM dnd_sources")
            known_sources = {row[0] for row in cur.fetchall()}

            stats, unknown = load_entities(cur, by_table, known_sources, tables, report)
            matched, unmatched = load_fluff(cur, data_dir, tables, report)
            spell_rows, spell_unknown = load_spell_sources(cur, data_dir, known_sources, tables, report)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print_summary(
        "Entities (inserted / updated)",
        [f"{t}: {c['inserted']} / {c['updated']}" for t, c in sorted(stats.items())],
    )
    print_summary(
        "Fluff merged (matched / unmatched)",
        [f"{t}: {matched[t]} / {unmatched[t]}" for t in sorted(set(matched) | set(unmatched))],
    )
    print_summary("Spell relations inserted", [str(spell_rows)])
    print_summary(
        "Skipped: source not in dnd_sources (entries / spell sources)",
        [f"{s}: {n}" for s, n in sorted(unknown.items())]
        + [f"spells/{s}: {n}" for s, n in sorted(spell_unknown.items())]
        or ["none"],
    )
    print(f"  skipped without name/source: {skipped}")
    print_summary("Notes", report or ["none"])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR, help="path to the 5etools data folder")
    parser.add_argument("--dry-run", action="store_true", help="parse JSON and report counts without touching MySQL")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.is_dir():
        sys.exit(f"data dir not found: {data_dir}")

    if args.dry_run:
        run_dry(data_dir)
    else:
        run_load(data_dir)


if __name__ == "__main__":
    main()
