"""
Deploys EffectBuilder Studio (with 130 styles across 26 core effect kinds, 17 extracted
core layers, 3D Forest Road Map, and 3D Sorceress + 3 Goblin GLB tokens), the unified
.NET 10 backend, and syncs the 3D Map Asset Library on disk + MySQL on the production server.
"""
import json
import os
import shutil
import subprocess
import tarfile
import urllib.error
import urllib.request
import lw_deploy_env as env

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EB_ROOT = os.path.join(ROOT, "effectbuilder-studio")
EB_DIST = os.path.join(EB_ROOT, "dist", "effectbuilder-client", "browser")
BACKEND_PUB = os.path.join(ROOT, "backend", "publish")
DEPLOY_TAR = os.path.join(ROOT, "effectbuilder_unified.tar.gz")


def get_github_credentials() -> tuple[str, str]:
    proc = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        text=True,
        capture_output=True,
        check=True,
    )
    creds = dict(
        line.split("=", 1) for line in proc.stdout.splitlines() if "=" in line
    )
    return creds["username"], creds["password"]


def ensure_github_repo(username: str, token: str, repo_name: str, description: str) -> str:
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "LoomWeaverV2-EffectBuilder",
        "Content-Type": "application/json",
    }
    payload = json.dumps(
        {
            "name": repo_name,
            "description": description,
            "private": False,
            "auto_init": False,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://api.github.com/user/repos",
        data=payload,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"Created new GitHub repository: {data['html_url']}")
    except urllib.error.HTTPError as e:
        if e.code == 422:
            print(f"GitHub repository https://github.com/{username}/{repo_name} already exists; reusing.")
        else:
            raise RuntimeError(f"GitHub API error {e.code}: {e.read().decode('utf-8')}") from e
    return f"https://github.com/{username}/{repo_name}.git"


def run_git(cwd: str, *args: str) -> None:
    res = subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=True)
    if res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} in {cwd} failed: {res.stderr}")
    if res.stdout.strip():
        print(res.stdout.strip())


def deploy_to_server() -> None:
    if not os.path.exists(os.path.join(EB_DIST, "index.html")):
        raise RuntimeError(f"Missing built frontend at {EB_DIST}/index.html")
    if not os.path.exists(os.path.join(BACKEND_PUB, "LoomWeaver.Api.dll")):
        raise RuntimeError(f"Missing published backend at {BACKEND_PUB}/LoomWeaver.Api.dll")

    print("Packaging EffectBuilder Studio frontend (including 3D GLBs) + Unified .NET 10 backend...")
    with tarfile.open(DEPLOY_TAR, "w:gz") as tf:
        tf.add(EB_DIST, arcname="client")
        tf.add(BACKEND_PUB, arcname="backend")

    ssh = env.connect()

    sftp = ssh.open_sftp()
    sftp.put(DEPLOY_TAR, "/tmp/effectbuilder_unified.tar.gz")

    remote_script = r"""#!/usr/bin/env bash
set -e

RELEASE_DIR="/var/www/effectbuilder/releases/unified-v20"
echo "1. Extracting EffectBuilder client + Unified .NET backend to $RELEASE_DIR..."
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf /tmp/effectbuilder_unified.tar.gz -C "$RELEASE_DIR"
rm -f /tmp/effectbuilder_unified.tar.gz

echo "2. Syncing 3D GLB Map & Token Assets to /var/www/loomweaver/assets/models-3d and object-library..."
mkdir -p /var/www/loomweaver/assets/models-3d
mkdir -p /var/www/loomweaver/assets/object-library/models
if [ -d "$RELEASE_DIR/client/models-3d" ]; then
    cp -f "$RELEASE_DIR/client/models-3d/"*.glb /var/www/loomweaver/assets/models-3d/
    cp -f "$RELEASE_DIR/client/models-3d/"*.jpg /var/www/loomweaver/assets/models-3d/ || true
    cp -f "$RELEASE_DIR/client/models-3d/"*.json /var/www/loomweaver/assets/models-3d/ || true
fi

python3 - << 'PY'
import json, pathlib, shutil, subprocess

models_3d_dir = pathlib.Path('/var/www/loomweaver/assets/models-3d')
obj_lib_dir = pathlib.Path('/var/www/loomweaver/assets/object-library')
cat_path = obj_lib_dir / 'catalog.json'

catalog = json.loads(cat_path.read_text(encoding='utf-8')) if cat_path.exists() else {'version': 1, 'groups': {}, 'assets': []}
by_id = {a['id']: a for a in catalog.get('assets', [])}

for meta_file in sorted(models_3d_dir.glob('*.glb.json')):
    meta = json.loads(meta_file.read_text(encoding='utf-8'))
    glb_src = models_3d_dir / meta['sourceFile']
    glb_dst = obj_lib_dir / 'models' / f"{meta['id']}.glb"
    meta_dst = obj_lib_dir / 'models' / f"{meta['id']}.glb.json"
    if glb_src.exists():
        shutil.copy2(glb_src, glb_dst)
        meta_dst.write_text(json.dumps(meta, indent=2), encoding='utf-8')
        by_id[meta['id']] = meta

catalog['assets'] = sorted(by_id.values(), key=lambda e: (e.get('group', ''), e.get('name', '')))
cat_path.write_text(json.dumps(catalog, indent=2), encoding='utf-8')
print(f"Updated object-library catalog.json with {len(catalog['assets'])} total 3D assets.")

sql_lines = [
    "CREATE TABLE IF NOT EXISTS loomweaver.mw_map_asset_library (",
    "  id VARCHAR(64) NOT NULL PRIMARY KEY,",
    "  name VARCHAR(255) NOT NULL,",
    "  category VARCHAR(64) NOT NULL,",
    "  asset_group VARCHAR(128) NOT NULL,",
    "  source_file VARCHAR(255) NOT NULL,",
    "  file_url VARCHAR(512) NOT NULL,",
    "  model_3d_url VARCHAR(512) NULL,",
    "  preview_url VARCHAR(512) NULL,",
    "  default_width_ft INT NOT NULL DEFAULT 5,",
    "  byte_size BIGINT NOT NULL DEFAULT 0,",
    "  original_byte_size BIGINT NOT NULL DEFAULT 0,",
    "  source_triangles INT NOT NULL DEFAULT 0,",
    "  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
]

def esc(val):
    return str(val or '').replace('\\', '\\\\').replace("'", "''")

for a in catalog['assets']:
    aid = esc(a.get('id'))
    name = esc(a.get('name'))
    cat = esc(a.get('category', 'props'))
    grp = esc(a.get('group', 'Props'))
    src = esc(a.get('sourceFile', ''))
    url = esc(a.get('url', ''))
    m3d = esc(a.get('model3dUrl', f"/assets/models-3d/{a.get('sourceFile', '')}"))
    prev = esc(a.get('previewUrl', ''))
    wft = int(a.get('defaultWidthFt', 5) or 5)
    bsize = int(a.get('bytes', 0) or 0)
    obsize = int(a.get('originalBytes', 0) or 0)
    tris = int(a.get('sourceTriangles', 0) or 0)
    sql_lines.append(
        f"INSERT INTO loomweaver.mw_map_asset_library "
        f"(id, name, category, asset_group, source_file, file_url, model_3d_url, preview_url, default_width_ft, byte_size, original_byte_size, source_triangles) "
        f"VALUES ('{aid}', '{name}', '{cat}', '{grp}', '{src}', '{url}', '{m3d}', '{prev}', {wft}, {bsize}, {obsize}, {tris}) "
        f"ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), asset_group=VALUES(asset_group), "
        f"file_url=VALUES(file_url), model_3d_url=VALUES(model_3d_url), byte_size=VALUES(byte_size), source_triangles=VALUES(source_triangles);"
    )

# Also ensure the EffectBuilder showcase 3D assets are in loomweaver.lw_assets
sql_lines.extend([
    "INSERT INTO loomweaver.lw_assets (id, name, category, creator_name, entitlement, price_label, price_cents, preview_url, summary, system_code, tags_json) "
    "VALUES ('ast-riverbank-terrain-3d', 'Riverbank Terrain Mod 3D Scene', 'map-pack', 'LoomWeaver Studio', 'free', 'Free', 0, '/assets/models-3d/Meshy_AI_Riverbank_Terrain_Mod_1023195705_texture.glb', '3D riverbank terrain environment for EffectBuilder and VTT.', 'dnd5e', '[\"3d-glb\", \"scene\", \"riverbank\", \"terrain\"]') "
    "ON DUPLICATE KEY UPDATE preview_url=VALUES(preview_url), summary=VALUES(summary);",
    "INSERT INTO loomweaver.lw_assets (id, name, category, creator_name, entitlement, price_label, price_cents, preview_url, summary, system_code, tags_json) "
    "VALUES ('ast-forest-road-night-3d', 'Forest (3) with a Road at Night 3D Scene', 'map-pack', 'LoomWeaver Studio', 'free', 'Free', 0, '/assets/models-3d/a_forest_3_with_a_road_at_night_for_game.glb', '3D night forest road environment for EffectBuilder and VTT.', 'dnd5e', '[\"3d-glb\", \"scene\", \"forest\", \"night\"]') "
    "ON DUPLICATE KEY UPDATE preview_url=VALUES(preview_url), summary=VALUES(summary);",
    "INSERT INTO loomweaver.lw_assets (id, name, category, creator_name, entitlement, price_label, price_cents, preview_url, summary, system_code, tags_json) "
    "VALUES ('ast-eclipse-abyss-sorceress-3d', 'Eclipse Abyss Sorceress 3D Token', '3d-stamp', 'LoomWeaver Studio', 'free', 'Free', 0, '/assets/models-3d/Meshy_AI_Eclipse_Abyss_Sorcere_1026221004_texture.glb', '3D caster miniature token for EffectBuilder and VTT.', 'dnd5e', '[\"3d-glb\", \"token\", \"caster\", \"sorceress\"]') "
    "ON DUPLICATE KEY UPDATE preview_url=VALUES(preview_url), summary=VALUES(summary);",
    "INSERT INTO loomweaver.lw_assets (id, name, category, creator_name, entitlement, price_label, price_cents, preview_url, summary, system_code, tags_json) "
    "VALUES ('ast-goblin-male-3d', 'Goblin Male 3D Token', '3d-stamp', 'LoomWeaver Studio', 'free', 'Free', 0, '/assets/models-3d/Meshy_AI_Goblin_Male_1026221232_texture.glb', '3D goblin target miniature token for EffectBuilder and VTT.', 'dnd5e', '[\"3d-glb\", \"token\", \"monster\", \"goblin\"]') "
    "ON DUPLICATE KEY UPDATE preview_url=VALUES(preview_url), summary=VALUES(summary);"
])

sql_path = pathlib.Path('/tmp/sync_map_assets.sql')
sql_path.write_text('\n'.join(sql_lines) + '\n', encoding='utf-8')
subprocess.run(['mysql', '--defaults-extra-file=/tmp/.lw_mysql_root.cnf', 'loomweaver', '-e', 'SOURCE /tmp/sync_map_assets.sql; SELECT COUNT(*) AS total_sql_map_assets FROM loomweaver.mw_map_asset_library;'], check=True)
sql_path.unlink(missing_ok=True)
PY

echo "3. Updating Unified .NET Backend at /var/www/loomweaver/server..."
mkdir -p /var/www/loomweaver/server
cp -a "$RELEASE_DIR/backend/." /var/www/loomweaver/server/
if [ -f "$RELEASE_DIR/client/google-sso.html" ] && [ -d /var/www/loomweaver/client ]; then
    cp -f "$RELEASE_DIR/client/google-sso.html" /var/www/loomweaver/client/google-sso.html
fi
chown -R ${SUDO_USER}:www-data /var/www/loomweaver/server
chmod -R 755 /var/www/loomweaver/server

echo "4. Activating EffectBuilder Studio frontend at /var/www/effectbuilder/current..."
rm -rf /var/www/effectbuilder/current
ln -sfn "$RELEASE_DIR" /var/www/effectbuilder/current
chown -R ${SUDO_USER}:www-data /var/www/effectbuilder /var/www/loomweaver/assets/models-3d /var/www/loomweaver/assets/object-library
chmod -R 755 /var/www/effectbuilder /var/www/loomweaver/assets/models-3d

echo "5. Updating nginx for effectbuilder.loom-weaver.com..."
cat << 'EOF' > /etc/nginx/sites-available/effectbuilder-loom-weaver
server {
    listen 80;
    server_name effectbuilder.loom-weaver.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name effectbuilder.loom-weaver.com;
    ssl_certificate /etc/ssl/certs/loom-weaver.pem;
    ssl_certificate_key /etc/ssl/private/loom-weaver.key;
    root /var/www/effectbuilder/current/client;
    index index.html;
    client_max_body_size 25m;

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-store";
    }
    location /hubs/ {
        proxy_pass http://127.0.0.1:5000/hubs/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /uploads/ { proxy_pass http://127.0.0.1:5000/uploads/; }
    location /assets/models-3d/ { alias /var/www/loomweaver/assets/models-3d/; }
    location /assets/object-library/ { alias /var/www/loomweaver/assets/object-library/; }
    location /assets/ { alias /var/www/loom-weaver/client/assets/; }
    location /tokens/ { proxy_pass http://127.0.0.1:5000/tokens/; }
    location /img/ { proxy_pass http://127.0.0.1:5000/img/; }
    location / { try_files $uri $uri/ /index.html; }
    location = /index.html { add_header Cache-Control "no-cache, no-store, must-revalidate" always; }
}
EOF

ln -sfn /etc/nginx/sites-available/effectbuilder-loom-weaver /etc/nginx/sites-enabled/effectbuilder-loom-weaver
nginx -t
systemctl daemon-reload
systemctl restart loom-weaver.service
systemctl reload nginx
sleep 3

echo "6. Verifying unified loom-weaver.service and 3D GLB assets..."
systemctl is-active loom-weaver.service nginx
curl -k -s -I -H "Host: effectbuilder.loom-weaver.com" https://127.0.0.1/models-3d/Meshy_AI_Riverbank_Terrain_Mod_1023195705_texture.glb | head -n 5
curl -k -s -I -H "Host: effectbuilder.loom-weaver.com" https://127.0.0.1/models-3d/Meshy_AI_Eclipse_Abyss_Sorcere_1026221004_texture.glb | head -n 5
curl -k -s -I -H "Host: effectbuilder.loom-weaver.com" https://127.0.0.1/models-3d/Meshy_AI_Goblin_Male_1026221232_texture.glb | head -n 5
"""
    with sftp.open("/tmp/deploy_effectbuilder_unified.sh", "w") as f:
        f.write(remote_script)
    sftp.close()

    mysql_cnf = "/tmp/.lw_mysql_root.cnf"
    env.require("LW_DB_ROOT_PASSWORD")
    env.put_mysql_cnf(ssh, mysql_cnf, "root", env.DB_ROOT_PASSWORD)
    try:
        out = env.run(ssh, "bash /tmp/deploy_effectbuilder_unified.sh", sudo=True, check=False)
    finally:
        env.run(ssh, f"rm -f {mysql_cnf}", check=False)
    print(out)

    ssh.close()
    if os.path.exists(DEPLOY_TAR):
        os.remove(DEPLOY_TAR)


def push_repos() -> None:
    username, token = get_github_credentials()
    eb_remote = ensure_github_repo(
        username,
        token,
        "LoomWeaver-EffectBuilder",
        "EffectBuilder Studio for effectbuilder.loom-weaver.com (unified LoomWeaver .NET 10 backend)",
    )

    eb_gitignore = os.path.join(EB_ROOT, ".gitignore")
    with open(eb_gitignore, "w", encoding="utf-8") as f:
        f.write("node_modules/\ndist/\n.angular/\npublic/models-3d/*.glb\n*.tar.gz\n")

    if not os.path.exists(os.path.join(EB_ROOT, ".git")):
        run_git(EB_ROOT, "init", "-b", "master")

    run_git(EB_ROOT, "config", "user.name", username)
    run_git(EB_ROOT, "config", "user.email", f"{username}@users.noreply.github.com")
    run_git(EB_ROOT, "add", "-A")
    status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=EB_ROOT, text=True, capture_output=True
    ).stdout.strip()
    if status:
        run_git(
            EB_ROOT,
            "commit",
            "-m",
            "Fix inverted X/Y camera orbit controls in Full Screen Preview mode",
        )

    remotes = subprocess.run(
        ["git", "remote"], cwd=EB_ROOT, text=True, capture_output=True
    ).stdout.splitlines()
    if "origin" in remotes:
        run_git(EB_ROOT, "remote", "set-url", "origin", eb_remote)
    else:
        run_git(EB_ROOT, "remote", "add", "origin", eb_remote)

    run_git(EB_ROOT, "branch", "-M", "master")
    run_git(EB_ROOT, "push", "-u", "origin", "master", "--force")
    run_git(EB_ROOT, "push", "origin", "master:dev", "--force")
    print(f"Pushed EffectBuilder Studio to {eb_remote} (master + dev)")

    shutil.rmtree(os.path.join(EB_ROOT, ".git"), ignore_errors=True)

    lw_gitignore = os.path.join(ROOT, ".gitignore")
    if os.path.exists(lw_gitignore):
        txt = open(lw_gitignore, "r", encoding="utf-8").read()
        if "public/models-3d/*.glb" not in txt:
            with open(lw_gitignore, "a", encoding="utf-8") as f:
                f.write("\neffectbuilder-studio/public/models-3d/*.glb\n")

    lw_remote = f"https://github.com/{username}/LoomWeaverV2.git"
    run_git(ROOT, "remote", "set-url", "origin", lw_remote)
    run_git(ROOT, "config", "user.name", username)
    run_git(ROOT, "config", "user.email", f"{username}@users.noreply.github.com")
    run_git(ROOT, "add", "-A")
    root_status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True, capture_output=True
    ).stdout.strip()
    if root_status:
        run_git(
            ROOT,
            "commit",
            "-m",
            "Fix inverted X/Y camera orbit controls in Full Screen Preview mode",
        )
    run_git(ROOT, "push", "-u", "origin", "master", "--force")
    run_git(ROOT, "push", "origin", "master:dev", "--force")
    print("Pushed LoomWeaverV2 to origin (master + dev)")


if __name__ == "__main__":
    deploy_to_server()
    push_repos()
