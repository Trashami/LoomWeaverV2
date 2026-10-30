"""Load 5etools decks.json into loomweaver.dnd_decks (idempotent).

Official decks are is_canonical=1 and owned by the LoomWeaver pseudo user. Custom (user-made) decks
use is_canonical=0 and owner_id set to the owning users.id.

Cards (decks.json "card") load into dnd_deck_cards, one row per (name, set, source).
dnd_deck_cards.deck_id is the first kept deck that lists the card. Every deck
ref is written to dnd_deck_card_refs with copies, replacement_raw (the JSON value,
NULL when the key is absent) and replacement (effective flag: 1 only when true).
Cards referenced by no deck are loaded with deck_id NULL. Cards referenced only
by a skipped deck are not loaded. Deck 17 (Features Deck, DMTCRG) is excluded by
request and removed if present.

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

from lw_official_owner import official_owner_id

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


def raw_refs(deck):
    out = []
    for ref in deck.get("cards") or []:
        if isinstance(ref, str):
            out.append((ref, 1, None))
        else:
            out.append((ref.get("uid"), ref.get("count", 1), ref.get("replacement")))
    return out


def ref_list(deck):
    return [{"uid": uid, "count": count, "replacement": bool(raw)} for uid, count, raw in raw_refs(deck)]


def card_key(uid, deck_source):
    parts = (uid or "").split("|")
    if len(parts) == 3:
        return tuple(parts)
    if len(parts) == 2:
        return (parts[0], parts[1], deck_source)
    return None


def href_path(obj):
    if isinstance(obj, dict):
        href = obj.get("href") or {}
        if href.get("type") == "internal":
            return href.get("path")
    return None


def load_card_catalog(data_dir):
    path = Path(data_dir) / "decks.json"
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    return {(c.get("name"), c.get("set"), c.get("source")): c for c in data.get("card", [])}


def plan_cards(kept, skipped, catalog):
    refs, missing, owner = [], [], {}
    for deck in kept:
        dkey = (deck.get("name"), deck.get("source"))
        for index, (uid, count, raw) in enumerate(raw_refs(deck)):
            key = card_key(uid, deck.get("source"))
            if key not in catalog:
                missing.append(uid)
                continue
            refs.append({
                "deck": dkey,
                "index": index,
                "card": key,
                "count": int(count or 1),
                "raw": None if raw is None else int(bool(raw)),
                "replacement": 1 if raw else 0,
            })
            owner.setdefault(key, (dkey, href_path(deck.get("back"))))
    skipped_keys = set()
    for deck in skipped:
        for uid, _, _ in raw_refs(deck):
            skipped_keys.add(card_key(uid, deck.get("source")))
    orphans = [k for k in catalog if k not in owner and k not in skipped_keys]
    cards = [(k, deck_key, back) for k, (deck_key, back) in owner.items()]
    cards += [(k, None, None) for k in orphans]
    skipped_only = sum(1 for k in skipped_keys if k in catalog and k not in owner)
    return {"refs": refs, "cards": cards, "missing": missing,
            "orphans": len(orphans), "skipped_only": skipped_only}


def missing_images(img_dir, plan, catalog):
    paths = set()
    for key, _, back in plan["cards"]:
        paths.add(href_path(catalog[key].get("face")))
        paths.add(back)
    paths.discard(None)
    return sorted(p for p in paths if not (Path(img_dir) / p).exists())


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


def upsert_deck(cur, row, owner_id):
    cur.execute(
        "SELECT id FROM dnd_decks WHERE name=%s AND source_book=%s AND is_canonical=1 AND owner_id=%s",
        (row["name"], row["source_book"], owner_id),
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
        return "updated", found[0]
    cur.execute(
        """INSERT INTO dnd_decks (name, source_book, page, cards_count, has_card_art,
               back_image_json, cards_ref_json, entries_json, raw_json, is_canonical, is_public, owner_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1, 1, %s)""",
        (row["name"], row["source_book"], row["page"], row["cards_count"], row["has_card_art"],
         row["back_image_json"], row["cards_ref_json"], row["entries_json"], row["raw_json"], owner_id),
    )
    return "inserted", cur.lastrowid


def remove_skipped(cur, owner_id):
    removed = 0
    for name, source in SKIP_DECKS:
        cur.execute(
            "SELECT id FROM dnd_decks WHERE name=%s AND source_book=%s AND is_canonical=1 AND owner_id=%s",
            (name, source, owner_id),
        )
        for (deck_id,) in cur.fetchall():
            cur.execute("DELETE FROM dnd_decks WHERE id=%s", (deck_id,))
            removed += 1
    return removed


CARD_COLUMNS = ["deck_id", "name", "set_name", "deck_name", "source_book", "page",
                "face_image_json", "entries_json", "raw_json", "image_path",
                "face_image_url", "back_image_url"]


def card_row(key, card, deck_id, back_path):
    face = card.get("face")
    face_path = href_path(face)
    return {
        "deck_id": deck_id,
        "name": key[0],
        "set_name": key[1],
        "deck_name": key[1],
        "source_book": key[2],
        "page": card.get("page"),
        "face_image_json": json.dumps(face) if face is not None else None,
        "entries_json": json.dumps(card.get("entries")) if card.get("entries") is not None else None,
        "raw_json": json.dumps(card),
        "image_path": f"/5etools/{face_path}" if face_path else None,
        "face_image_url": f"/5etools/{face_path}" if face_path else None,
        "back_image_url": f"/5etools/{back_path}" if back_path else None,
    }


def upsert_card(cur, row, owner_id):
    cur.execute(
        """SELECT id FROM dnd_deck_cards WHERE name=%s AND set_name=%s AND source_book=%s
           AND is_canonical=1 AND owner_id=%s AND campaign_scope_key=0""",
        (row["name"], row["set_name"], row["source_book"], owner_id),
    )
    found = cur.fetchone()
    values = [row[c] for c in CARD_COLUMNS]
    if found:
        assignments = ", ".join(f"{c}=%s" for c in CARD_COLUMNS)
        cur.execute(f"UPDATE dnd_deck_cards SET {assignments} WHERE id=%s", values + [found[0]])
        return "updated", found[0]
    placeholders = ", ".join(["%s"] * len(CARD_COLUMNS))
    cur.execute(
        f"INSERT INTO dnd_deck_cards (is_canonical, owner_id, {', '.join(CARD_COLUMNS)}) VALUES (1, %s, {placeholders})",
        [owner_id] + values,
    )
    return "inserted", cur.lastrowid


def prune_stale_cards(cur, keep_ids, owner_id):
    if not keep_ids:
        raise RuntimeError("no cards planned; refusing to prune canonical deck cards")
    placeholders = ", ".join(["%s"] * len(keep_ids))
    cur.execute(
        f"DELETE FROM dnd_deck_cards WHERE is_canonical=1 AND owner_id=%s AND id NOT IN ({placeholders})",
        [owner_id] + list(keep_ids),
    )
    return cur.rowcount


def write_cards(cur, plan, catalog, deck_ids, owner_id):
    counts = {"inserted": 0, "updated": 0}
    card_ids = {}
    for key, deck_key, back in plan["cards"]:
        deck_id = deck_ids.get(deck_key) if deck_key else None
        status, card_id = upsert_card(cur, card_row(key, catalog[key], deck_id, back), owner_id)
        counts[status] += 1
        card_ids[key] = card_id
    counts["pruned"] = prune_stale_cards(cur, list(card_ids.values()), owner_id)
    for deck_id in deck_ids.values():
        cur.execute("DELETE FROM dnd_deck_card_refs WHERE deck_id=%s", (deck_id,))
    for ref in plan["refs"]:
        cur.execute(
            """INSERT INTO dnd_deck_card_refs (deck_id, ref_index, card_id, copies, replacement_raw, replacement)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (deck_ids[ref["deck"]], ref["index"], card_ids[ref["card"]],
             ref["count"], ref["raw"], ref["replacement"]),
        )
    counts["refs"] = len(plan["refs"])
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR)
    parser.add_argument("--img-dir", default=None, help="defaults to <data-dir>/../img")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    kept, skipped = load_decks(args.data_dir)
    rows = [deck_row(d) for d in kept]
    catalog = load_card_catalog(args.data_dir)
    plan = plan_cards(kept, skipped, catalog)
    img_dir = Path(args.img_dir) if args.img_dir else Path(args.data_dir).parent / "img"
    replacement_refs = sum(ref["replacement"] for ref in plan["refs"])
    print(f"decks to load: {len(rows)}; skipped by rule: {len(skipped)}; replacement refs: {replacement_refs}")
    print(f"cards to load: {len(plan['cards'])}; deck refs: {len(plan['refs'])}; "
          f"orphan cards (deck_id NULL): {plan['orphans']}; skipped-only cards: {plan['skipped_only']}")
    print(f"unresolved deck refs: {len(plan['missing'])}")
    missing = missing_images(img_dir, plan, catalog)
    print(f"missing image files under {img_dir}: {len(missing)}")
    for path in missing[:10]:
        print(f"  missing: {path}")
    if args.dry_run:
        return

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
    try:
        with conn.cursor() as cur:
            owner_id = official_owner_id(cur)
            counts = {"inserted": 0, "updated": 0}
            deck_ids = {}
            for row in rows:
                status, deck_id = upsert_deck(cur, row, owner_id)
                counts[status] += 1
                deck_ids[(row["name"], row["source_book"])] = deck_id
            removed = remove_skipped(cur, owner_id)
            card_counts = write_cards(cur, plan, catalog, deck_ids, owner_id)
        conn.commit()
        print(f"decks inserted={counts['inserted']} updated={counts['updated']} removed_skipped={removed}")
        print(f"cards inserted={card_counts['inserted']} updated={card_counts['updated']} "
              f"pruned={card_counts['pruned']} deck_refs={card_counts['refs']}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
