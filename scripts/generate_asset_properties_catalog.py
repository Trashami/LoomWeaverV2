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
    },
    "173cd8d9-4251-4ef9-a467-ec9b13012970": {
        "id": "173cd8d9-4251-4ef9-a467-ec9b13012970",
        "name": "monster_tokens",
        "tool": "single_stamp",
        "description": "monster tokens",
        "folder": "monster_tokens-173cd8d9",
    },
    "973688a2-2f09-4bf4-a830-89822dfbe1c7": {
        "id": "973688a2-2f09-4bf4-a830-89822dfbe1c7",
        "name": "floor_stamps",
        "tool": "tiled_stamp",
        "description": "flooring stamps",
        "folder": "floor_stamps-973688a2",
    },
    "15a695c4-424d-4afb-a806-0957b49a6bbc": {
        "id": "15a695c4-424d-4afb-a806-0957b49a6bbc",
        "name": "buildings",
        "tool": "single_stamp",
        "description": "decorative_buildings",
        "folder": "buildings-15a695c4",
    },
    "f230d77d-a70a-4d61-860d-6105ce295173": {
        "id": "f230d77d-a70a-4d61-860d-6105ce295173",
        "name": "props",
        "tool": "single_stamp",
        "description": "single stamp props",
        "folder": "props-f230d77d",
    },
    "f9134ab4-9d42-4783-8be1-8482909d0859": {
        "id": "f9134ab4-9d42-4783-8be1-8482909d0859",
        "name": "walls",
        "tool": "wall_stamp",
        "description": "wall stamps",
        "folder": "walls-f9134ab4",
    },
    "6173d279-89a3-4c51-ae5c-4ab36fb6d469": {
        "id": "6173d279-89a3-4c51-ae5c-4ab36fb6d469",
        "name": "grass_floor",
        "tool": "randon_stamp",
        "description": "random stamping of grass and scatter foliage",
        "folder": "grass_floor-6173d279",
    },
}

CAT_ID_HERO = "439123c6-7532-4044-92e1-0050bd1e97ea"
CAT_ID_MONSTER = "173cd8d9-4251-4ef9-a467-ec9b13012970"
CAT_ID_FLOOR = "973688a2-2f09-4bf4-a830-89822dfbe1c7"
CAT_ID_BUILDING = "15a695c4-424d-4afb-a806-0957b49a6bbc"
CAT_ID_PROP = "f230d77d-a70a-4d61-860d-6105ce295173"
CAT_ID_WALL = "f9134ab4-9d42-4783-8be1-8482909d0859"
CAT_ID_SCATTER = "6173d279-89a3-4c51-ae5c-4ab36fb6d469"


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


def is_scatter_candidate(name: str, studio_category: str, mv_tool: str = "") -> bool:
    if mv_tool in ("randon_stamp", "random_stamp", "scatter", "scatter_stamp"):
        return True
    if studio_category in ("Nature", "Rocks & Cliffs"):
        return True
    n = name.lower()
    return any(
        k in n
        for k in (
            "tree",
            "fern",
            "grass",
            "sedge",
            "plume",
            "euphorbia",
            "bush",
            "shrub",
            "plant",
            "flower",
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


def infer_mat_vis_category_id(name: str, studio_category: str) -> str:
    n = name.lower()
    if is_scatter_candidate(name, studio_category):
        return CAT_ID_SCATTER
    if is_wall_name(name, studio_category) and not is_door_name(name):
        return CAT_ID_WALL
    if is_floor_tile_name(name):
        return CAT_ID_FLOOR
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

    mv_categories: dict[str, dict[str, Any]] = {
        **DEFAULT_MAT_VIS_CATEGORIES,
        **(existing_mat_vis.get("categories") or {}),
    }
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
        man_entry = manifest_by_base.get(base, {})
        mid_var = variants.get("mid") or variants.get("low") or variants.get("high") or {}
        aid = man_entry.get("id") or f"obj-{ (mid_var.get('sha256') or hashlib.sha256(base.encode()).hexdigest())[:16] }"
        apc_ov = existing_apc_by_id.get(aid, {})

        name = apc_ov.get("name") or man_entry.get("name") or clean_display_name(base)
        studio_cat = apc_ov.get("category") or man_entry.get("category") or "Props"

        # Determine mat-vis categoryId from existing mat-vis-assets.json if present for any tier
        chosen_cat_id = None
        for q in ("high", "mid", "low"):
            mv_key = f"3d-models/{base}_{q}.glb"
            if mv_key in existing_mv_assets and existing_mv_assets[mv_key].get("categoryId"):
                chosen_cat_id = existing_mv_assets[mv_key]["categoryId"]
                break
        if not chosen_cat_id:
            chosen_cat_id = infer_mat_vis_category_id(name, studio_cat)

        mv_cat_obj = mv_categories.get(chosen_cat_id, DEFAULT_MAT_VIS_CATEGORIES[CAT_ID_PROP])
        mv_cat_name = mv_cat_obj.get("name", "props")
        mv_tool = mv_cat_obj.get("tool", "single_stamp")

        is_door = bool(apc_ov.get("isDoor", is_door_name(name)))
        is_wall = bool(apc_ov.get("isWall", mv_tool == "wall_stamp"))
        is_floor = bool(apc_ov.get("isFloor", False))
        is_scatter = bool(
            apc_ov.get(
                "isScatter",
                is_scatter_candidate(name, studio_cat, mv_tool),
            )
        )
        is_object = bool(apc_ov.get("isObject", not is_door))

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
        base_model_url = f"/assets/models-3d/{base}.glb"
        triangles = int(man_entry.get("triangles", 0))

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
        "schemaVersion": "2.1.0",
        "totalAssets": len(cleaned_manifest_assets),
        "renderedCount": raw_manifest_3d.get("renderedCount", 0),
        "cachedCount": len(cleaned_manifest_assets),
        "categories": cat_counts,
        "assets": cleaned_manifest_assets,
    }

    mat_vis_payload = {
        "version": 1,
        "schemaVersion": "2.1.0",
        "qualityMap": QUALITY_MAP,
        "categories": mv_categories,
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
                "lodVariants": item["lodVariants"],
            }
        )

    apc_payload = {
        "schemaVersion": "2.1.0",
        "description": (
            "Editable LoomMaps Asset Properties Catalog. Modify toolRole ('wall-texture' | 'floor-texture' | "
            "'wall-3d' | 'door-3d' | 'object-3d' | 'scatter-3d' | 'floor-stamp-2d'), isWall, isFloor, isDoor, "
            "isObject, isScatter, defaultScaleGrid ([X, Y, Z] in 5ft squares), lodVariants.{low,mid,high}.stampScale "
            "or defaultScaleGrid, defaultPlacement ('floor' | 'custom'), snapToGrid, or defaultColorTint."
        ),
        "qualityMap": QUALITY_MAP,
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
