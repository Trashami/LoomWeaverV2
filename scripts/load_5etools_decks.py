"""Load 5etools decks.json into loomweaver.dnd_decks (idempotent).

Official decks are is_canonical=1 with owner_id NULL. Custom (user-made) decks
use is_canonical=0 and owner_id set to the owning users.id.

Deck refs are stored exactly as in the JSON (uid, count, replacement) so the
draw API can honor replacement on every reload. Deck 17 (Features Deck,
DMTCRG) is excluded by request and removed if present.

Usage:
  LW_DB_PASSWORD=... python scripts/load_5etools_decks.py --data-dir <path>/data
  add --dry-run to report without writing.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import pymysql

DB_NAME = "loomweaver"
SKIP_DECKS = {("Features Deck", "DMTCRG")}
DEFAULT_DATA_DIR = "/var/www/jane-assets/5etools/data"


def load_decks(data_dir):
    path = Path(data_dir) / "decks.json"
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    decks = data.get("deck", [])
    kept, skipped = [], []
    for deck in decks:
        key = (deck.get("name"), deck.get("source"))
        (skipped if key in SKIP_DECKS else kept).append(deck)
    return kept, skipped


def ref_list(deck):
    refs = []
    for ref in deck.get("cards") or []:
        if isinstance(ref, str):
            refs.append({"uid": ref, "count": 1, "replacement": False})
        else:
            refs.append({
                "uid": ref.get("uid"),
                "count": ref.get("count", 1),
                "replacement": bool(ref.get("replacement", False)),
            })
    return refs


def deck_row(deck):
    refs = ref_list(deck)
    back = deck.get("back")
    return {
        "name": deck.get("name"),
        "source_book": deck.get("source"),
        "page": str(deck.get("page")) if deck.get("page") is not None else None,
        "cards_count": sum(int(r["count"] or 1) for r in refs),
        "has_card_art": 1 if deck.get("hasCardArt") else 0,
        "back_image_json": json.dumps(back) if back is not None else None,
        "cards_ref_json": json.dumps(refs),
        "entries_json": json.dumps(deck.get("entries")) if deck.get("entries") is not None else None,
        "raw_json": json.dumps(deck),
    }


def upsert_deck(cur, row):
    cur.execute(
        "SELECT id FROM dnd_decks WHERE name=%s AND source_book=%s AND is_canonical=1 AND owner_id IS NULL",
        (row["name"], row["source_book"]),
    )
    found = cur.fetchone()
    if found:
        cur.execute(
            """UPDATE dnd_decks SET page=%s, cards_count=%s, has_card_art=%s,
                   back_image_json=%s, cards_ref_json=%s, entries_json=%s, raw_json=%s
               WHERE id=%s""",
            (row["page"], row["cards_count"], row["has_card_art"], row["back_image_json"],
             row["cards_ref_json"], row["entries_json"], row["raw_json"], found[0]),
        )
        return "updated"
    cur.execute(
        """INSERT INTO dnd_decks (name, source_book, page, cards_count, has_card_art,
               back_image_json, cards_ref_json, entries_json, raw_json, is_canonical, is_public)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1, 1)""",
        (row["name"], row["source_book"], row["page"], row["cards_count"], row["has_card_art"],
         row["back_image_json"], row["cards_ref_json"], row["entries_json"], row["raw_json"]),
    )
    return "inserted"


def remove_skipped(cur):
    removed = 0
    for name, source in SKIP_DECKS:
        cur.execute(
            "SELECT id FROM dnd_decks WHERE name=%s AND source_book=%s AND is_canonical=1 AND owner_id IS NULL",
            (name, source),
        )
        for (deck_id,) in cur.fetchall():
            cur.execute("DELETE FROM dnd_deck_cards WHERE deck_id=%s", (deck_id,))
            cur.execute("DELETE FROM dnd_decks WHERE id=%s", (deck_id,))
            removed += 1
    return removed


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    kept, skipped = load_decks(args.data_dir)
    rows = [deck_row(d) for d in kept]
    replacement_refs = sum(1 for r in rows for ref in json.loads(r["cards_ref_json"]) if ref["replacement"])
    print(f"decks to load: {len(rows)}; skipped by rule: {len(skipped)}; replacement refs: {replacement_refs}")
    if args.dry_run:
        return

    password = os.environ.get("LW_DB_PASSWORD")
    if not password:
        sys.exit("LW_DB_PASSWORD must be set in the environment")

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
            counts = {"inserted": 0, "updated": 0}
            for row in rows:
                counts[upsert_deck(cur, row)] += 1
            removed = remove_skipped(cur)
        conn.commit()
        print(f"inserted={counts['inserted']} updated={counts['updated']} removed_skipped={removed}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
