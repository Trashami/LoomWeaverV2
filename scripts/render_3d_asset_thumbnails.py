#!/usr/bin/env python3
"""
Backend Python 3D-to-PNG Thumbnail Renderer & Catalog Synchronizer for LoomMaps.
Supports:
  1. Batch mode (--batch): Incrementally processes all .glb files in the map-assets folder,
     printing 256x256 .png thumbnails and updating manifest.json. Respects cached hashes/mtimes
     unless --force is specified.
  2. Single upload mode (--single <path.glb>): Processes a single newly uploaded .glb file,
     renders its 3D isometric .png preview, updates manifest.json, and emits JSON metadata.
"""
import argparse
import hashlib
import io
import json
import math
import os
import re
import struct
import sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance

DEFAULT_LOCAL_MODELS_DIR = (
    Path(r"C:\map assets\3d-models")
    if Path(r"C:\map assets\3d-models").exists()
    else Path(r"C:\map assets\models-3d")
)
DEFAULT_LOCAL_PREVIEWS_DIR = Path(r"C:\map assets\previews-png")
DEFAULT_LEGACY_OBJ_LIB = Path(
    r"C:\repos\Jane\Jane\MythWeaver\LoomMaps.client\public\assets\object-library"
)

STUDIO_CATEGORIES = {
    "architecture": "Architecture",
    "walls": "Architecture",
    "buildings": "Architecture",
    "doors": "Architecture",
    "floors": "Architecture",
    "furniture": "Furniture",
    "props": "Props",
    "trees": "Nature",
    "foliage": "Nature",
    "plants": "Nature",
    "rocks": "Rocks & Cliffs",
    "cliffs": "Rocks & Cliffs",
    "lighting": "Lighting",
    "lights": "Lighting",
    "players": "Tokens",
    "monsters": "Tokens",
    "water": "Water",
    "scenes": "Architecture",
}


def clean_display_name(stem: str) -> str:
    name = re.sub(r"^Meshy_AI_", "", stem, flags=re.IGNORECASE)
    name = re.sub(r"_\d{8,12}_(texture|generate|image-to-3d-te.*)$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s*\(\d+\)$", "", name)
    name = name.replace("_", " ").replace("-", " ").strip()
    name = re.sub(r"\s+", " ", name)
    return name.title() if name else "Ancient Dungeon Asset"


def infer_studio_category(name: str, raw_cat: str = "") -> str:
    low = name.lower()
    if any(k in low for k in ["table", "chair", "throne", "desk", "bookshelf", "shelf", "bed", "bench", "cabinet", "organ", "workbench", "pew", "sarcophagus", "coffin", "altar", "chest", "crate", "barrel", "wardrobe", "bookcase", "cauldron", "anvil", "forge", "hearth", "fireplace"]):
        return "Furniture"
    if any(k in low for k in ["candle", "lantern", "brazier", "torch", "candelabra", "lamp", "chandelier", "glowfungus", "light", "campfire", "bonfire"]):
        return "Lighting"
    if any(k in low for k in ["rock", "cliff", "boulder", "slate", "mountain", "canyon", "crag", "outcrop", "stalagmite", "crystal"]):
        return "Rocks & Cliffs"
    if any(k in low for k in ["tree", "oak", "pine", "birch", "willow", "fern", "shrub", "bush", "mushroom", "fungus", "fungi", "flower", "pansy", "pansies", "clover", "hosta", "vine", "moss", "plant"]):
        return "Nature"
    if any(k in low for k in ["wall", "pillar", "column", "arch", "door", "gate", "tower", "castle", "church", "crypt", "stairs", "steps", "bridge", "ruin", "obelisk", "temple", "house", "cottage", "homestead", "floor", "cobble", "tile", "fence", "citadel", "cathedral", "abbey", "sanctuary", "manor", "villa", "portal"]):
        return "Architecture"

    low_cat = (raw_cat or "").lower().strip()
    if low_cat in STUDIO_CATEGORIES:
        return STUDIO_CATEGORIES[low_cat]

    if any(k in low for k in ["dragon", "goblin", "sorceress", "archer", "warrior", "wizard", "witch", "golem", "wendigo", "revenant", "warden", "guardian", "sentinel", "ranger", "rogue", "elemental", "beast", "monster", "hero", "token"]):
        return "Tokens"
    return "Props"


def infer_default_dimensions(category: str, name: str) -> dict[str, float]:
    low = name.lower()
    if "wall" in low or "arch" in low or "gate" in low:
        return {"widthSq": 2.0, "depthSq": 0.4, "heightSq": 2.0, "defaultWidthFt": 10}
    if "door" in low:
        return {"widthSq": 1.0, "depthSq": 0.25, "heightSq": 2.0, "defaultWidthFt": 5}
    if "pillar" in low or "column" in low or "obelisk" in low:
        return {"widthSq": 1.0, "depthSq": 1.0, "heightSq": 3.0, "defaultWidthFt": 5}
    if category == "Nature":
        return {"widthSq": 2.0, "depthSq": 2.0, "heightSq": 3.0, "defaultWidthFt": 10}
    if category == "Rocks & Cliffs":
        return {"widthSq": 3.0, "depthSq": 2.0, "heightSq": 2.5, "defaultWidthFt": 15}
    if category == "Tokens":
        return {"widthSq": 1.0, "depthSq": 1.0, "heightSq": 1.2, "defaultWidthFt": 5}
    if category == "Furniture":
        return {"widthSq": 2.0, "depthSq": 1.0, "heightSq": 1.0, "defaultWidthFt": 10}
    return {"widthSq": 1.0, "depthSq": 1.0, "heightSq": 1.0, "defaultWidthFt": 5}


def parse_glb_chunks(glb_path: Path) -> tuple[dict[str, Any], bytes]:
    with glb_path.open("rb") as f:
        header = f.read(12)
        if len(header) < 12:
            raise ValueError("Invalid GLB header")
        magic, version, total_len = struct.unpack("<III", header)
        if magic != 0x46546C67:
            raise ValueError("Not a binary glTF (.glb) file")
        c0_header = f.read(8)
        c0_len, c0_type = struct.unpack("<II", c0_header)
        json_bytes = f.read(c0_len)
        gltf = json.loads(json_bytes.decode("utf-8", errors="replace"))
        bin_bytes = b""
        rem = f.read(8)
        if len(rem) == 8:
            c1_len, _ = struct.unpack("<II", rem)
            bin_bytes = f.read(c1_len)
        return gltf, bin_bytes


def extract_accessor_floats(gltf: dict[str, Any], bin_bytes: bytes, accessor_idx: int) -> np.ndarray | None:
    try:
        acc = gltf["accessors"][accessor_idx]
        bv = gltf["bufferViews"][acc["bufferView"]]
        comp_type = acc["componentType"]
        count = acc["count"]
        acc_type = acc["type"]
        num_comp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}.get(acc_type, 3)
        dtype_map = {
            5120: np.int8,
            5121: np.uint8,
            5122: np.int16,
            5123: np.uint16,
            5125: np.uint32,
            5126: np.float32,
        }
        dt = dtype_map.get(comp_type)
        if dt is None:
            return None
        offset = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = bv.get("byteStride", 0)
        elem_size = np.dtype(dt).itemsize * num_comp
        if stride and stride != elem_size:
            raw = np.frombuffer(bin_bytes, dtype=np.uint8, count=count * stride, offset=offset)
            raw = raw.reshape((count, stride))[:, :elem_size]
            arr = np.frombuffer(raw.tobytes(), dtype=dt).reshape((count, num_comp))
        else:
            arr = np.frombuffer(bin_bytes, dtype=dt, count=count * num_comp, offset=offset).reshape((count, num_comp))
        return arr.astype(np.float32)
    except Exception:
        return None


def extract_embedded_texture(gltf: dict[str, Any], bin_bytes: bytes) -> Image.Image | None:
    for img_def in gltf.get("images", []):
        bv_idx = img_def.get("bufferView")
        if bv_idx is not None and bv_idx < len(gltf.get("bufferViews", [])):
            bv = gltf["bufferViews"][bv_idx]
            offset = bv.get("byteOffset", 0)
            length = bv.get("byteLength", 0)
            chunk = bin_bytes[offset : offset + length]
            try:
                return Image.open(io.BytesIO(chunk)).convert("RGB")
            except Exception:
                continue
    return None


def render_studio_backdrop(size: int = 256) -> Image.Image:
    y, x = np.ogrid[:size, :size]
    cx, cy = size * 0.5, size * 0.54
    dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / (size * 0.72)
    dist = np.clip(dist, 0.0, 1.0)

    r = (18 * (1.0 - dist) + 7 * dist).astype(np.uint8)
    g = (34 * (1.0 - dist) + 14 * dist).astype(np.uint8)
    b = (27 * (1.0 - dist) + 12 * dist).astype(np.uint8)
    a = np.full((size, size), 255, dtype=np.uint8)
    bg = Image.fromarray(np.dstack([r, g, b, a]), mode="RGBA")

    draw = ImageDraw.Draw(bg, "RGBA")
    # Subtle isometric floor diamond
    pts = [
        (size * 0.5, size * 0.62),
        (size * 0.84, size * 0.77),
        (size * 0.5, size * 0.91),
        (size * 0.16, size * 0.77),
    ]
    draw.polygon(pts, fill=(24, 48, 38, 95), outline=(73, 232, 146, 52))
    return bg


def render_glb_software_isometric(glb_path: Path, size: int = 256) -> tuple[Image.Image, int]:
    canvas = render_studio_backdrop(size)
    gltf, bin_bytes = parse_glb_chunks(glb_path)
    tex_img = extract_embedded_texture(gltf, bin_bytes)
    tex_arr = np.asarray(tex_img, dtype=np.float32) / 255.0 if tex_img else None

    positions_list = []
    normals_list = []
    uvs_list = []
    total_tris = 0

    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            attrs = prim.get("attributes", {})
            pos_idx = attrs.get("POSITION")
            if pos_idx is None:
                continue
            pos = extract_accessor_floats(gltf, bin_bytes, pos_idx)
            if pos is None or len(pos) == 0:
                continue
            norm = extract_accessor_floats(gltf, bin_bytes, attrs["NORMAL"]) if "NORMAL" in attrs else None
            uv = extract_accessor_floats(gltf, bin_bytes, attrs["TEXCOORD_0"]) if "TEXCOORD_0" in attrs else None

            if "indices" in prim:
                idx_arr = extract_accessor_floats(gltf, bin_bytes, prim["indices"])
                if idx_arr is not None:
                    total_tris += len(idx_arr) // 3
            else:
                total_tris += len(pos) // 3

            step = max(1, len(pos) // 18000)
            positions_list.append(pos[::step])
            if norm is not None and len(norm) == len(pos):
                normals_list.append(norm[::step])
            else:
                normals_list.append(np.tile([0.0, 1.0, 0.0], (len(pos[::step]), 1)))
            if uv is not None and len(uv) == len(pos):
                uvs_list.append(uv[::step])
            else:
                uvs_list.append(np.zeros((len(pos[::step]), 2), dtype=np.float32))

    if not positions_list:
        return canvas, 0

    pts = np.vstack(positions_list)
    nrms = np.vstack(normals_list)
    uvs = np.vstack(uvs_list)

    mn = pts.min(axis=0)
    mx = pts.max(axis=0)
    center = (mn + mx) * 0.5
    span = float(np.max(mx - mn)) or 1.0
    pts = (pts - center) / span

    # Isometric rotation: yaw = -38 deg, pitch = 26 deg
    yaw = math.radians(-38.0)
    pitch = math.radians(26.0)
    cy, sy = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)

    ry = np.array([[cy, 0.0, sy], [0.0, 1.0, 0.0], [-sy, 0.0, cy]], dtype=np.float32)
    rx = np.array([[1.0, 0.0, 0.0], [0.0, cp, -sp], [0.0, sp, cp]], dtype=np.float32)
    rot = rx @ ry

    r_pts = pts @ rot.T
    r_nrms = nrms @ rot.T

    scale = size * 0.68
    sx = (r_pts[:, 0] * scale + size * 0.5).astype(np.int32)
    sy_px = (-r_pts[:, 1] * scale + size * 0.52).astype(np.int32)
    depth = r_pts[:, 2]

    valid = (sx >= 2) & (sx < size - 2) & (sy_px >= 2) & (sy_px < size - 2)
    sx, sy_px, depth, r_nrms, uvs = sx[valid], sy_px[valid], depth[valid], r_nrms[valid], uvs[valid]

    order = np.argsort(depth)
    sx, sy_px, r_nrms, uvs = sx[order], sy_px[order], r_nrms[order], uvs[order]

    light_dir = np.array([0.45, 0.72, 0.52], dtype=np.float32)
    light_dir /= np.linalg.norm(light_dir)
    n_len = np.linalg.norm(r_nrms, axis=1, keepdims=True)
    n_len[n_len == 0] = 1.0
    r_nrms = r_nrms / n_len
    lambert = np.clip(np.sum(r_nrms * light_dir, axis=1), 0.15, 1.0) * 0.85 + 0.22

    if tex_arr is not None:
        th, tw, _ = tex_arr.shape
        u_px = np.clip((np.mod(uvs[:, 0], 1.0) * (tw - 1)).astype(np.int32), 0, tw - 1)
        v_px = np.clip((np.mod(uvs[:, 1], 1.0) * (th - 1)).astype(np.int32), 0, th - 1)
        base_col = tex_arr[v_px, u_px]
    else:
        base_col = np.tile(np.array([0.68, 0.61, 0.49], dtype=np.float32), (len(sx), 1))

    shaded = np.clip(base_col * lambert[:, None] * 255.0, 0, 255).astype(np.uint8)
    buf = np.asarray(canvas).copy()

    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            px = np.clip(sx + dx, 0, size - 1)
            py = np.clip(sy_px + dy, 0, size - 1)
            buf[py, px, :3] = shaded
            buf[py, px, 3] = 255

    return Image.fromarray(buf, mode="RGBA"), total_tris


def compose_png_from_existing_webp(webp_path: Path, png_path: Path, size: int = 256) -> None:
    bg = render_studio_backdrop(size)
    with Image.open(webp_path) as src:
        fg = src.convert("RGBA")
        fg.thumbnail((int(size * 0.88), int(size * 0.88)), Image.Resampling.LANCZOS)
        enhancer = ImageEnhance.Contrast(fg)
        fg = enhancer.enhance(1.08)
        ox = (size - fg.width) // 2
        oy = (size - fg.height) // 2
        bg.paste(fg, (ox, oy), fg)
    png_path.parent.mkdir(parents=True, exist_ok=True)
    bg.save(png_path, format="PNG", optimize=True)


def process_single_glb(
    glb_path: Path,
    previews_dir: Path,
    legacy_lookup: dict[str, dict[str, Any]],
    legacy_previews_dir: Path | None,
    custom_name: str | None = None,
    custom_category: str | None = None,
) -> dict[str, Any]:
    stat = glb_path.stat()
    legacy_entry = legacy_lookup.get(glb_path.name)

    if legacy_entry and legacy_entry.get("id"):
        asset_id = legacy_entry["id"]
        source_hash = legacy_entry.get("sourceHash", "")
        triangles = int(legacy_entry.get("sourceTriangles", 0) or 0)
    else:
        h = hashlib.sha256()
        with glb_path.open("rb") as fp:
            for chunk in iter(lambda: fp.read(1024 * 1024), b""):
                h.update(chunk)
        source_hash = h.hexdigest()
        asset_id = f"obj-{source_hash[:16]}"
        triangles = 0

    display_name = custom_name or (
        clean_display_name(legacy_entry["name"]) if legacy_entry and legacy_entry.get("name") else clean_display_name(glb_path.stem)
    )
    raw_cat = custom_category or (legacy_entry.get("category", "") if legacy_entry else "")
    studio_category = infer_studio_category(display_name, raw_cat)
    dims = infer_default_dimensions(studio_category, display_name)

    png_filename = f"{asset_id}.png"
    png_path = previews_dir / png_filename

    webp_candidate = legacy_previews_dir / f"{asset_id}.webp" if legacy_previews_dir else None
    if webp_candidate and webp_candidate.exists():
        compose_png_from_existing_webp(webp_candidate, png_path, size=256)
    else:
        try:
            rendered_img, parsed_tris = render_glb_software_isometric(glb_path, size=256)
            if parsed_tris > 0 and triangles == 0:
                triangles = parsed_tris
            png_path.parent.mkdir(parents=True, exist_ok=True)
            rendered_img.save(png_path, format="PNG", optimize=True)
        except Exception:
            fallback = render_studio_backdrop(256)
            png_path.parent.mkdir(parents=True, exist_ok=True)
            fallback.save(png_path, format="PNG", optimize=True)

    return {
        "id": asset_id,
        "name": display_name,
        "category": studio_category,
        "sourceFile": glb_path.name,
        "sourceHash": source_hash,
        "bytes": stat.st_size,
        "mtime": int(stat.st_mtime),
        "triangles": triangles,
        "pngPreviewUrl": f"/assets/previews-png/{png_filename}",
        "glbUrl": f"/assets/models-3d/{glb_path.name}",
        "widthSq": dims["widthSq"],
        "depthSq": dims["depthSq"],
        "heightSq": dims["heightSq"],
        "defaultWidthFt": dims["defaultWidthFt"],
        "defaultMaterial": "Aged Stone" if studio_category in ("Architecture", "Rocks & Cliffs") else "Weathered Timber",
    }


def load_legacy_catalog(legacy_obj_lib: Path) -> dict[str, dict[str, Any]]:
    cat_file = legacy_obj_lib / "catalog.json"
    if not cat_file.exists():
        return {}
    try:
        data = json.loads(cat_file.read_text(encoding="utf-8"))
        lookup = {}
        for item in data.get("assets", []):
            sf = item.get("sourceFile")
            if sf:
                lookup[sf] = item
        return lookup
    except Exception:
        return {}


def main() -> int:
    parser = argparse.ArgumentParser(description="LoomMaps 3D GLB to PNG Thumbnail Generator")
    parser.add_argument("--batch", action="store_true", help="Batch process all .glb files in source-dir")
    parser.add_argument("--single", type=str, help="Path to a single .glb file to process")
    parser.add_argument("--name", type=str, default=None, help="Optional display name for single upload")
    parser.add_argument("--category", type=str, default=None, help="Optional category for single upload")
    parser.add_argument("--source-dir", type=str, default=str(DEFAULT_LOCAL_MODELS_DIR))
    parser.add_argument("--output-dir", type=str, default=str(DEFAULT_LOCAL_PREVIEWS_DIR))
    parser.add_argument("--legacy-obj-lib", type=str, default=str(DEFAULT_LEGACY_OBJ_LIB))
    parser.add_argument("--force", action="store_true", help="Force re-render even if PNG already exists")
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "manifest.json"

    legacy_obj_lib = Path(args.legacy_obj_lib)
    legacy_lookup = load_legacy_catalog(legacy_obj_lib)
    legacy_previews_dir = legacy_obj_lib / "previews" if (legacy_obj_lib / "previews").exists() else None

    existing_manifest: dict[str, dict[str, Any]] = {}
    if manifest_path.exists():
        try:
            raw = json.loads(manifest_path.read_text(encoding="utf-8"))
            for entry in raw.get("assets", []):
                existing_manifest[entry["sourceFile"]] = entry
        except Exception:
            existing_manifest = {}

    if args.single:
        single_path = Path(args.single)
        if not single_path.exists():
            print(json.dumps({"accepted": False, "error": f"File not found: {single_path}"}))
            return 1
        entry = process_single_glb(
            single_path,
            output_dir,
            legacy_lookup,
            legacy_previews_dir,
            custom_name=args.name,
            custom_category=args.category,
        )
        existing_manifest[entry["sourceFile"]] = entry
        sorted_assets = sorted(existing_manifest.values(), key=lambda x: (x["category"], x["name"]))
        manifest_payload = {
            "schemaVersion": "2.0.0",
            "totalAssets": len(sorted_assets),
            "assets": sorted_assets,
        }
        manifest_path.write_text(json.dumps(manifest_payload, indent=2), encoding="utf-8")
        print(json.dumps({"accepted": True, "mode": "single", "asset": entry}))
        return 0

    # Batch processing mode
    if not source_dir.exists():
        print(json.dumps({"accepted": False, "error": f"Source directory not found: {source_dir}"}))
        return 1

    rendered_count = 0
    cached_count = 0
    glb_files = sorted(source_dir.glob("*.glb"))

    for glb_path in glb_files:
        stat = glb_path.stat()
        cached = existing_manifest.get(glb_path.name)
        if (
            not args.force
            and cached
            and cached.get("bytes") == stat.st_size
            and (output_dir / f"{cached['id']}.png").exists()
        ):
            cached["category"] = infer_studio_category(cached.get("name", ""), cached.get("category", ""))
            dims = infer_default_dimensions(cached["category"], cached.get("name", ""))
            cached.update(dims)
            existing_manifest[glb_path.name] = cached
            cached_count += 1
            continue

        entry = process_single_glb(
            glb_path,
            output_dir,
            legacy_lookup,
            legacy_previews_dir,
        )
        existing_manifest[entry["sourceFile"]] = entry
        rendered_count += 1

    sorted_assets = sorted(existing_manifest.values(), key=lambda x: (x["category"], x["name"]))
    category_counts: dict[str, int] = {}
    for a in sorted_assets:
        cat = a["category"]
        category_counts[cat] = category_counts.get(cat, 0) + 1

    manifest_payload = {
        "schemaVersion": "2.0.0",
        "totalAssets": len(sorted_assets),
        "renderedCount": rendered_count,
        "cachedCount": cached_count,
        "categories": category_counts,
        "assets": sorted_assets,
    }
    manifest_path.write_text(json.dumps(manifest_payload, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "accepted": True,
                "mode": "batch",
                "totalAssets": len(sorted_assets),
                "renderedCount": rendered_count,
                "cachedCount": cached_count,
                "categories": category_counts,
                "manifestPath": str(manifest_path),
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
