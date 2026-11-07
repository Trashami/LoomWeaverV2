#!/usr/bin/env python3
"""
Unified Local & Server Map Asset Catalog Builder (`generate_asset_properties_catalog.py`).
Synchronizes:
  1. `c:\\map assets\\catalogs\\mat-vis-assets.json` (preserving user scatter/tool categories and per-tier high/mid/low sizes while adding all mapping tool fields)
  2. `c:\\map assets\\catalogs\\asset-properties-catalog.json` (+ `previews-png`, `frontend/public`, `loommaps-studio/public`)
  3. `c:\\map assets\\catalogs\\manifest.json` (+ `previews-png/manifest.json`, `frontend/public/assets/previews-png/manifest.json`)
  4. `c:\\map assets\\catalogs\\models-registry.json` (+ `3d-models/models-registry.json`)
  5. `c:\\map assets\\catalogs\\bump-height-manifest.json`
  6. `c:\\map assets\\catalogs\\loomweaver-asset-manifest.json`
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
LOCAL_MAP_ASSETS = Path(r"c:\map assets")
MODELS_3D_DIR = LOCAL_MAP_ASSETS / "3d-models"
CATALOGS_DIR = LOCAL_MAP_ASSETS / "catalogs"
PREVIEWS_DIR = LOCAL_MAP_ASSETS / "previews-png"
STUDIO_PUBLIC = REPO_ROOT / "loommaps-studio" / "public"
FRONTEND_PUBLIC = REPO_ROOT / "frontend" / "public"

VARIANT_RE = re.compile(r"^(?P<base>.+)_(?P<q>low|mid|high)\.glb$", re.IGNORECASE)
QUALITY_MAP = {"low": "Performance", "mid": "Balanced", "high": "Visual"}

DEFAULT_MAT_VIS_CATEGORIES = {
    "439123c6-7532-4044-92e1-0050bd1e97ea": {
        "id": "439123c6-7532-4044-92e1-0050bd1e97ea",
        "name": "hero_tokens",
        "tool": "single_stamp",
        "description": "Hero tokens",
        "folder": "hero_tokens-439123c6",
        "randomSettings": {
            "enabled": False,
            "selectionMode": "shuffle-bag",
            "stampScale": 1.0,
            "scaleJitterPct": 0,
            "rotationJitterDeg": 0,
        },
    },
    "173cd8d9-4251-4ef9-a467-ec9b13012970": {
        "id": "173cd8d9-4251-4ef9-a467-ec9b13012970",
        "name": "monster_tokens",
        "tool": "single_stamp",
        "description": "monster tokens",
        "folder": "monster_tokens-173cd8d9",
        "randomSettings": {
            "enabled": False,
            "selectionMode": "shuffle-bag",
            "stampScale": 1.0,
            "scaleJitterPct": 10,
            "rotationJitterDeg": 45,
        },
    },
    "973688a2-2f09-4bf4-a830-89822dfbe1c7": {
        "id": "973688a2-2f09-4bf4-a830-89822dfbe1c7",
        "name": "floor_stamps",
        "tool": "tiled_stamp",
        "description": "flooring stamps",
        "folder": "floor_stamps-973688a2",
        "randomSettings": {
            "enabled": True,
            "selectionMode": "shuffle-bag",
            "stampScale": 1.0,
            "scaleJitterPct": 0,
            "rotationJitterDeg": 0,
        },
    },
    "15a695c4-424d-4afb-a806-0957b49a6bbc": {
        "id": "15a695c4-424d-4afb-a806-0957b49a6bbc",
        "name": "buildings",
        "tool": "single_stamp",
        "description": "decorative_buildings",
        "folder": "buildings-15a695c4",
        "randomSettings": {
            "enabled": False,
            "selectionMode": "shuffle-bag",
            "stampScale": 1.0,
            "scaleJitterPct": 8,
            "rotationJitterDeg": 0,
        },
    },
    "f230d77d-a70a-4d61-860d-6105ce295173": {
        "id": "f230d77d-a70a-4d61-860d-6105ce295173",
        "name": "props",
        "tool": "single_stamp",
        "description": "single stamp props",
        "folder": "props-f230d77d",
        "randomSettings": {
            "enabled": False,
            "selectionMode": "shuffle-bag",
            "stampScale": 1.0,
            "scaleJitterPct": 15,
            "rotationJitterDeg": 360,
        },
    },
    "f9134ab4-9d42-4783-8be1-8482909d0859": {
        "id": "f9134ab4-9d42-4783-8be1-8482909d0859",
        "name": "walls",
        "tool": "wall_stamp",
        "description": "wall stamps",
        "folder": "walls-f9134ab4",
        "randomSettings": {
            "enabled": False,
            "selectionMode": "shuffle-bag",
            "stampScale": 1.0,
            "scaleJitterPct": 0,
            "rotationJitterDeg": 0,
        },
    },
    "6173d279-89a3-4c51-ae5c-4ab36fb6d469": {
        "id": "6173d279-89a3-4c51-ae5c-4ab36fb6d469",
        "name": "grass_floor",
        "tool": "random_stamp",
        "description": "random stamping of grass and scatter foliage",
        "folder": "grass_floor-6173d279",
        "randomSettings": {
            "enabled": True,
            "selectionMode": "shuffle-bag",
            "stampScale": 1.15,
            "scaleJitterPct": 24,
            "rotationJitterDeg": 360,
        },
    },
}

CAT_ID_HERO = "439123c6-7532-4044-92e1-0050bd1e97ea"
CAT_ID_MONSTER = "173cd8d9-4251-4ef9-a467-ec9b13012970"
CAT_ID_FLOOR = "973688a2-2f09-4bf4-a830-89822dfbe1c7"
CAT_ID_BUILDING = "15a695c4-424d-4afb-a806-0957b49a6bbc"
CAT_ID_PROP = "f230d77d-a70a-4d61-860d-6105ce295173"
CAT_ID_WALL = "f9134ab4-9d42-4783-8be1-8482909d0859"
CAT_ID_SCATTER = "6173d279-89a3-4c51-ae5c-4ab36fb6d469"

PROCESSED_UNPROCESSED_MAP: dict[str, dict[str, Any]] = {
    "fungal_golem_-_forest_mushroom_beast": {"alias": "fungal_golem", "catId": CAT_ID_MONSTER, "name": "Fungal Golem Mushroom Beast"},
    "Meshy_AI__1026224419_texture": {"alias": "dungeon_tile", "catId": CAT_ID_FLOOR, "name": "Dungeon Stone Floor Tile"},
    "Meshy_AI__High_Detailed_PBR_3_1023200617_texture": {"alias": "hero_ranger_token", "catId": CAT_ID_HERO, "name": "Hero Ranger Token"},
    "Meshy_AI__Halloween2025_ult_1023200746_texture": {"alias": "halloween_reaper_monster", "catId": CAT_ID_MONSTER, "name": "Halloween Reaper Monster"},
    "Meshy_AI__Halloween2025_a_ul_1023201426_texture": {"alias": "tree_golum_monster", "catId": CAT_ID_MONSTER, "name": "Tree Golem Monster"},
    "Meshy_AI__1026223915_texture": {"alias": "fey_dark_pixie", "catId": CAT_ID_MONSTER, "name": "Fey Dark Pixie"},
    "Meshy_AI__Halloween2025_a_st_1023201312_texture": {"alias": "skeleton_creepy_monster", "catId": CAT_ID_MONSTER, "name": "Skeleton Creepy Monster"},
    "Meshy_AI__Halloween2025_ult_1023201912_texture": {"alias": "skeleton_alien_monster", "catId": CAT_ID_MONSTER, "name": "Skeleton Alien Monster"},
    "Meshy_AI__1028184746_texture": {"alias": "colonial_home", "catId": CAT_ID_BUILDING, "name": "Colonial Home"},
    "Meshy_AI_01cleanstone_25ptc_lo_1028134541_texture": {"alias": "curved_stone_wall", "catId": CAT_ID_WALL, "name": "Curved Clean Stone Wall"},
    "Meshy_AI_01cleanstone_25ptc_lo_1028185647_texture": {"alias": "curved_stone_wall_2", "catId": CAT_ID_WALL, "name": "Curved Stone Wall II"},
    "Meshy_AI_02mossystone_25ptc_lo_1028185649_texture": {"alias": "curved_grime_stone_wall", "catId": CAT_ID_WALL, "name": "Curved Mossy Stone Wall"},
    "Meshy_AI_10_Floor_Tile_Wizar_1028124340_texture": {"alias": "floor_tile_clean_design", "catId": CAT_ID_FLOOR, "name": "Clean Wizard Floor Tile"},
    "Meshy_AI__Halloween2025_full_1023202215_texture": {"alias": "forest_flooring_fern_1", "catId": CAT_ID_SCATTER, "name": "Forest Flooring Fern I"},
    "Meshy_AI_A_majestic_forest_fer_1022200323_texture": {"alias": "forest_floor_fern_2", "catId": CAT_ID_SCATTER, "name": "Forest Floor Fern II"},
    "Meshy_AI_A_majestic_forest_fer_1023133940_texture": {"alias": "forest_floor_fern_3", "catId": CAT_ID_SCATTER, "name": "Forest Floor Fern III"},
    "Meshy_AI_A_majestic_forest_fer_1023201308_texture": {"alias": "forest_floor_fern_3", "catId": CAT_ID_SCATTER, "name": "Majestic Forest Fern IV"},
    "Meshy_AI_A_hosta_plant_feature_1023091736_texture": {"alias": "forest_floor_plant_1", "catId": CAT_ID_SCATTER, "name": "Forest Hosta Ground Plant"},
}

RANDOM_GROUP_DEFINITIONS: dict[str, dict[str, Any]] = {
    "grass_ground_cover": {
        "id": "grass_ground_cover",
        "label": "Lush Grass & Meadow Ground Cover",
        "categoryId": CAT_ID_SCATTER,
        "tool": "random_stamp",
        "selectionMode": "shuffle-bag",
        "stampScale": 1.15,
        "scaleJitterPct": 24,
        "rotationJitterDeg": 360,
    },
    "forest_ferns_undergrowth": {
        "id": "forest_ferns_undergrowth",
        "label": "Forest Ferns, Hostas & Undergrowth",
        "categoryId": CAT_ID_SCATTER,
        "tool": "random_stamp",
        "selectionMode": "shuffle-bag",
        "stampScale": 1.15,
        "scaleJitterPct": 25,
        "rotationJitterDeg": 360,
    },
    "wildflowers_meadow_flora": {
        "id": "wildflowers_meadow_flora",
        "label": "Wildflowers & Meadow Flora",
        "categoryId": CAT_ID_SCATTER,
        "tool": "random_stamp",
        "selectionMode": "shuffle-bag",
        "stampScale": 1.05,
        "scaleJitterPct": 22,
        "rotationJitterDeg": 360,
    },
    "forest_trees_woods": {
        "id": "forest_trees_woods",
        "label": "Forest Trees & Woods",
        "categoryId": CAT_ID_SCATTER,
        "tool": "random_stamp",
        "selectionMode": "shuffle-bag",
        "stampScale": 3.4,
        "scaleJitterPct": 22,
        "rotationJitterDeg": 360,
    },
    "mushrooms_fungi_crystals": {
        "id": "mushrooms_fungi_crystals",
        "label": "Mushrooms, Fungi & Crystals",
        "categoryId": CAT_ID_SCATTER,
        "tool": "random_stamp",
        "selectionMode": "shuffle-bag",
        "stampScale": 1.25,
        "scaleJitterPct": 26,
        "rotationJitterDeg": 360,
    },
    "rocks_boulders_stumps": {
        "id": "rocks_boulders_stumps",
        "label": "Rocks, Boulders, Stumps & Rubble",
        "categoryId": CAT_ID_SCATTER,
        "tool": "random_stamp",
        "selectionMode": "shuffle-bag",
        "stampScale": 1.25,
        "scaleJitterPct": 26,
        "rotationJitterDeg": 360,
    },
    "floor_tiles_dungeon": {
        "id": "floor_tiles_dungeon",
        "label": "Dungeon & Cobblestone Floor Tiles",
        "categoryId": CAT_ID_FLOOR,
        "tool": "tiled_stamp",
        "selectionMode": "shuffle-bag",
        "stampScale": 1.0,
        "scaleJitterPct": 0,
        "rotationJitterDeg": 0,
    },
    "dungeon_props_clutter": {
        "id": "dungeon_props_clutter",
        "label": "Props & Dungeon Furnishings",
        "categoryId": CAT_ID_PROP,
        "tool": "single_stamp",
        "selectionMode": "shuffle-bag",
        "stampScale": 1.0,
        "scaleJitterPct": 15,
        "rotationJitterDeg": 360,
    },
}


def is_door_name(name: str) -> bool:
    n = name.lower()
    if "archer" in n:
        return False
    return any(k in n for k in ("door", "gate", "archway", "entry", "passage", "portal", "portcullis"))


def is_wall_name(name: str, category: str) -> bool:
    n = name.lower()
    c = category.lower()
    return any(
        k in n
        for k in (
            "wall",
            "brick",
            "fence",
            "palisade",
            "barrier",
            "rampart",
            "battlement",
            "buttress",
            "masonry",
            "ashlar",
        )
    ) or "wall" in c


def is_floor_tile_name(name: str) -> bool:
    n = name.lower()
    return any(k in n for k in ("floor tile", "ground tile", "cobblestone squa", "dungeon tile", "floor_tile", "dungeon_tile"))


def is_non_scatter_structure_or_furniture(name: str) -> bool:
    n = name.lower()
    return any(
        k in n
        for k in (
            "library",
            "bookcase",
            "bookshelf",
            "cabinet",
            "castle",
            "sanctuary",
            "archway",
            "barrel",
            "crate",
            "chest",
            "table",
            "chair",
            "throne",
            "bed",
            "altar",
            "statue",
            "house",
            "home",
            "cottage",
            "cabin",
            "tavern",
            "inn",
            "tower",
            "cathedral",
            "church",
            "bridge",
            "wagon",
            "cart",
            "chandelier",
            "sconce",
            "brazier",
            "candle",
            "lantern",
            "anvil",
            "forge",
            "cauldron",
            "fountain",
            "well",
            "portal",
            "door",
            "gate",
            "wall",
            "wiza",
            "pillar",
            "column",
            "obelisk",
        )
    )


def is_scatter_candidate(name: str, studio_category: str, mv_tool: str = "") -> bool:
    if is_non_scatter_structure_or_furniture(name) and "tree" not in name.lower() and "grass" not in name.lower() and "fern" not in name.lower():
        return False
    n = name.lower()
    has_nature_keyword = any(
        k in n
        for k in (
            "tree",
            "pine",
            "oak",
            "birch",
            "willow",
            "evergreen",
            "fern",
            "grass",
            "meadow",
            "blades",
            "sedge",
            "plume",
            "euphorbia",
            "bush",
            "shrub",
            "plant",
            "flower",
            "wildflower",
            "daisy",
            "pansy",
            "pansies",
            "clover",
            "hosta",
            "mushroom",
            "fungus",
            "fungi",
            "moss",
            "vine",
            "rock",
            "boulder",
            "stone cluster",
            "pebble",
            "rubble",
            "crystal",
            "stalagmite",
            "stump",
            "driftwood",
            "log",
            "weed",
            "reed",
            "lily",
            "kelp",
            "coral",
            "bones",
            "skull pile",
            "debris",
        )
    )
    if has_nature_keyword:
        return True
    if mv_tool in ("randon_stamp", "random_stamp", "scatter", "scatter_stamp") and studio_category in ("Nature", "Rocks & Cliffs"):
        return True
    return False


def infer_random_group(name: str, cat_id: str, is_scatter: bool, is_floor_tile: bool) -> str:
    n = name.lower()
    if is_floor_tile or cat_id == CAT_ID_FLOOR:
        return "floor_tiles_dungeon"
    if any(k in n for k in ("grass", "blades", "clover", "sedge", "plume", "moss", "weed", "reed", "turf")) and "tree" not in n and "stone" not in n and "driftwood" not in n:
        return "grass_ground_cover"
    if any(k in n for k in ("fern", "hosta", "bush", "shrub", "euphorbia", "plant", "vine", "ivy", "undergrowth", "kelp")):
        return "forest_ferns_undergrowth"
    if any(k in n for k in ("flower", "daisy", "pansy", "pansies", "lily", "meadow")) and "grass" not in n:
        return "wildflowers_meadow_flora"
    if any(k in n for k in ("tree", "oak", "birch", "pine", "evergreen", "willow")) and "crystal" not in n and "golum" not in n and "golem" not in n:
        return "forest_trees_woods"
    if any(k in n for k in ("mushroom", "fungus", "fungi", "crystal", "coral")):
        return "mushrooms_fungi_crystals"
    if is_scatter or any(k in n for k in ("rock", "boulder", "stone", "pebble", "rubble", "stalagmite", "stump", "driftwood", "log", "bones", "skull", "debris")):
        return "rocks_boulders_stumps"
    return "dungeon_props_clutter"


def infer_mat_vis_category_id(name: str, studio_category: str) -> str:
    n = name.lower()
    if is_floor_tile_name(name):
        return CAT_ID_FLOOR
    if is_wall_name(name, studio_category) and not is_door_name(name):
        return CAT_ID_WALL
    if is_scatter_candidate(name, studio_category):
        return CAT_ID_SCATTER
    if studio_category == "Tokens":
        if any(k in n for k in ("hero", "ranger", "rogue", "paladin", "cleric", "wizard", "knight", "bard", "fighter", "player", "adventurer")):
            return CAT_ID_HERO
        return CAT_ID_MONSTER
    if studio_category == "Architecture" or any(k in n for k in ("house", "home", "church", "tower", "castle", "cottage", "cabin", "inn", "tavern", "temple", "sanctuary", "cathedral", "crypt", "ruin", "bridge", "arch", "pillar", "column", "obelisk")):
        return CAT_ID_BUILDING
    return CAT_ID_PROP


def clean_display_name(stem: str) -> str:
    name = re.sub(r"^Meshy_AI_", "", stem, flags=re.IGNORECASE)
    name = re.sub(r"_\d{8,12}_(texture|generate|image-to-3d-te.*)$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s*\(\d+\)$", "", name)
    name = name.replace("_", " ").replace("-", " ").strip()
    name = re.sub(r"\s+", " ", name)
    return name.title() if name else "Ancient Dungeon Asset"


def build_all_catalogs() -> dict[str, Any]:
    CATALOGS_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Load existing mat-vis-assets.json to preserve user's categories, scatter assignments, and per-tier sizes
    mat_vis_path = CATALOGS_DIR / "mat-vis-assets.json"
    existing_mat_vis: dict[str, Any] = {}
    if mat_vis_path.exists():
        try:
            existing_mat_vis = json.loads(mat_vis_path.read_text(encoding="utf-8"))
        except Exception:
            existing_mat_vis = {}

    mv_categories: dict[str, dict[str, Any]] = {}
    for cid, default_c in DEFAULT_MAT_VIS_CATEGORIES.items():
        user_c = (existing_mat_vis.get("categories") or {}).get(cid, {})
        merged_c = {**default_c, **user_c}
        if merged_c.get("tool") == "randon_stamp":
            merged_c["tool"] = "random_stamp"
        if "randomSettings" not in merged_c:
            merged_c["randomSettings"] = default_c["randomSettings"]
        mv_categories[cid] = merged_c
    existing_mv_assets: dict[str, dict[str, Any]] = existing_mat_vis.get("assets") or {}

    # 2. Load existing models-registry.json & scan 3d-models directory for {base}_{low|mid|high}.glb
    reg_path = MODELS_3D_DIR / "models-registry.json"
    old_reg_hashes: dict[str, tuple[int, str]] = {}
    if reg_path.exists():
        try:
            old_reg = json.loads(reg_path.read_text(encoding="utf-8"))
            for m in old_reg.get("models", []):
                for q, v in (m.get("variants") or {}).items():
                    old_reg_hashes[v["file"]] = (v.get("bytes", 0), v.get("sha256", ""))
        except Exception:
            pass

    models_by_base: dict[str, dict[str, dict[str, Any]]] = {}
    if MODELS_3D_DIR.exists():
        for p in sorted(MODELS_3D_DIR.iterdir()):
            if not p.is_file():
                continue
            m = VARIANT_RE.match(p.name)
            if not m:
                continue
            base = m["base"]
            q = m["q"].lower()
            sz = p.stat().st_size
            cached_sz, cached_sha = old_reg_hashes.get(p.name, (0, ""))
            if cached_sz == sz and cached_sha:
                sha = cached_sha
            else:
                sha = hashlib.sha256(p.read_bytes()).hexdigest()
            models_by_base.setdefault(base, {})[q] = {
                "file": p.name,
                "bytes": sz,
                "sha256": sha,
            }

    # 3. Load previews-png/manifest.json & existing asset-properties-catalog.json overrides
    manifest_3d_path = PREVIEWS_DIR / "manifest.json"
    raw_manifest_3d: dict[str, Any] = {}
    if manifest_3d_path.exists():
        try:
            raw_manifest_3d = json.loads(manifest_3d_path.read_text(encoding="utf-8"))
        except Exception:
            raw_manifest_3d = {}

    manifest_by_base: dict[str, dict[str, Any]] = {}
    for item in raw_manifest_3d.get("assets", []):
        sf = item.get("sourceFile", "")
        base = Path(sf).stem if sf else ""
        if base:
            manifest_by_base[base] = item

    existing_apc_by_id: dict[str, dict[str, Any]] = {}
    for apc_candidate in [CATALOGS_DIR / "asset-properties-catalog.json", PREVIEWS_DIR / "asset-properties-catalog.json"]:
        if apc_candidate.exists():
            try:
                raw_apc = json.loads(apc_candidate.read_text(encoding="utf-8"))
                for a in raw_apc.get("assets", []):
                    if a.get("id"):
                        existing_apc_by_id[a["id"]] = a
                break
            except Exception:
                pass

    # 4. Reconcile all active 3D models into:
    #    - cleaned `previews-png/manifest.json`
    #    - enriched `mat-vis-assets.json`
    #    - enriched `models-registry.json`
    new_mv_assets: dict[str, dict[str, Any]] = {}
    cleaned_manifest_assets: list[dict[str, Any]] = []
    registry_models: list[dict[str, Any]] = []

    active_bases = sorted(models_by_base.keys()) if models_by_base else sorted(manifest_by_base.keys())

    for base in active_bases:
        variants = models_by_base.get(base, {})
        proc_info = PROCESSED_UNPROCESSED_MAP.get(base)
        alias_base = proc_info["alias"] if proc_info else None
        man_entry = manifest_by_base.get(base) or (manifest_by_base.get(alias_base, {}) if alias_base else {})
        mid_var = variants.get("mid") or variants.get("low") or variants.get("high") or {}
        aid = (
            (f"obj-{hashlib.sha256(base.encode()).hexdigest()[:16]}" if proc_info else man_entry.get("id"))
            or f"obj-{(mid_var.get('sha256') or hashlib.sha256(base.encode()).hexdigest())[:16]}"
        )
        apc_ov = existing_apc_by_id.get(aid, {})

        name = (
            (proc_info["name"] if proc_info else None)
            or apc_ov.get("name")
            or man_entry.get("name")
            or clean_display_name(base)
        )
        studio_cat = apc_ov.get("category") or man_entry.get("category") or "Props"

        # Determine mat-vis categoryId from existing mat-vis-assets.json if present for any tier
        chosen_cat_id = proc_info["catId"] if proc_info else None
        if not chosen_cat_id:
            for q in ("high", "mid", "low"):
                mv_key = f"3d-models/{base}_{q}.glb"
                if mv_key in existing_mv_assets and existing_mv_assets[mv_key].get("categoryId"):
                    cand_id = existing_mv_assets[mv_key]["categoryId"]
                    # Fix earlier misclassifications where buildings/furniture/walls were placed in grass_floor
                    if cand_id == CAT_ID_SCATTER and not is_scatter_candidate(name, studio_cat):
                        cand_id = infer_mat_vis_category_id(name, studio_cat)
                    chosen_cat_id = cand_id
                    break
        if not chosen_cat_id:
            chosen_cat_id = infer_mat_vis_category_id(name, studio_cat)

        mv_cat_obj = mv_categories.get(chosen_cat_id, DEFAULT_MAT_VIS_CATEGORIES[CAT_ID_PROP])
        mv_cat_name = mv_cat_obj.get("name", "props")
        mv_tool = mv_cat_obj.get("tool", "single_stamp")
        if mv_tool == "randon_stamp":
            mv_tool = "random_stamp"

        is_door = bool(apc_ov.get("isDoor", is_door_name(name)))
        is_wall = bool(apc_ov.get("isWall", mv_tool == "wall_stamp"))
        is_floor_tile = is_floor_tile_name(name) or chosen_cat_id == CAT_ID_FLOOR
        is_floor = bool(apc_ov.get("isFloor", False))
        is_scatter = bool(
            chosen_cat_id == CAT_ID_SCATTER or is_scatter_candidate(name, studio_cat, mv_tool)
        )
        is_object = bool(apc_ov.get("isObject", not is_door))

        random_group_id = infer_random_group(name, chosen_cat_id, is_scatter, is_floor_tile)
        random_group_def = RANDOM_GROUP_DEFINITIONS.get(
            random_group_id, RANDOM_GROUP_DEFINITIONS["dungeon_props_clutter"]
        )
        random_settings = {
            "randomGroup": random_group_id,
            "randomGroupLabel": random_group_def["label"],
            "selectionMode": random_group_def["selectionMode"],
            "stampScale": random_group_def["stampScale"],
            "scaleJitterPct": random_group_def["scaleJitterPct"],
            "rotationJitterDeg": random_group_def["rotationJitterDeg"],
        }

        if is_door:
            tool_role = "door-3d"
        elif is_wall:
            tool_role = "wall-3d"
        elif is_scatter:
            tool_role = "scatter-3d"
        else:
            tool_role = apc_ov.get("toolRole") or "object-3d"

        width_sq = float(man_entry.get("widthSq", 1.0))
        depth_sq = float(man_entry.get("depthSq", 1.0))
        height_sq = float(man_entry.get("heightSq", 1.0))
        default_width_ft = float(man_entry.get("defaultWidthFt", width_sq * 5.0))
        base_scale_grid = list(apc_ov.get("defaultScaleGrid") or [width_sq, height_sq, depth_sq])
        if len(base_scale_grid) != 3:
            base_scale_grid = [width_sq, height_sq, depth_sq]

        default_placement = apc_ov.get("defaultPlacement", "floor")
        snap_to_grid = bool(apc_ov.get("snapToGrid", True))
        default_color_tint = apc_ov.get("defaultColorTint", "#ffffff")
        default_material = man_entry.get("defaultMaterial", "Aged Stone")
        png_preview_url = man_entry.get("pngPreviewUrl") or f"/assets/previews-png/{aid}.png"
        # Ensure preview file exists on disk if mapped from an alias
        if proc_info and man_entry.get("id"):
            alias_png = PREVIEWS_DIR / f"{man_entry['id']}.png"
            target_png = PREVIEWS_DIR / f"{aid}.png"
            if alias_png.exists() and not target_png.exists():
                shutil.copyfile(alias_png, target_png)
            if target_png.exists():
                png_preview_url = f"/assets/previews-png/{aid}.png"
        base_model_url = f"/assets/models-3d/{base}.glb"
        triangles = int(man_entry.get("triangles", 25000))

        lod_variants_meta: dict[str, dict[str, Any]] = {}
        reg_variants: dict[str, dict[str, Any]] = {}

        for q in ("high", "low", "mid"):
            v_info = variants.get(q)
            if not v_info:
                continue
            mv_key = f"3d-models/{v_info['file']}"
            prev_mv_entry = existing_mv_assets.get(mv_key, {})
            prev_apc_lod = (apc_ov.get("lodVariants") or {}).get(q, {})

            tier_scale = float(
                prev_mv_entry.get(
                    "stampScale",
                    prev_apc_lod.get("stampScale", 1.0),
                )
            )
            tier_scale_grid = list(
                prev_mv_entry.get(
                    "defaultScaleGrid",
                    prev_apc_lod.get("defaultScaleGrid", base_scale_grid),
                )
            )
            if len(tier_scale_grid) != 3:
                tier_scale_grid = list(base_scale_grid)

            tier_w = float(prev_mv_entry.get("widthSq", tier_scale_grid[0]))
            tier_h = float(prev_mv_entry.get("heightSq", tier_scale_grid[1]))
            tier_d = float(prev_mv_entry.get("depthSq", tier_scale_grid[2]))
            tier_glb_url = f"/assets/models-3d/{v_info['file']}"

            new_mv_assets[mv_key] = {
                "source": prev_mv_entry.get("source", None),
                "categoryId": chosen_cat_id,
                "id": aid,
                "baseName": base,
                "name": name,
                "category": studio_cat,
                "matVisCategory": mv_cat_name,
                "matVisTool": mv_tool,
                "toolRole": tool_role,
                "isScatter": is_scatter,
                "isObject": is_object,
                "isWall": is_wall,
                "isDoor": is_door,
                "isFloor": is_floor,
                "qualityTier": q,
                "qualityLabel": QUALITY_MAP[q],
                "bytes": v_info["bytes"],
                "sha256": v_info["sha256"],
                "triangles": triangles,
                "pngPreviewUrl": png_preview_url,
                "thumbnailUrl": png_preview_url,
                "glbUrl": tier_glb_url,
                "modelUrl": base_model_url,
                "widthSq": tier_w,
                "depthSq": tier_d,
                "heightSq": tier_h,
                "defaultWidthFt": default_width_ft,
                "defaultScaleGrid": tier_scale_grid,
                "stampScale": tier_scale,
                "defaultPlacement": default_placement,
                "snapToGrid": snap_to_grid,
                "defaultColorTint": default_color_tint,
                "defaultMaterial": default_material,
                "randomGroup": random_group_id,
                "randomGroupLabel": random_group_def["label"],
                "randomSettings": random_settings,
            }

            lod_variants_meta[q] = {
                "file": v_info["file"],
                "glbUrl": tier_glb_url,
                "bytes": v_info["bytes"],
                "sha256": v_info["sha256"],
                "qualityLabel": QUALITY_MAP[q],
                "stampScale": tier_scale,
                "defaultScaleGrid": tier_scale_grid,
            }
            reg_variants[q] = {
                "file": v_info["file"],
                "bytes": v_info["bytes"],
                "sha256": v_info["sha256"],
                "stampScale": tier_scale,
                "defaultScaleGrid": tier_scale_grid,
            }

        mid_file = (variants.get("mid") or mid_var).get("file", f"{base}_mid.glb")
        cleaned_manifest_assets.append(
            {
                "id": aid,
                "name": name,
                "category": studio_cat,
                "sourceFile": f"{base}.glb",
                "sourceHash": man_entry.get("sourceHash") or mid_var.get("sha256", ""),
                "bytes": mid_var.get("bytes", man_entry.get("bytes", 0)),
                "mtime": man_entry.get("mtime", int(time.time())),
                "triangles": triangles,
                "pngPreviewUrl": png_preview_url,
                "glbUrl": f"/assets/models-3d/{mid_file}",
                "modelUrl": base_model_url,
                "widthSq": width_sq,
                "depthSq": depth_sq,
                "heightSq": height_sq,
                "defaultWidthFt": default_width_ft,
                "defaultScaleGrid": base_scale_grid,
                "defaultMaterial": default_material,
                "matVisCategory": mv_cat_name,
                "matVisCategoryId": chosen_cat_id,
                "matVisTool": mv_tool,
                "toolRole": tool_role,
                "isScatter": is_scatter,
                "isObject": is_object,
                "isWall": is_wall,
                "isDoor": is_door,
                "isFloor": is_floor,
                "defaultPlacement": default_placement,
                "snapToGrid": snap_to_grid,
                "defaultColorTint": default_color_tint,
                "randomGroup": random_group_id,
                "randomGroupLabel": random_group_def["label"],
                "randomSettings": random_settings,
                "lodVariants": lod_variants_meta,
            }
        )

        registry_models.append(
            {
                "base": base,
                "id": aid,
                "displayName": name,
                "category": studio_cat,
                "matVisCategory": mv_cat_name,
                "matVisTool": mv_tool,
                "isScatter": is_scatter,
                "randomGroup": random_group_id,
                "defaultScaleGrid": base_scale_grid,
                "variants": reg_variants,
            }
        )

    cleaned_manifest_assets.sort(key=lambda x: (x["category"], x["name"]))
    cat_counts: dict[str, int] = {}
    for a in cleaned_manifest_assets:
        c = a["category"]
        cat_counts[c] = cat_counts.get(c, 0) + 1

    manifest_3d_payload = {
        "schemaVersion": "2.2.0",
        "totalAssets": len(cleaned_manifest_assets),
        "renderedCount": raw_manifest_3d.get("renderedCount", 0),
        "cachedCount": len(cleaned_manifest_assets),
        "categories": cat_counts,
        "randomGroups": RANDOM_GROUP_DEFINITIONS,
        "assets": cleaned_manifest_assets,
    }

    mat_vis_payload = {
        "version": 1,
        "schemaVersion": "2.2.0",
        "qualityMap": QUALITY_MAP,
        "categories": mv_categories,
        "randomGroups": RANDOM_GROUP_DEFINITIONS,
        "assets": new_mv_assets,
    }

    registry_payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "qualityMap": QUALITY_MAP,
        "models": registry_models,
    }

    # 5. Build asset-properties-catalog.json (2D curated + 2D bump-height + 3D stamps with LOD variants & scatter flags)
    entries: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    curated_2d = [
        {
            "id": "bump-lush-meadow-grass",
            "name": "Lush Meadow Grass Field (PBR Relief)",
            "category": "Flooring (Bump/Height)",
            "toolRole": "floor-texture",
            "isFloor": True,
            "isWall": False,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/terrain-textures/meadow-grass-v1/lush-meadow-grass.png",
            "normalUrl": "/assets/terrain-textures/meadow-grass-v1/lush-meadow-grass_normal.png",
            "heightUrl": "/assets/terrain-textures/meadow-grass-v1/lush-meadow-grass_height.png",
        },
        {
            "id": "bump-wildflower-grass-field",
            "name": "Wildflower & Clover Grass Field",
            "category": "Flooring (Bump/Height)",
            "toolRole": "floor-texture",
            "isFloor": True,
            "isWall": False,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/terrain-textures/meadow-grass-v1/wildflower-grass-field.png",
            "normalUrl": "/assets/terrain-textures/meadow-grass-v1/wildflower-grass-field_normal.png",
            "heightUrl": "/assets/terrain-textures/meadow-grass-v1/wildflower-grass-field_height.png",
        },
        {
            "id": "bump-forest-moss-turf",
            "name": "Deep Forest Moss & Pine Turf",
            "category": "Flooring (Bump/Height)",
            "toolRole": "floor-texture",
            "isFloor": True,
            "isWall": False,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/terrain-textures/meadow-grass-v1/forest-moss-turf.png",
            "normalUrl": "/assets/terrain-textures/meadow-grass-v1/forest-moss-turf_normal.png",
            "heightUrl": "/assets/terrain-textures/meadow-grass-v1/forest-moss-turf_height.png",
        },
        {
            "id": "bump-worn-castle-flagstone",
            "name": "Worn Castle Flagstone",
            "category": "Flooring (Bump/Height)",
            "toolRole": "floor-texture",
            "isFloor": True,
            "isWall": False,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone.png",
            "normalUrl": "/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone_normal.png",
        },
        {
            "id": "bump-raised-cobbles",
            "name": "Raised Cobbles Floor",
            "category": "Flooring (Bump/Height)",
            "toolRole": "floor-texture",
            "isFloor": True,
            "isWall": False,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/light-aware-assets-v1/new/256/new-raised-cobbles.png",
            "normalUrl": "/assets/light-aware-assets-v1/new/256/new-raised-cobbles_normal.png",
        },
        {
            "id": "bump-broken-slate-floor",
            "name": "Broken Slate Floor",
            "category": "Flooring (Bump/Height)",
            "toolRole": "floor-texture",
            "isFloor": True,
            "isWall": False,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/light-aware-assets-v1/new/256/new-broken-slate-floor.png",
            "normalUrl": "/assets/light-aware-assets-v1/new/256/new-broken-slate-floor_normal.png",
        },
        {
            "id": "bump-root-moss-floor",
            "name": "Root Moss Floor",
            "category": "Flooring (Bump/Height)",
            "toolRole": "floor-texture",
            "isFloor": True,
            "isWall": False,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/light-aware-assets-v1/new/256/new-root-moss-floor.png",
            "normalUrl": "/assets/light-aware-assets-v1/new/256/new-root-moss-floor_normal.png",
        },
        {
            "id": "bump-pitted-basalt",
            "name": "Pitted Basalt Floor",
            "category": "Flooring (Bump/Height)",
            "toolRole": "floor-texture",
            "isFloor": True,
            "isWall": False,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/light-aware-assets-v1/new/256/new-pitted-basalt.png",
            "normalUrl": "/assets/light-aware-assets-v1/new/256/new-pitted-basalt_normal.png",
        },
        {
            "id": "bump-worn-castle-wall",
            "name": "Worn Castle Ashlar Masonry",
            "category": "Walls & Cliffs (Bump/Height)",
            "toolRole": "wall-texture",
            "isFloor": False,
            "isWall": True,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone.png",
            "normalUrl": "/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone_normal.png",
        },
        {
            "id": "bump-raised-cobble-wall",
            "name": "Fortified Cobble & Mortar Wall",
            "category": "Walls & Cliffs (Bump/Height)",
            "toolRole": "wall-texture",
            "isFloor": False,
            "isWall": True,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/light-aware-assets-v1/new/256/new-raised-cobbles.png",
            "normalUrl": "/assets/light-aware-assets-v1/new/256/new-raised-cobbles_normal.png",
        },
        {
            "id": "bump-pitted-basalt-wall",
            "name": "Subterranean Basalt Wall",
            "category": "Walls & Cliffs (Bump/Height)",
            "toolRole": "wall-texture",
            "isFloor": False,
            "isWall": True,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/light-aware-assets-v1/new/256/new-pitted-basalt.png",
            "normalUrl": "/assets/light-aware-assets-v1/new/256/new-pitted-basalt_normal.png",
        },
        {
            "id": "bump-root-moss-wall",
            "name": "Overgrown Crypt Moss Wall",
            "category": "Walls & Cliffs (Bump/Height)",
            "toolRole": "wall-texture",
            "isFloor": False,
            "isWall": True,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/light-aware-assets-v1/new/256/new-root-moss-floor.png",
            "normalUrl": "/assets/light-aware-assets-v1/new/256/new-root-moss-floor_normal.png",
        },
        {
            "id": "bump-fallen-buttress-01",
            "name": "Fallen Buttress Wall (Bump)",
            "category": "Walls & Cliffs (Bump/Height)",
            "toolRole": "wall-texture",
            "isFloor": False,
            "isWall": True,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/light-aware-assets-v1/new/256/new-fallen-buttress-01.png",
            "normalUrl": "/assets/light-aware-assets-v1/new/256/new-fallen-buttress-01_normal.png",
        },
        {
            "id": "bump-mossy-stone-wall",
            "name": "Polyhaven Mossy Stone Wall (1K Relief)",
            "category": "Walls & Cliffs (Bump/Height)",
            "toolRole": "wall-texture",
            "isFloor": False,
            "isWall": True,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/terrain-textures/downloads/polyhaven/mossy_stone_wall/1k/color.png",
            "normalUrl": "/assets/terrain-textures/downloads/polyhaven/mossy_stone_wall/1k/normal.png",
            "heightUrl": "/assets/terrain-textures/downloads/polyhaven/mossy_stone_wall/1k/displacement.png",
        },
        {
            "id": "bump-mossy-stone-floor",
            "name": "Polyhaven Mossy Stone Floor (1K Relief)",
            "category": "Flooring (Bump/Height)",
            "toolRole": "floor-texture",
            "isFloor": True,
            "isWall": False,
            "isDoor": False,
            "isObject": False,
            "isScatter": False,
            "albedoUrl": "/assets/terrain-textures/downloads/polyhaven/mossy_stone_wall/1k/color.png",
            "normalUrl": "/assets/terrain-textures/downloads/polyhaven/mossy_stone_wall/1k/normal.png",
            "heightUrl": "/assets/terrain-textures/downloads/polyhaven/mossy_stone_wall/1k/displacement.png",
        },
    ]

    for item in curated_2d:
        seen_ids.add(item["id"])
        entries.append(
            {
                **item,
                "defaultScaleGrid": [1, 1, 1],
                "defaultPlacement": "floor",
                "snapToGrid": True,
                "defaultColorTint": "#ffffff",
            }
        )

    bump_manifest_path = PREVIEWS_DIR / "bump-height-manifest.json"
    if bump_manifest_path.exists():
        raw_bump = json.loads(bump_manifest_path.read_text(encoding="utf-8"))
        for item in raw_bump.get("items", raw_bump.get("assets", [])):
            aid = item.get("id", "")
            if not aid or aid in seen_ids:
                continue
            seen_ids.add(aid)
            name = item.get("name", aid)
            category = item.get("category", "Stamps & Props (Bump/Height)")
            is_floor = bool(item.get("isFloor", False))
            is_wall = not is_floor and is_wall_name(name, category)
            role = "floor-texture" if is_floor else ("wall-texture" if is_wall else "floor-stamp-2d")
            entries.append(
                {
                    "id": aid,
                    "name": name,
                    "category": category,
                    "toolRole": role,
                    "isFloor": is_floor,
                    "isWall": is_wall,
                    "isDoor": False,
                    "isObject": not is_floor and not is_wall,
                    "isScatter": False,
                    "albedoUrl": item.get("albedoUrl", ""),
                    "normalUrl": item.get("normalUrl", ""),
                    "defaultScaleGrid": [1, 1, 1],
                    "defaultPlacement": "floor",
                    "snapToGrid": True,
                    "defaultColorTint": "#ffffff",
                }
            )

    for item in cleaned_manifest_assets:
        aid = item["id"]
        if aid in seen_ids:
            continue
        seen_ids.add(aid)
        entries.append(
            {
                "id": aid,
                "name": item["name"],
                "category": item["category"],
                "sourceFile": item["sourceFile"],
                "toolRole": item["toolRole"],
                "isFloor": item["isFloor"],
                "isWall": item["isWall"],
                "isDoor": item["isDoor"],
                "isObject": item["isObject"],
                "isScatter": item["isScatter"],
                "modelUrl": item["modelUrl"],
                "glbUrl": item["glbUrl"],
                "thumbnailUrl": item["pngPreviewUrl"],
                "pngPreviewUrl": item["pngPreviewUrl"],
                "widthSq": item["widthSq"],
                "depthSq": item["depthSq"],
                "heightSq": item["heightSq"],
                "defaultWidthFt": item["defaultWidthFt"],
                "defaultScaleGrid": item["defaultScaleGrid"],
                "defaultPlacement": item["defaultPlacement"],
                "snapToGrid": item["snapToGrid"],
                "defaultColorTint": item["defaultColorTint"],
                "matVisCategory": item["matVisCategory"],
                "matVisCategoryId": item["matVisCategoryId"],
                "matVisTool": item["matVisTool"],
                "randomGroup": item["randomGroup"],
                "randomGroupLabel": item["randomGroupLabel"],
                "randomSettings": item["randomSettings"],
                "lodVariants": item["lodVariants"],
            }
        )

    apc_payload = {
        "schemaVersion": "2.2.0",
        "description": (
            "Editable LoomMaps Asset Properties Catalog. Modify toolRole ('wall-texture' | 'floor-texture' | "
            "'wall-3d' | 'door-3d' | 'object-3d' | 'scatter-3d' | 'floor-stamp-2d'), isWall, isFloor, isDoor, "
            "isObject, isScatter, defaultScaleGrid ([X, Y, Z] in 5ft squares), lodVariants.{low,mid,high}.stampScale "
            "or defaultScaleGrid, defaultPlacement ('floor' | 'custom'), snapToGrid, or defaultColorTint."
        ),
        "qualityMap": QUALITY_MAP,
        "randomGroups": RANDOM_GROUP_DEFINITIONS,
        "totalAssets": len(entries),
        "assets": entries,
    }

    # 6. Write all JSON files to c:\map assets\catalogs, c:\map assets\previews-png, c:\map assets\3d-models, and repo public dirs
    mat_vis_json = json.dumps(mat_vis_payload, indent=2)
    apc_json = json.dumps(apc_payload, indent=2)
    manifest_3d_json = json.dumps(manifest_3d_payload, indent=2)
    registry_json = json.dumps(registry_payload, indent=2)

    (CATALOGS_DIR / "mat-vis-assets.json").write_text(mat_vis_json, encoding="utf-8")
    (CATALOGS_DIR / "asset-properties-catalog.json").write_text(apc_json, encoding="utf-8")
    (CATALOGS_DIR / "manifest.json").write_text(manifest_3d_json, encoding="utf-8")
    (CATALOGS_DIR / "models-registry.json").write_text(registry_json, encoding="utf-8")
    if bump_manifest_path.exists():
        shutil.copyfile(bump_manifest_path, CATALOGS_DIR / "bump-height-manifest.json")
    if (MODELS_3D_DIR / "glb-shrink-manifest.json").exists():
        shutil.copyfile(MODELS_3D_DIR / "glb-shrink-manifest.json", CATALOGS_DIR / "glb-shrink-manifest.json")

    lw_manifest = {
        "schemaVersion": "2.1.0",
        "root": "c:\\map assets",
        "qualityMap": QUALITY_MAP,
        "categories": {
            "models-3d-base": len(registry_models),
            "models-3d-tier-files": len(new_mv_assets),
            "scatter-enabled-3d": sum(1 for a in cleaned_manifest_assets if a.get("isScatter")),
            "stamps-2d": 928,
            "terrain-textures": 16,
            "catalogs": 6,
        },
        "catalogFiles": [
            "mat-vis-assets.json",
            "asset-properties-catalog.json",
            "manifest.json",
            "models-registry.json",
            "bump-height-manifest.json",
            "glb-shrink-manifest.json",
        ],
        "stampsSubfolders": [
            "furniture",
            "props",
            "room-bundles-v1",
            "room-furnishings-v1",
            "table-room-decor-v1",
        ],
        "terrainSubfolders": [
            "castle-timber",
            "downloads",
            "sewer-dungeon-wall-library-v1",
            "walls",
        ],
    }
    (CATALOGS_DIR / "loomweaver-asset-manifest.json").write_text(json.dumps(lw_manifest, indent=2), encoding="utf-8")

    if PREVIEWS_DIR.exists():
        (PREVIEWS_DIR / "manifest.json").write_text(manifest_3d_json, encoding="utf-8")
        (PREVIEWS_DIR / "asset-properties-catalog.json").write_text(apc_json, encoding="utf-8")
    if MODELS_3D_DIR.exists():
        (MODELS_3D_DIR / "models-registry.json").write_text(registry_json, encoding="utf-8")

    for target in [
        REPO_ROOT / "asset-properties-catalog.json",
        STUDIO_PUBLIC / "asset-properties-catalog.json",
        FRONTEND_PUBLIC / "asset-properties-catalog.json",
    ]:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(apc_json, encoding="utf-8")

    fe_previews = FRONTEND_PUBLIC / "assets" / "previews-png"
    if fe_previews.exists():
        (fe_previews / "manifest.json").write_text(manifest_3d_json, encoding="utf-8")

    fe_catalogs = FRONTEND_PUBLIC / "assets" / "catalogs"
    fe_catalogs.mkdir(parents=True, exist_ok=True)
    (fe_catalogs / "mat-vis-assets.json").write_text(mat_vis_json, encoding="utf-8")
    (fe_catalogs / "loomweaver-asset-manifest.json").write_text(json.dumps(lw_manifest, indent=2), encoding="utf-8")

    print(
        f"Synchronized catalogs: {len(registry_models)} 3D base models ({len(new_mv_assets)} high/mid/low GLB files), "
        f"{sum(1 for a in cleaned_manifest_assets if a.get('isScatter'))} scatter-enabled 3D stamps, "
        f"{len(entries)} total catalog entries."
    )
    return apc_payload


if __name__ == "__main__":
    build_all_catalogs()
