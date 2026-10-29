"""
Scans /var/www/loomweaver/assets on the production server for all 2D bump/height/normal
assets (albedo + _normal.png + _height.png) and saves bump-height-manifest.json
locally and on the production server.
"""
import json
import os
import lw_deploy_env as env
OUT_LOCAL = r"c:\repos\Jane\Jane\LoomWeaverV2\frontend\public\assets\previews-png\bump-height-manifest.json"
OUT_MAP_ASSETS = r"C:\map assets\previews-png\bump-height-manifest.json"

REMOTE_PY = r"""
import os, json

root = "/var/www/loomweaver/assets"
items = []
seen = set()

STAMP_EXCLUDE = [
    "circle", "tuft", "altar", "sarcophagus", "pillar", "column", "statue",
    "ruin", "camp", "tree", "bush", "rock", "boulder", "patch", "crater",
    "mound", "hill", "stairs", "bridge", "door", "gate", "wall", "cliff",
    "buttress", "shelf", "shelves", "outcrop", "throne", "chest", "brazier",
    "obelisk", "portal", "fountain", "well", "cart", "wagon", "tent", "table",
    "chair", "bed", "barrel", "crate", "corpse", "skeleton", "bones", "skull",
    "crystal", "mushroom", "fungus", "vine", "root-cluster", "web", "trap",
    "rune", "sigil", "statuary", "arch", "rubble", "debris", "log", "stump"
]

FLOOR_INCLUDE = [
    "floor", "cobble", "paver", "gravel", "basalt", "flagstone",
    "tiles", "tile", "meadow", "sand", "peat", "slate", "parquet",
    "planks", "dirt-ground", "mud-ground", "grass-ground", "stone-ground"
]

for dp, dn, fn in os.walk(root):
    if "/128" in dp or "/64" in dp:
        continue
    for f in sorted(fn):
        if not f.endswith("_normal.png"):
            continue
        base = f[:-11]
        if base in seen:
            continue
        alb = os.path.join(dp, base + ".png")
        hgt = os.path.join(dp, base + "_height.png")
        if not os.path.exists(alb):
            alb_dir = dp.replace("/normals", "/albedo")
            alb = os.path.join(alb_dir, base + ".png")
        if not os.path.exists(hgt):
            hgt_dir = dp.replace("/normals", "/heights")
            hgt = os.path.join(hgt_dir, base + "_height.png")
        if not os.path.exists(alb):
            continue
        seen.add(base)
        rel_alb = "/assets/" + os.path.relpath(alb, root).replace("\\", "/")
        rel_norm = "/assets/" + os.path.relpath(os.path.join(dp, f), root).replace("\\", "/")
        rel_hgt = ("/assets/" + os.path.relpath(hgt, root).replace("\\", "/")) if os.path.exists(hgt) else rel_norm

        base_lower = base.lower()
        is_stamp_or_wall = any(k in base_lower for k in STAMP_EXCLUDE)
        is_floor = (not is_stamp_or_wall) and any(k in base_lower for k in FLOOR_INCLUDE)

        if is_floor:
            cat = "Flooring (Bump/Height)"
        elif any(k in base_lower for k in ["wall", "buttress", "cliff", "shelf", "shelves", "outcrop"]):
            cat = "Walls & Cliffs (Bump/Height)"
        else:
            cat = "Stamps & Props (Bump/Height)"

        clean_name = (
            base.replace("new-", "")
            .replace("retrofit-", "")
            .replace("-", " ")
            .replace("_", " ")
            .title()
        )
        tags = [w for w in clean_name.lower().split() if len(w) > 2]
        items.append({
            "id": "bump-" + base,
            "name": clean_name,
            "category": cat,
            "isFloor": is_floor,
            "thumbnailUrl": rel_alb,
            "albedoUrl": rel_alb,
            "normalUrl": rel_norm,
            "heightUrl": rel_hgt,
            "tags": tags,
        })

floor_items = [x for x in items if x["isFloor"]]
other_items = [x for x in items if not x["isFloor"]]
combined = floor_items + other_items
print(json.dumps({"total": len(combined), "items": combined}, indent=2))
"""


def main() -> None:
    ssh = env.connect()
    sftp = ssh.open_sftp()
    with sftp.open("/tmp/scan_bump.py", "w") as f:
        f.write(REMOTE_PY)
    sftp.close()
    _, stdout, stderr = ssh.exec_command("python3 /tmp/scan_bump.py")
    data = stdout.read().decode("utf-8")
    err = stderr.read().decode("utf-8")
    if err:
        print("STDERR:", err)
    parsed = json.loads(data)
    with open(OUT_LOCAL, "w", encoding="utf-8") as f:
        f.write(data)
    with open(OUT_MAP_ASSETS, "w", encoding="utf-8") as f:
        f.write(data)
    ssh.close()
    print(f"Saved {parsed['total']} bump/height assets to {OUT_LOCAL}")
    floors = [x["name"] for x in parsed["items"] if x["isFloor"]]
    print(f"Seamless Floors ({len(floors)}):", floors[:20])
    stamps = [x["name"] for x in parsed["items"] if not x["isFloor"]]
    print(f"2D Cutout Stamps & Walls ({len(stamps)}):", stamps[:20])


if __name__ == "__main__":
    main()
