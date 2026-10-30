"""Merge official rows of dnd_custom_feats / dnd_custom_backgrounds into dnd_feats / dnd_backgrounds.

The custom tables hold the same official content under display-label sources
("Player's Handbook (2014)", "5e System Core", ...). Each label is mapped to its
canonical 5etools code. Only is_canonical=1, owner_id NULL rows are read.

For each (name, source code):
  - matches a canonical row: fills description, image_path, feature fields and
    other extras that are still NULL, and sets is_public=1.
  - no match: inserts an official row (is_canonical=1, owner_id NULL).
  - repeats an earlier custom row: skipped and counted.

Labels with no mapping are kept as-is when they fit dnd_*.source_book (32 chars),
and are listed in the report so they can be reviewed.

Idempotent. Run the migration 20261105_dnd_feats_backgrounds_merge.sql first.

Usage:
  LW_DB_PASSWORD=... python scripts/merge_custom_feats_backgrounds.py [--dry-run]
  LW_DB_HOST / LW_DB_PORT / LW_DB_USER default to localhost / 3306 / loomweaver_app.
"""

import argparse
import os
import sys

import pymysql

DB_NAME = "loomweaver"
SOURCE_MAX_LEN = 32

FEAT_SOURCE_CODES = {
    "5e System Core": "PHB",
    "Expanded Rules (2024)": "XPHB",
    "Eberron / Frontier": "EFA",
    "Eberron": "EFA",
    "Xanathar's Guide to Everything": "XGE",
    "Tasha's Cauldron of Everything": "TCE",
    "Bigby Presents: Glory of the Giants": "BGG",
    "Fizban's Treasury of Dragons": "FTD",
    "Strixhaven": "SCC",
    "Mordenkainen's Tome of Foes": "MTF",
}

BACKGROUND_SOURCE_CODES = {
    "Player's Handbook (2014)": "PHB",
    "Core Rules (2024)": "XPHB",
    "Forgotten Realms: Heroes of Faerun": "FRHoF",
    "Eberron: Frontier Adventures": "EFA",
    "Baldur's Gate: Descent Into Avernus": "BGDIA",
    "Sword Coast Adventurer's Guide": "SCAG",
    "Guildmasters' Guide to Ravnica": "GGR",
    "Explorer's Guide to Wildemount": "EGW",
    "Strixhaven: Curriculum of Chaos": "SCC",
    "Ghosts of Saltmarsh": "GoS",
    "Tomb of Annihilation": "ToA",
    "Acquisitions Incorporated": "AI",
    "Spelljammer: Astral Adventurer's Guide": "AAG",
    "The Wild Beyond the Witchlight": "WBtW",
    "Dragonlance: Shadow of the Dragon Queen": "DSotDQ",
    "Van Richten's Guide to Ravenloft": "VRGR",
    "Bigby Presents: Glory of the Giants": "BGG",
    "Plane Shift: Amonkhet": "PSA",
    "Plane Shift: Innistrad": "PSI",
    "Eberron: Rising from the Last War": "ERLW",
    "Mythic Odysseys of Theros": "MOT",
    "The Book of Many Things": "BMT",
    "Out of the Abyss": "OotA",
    "Princes of the Apocalypse": "PotA",
    "Curse of Strahd": "CoS",
    "Planescape: Sigil and the Outlands": "PSX",
}

TABLES = {
    "feats": {
        "custom": "dnd_custom_feats",
        "target": "dnd_feats",
        "codes": FEAT_SOURCE_CODES,
        "extras": ["description", "image_path", "category", "ability_score_increase_json",
                   "campaign_id", "source_template_id"],
    },
    "backgrounds": {
        "custom": "dnd_custom_backgrounds",
        "target": "dnd_backgrounds",
        "codes": BACKGROUND_SOURCE_CODES,
        "extras": ["description", "feature_name", "feature_desc", "image_path", "languages_json",
                   "campaign_id", "source_template_id"],
    },
}


def merge_table(cur, spec, report):
    counts = {"matched": 0, "inserted": 0, "duplicate": 0, "too_long": 0}
    unmapped = {}
    seen = set()
    cur.execute(f"SELECT DISTINCT source_book FROM `{spec['target']}`")
    known_codes = {row["source_book"] for row in cur.fetchall()}
    cur.execute(
        f"SELECT * FROM `{spec['custom']}` WHERE is_canonical = 1 AND owner_id IS NULL ORDER BY id"
    )
    rows = cur.fetchall()
    extras = spec["extras"]
    for row in rows:
        label = row["source_book"]
        code = spec["codes"].get(label)
        if code is None:
            code = label
            if label not in known_codes:
                unmapped[label] = unmapped.get(label, 0) + 1
        if len(code) > SOURCE_MAX_LEN:
            counts["too_long"] += 1
            continue
        key = (row["name"], code)
        if key in seen:
            counts["duplicate"] += 1
            continue
        seen.add(key)

        cur.execute(
            f"SELECT id FROM `{spec['target']}` "
            "WHERE name = %s AND source_book = %s AND is_canonical = 1 AND owner_id IS NULL",
            (row["name"], code),
        )
        existing = cur.fetchone()
        values = [row[col] for col in extras]
        if existing:
            assignments = ", ".join(f"`{col}` = COALESCE(%s, `{col}`)" for col in extras)
            cur.execute(
                f"UPDATE `{spec['target']}` SET {assignments}, is_public = 1, page = COALESCE(%s, page) "
                "WHERE id = %s",
                (*values, row["page"], existing["id"]),
            )
            counts["matched"] += 1
        else:
            columns = ", ".join(f"`{col}`" for col in extras)
            placeholders = ", ".join(["%s"] * len(extras))
            cur.execute(
                f"INSERT INTO `{spec['target']}` "
                f"(name, source_book, page, is_canonical, owner_id, is_public, {columns}) "
                f"VALUES (%s, %s, %s, 1, NULL, 1, {placeholders})",
                (row["name"], code, row["page"], *values),
            )
            counts["inserted"] += 1

    report.append(f"{spec['target']}: custom rows read={len(rows)} matched={counts['matched']} "
                  f"inserted={counts['inserted']} duplicate_skipped={counts['duplicate']} "
                  f"too_long_skipped={counts['too_long']}")
    for label, n in sorted(unmapped.items(), key=lambda kv: -kv[1]):
        report.append(f"  unmapped source kept as-is: {label!r} ({n} rows)")
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="run the merge and roll back")
    args = parser.parse_args()

    password = os.environ.get("LW_DB_PASSWORD")
    if not password:
        sys.exit("LW_DB_PASSWORD must be set in the environment")

    conn = pymysql.connect(
        host=os.environ.get("LW_DB_HOST", "localhost"),
        port=int(os.environ.get("LW_DB_PORT", "3306")),
        user=os.environ.get("LW_DB_USER", "loomweaver_app"),
        password=password,
        database=DB_NAME,
        charset="utf8mb4",
        autocommit=False,
    )
    report = []
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            for spec in TABLES.values():
                merge_table(cur, spec, report)
        if args.dry_run:
            conn.rollback()
            report.insert(0, "DRY RUN: rolled back, nothing written")
        else:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    print("\n".join(report))


if __name__ == "__main__":
    main()
