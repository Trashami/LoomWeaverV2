"""Verify that every image path referenced in 5etools data JSON exists in the image repo.

Image paths in 5etools data are relative to the image root, e.g.
    "path": "items/MOT/Akmon, Hammer of Purphoros.webp"
Matching is case-sensitive, because the server runs Linux even when this runs on Windows.

Usage:
    python scripts/verify_5etools_image_refs.py
    python scripts/verify_5etools_image_refs.py --data path\\to\\data --img path\\to\\img --report out.json
Exit code is 1 when any reference is missing.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGE_EXTS = (".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg")
DEFAULT_DATA = os.path.join(ROOT, "data")
DEFAULT_IMG = os.path.join(ROOT, "5etools-img-main")


class CaseSensitiveIndex:
    """Resolves relative paths against the disk, requiring exact-case matches per segment."""

    def __init__(self, root: str):
        self.root = root
        self._listings: dict[str, set[str] | None] = {}

    def _names(self, directory: str) -> set[str] | None:
        if directory not in self._listings:
            try:
                self._listings[directory] = set(os.listdir(directory))
            except OSError:
                self._listings[directory] = None
        return self._listings[directory]

    def exists(self, rel: str) -> bool:
        current = self.root
        for part in rel.split("/"):
            names = self._names(current)
            if names is None or part not in names:
                return False
            current = os.path.join(current, part)
        return os.path.isfile(current)


def iter_image_refs(node, source: str, found: list[tuple[str, str]]):
    if isinstance(node, dict):
        for value in node.values():
            iter_image_refs(value, source, found)
    elif isinstance(node, list):
        for value in node:
            iter_image_refs(value, source, found)
    elif isinstance(node, str):
        clean = unquote(node).strip()
        if clean.lower().endswith(IMAGE_EXTS) and not clean.startswith(("http://", "https://", "/")):
            found.append((source, clean))


def scan(data_dir: str, img_dir: str):
    index = CaseSensitiveIndex(img_dir)
    refs_by_file: dict[str, list[str]] = defaultdict(list)
    missing: list[dict] = []
    total = 0
    unique_paths: set[str] = set()

    for dirpath, _, filenames in os.walk(data_dir):
        for name in filenames:
            if not name.endswith(".json"):
                continue
            full = os.path.join(dirpath, name)
            rel_file = os.path.relpath(full, data_dir).replace(os.sep, "/")
            try:
                with open(full, encoding="utf-8") as fh:
                    payload = json.load(fh)
            except (OSError, ValueError) as exc:
                missing.append({"file": rel_file, "path": None, "error": f"unreadable JSON: {exc}"})
                continue
            found: list[tuple[str, str]] = []
            iter_image_refs(payload, rel_file, found)
            for source, ref in found:
                total += 1
                unique_paths.add(ref)
                refs_by_file[source].append(ref)
                if not index.exists(ref):
                    missing.append({"file": source, "path": ref, "error": "not found in image root"})

    return {
        "data_dir": data_dir,
        "img_dir": img_dir,
        "files_with_refs": len(refs_by_file),
        "total_refs": total,
        "unique_paths": len(unique_paths),
        "missing_count": len(missing),
        "missing_by_file": dict(Counter(item["file"] for item in missing).most_common()),
        "missing": missing,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default=DEFAULT_DATA, help="5etools data folder")
    parser.add_argument("--img", default=DEFAULT_IMG, help="5etools image root folder")
    parser.add_argument("--report", help="optional path to write the full JSON report")
    args = parser.parse_args()

    result = scan(args.data, args.img)
    print(f"Image refs: {result['total_refs']} total, {result['unique_paths']} unique, "
          f"in {result['files_with_refs']} files")
    print(f"Missing: {result['missing_count']}")
    for name, count in list(result["missing_by_file"].items())[:40]:
        print(f"  {count:6d}  {name}")
    for item in result["missing"][:25]:
        print(f"  - {item['file']}: {item['path']} ({item['error']})")
    if args.report:
        with open(args.report, "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=2, ensure_ascii=False)
    return 1 if result["missing_count"] else 0


if __name__ == "__main__":
    sys.exit(main())
