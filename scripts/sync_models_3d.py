"""Sync C:\\map assets\\3d-models to the server's models-3d folder and register the models in MySQL.

    python scripts/sync_models_3d.py upload     # resumable upload to a staging dir (live site untouched)
    python scripts/sync_models_3d.py finalize   # verify, back up the old folder, swap, register in MySQL

Files are named {base}_{low|mid|high}.glb. Maps store only {base}; clients resolve the quality tier.
"""
from __future__ import annotations

import hashlib
import re
import stat
import sys
import threading
import time
from pathlib import Path

from lw_deploy_env import connect, put_mysql_cnf, require, run

LOCAL = Path(r"C:\map assets\3d-models")
LIVE = "/var/www/loomweaver/assets/models-3d"
STAGE = LIVE + ".incoming"
VARIANT = re.compile(r"^(?P<base>.+)_(?P<q>low|mid|high)\.glb$")


def local_files() -> list[Path]:
    return sorted(p for p in LOCAL.iterdir() if p.is_file())


WORKERS = 8
_lock = threading.Lock()


def _worker(queue: list[Path], progress: dict) -> None:
    ssh = connect()
    sftp = ssh.open_sftp()
    sftp.get_channel().settimeout(900)
    while True:
        with _lock:
            if not queue:
                break
            path = queue.pop()
        sftp.put(str(path), f"{STAGE}/{path.name}.part")
        sftp.posix_rename(f"{STAGE}/{path.name}.part", f"{STAGE}/{path.name}")
        with _lock:
            progress["files"] += 1
            progress["bytes"] += path.stat().st_size
    sftp.close()
    ssh.close()


def upload() -> None:
    ssh = connect()
    sftp = ssh.open_sftp()
    run(ssh, f"mkdir -p {STAGE}", sudo=True)
    run(ssh, f"chown -R {require('LW_SSH_USER')} {STAGE}", sudo=True)
    remote = {a.filename: a.st_size for a in sftp.listdir_attr(STAGE) if stat.S_ISREG(a.st_mode)}
    sftp.close()
    ssh.close()
    pending = [p for p in local_files() if remote.get(p.name) != p.stat().st_size]
    # Biggest last so pop() starts with large files while all workers are busy.
    pending.sort(key=lambda p: p.stat().st_size)
    total = sum(p.stat().st_size for p in pending)
    print(f"{len(pending)} files to upload, {total / 1e9:.2f} GB", flush=True)
    progress = {"files": 0, "bytes": 0}
    started = time.time()
    threads = [threading.Thread(target=_worker, args=(pending, progress)) for _ in range(WORKERS)]
    for thread in threads:
        thread.start()
    while any(thread.is_alive() for thread in threads):
        time.sleep(30)
        rate = progress["bytes"] / max(time.time() - started, 1) / 1e6
        print(f"{progress['files']} files, {progress['bytes'] / 1e9:.2f}/{total / 1e9:.2f} GB, {rate:.1f} MB/s", flush=True)
    print("upload complete")

def display_name(base: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[_\-]+", " ", base)).strip()[:160]


def build_sql(files: list[Path]) -> str:
    models: dict[str, dict[str, tuple[int, str]]] = {}
    for path in files:
        match = VARIANT.match(path.name)
        if not match:
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        models.setdefault(match["base"], {})[match["q"]] = (path.stat().st_size, digest)
    lines = ["USE loomweaver;", "START TRANSACTION;"]
    for base, variants in models.items():
        esc = base.replace("\\", "\\\\").replace("'", "''")
        lines.append(
            "INSERT INTO lw_asset_models (base_name, display_name, category, entitlement) "
            f"VALUES ('{esc}', '{display_name(base).replace(chr(39), chr(39) * 2)}', '3d-stamp', 'free') "
            "ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);"
        )
        for quality, (size, digest) in variants.items():
            lines.append(
                "INSERT INTO lw_asset_model_variants (base_name, quality, storage_ref, byte_size, sha256) "
                f"VALUES ('{esc}', '{quality}', 'models-3d/{esc}_{quality}.glb', {size}, '{digest}') "
                "ON DUPLICATE KEY UPDATE storage_ref = VALUES(storage_ref), "
                "byte_size = VALUES(byte_size), sha256 = VALUES(sha256);"
            )
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def finalize() -> None:
    files = local_files()
    ssh = connect()
    sftp = ssh.open_sftp()
    remote = {a.filename: a.st_size for a in sftp.listdir_attr(STAGE) if stat.S_ISREG(a.st_mode)}
    missing = [p.name for p in files if remote.get(p.name) != p.stat().st_size]
    if missing:
        raise SystemExit(f"staging incomplete ({len(missing)} missing or wrong size), e.g. {missing[:3]}; rerun upload")

    stamp = time.strftime("%Y%m%dT%H%M%S")
    backup = f"{LIVE}.bak-{stamp}"
    # Keep older base-named files that records may still point at, without overwriting new ones.
    print(run(ssh, (
        f"set -e; cp -n {LIVE}/* {STAGE}/ 2>/dev/null || true; "
        f"mv {LIVE} {backup}; mv {STAGE} {LIVE}; "
        f"chown -R root:www-data {LIVE}; find {LIVE} -type d -exec chmod 755 {{}} +; find {LIVE} -type f -exec chmod 644 {{}} +; "
        f"echo swapped; ls {LIVE} | wc -l; echo backup {backup}"
    ), sudo=True))

    sql = build_sql(files)
    with sftp.open("/tmp/lw_models_register.sql", "w") as handle:
        handle.write(sql)
    sftp.close()
    put_mysql_cnf(ssh, "/tmp/.lw_root.cnf", "root", require("LW_DB_ROOT_PASSWORD"))
    print(run(ssh, (
        "mysql --defaults-extra-file=/tmp/.lw_root.cnf loomweaver < /tmp/lw_models_register.sql && "
        "mysql --defaults-extra-file=/tmp/.lw_root.cnf loomweaver -N -e "
        "\"select count(*) from lw_asset_models; select quality, count(*) from lw_asset_model_variants group by quality\"; "
        "rm -f /tmp/.lw_root.cnf /tmp/lw_models_register.sql"
    ), sudo=True))
    ssh.close()


if __name__ == "__main__":
    {"upload": upload, "finalize": finalize}[sys.argv[1] if len(sys.argv) > 1 else "upload"]()
