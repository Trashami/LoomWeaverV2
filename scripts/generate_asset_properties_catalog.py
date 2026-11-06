#!/usr/bin/env python3
"""
Generates a human-editable JSON catalog (`asset-properties-catalog.json`) of all
2D Bump/Height textures, 2D Floor Stamps, and 3D Objects so GMs/admins can
inspect and manually override tool classifications, default grid scale (1x1x1),
default placement ('floor' | 'custom'), and default color tint.
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MAP_ASSETS_PREVIEWS = Path(r"c:\map assets\previews-png")
STUDIO_PUBLIC = REPO_ROOT / "loommaps-studio" / "public"
FRONTEND_PUBLIC = REPO_ROOT / "frontend" / "public"


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


def build_catalog() -> dict:
    entries = []
    seen_ids = set()

    # 1. Curated 2D Bump/Height Flooring & Wall Masonry Textures
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

    # 2. Load 2D bump-height manifest if available
    bump_manifest_path = MAP_ASSETS_PREVIEWS / "bump-height-manifest.json"
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
                    "albedoUrl": item.get("albedoUrl", ""),
                    "normalUrl": item.get("normalUrl", ""),
                    "defaultScaleGrid": [1, 1, 1],
                    "defaultPlacement": "floor",
                    "snapToGrid": True,
                    "defaultColorTint": "#ffffff",
                }
            )

    # 3. Load 3D manifest if available
    manifest_3d_path = MAP_ASSETS_PREVIEWS / "manifest.json"
    if manifest_3d_path.exists():
        raw_3d = json.loads(manifest_3d_path.read_text(encoding="utf-8"))
        for item in raw_3d.get("assets", raw_3d.get("items", [])):
            aid = item.get("id", "")
            if not aid or aid in seen_ids:
                continue
            seen_ids.add(aid)
            name = item.get("name", aid)
            category = item.get("category", "Props")
            mv_cat = item.get("matVisCategory", "")
            mv_tool = item.get("matVisTool", "")
            is_door = is_door_name(name)
            # 3D assets are never used as procedural wall/shape textures unless explicitly overridden by user
            role = "door-3d" if is_door else "object-3d"
            src_file = item.get("sourceFile", "")
            model_url = (
                f"/assets/models-3d/{src_file}"
                if src_file
                else (item.get("glbUrl") or item.get("modelUrl") or f"/assets/object-library/models/{aid}.glb")
            )
            entries.append(
                {
                    "id": aid,
                    "name": name,
                    "category": category,
                    "toolRole": role,
                    "isFloor": False,
                    "isWall": False,
                    "isDoor": is_door,
                    "isObject": not is_door,
                    "modelUrl": model_url,
                    "thumbnailUrl": item.get("pngPreviewUrl") or item.get("thumbnailUrl") or f"/assets/previews-png/{aid}.png",
                    "defaultScaleGrid": [1, 1, 1],
                    "defaultPlacement": "floor",
                    "snapToGrid": True,
                    "defaultColorTint": "#ffffff",
                    **({"matVisCategory": mv_cat, "matVisTool": mv_tool} if mv_cat else {}),
                }
            )

    return {
        "schemaVersion": "1.0.0",
        "description": (
            "Editable LoomMaps Asset Properties Catalog. Modify toolRole ('wall-texture' | 'floor-texture' | "
            "'door-3d' | 'object-3d' | 'floor-stamp-2d'), isWall, isFloor, isDoor, isObject, defaultScaleGrid ([X, Y, Z] in 5ft squares), "
            "defaultPlacement ('floor' | 'custom'), snapToGrid (true/false), or defaultColorTint ('#ffffff') to customize any asset."
        ),
        "totalAssets": len(entries),
        "assets": entries,
    }


def main() -> None:
    catalog = build_catalog()
    payload = json.dumps(catalog, indent=2)

    targets = [
        REPO_ROOT / "asset-properties-catalog.json",
        STUDIO_PUBLIC / "asset-properties-catalog.json",
        FRONTEND_PUBLIC / "asset-properties-catalog.json",
    ]
    if MAP_ASSETS_PREVIEWS.exists():
        targets.append(MAP_ASSETS_PREVIEWS / "asset-properties-catalog.json")

    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload, encoding="utf-8")
        print(f"Wrote {catalog['totalAssets']} asset property definitions -> {target}")


if __name__ == "__main__":
    main()
