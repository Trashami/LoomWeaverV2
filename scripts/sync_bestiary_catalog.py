"""Import the existing server 5e-tools bestiary into loomweaver only. No downloads or deletions.
Run the adjacent export script first. Dry-run by default; --apply snapshots the catalog before upserting.
Credentials are supplied in LW_DB_PASSWORD, never logged.
"""
import argparse
import glob
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import quote
import pymysql

parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
parser.add_argument('--input', default='/tmp/bestiary-resolved.json')
args = parser.parse_args()
monsters = json.loads(Path(args.input).read_text())
assert monsters and all(not m.get('_copy') for m in monsters)
root = Path('/var/www/jane-assets/5etools')
fluffs = {}
for filename in sorted(glob.glob(str(root / 'data/bestiary/fluff-bestiary-*.json'))):
    for fluff in json.loads(Path(filename).read_text()).get('monsterFluff', []):
        fluffs[(fluff.get('name', '').lower(), fluff.get('source', '').upper())] = fluff
conn = pymysql.connect(host='127.0.0.1', user='loomweaver_app', password=os.environ['LW_DB_PASSWORD'],
                       database='loomweaver', charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor)
def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
def asset(path):
    if path and (root / 'img' / path).is_file():
        return '/5etools/' + quote(path, safe='/')
    return None
with conn.cursor() as cur:
    cur.execute("SELECT id,source_id,name_norm FROM dnd_monster_library WHERE provider='5etools' AND campaign_id IS NULL")
    existing = {(row['source_id'].upper(), row['name_norm']): row['id'] for row in cur.fetchall()}
    print(dump({'sourceDefinitions':len(monsters),'existingCatalogRows':len(existing),
                'newIdentities':sum((m['source'].upper(), re.sub(r'\s+', ' ', m['name'].lower()).strip()) not in existing for m in monsters)}))
    if not args.apply:
        raise SystemExit(0)
    from datetime import datetime, timezone
    backup = 'lw_bestiary_backup_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    cur.execute(f'CREATE TABLE `{backup}` LIKE dnd_monster_library')
    cur.execute('SHOW COLUMNS FROM dnd_monster_library')
    columns = ','.join('`'+row['Field']+'`' for row in cur.fetchall() if 'GENERATED' not in row['Extra'] or row['Extra'] == 'DEFAULT_GENERATED')
    cur.execute(f'INSERT INTO `{backup}` ({columns}) SELECT {columns} FROM dnd_monster_library')
    conn.commit()
    cur.execute("SELECT CHARACTER_MAXIMUM_LENGTH n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='loomweaver' AND TABLE_NAME='dnd_monster_library' AND COLUMN_NAME='source_id'")
    if cur.fetchone()['n'] < max(len(m['source']) for m in monsters):
        cur.execute("ALTER TABLE dnd_monster_library MODIFY source_id VARCHAR(128) NOT NULL DEFAULT ''")
    updated = inserted = images = tokens = 0
    try:
        for monster in monsters:
            name = monster['name'].strip()
            source = monster['source'].upper()
            norm = re.sub(r'\s+', ' ', name.lower()).strip()
            fluff = fluffs.get((name.lower(), source))
            if fluff and not fluff.get('_copy'):
                monster['fluff'] = fluff
            image = None
            for entry in ((fluff or {}).get('images') or []):
                image = asset(entry.get('href', {}).get('path'))
                if image: break
            image = image or asset(f'bestiary/{source}/{name}.webp')
            token = asset(f'bestiary/tokens/{source}/{name}.webp')
            images += bool(image)
            tokens += bool(token)
            cr = monster.get('cr', '0')
            cr = str(cr.get('cr', '0') if isinstance(cr, dict) else cr)
            cr_value = {'1/8':.125, '1/4':.25, '1/2':.5}.get(cr)
            if cr_value is None:
                try: cr_value = float(cr)
                except ValueError: cr_value = None
            kind = monster.get('type', 'unknown')
            if isinstance(kind, dict): kind = kind.get('type', 'unknown')
            raw = dump(monster)
            values = (cr, cr_value, dump(monster.get('size')), str(kind), dump(monster.get('alignment')),
                      dump(monster.get('ac')), dump(monster.get('speed')), raw,
                      dump(fluff) if fluff else None, image, token, hashlib.sha256(raw.encode()).digest())
            identity = existing.get((source, norm))
            if identity:
                cur.execute("""UPDATE dnd_monster_library SET cr_text=%s,cr_decimal=%s,size_json=%s,type_main=%s,
                    alignment_json=%s,ac_json=%s,speed_json=%s,raw_json=%s,fluff_json=%s,
                    image_path=COALESCE(%s,image_path),token_url=COALESCE(%s,token_url),content_hash=%s
                    WHERE id=%s AND provider='5etools' AND campaign_id IS NULL""", values + (identity,))
                updated += 1
            else:
                slug = re.sub('[^a-z0-9]+', '-', (name+'-'+source).lower()).strip('-')[:255]
                cur.execute("""INSERT INTO dnd_monster_library
                    (provider,source_id,name,name_norm,slug,cr_text,cr_decimal,size_json,type_main,alignment_json,
                     ac_json,speed_json,raw_json,fluff_json,image_path,token_url,content_hash,is_public,is_canonical)
                    VALUES ('5etools',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1,1)""",
                    (source,name,norm,slug) + values)
                inserted += 1
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    print(dump({'backupTable':backup,'updated':updated,'inserted':inserted,'verifiedImages':images,'verifiedTokens':tokens}))
conn.close()
