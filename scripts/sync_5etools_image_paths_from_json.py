"""Set loomweaver image_path values from the 5etools JSON source of truth.

The JSON declares images per entity (fluff-*.json `images[].href.path`, and
decks.json `back.href.path`), keyed by name + source. For every dnd_* table that
has name, image_path and a source column (source_book or source_id), this sets:

    image_path = "/5etools/" + <declared path>

only when the declared file exists under the image folder. Declared files that
are absent from the release are reported, never guessed. Rows without a
declaration keep their current value and are reported.

Dry run by default; pass --apply to write.

Environment: LW_DB_PASSWORD (required), LW_DB_HOST (default localhost),
LW_DB_USER (default loomweaver_app).

Usage (on the server):
    python3 sync_5etools_image_paths_from_json.py \
        --data /var/www/jane-assets/5etools/data \
        --img /var/www/jane-assets/5etools/img [--apply]
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from pathlib import Path

import pymysql

DB_NAME = "loomweaver"
PREFIX = "/5etools/"
SOURCE_COLUMNS = ("source_book", "source_id")
DECK_FILE = "decks.json"
JSON_OWNED_TABLES = {"dnd_deck_cards"}


def iter_entities(node):
    """Yield every dict that carries both name and source, at any depth."""
    if isinstance(node, dict):
        if "name" in node and "source" in node:
            yield node
        for value in node.values():
            yield from iter_entities(value)
    elif isinstance(node, list):
        for value in node:
            yield from iter_entities(value)


def declared_paths(entity: dict):
    """Internal image paths declared by one entity, in JSON order."""
    holders = list(entity.get("images") or [])
    if isinstance(entity.get("back"), dict):
        holders.append(entity["back"])
    for holder in holders:
        href = holder.get("href") if isinstance(holder, dict) else None
        if isinstance(href, dict) and href.get("type") == "internal" and href.get("path"):
            yield href["path"]


def load_declarations(data_root: Path, img_root: Path):
    """Map (lower name, source) -> first declared path that exists on disk.

    Also returns the declared-but-absent paths so they can be reported.
    """
    resolved: dict[tuple[str, str], str] = {}
    absent: Counter = Counter()
    files = sorted(data_root.rglob("fluff-*.json")) + [data_root / DECK_FILE]
    for path in files:
        if not path.is_file():
            continue
        with path.open(encoding="utf-8") as handle:
            doc = json.load(handle)
        for entity in iter_entities(doc):
            key = (str(entity["name"]).strip().lower(), str(entity["source"]).strip())
            for rel in declared_paths(entity):
                if (img_root / rel).is_file():
                    resolved.setdefault(key, rel)
                    break
                absent[rel] += 1
    return resolved, absent


def target_tables(cur) -> list[tuple[str, str]]:
    """(table, source column) for every dnd_* table with name + image_path + source.

    dnd_deck_cards is excluded: its image_path is the card's own face from decks.json
    (set by load_5etools_decks.py). Name-keyed resolution would pick a fluff back image.
    """
    cur.execute(
        "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'dnd\\_%' "
        "AND COLUMN_NAME IN ('name', 'image_path', 'source_book', 'source_id') "
        "ORDER BY TABLE_NAME"
    )
    columns: dict[str, set[str]] = {}
    for table, column in cur.fetchall():
        columns.setdefault(table, set()).add(column)
    tables = []
    for table, cols in sorted(columns.items()):
        if table in JSON_OWNED_TABLES:
            continue
        if {"name", "image_path"} <= cols:
            source = next((c for c in SOURCE_COLUMNS if c in cols), None)
            if source:
                tables.append((table, source))
    return tables


def sync(cur, resolved, img_root: Path, apply: bool, clear_undeclared: bool):
    report = Counter()
    pending: list[tuple[str, int, str | None]] = []
    for table, source in target_tables(cur):
        cur.execute(f"SELECT id, name, `{source}`, image_path FROM `{table}`")
        for row_id, name, src, current in cur.fetchall():
            key = (str(name or "").strip().lower(), str(src or "").strip())
            rel = resolved.get(key)
            if rel is None:
                if current and not current.startswith(PREFIX):
                    report[f"{table}: kept non-5etools value"] += 1
                elif current and (img_root / current[len(PREFIX):]).is_file():
                    report[f"{table}: kept undeclared file on disk"] += 1
                elif current and clear_undeclared:
                    report[f"{table}: cleared undeclared broken value"] += 1
                    pending.append((table, row_id, None))
                elif current:
                    report[f"{table}: undeclared broken value (kept)"] += 1
                else:
                    report[f"{table}: no declared image"] += 1
                continue
            wanted = PREFIX + rel
            if current == wanted:
                report[f"{table}: already correct"] += 1
                continue
            report[f"{table}: set"] += 1
            pending.append((table, row_id, wanted))

    if apply:
        for table, row_id, wanted in pending:
            cur.execute(f"UPDATE `{table}` SET image_path = %s WHERE id = %s", (wanted, row_id))
    return report, len(pending)


def fix_tokens_and_covers(cur, img_root: Path, apply: bool) -> Counter:
    """Monster tokens follow bestiary/tokens/<SOURCE>/<name>.webp; covers have no declaration.

    A token is set only when its convention path exists; a cover or token that
    does not exist on disk is NULLed. Values that exist on disk are kept.
    """
    report: Counter = Counter()
    cur.execute("SELECT id, name, source_id, token_url FROM dnd_monster_library")
    for row_id, name, src, token in cur.fetchall():
        rel = f"bestiary/tokens/{src}/{name}.webp"
        if (img_root / rel).is_file():
            wanted = PREFIX + rel
        elif token and (img_root / token[len(PREFIX):]).is_file():
            continue
        else:
            wanted = None
        if wanted != token:
            report["dnd_monster_library.token_url: set" if wanted else "dnd_monster_library.token_url: cleared"] += 1
            if apply:
                cur.execute("UPDATE dnd_monster_library SET token_url = %s WHERE id = %s", (wanted, row_id))
    for table, key in (("dnd_sources", "id"), ("dnd_adventures_books", "code")):
        cur.execute(f"SELECT `{key}`, cover_path FROM `{table}` WHERE cover_path IS NOT NULL")
        for row_key, cover in cur.fetchall():
            if not cover.startswith(PREFIX) or (img_root / cover[len(PREFIX):]).is_file():
                continue
            report[f"{table}.cover_path: cleared"] += 1
            if apply:
                cur.execute(f"UPDATE `{table}` SET cover_path = NULL WHERE `{key}` = %s", (row_key,))
    return report


ENTITY_IMAGE_QUERIES = [
    ("source", "SELECT id AS eid, cover_path AS url, name AS label FROM dnd_sources WHERE cover_path IS NOT NULL"),
    ("adventure_book", "SELECT code AS eid, cover_path AS url, name AS label FROM dnd_adventures_books WHERE cover_path IS NOT NULL"),
    ("spell", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_spells WHERE image_path IS NOT NULL"),
    ("item", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_items WHERE image_path IS NOT NULL"),
    ("monster", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_monster_library WHERE image_path IS NOT NULL"),
    ("monster_token", "SELECT CAST(id AS CHAR) AS eid, token_url AS url, name AS label FROM dnd_monster_library WHERE token_url IS NOT NULL"),
    ("class", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_custom_classes WHERE image_path IS NOT NULL"),
    ("subclass", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_subclasses WHERE image_path IS NOT NULL"),
    ("species", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_custom_species WHERE image_path IS NOT NULL"),
    ("subrace", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_subraces WHERE image_path IS NOT NULL"),
    ("background", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label     FROM dnd_backgrounds WHERE image_path IS NOT NULL"),
        ("feat", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_feats WHERE image_path IS NOT NULL"),
    ("deck", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_decks WHERE image_path IS NOT NULL"),
    ("deck_card", "SELECT CAST(id AS CHAR) AS eid, face_image_url AS url, name AS label FROM dnd_deck_cards WHERE face_image_url IS NOT NULL"),
    ("deity", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_deities WHERE image_path IS NOT NULL"),
    ("condition", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_conditions_diseases WHERE image_path IS NOT NULL"),
    ("bastion", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_bastions WHERE image_path IS NOT NULL"),
    ("vehicle", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_vehicles WHERE image_path IS NOT NULL"),
]


def rebuild_entity_images(cur) -> int:
    """Re-derive 5etools rows of dnd_entity_images from the corrected image columns."""
    cur.execute("DELETE FROM dnd_entity_images WHERE source_type = '5etools'")
    total = 0
    for etype, query in ENTITY_IMAGE_QUERIES:
        cur.execute(query)
        rows = [(etype, str(eid)[:100], str(url)[:500], str(label or "")[:250])
                for eid, url, label in cur.fetchall() if url]
        if rows:
            cur.executemany(
                "INSERT INTO dnd_entity_images (entity_type, entity_id, image_url, prompt, source_type, is_selected, created_by) "
                "VALUES (%s, %s, %s, %s, '5etools', 1, '5etools')",
                rows,
            )
        total += len(rows)
    return total


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", required=True, type=Path, help="5etools data folder (JSON source of truth)")
    parser.add_argument("--img", required=True, type=Path, help="5etools image folder (contains items/, bestiary/, ...)")
    parser.add_argument("--apply", action="store_true", help="write changes (default is a dry run)")
    parser.add_argument(
        "--clear-undeclared",
        action="store_true",
        help="NULL image_path where the value has no JSON declaration and no file on disk",
    )
    parser.add_argument(
        "--rebuild-entity-images",
        action="store_true",
        help="rebuild 5etools rows of dnd_entity_images from the image columns (requires --apply)",
    )
    args = parser.parse_args()

    password = os.environ.get("LW_DB_PASSWORD")
    if not password:
        print("LW_DB_PASSWORD must be set in the environment")
        return 1

    resolved, absent = load_declarations(args.data, args.img)
    print(f"Declarations with an existing file: {len(resolved)}")
    print(f"Declared paths absent from the image folder: {len(absent)} distinct ({sum(absent.values())} declarations)")

    conn = pymysql.connect(
        host=os.environ.get("LW_DB_HOST", "localhost"),
        user=os.environ.get("LW_DB_USER", "loomweaver_app"),
        password=password,
        database=DB_NAME,
        charset="utf8mb4",
    )
    try:
        with conn.cursor() as cur:
            report, changes = sync(cur, resolved, args.img, args.apply, args.clear_undeclared)
            report.update(fix_tokens_and_covers(cur, args.img, args.apply))
            if args.apply and args.rebuild_entity_images:
                print(f"Rebuilt dnd_entity_images 5etools rows: {rebuild_entity_images(cur)}")
        if args.apply:
            conn.commit()
    finally:
        conn.close()

    for line in sorted(report):
        print(f"  {line}: {report[line]}")
    print(f"{'Applied' if args.apply else 'Dry run, would apply'} {changes} image_path updates")
    if absent:
        print("Absent declared paths (top 15):")
        for rel, count in absent.most_common(15):
            print(f"  {count:5d}  {rel}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
