#!/usr/bin/env python3
"""
Populates all 29,271+ images from /var/www/jane-assets/5etools/img/ into MySQL:
1. `dnd_assets` — Every image file in `img/`, linked by book `source_id` (`CoS`, `DMG`, `HotDQ`, `LMoP`, `MM`, `PHB`, etc.).
2. `dnd_node_assets` — Links every inline map, handout, and illustration inside `dnd_book_nodes` (`adventure-*.json` and `book-*.json`) to `dnd_assets`.
3. `dnd_monster_library` — Links the top-level book-source folders (`img/CoS/<Name>.png`, `img/DMG/<Name>.png`, `img/HotDQ/<Name>.png`, `img/MM/<Name>.png`, etc.) and `img/bestiary/<SOURCE>/<Name>.webp` to `token_url` and `image_path`.
4. `dnd_entity_images` — Populates the central entity-image table for all sources, adventures, books, spells, items, monsters, classes, subclasses, species, backgrounds, feats, decks, cards, deities, conditions, bastions, and vehicles.
5. Synchronizes all updated image tables into `loomweaver`.
"""
import json
import os
import re
import sys
import pymysql

IMG_DIR = "/var/www/jane-assets/5etools/img"
DB_HOST = "localhost"
DB_USER = "loomweaver_app"
DB_PASS = os.environ.get("LW_DB_PASSWORD") or sys.exit("LW_DB_PASSWORD must be set in the environment")

CATEGORY_FOLDERS = {
    "adventure", "backgrounds", "bastions", "bestiary", "book", "characters",
    "charcreationoptions", "classes", "conditionsdiseases", "covers", "decks",
    "deities", "dmscreen", "feats", "hazards", "items", "languages", "objects",
    "optionalfeatures", "pdf", "plutonium", "races", "recipes", "rewards",
    "roll20", "rules", "spell-art", "spells", "traps", "variantrules", "vehicles"
}

IMAGE_EXTS = (".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg")


def parse_source_and_category(rel_path):
    """
    Given a relative path inside /var/www/jane-assets/5etools/img (e.g.
    'CoS/Rahadin.png', 'adventure/CoS/001.webp', 'bestiary/tokens/MM/Goblin.webp',
    'covers/PHB.webp', 'items/DMG/Vorpal Sword.webp'), returns (source_id, category, title).
    """
    parts = rel_path.replace("\\", "/").split("/")
    filename = parts[-1]
    stem = os.path.splitext(filename)[0]

    if len(parts) == 1:
        return ("CORE", "root", stem)

    top = parts[0]
    # Direct book-source folder at top of img/ (e.g. img/CoS/Rahadin.png, img/DMG/Avatar of Death.png)
    if top not in CATEGORY_FOLDERS:
        return (top[:32].upper(), "source-token", stem)

    # Covers: img/covers/PHB.webp or img/covers/PHB/foo.webp
    if top == "covers":
        src = stem if len(parts) == 2 else parts[1]
        return (src[:32].upper(), "cover", f"{src} Cover")

    # Bestiary tokens: img/bestiary/tokens/<SOURCE>/<File>
    if top == "bestiary" and len(parts) >= 4 and parts[1] == "tokens":
        return (parts[2][:32].upper(), "bestiary-token", stem)

    # Category with book source subfolder: img/<category>/<SOURCE>/...
    if len(parts) >= 3:
        return (parts[1][:32].upper(), top, stem)

    # Category with file directly inside: img/items/Wand of Orcus.jpg, img/deities/Symbol of Bane.jpg
    return ("CORE", top, stem)


def extract_image_nodes(obj, found=None):
    if found is None:
        found = []
    if isinstance(obj, dict):
        t = obj.get("type")
        if t in ("image", "gallery"):
            if "href" in obj and isinstance(obj["href"], dict) and obj["href"].get("path"):
                found.append(obj)
            if "images" in obj and isinstance(obj["images"], list):
                for sub in obj["images"]:
                    extract_image_nodes(sub, found)
        for v in obj.values():
            if isinstance(v, (dict, list)):
                extract_image_nodes(v, found)
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                extract_image_nodes(item, found)
    return found


def main():
    conn = pymysql.connect(
        host=DB_HOST, user=DB_USER, password=DB_PASS, database="jane_scrum",
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor
    )
    cur = conn.cursor()

    print("1. Scanning all image files in /var/www/jane-assets/5etools/img/...")
    all_images = []
    top_book_tokens = {}  # (SOURCE_UPPER, norm_name) -> '/5etools/<Top>/<File>'
    bestiary_portraits = {}  # (SOURCE_UPPER, norm_name) -> '/5etools/bestiary/<SOURCE>/<File>'
    bestiary_tokens = {}  # (SOURCE_UPPER, norm_name) -> '/5etools/bestiary/tokens/<SOURCE>/<File>'

    for root, dirs, files in os.walk(IMG_DIR):
        # Skip symlinks 'img' and 'data' inside IMG_DIR
        dirs[:] = [d for d in dirs if not os.path.islink(os.path.join(root, d))]
        for fn in files:
            if not fn.lower().endswith(IMAGE_EXTS):
                continue
            full_p = os.path.join(root, fn)
            rel_p = os.path.relpath(full_p, IMG_DIR).replace("\\", "/")
            src_id, cat, title = parse_source_and_category(rel_p)
            web_path = f"/5etools/{rel_p}"
            all_images.append((src_id, rel_p, web_path, cat, title))

            norm_stem = re.sub(r"[^a-z0-9]+", "", title.lower())
            if cat == "source-token":
                top_book_tokens[(src_id, norm_stem)] = web_path
                top_book_tokens.setdefault(("*", norm_stem), web_path)
            elif cat == "bestiary":
                bestiary_portraits[(src_id, norm_stem)] = web_path
                bestiary_portraits.setdefault(("*", norm_stem), web_path)
            elif cat == "bestiary-token":
                bestiary_tokens[(src_id, norm_stem)] = web_path
                bestiary_tokens.setdefault(("*", norm_stem), web_path)

    print(f"   -> Found {len(all_images)} image files ({len(top_book_tokens)} top-level book-source token mappings)")

    # Ensure all source_ids exist in dnd_sources so foreign keys / joins work cleanly
    print("2. Ensuring all image book source_ids exist in dnd_sources...")
    cur.execute("SELECT id FROM dnd_sources")
    existing_sources = {r["id"].upper() for r in cur.fetchall()}
    unique_img_sources = sorted({x[0] for x in all_images if x[0]})
    new_sources = []
    for s in unique_img_sources:
        if s.upper() not in existing_sources:
            cov = f"/5etools/covers/{s}.webp"
            new_sources.append((s[:32], s, "supplement", "supplement", cov, cov))
            existing_sources.add(s.upper())
    if new_sources:
        cur.executemany(
            """
            INSERT IGNORE INTO dnd_sources (id, name, source_type, source_group, cover_path, cover_url)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            new_sources,
        )
        conn.commit()
    print(f"   -> Added {len(new_sources)} missing source codes to dnd_sources")

    # 3. Populate dnd_assets with all 29,271+ images from img/
    print("3. Populating dnd_assets with all images from /var/www/jane-assets/5etools/img/...")
    batch = []
    for src_id, rel_p, web_path, cat, title in all_images:
        if len(rel_p) > 250:
            continue
        extra = json.dumps({"category": cat, "source_book": src_id, "web_url": web_path}, ensure_ascii=False)
        batch.append((src_id[:32], "internal", rel_p[:255], web_path[:512], title[:250], extra))
        if len(batch) >= 2000:
            cur.executemany(
                """
                INSERT INTO dnd_assets (source_id, href_type, href_path, local_path, title, extra_json)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    local_path = VALUES(local_path),
                    title = COALESCE(dnd_assets.title, VALUES(title)),
                    extra_json = COALESCE(dnd_assets.extra_json, VALUES(extra_json))
                """,
                batch,
            )
            conn.commit()
            batch = []
    if batch:
        cur.executemany(
            """
            INSERT INTO dnd_assets (source_id, href_type, href_path, local_path, title, extra_json)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                local_path = VALUES(local_path),
                title = COALESCE(dnd_assets.title, VALUES(title)),
                extra_json = COALESCE(dnd_assets.extra_json, VALUES(extra_json))
            """,
            batch,
        )
        conn.commit()

    cur.execute("SELECT COUNT(*) as c FROM dnd_assets")
    print(f"   -> dnd_assets count: {cur.fetchone()['c']}")

    # Build lookup map (source_id.upper(), href_path) -> asset_id and href_path -> asset_id
    cur.execute("SELECT id, source_id, href_path FROM dnd_assets")
    asset_by_src_href = {}
    asset_by_href = {}
    for r in cur.fetchall():
        asset_by_src_href[(r["source_id"].upper(), r["href_path"])] = r["id"]
        asset_by_href[r["href_path"]] = r["id"]

    # 4. Link dnd_book_nodes inline images to dnd_assets via dnd_node_assets
    print("4. Linking adventure & book inline images in dnd_book_nodes -> dnd_node_assets...")
    cur.execute("SELECT id, source_id, data_json FROM dnd_book_nodes WHERE data_json IS NOT NULL")
    node_asset_batch = []
    for nrow in cur.fetchall():
        nid = nrow["id"]
        src_id = (nrow["source_id"] or "CORE").upper()
        try:
            djson = json.loads(nrow["data_json"]) if isinstance(nrow["data_json"], str) else nrow["data_json"]
        except Exception:
            continue
        img_objs = extract_image_nodes(djson)
        for iobj in img_objs:
            href = iobj.get("href") or {}
            hpath = (href.get("path") or "").lstrip("/")
            if not hpath or len(hpath) > 250:
                continue
            title = str(iobj.get("title") or iobj.get("altText") or os.path.splitext(os.path.basename(hpath))[0])[:250]
            width = iobj.get("width") if isinstance(iobj.get("width"), int) else None
            height = iobj.get("height") if isinstance(iobj.get("height"), int) else None
            role = str(iobj.get("imageType") or "inline")[:30]

            aid = asset_by_src_href.get((src_id, hpath)) or asset_by_href.get(hpath)
            if not aid:
                web_p = f"/5etools/{hpath}"
                cur.execute(
                    """
                    INSERT INTO dnd_assets (source_id, href_type, href_path, local_path, title, width, height)
                    VALUES (%s, 'internal', %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), width=COALESCE(VALUES(width), width), height=COALESCE(VALUES(height), height)
                    """,
                    (src_id[:32], hpath[:255], web_p[:512], title, width, height),
                )
                aid = cur.lastrowid
                asset_by_src_href[(src_id, hpath)] = aid
                asset_by_href[hpath] = aid
            elif width or height or iobj.get("title"):
                cur.execute(
                    "UPDATE dnd_assets SET title = COALESCE(%s, title), width = COALESCE(%s, width), height = COALESCE(%s, height) WHERE id = %s",
                    (title, width, height, aid),
                )
            node_asset_batch.append((nid, aid, role))
            if len(node_asset_batch) >= 2000:
                cur.executemany(
                    "INSERT IGNORE INTO dnd_node_assets (node_id, asset_id, role) VALUES (%s, %s, %s)",
                    node_asset_batch,
                )
                conn.commit()
                node_asset_batch = []
    if node_asset_batch:
        cur.executemany(
            "INSERT IGNORE INTO dnd_node_assets (node_id, asset_id, role) VALUES (%s, %s, %s)",
            node_asset_batch,
        )
        conn.commit()

    cur.execute("SELECT COUNT(*) as c FROM dnd_node_assets")
    print(f"   -> dnd_node_assets count: {cur.fetchone()['c']}")

    # 5. Update dnd_monster_library with exact book-source images (`img/CoS/...`, `img/DMG/...`, `img/bestiary/<SOURCE>/...`)
    print("5. Linking top-level book-source folders (img/CoS, img/DMG, img/HotDQ, img/MM, etc.) to dnd_monster_library...")
    cur.execute("SELECT id, source_id, name, image_path, token_url FROM dnd_monster_library")
    mon_updates = []
    for m in cur.fetchall():
        mid = m["id"]
        msrc = (m["source_id"] or "MM").upper()
        mname_norm = re.sub(r"[^a-z0-9]+", "", (m["name"] or "").lower())

        portrait = (
            bestiary_portraits.get((msrc, mname_norm))
            or top_book_tokens.get((msrc, mname_norm))
            or bestiary_portraits.get(("*", mname_norm))
            or top_book_tokens.get(("*", mname_norm))
            or m["image_path"]
        )
        token = (
            top_book_tokens.get((msrc, mname_norm))
            or bestiary_tokens.get((msrc, mname_norm))
            or top_book_tokens.get(("*", mname_norm))
            or bestiary_tokens.get(("*", mname_norm))
            or portrait
        )
        if portrait != m["image_path"] or token != m["token_url"]:
            mon_updates.append((portrait, token, mid))
    if mon_updates:
        cur.executemany(
            "UPDATE dnd_monster_library SET image_path = %s, token_url = %s WHERE id = %s",
            mon_updates,
        )
        conn.commit()
    print(f"   -> Updated {len(mon_updates)} monsters with exact book-source portrait/token paths")

    # 6. Populate dnd_entity_images across all linked tables
    print("6. Populating dnd_entity_images across all compendium entities...")
    cur.execute("DELETE FROM dnd_entity_images WHERE source_type = '5etools'")
    conn.commit()

    entity_queries = [
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
        ("background", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_custom_backgrounds WHERE image_path IS NOT NULL"),
        ("feat", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_custom_feats WHERE image_path IS NOT NULL"),
        ("deck", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_decks WHERE image_path IS NOT NULL"),
        ("deck_card", "SELECT CAST(id AS CHAR) AS eid, face_image_url AS url, name AS label FROM dnd_deck_cards WHERE face_image_url IS NOT NULL"),
        ("deity", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_deities WHERE image_path IS NOT NULL"),
        ("condition", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_conditions_diseases WHERE image_path IS NOT NULL"),
        ("bastion", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_bastions WHERE image_path IS NOT NULL"),
        ("vehicle", "SELECT CAST(id AS CHAR) AS eid, image_path AS url, name AS label FROM dnd_vehicles WHERE image_path IS NOT NULL"),
    ]
    for etype, q in entity_queries:
        cur.execute(q)
        rows = cur.fetchall()
        ebatch = [(etype, str(r["eid"])[:100], str(r["url"])[:500], str(r["label"] or "")[:250]) for r in rows if r.get("url")]
        for i in range(0, len(ebatch), 2000):
            cur.executemany(
                """
                INSERT INTO dnd_entity_images (entity_type, entity_id, image_url, prompt, source_type, is_selected, created_by)
                VALUES (%s, %s, %s, %s, '5etools', 1, '5etools')
                """,
                ebatch[i:i + 2000],
            )
            conn.commit()

    cur.execute("SELECT COUNT(*) as c FROM dnd_entity_images")
    print(f"   -> dnd_entity_images count: {cur.fetchone()['c']}")

    # 7. Sync updated image tables into `loomweaver`
    print("7. Synchronizing dnd_sources, dnd_assets, dnd_node_assets, dnd_monster_library, and dnd_entity_images into `loomweaver`...")
    cur.execute("SET FOREIGN_KEY_CHECKS = 0")
    for tbl in ["dnd_sources", "dnd_assets", "dnd_node_assets", "dnd_monster_library", "dnd_entity_images"]:
        cur.execute(f"DROP TABLE IF EXISTS `loomweaver`.`{tbl}`")
        cur.execute(f"CREATE TABLE `loomweaver`.`{tbl}` LIKE `jane_scrum`.`{tbl}`")
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
        cur.execute(f"INSERT INTO `loomweaver`.`{tbl}` ({col_list}) SELECT {col_list} FROM `jane_scrum`.`{tbl}`")
        conn.commit()
        cur.execute(f"SELECT COUNT(*) as c FROM `loomweaver`.`{tbl}`")
        print(f"   -> loomweaver.{tbl:28s}: {cur.fetchone()['c']} rows")
    cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.commit()
    conn.close()
    print("=== ALL 5ETOOLS IMAGES LINKED BY BOOK SOURCE IN SQL ===")


if __name__ == "__main__":
    main()
