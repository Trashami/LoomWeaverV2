#!/usr/bin/env python3
"""Check 5etools image references stored in loomweaver against the image folder on disk.

Checks:
  1. dnd_entity_images.image_url where source_type = '5etools'. The sync writes these as
     /5etools/<relative path>, so each one should resolve to a file under --img.
  2. Every dnd_* table with an image_path column (for example dnd_items, dnd_decks). Values are
     relative (items/MOT/Akmon, Hammer of Purphoros.webp) or /5etools/-prefixed.
  3. dnd_deck_cards.face_image_url and back_image_url (/5etools/decks/... paths).

Uploaded and AI-generated images are not on disk and are not checked.
Exits with code 1 if any reference is missing.

Environment: LW_DB_PASSWORD (required), LW_DB_HOST (default localhost), LW_DB_USER (default loomweaver_app).
"""

from __future__ import annotations

import argparse
import os
import sys
from urllib.parse import unquote

import pymysql

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify_5etools_image_refs import DEFAULT_IMG  # noqa: E402

DB_NAME = "loomweaver"
PREFIX = "/5etools/"
SAMPLE_LIMIT = 10


def resolve(img_root: str, ref: str) -> str | None:
    """Map a stored reference to a path under img_root, or None if it escapes the root."""
    rel = unquote(ref)
    if rel.startswith(PREFIX):
        rel = rel[len(PREFIX):]
    rel = rel.lstrip("/")
    root = os.path.normpath(img_root)
    full = os.path.normpath(os.path.join(root, rel))
    if not full.startswith(root + os.sep):
        return None
    return full


def exists(img_root: str, ref: str) -> bool:
    full = resolve(img_root, ref)
    return full is not None and os.path.isfile(full)


def image_path_tables(cur) -> list[str]:
    cur.execute(
        "SELECT table_name FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND column_name = 'image_path' ORDER BY table_name"
    )
    return [row[0] for row in cur.fetchall() if row[0].startswith("dnd_")]


def check_values(img_root: str, label: str, rows, misses_out: list) -> tuple[int, int]:
    """rows: iterable of (reference, row_count). Returns (distinct_checked, missing_rows)."""
    checked = 0
    missing_rows = 0
    missing = []
    for ref, count in rows:
        if not ref:
            continue
        checked += 1
        if not exists(img_root, ref):
            missing_rows += count
            missing.append((ref, count))
    print(f"{label}: {checked} distinct references checked, {sum(c for _, c in missing)} rows missing on disk")
    for ref, count in sorted(missing, key=lambda m: -m[1])[:SAMPLE_LIMIT]:
        print(f"    missing ({count}): {ref}")
    misses_out.extend((label, ref, count) for ref, count in missing)
    return checked, missing_rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--img", default=DEFAULT_IMG, help="5etools image root folder")
    args = parser.parse_args()

    img_root = os.path.abspath(args.img)
    if not os.path.isdir(img_root):
        print(f"image root not found: {img_root}")
        return 1

    password = os.environ.get("LW_DB_PASSWORD")
    if not password:
        print("LW_DB_PASSWORD must be set in the environment")
        return 1

    conn = pymysql.connect(
        host=os.environ.get("LW_DB_HOST", "localhost"),
        user=os.environ.get("LW_DB_USER", "loomweaver_app"),
        password=password,
        database=DB_NAME,
        charset="utf8mb4",
    )
    misses: list = []
    try:
        with conn.cursor() as cur:
            print(f"Image root: {img_root}")
            cur.execute(
                "SELECT image_url, COUNT(*) FROM dnd_entity_images "
                "WHERE source_type = '5etools' GROUP BY image_url"
            )
            check_values(img_root, "dnd_entity_images.image_url (5etools)", cur.fetchall(), misses)

            for table in image_path_tables(cur):
                cur.execute(
                    f"SELECT image_path, COUNT(*) FROM `{table}` "
                    "WHERE image_path IS NOT NULL AND image_path <> '' GROUP BY image_path"
                )
                check_values(img_root, f"{table}.image_path", cur.fetchall(), misses)

            for column in ("face_image_url", "back_image_url"):
                cur.execute(
                    f"SELECT {column}, COUNT(*) FROM dnd_deck_cards "
                    f"WHERE {column} IS NOT NULL AND {column} <> '' GROUP BY {column}"
                )
                check_values(img_root, f"dnd_deck_cards.{column}", cur.fetchall(), misses)
    finally:
        conn.close()

    total = sum(count for _, _, count in misses)
    print(f"\nTotal missing references: {total} rows across {len(misses)} distinct values")
    return 1 if misses else 0


if __name__ == "__main__":
    sys.exit(main())
