"""
Deploys ActionBuilder Studio (actionbuilder-studio) and the unified .NET 10 backend
(LoomWeaver.Modules.ActionStudio) to the production server for actionbuilder.loom-weaver.com,
and pushes both LoomWeaver-ActionBuilder and LoomWeaverV2 to GitHub.
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
AB_ROOT = os.path.join(ROOT, "actionbuilder-studio")
AB_DIST = os.path.join(AB_ROOT, "dist", "actionbuilder-studio", "browser")
BACKEND_PUB = os.path.join(ROOT, "backend", "publish")
DEPLOY_TAR = os.path.join(ROOT, "actionbuilder_unified.tar.gz")


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
        "User-Agent": "LoomWeaverV2-ActionBuilder",
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
    if not os.path.exists(os.path.join(AB_DIST, "index.html")):
        raise RuntimeError(f"Missing built frontend at {AB_DIST}/index.html")
    if not os.path.exists(os.path.join(BACKEND_PUB, "LoomWeaver.Api.dll")):
        raise RuntimeError(f"Missing published backend at {BACKEND_PUB}/LoomWeaver.Api.dll")

    print("Packaging ActionBuilder Studio frontend + Unified .NET 10 backend...")
    with tarfile.open(DEPLOY_TAR, "w:gz") as tf:
        tf.add(AB_DIST, arcname="client")
        tf.add(BACKEND_PUB, arcname="backend")

    ssh = env.connect()

    sftp = ssh.open_sftp()
    sftp.put(DEPLOY_TAR, "/tmp/actionbuilder_unified.tar.gz")

    remote_script = r"""#!/usr/bin/env bash
set -e

RELEASE_DIR="/var/www/actionbuilder/releases/unified-v2"
echo "1. Extracting ActionBuilder client + Unified .NET backend to $RELEASE_DIR..."
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf /tmp/actionbuilder_unified.tar.gz -C "$RELEASE_DIR"
rm -f /tmp/actionbuilder_unified.tar.gz

echo "2. Updating Unified .NET Backend at /var/www/loomweaver/server..."
mkdir -p /var/www/loomweaver/server
cp -a "$RELEASE_DIR/backend/." /var/www/loomweaver/server/
chown -R ${SUDO_USER}:www-data /var/www/loomweaver/server
chmod -R 755 /var/www/loomweaver/server

echo "3. Activating ActionBuilder Studio frontend at /var/www/actionbuilder/current..."
rm -rf /var/www/actionbuilder/current
ln -sfn "$RELEASE_DIR" /var/www/actionbuilder/current
chown -R ${SUDO_USER}:www-data /var/www/actionbuilder
chmod -R 755 /var/www/actionbuilder

echo "4. Updating nginx for actionbuilder.loom-weaver.com..."
cat << 'EOF' > /etc/nginx/sites-available/actionbuilder-loom-weaver
server {
    listen 80;
    listen [::]:80;
    server_name actionbuilder.loom-weaver.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name actionbuilder.loom-weaver.com;
    ssl_certificate /etc/ssl/certs/loom-weaver.pem;
    ssl_certificate_key /etc/ssl/private/loom-weaver.key;
    root /var/www/actionbuilder/current/client;
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
    location = / {
        add_header Cache-Control "no-cache, no-store, must-revalidate, max-age=0" always;
        try_files /index.html =404;
    }
    location = /home {
        add_header Cache-Control "no-cache, no-store, must-revalidate, max-age=0" always;
        try_files /index.html =404;
    }
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate, max-age=0" always;
    }
    location / {
        add_header Cache-Control "no-cache, no-store, must-revalidate, max-age=0" always;
        try_files $uri $uri/ /index.html;
    }
}
EOF

ln -sfn /etc/nginx/sites-available/actionbuilder-loom-weaver /etc/nginx/sites-enabled/actionbuilder-loom-weaver
nginx -t
systemctl daemon-reload
systemctl restart loom-weaver.service
systemctl reload nginx
sleep 3

echo "5. Verifying unified loom-weaver.service and actionbuilder.loom-weaver.com..."
systemctl is-active loom-weaver.service nginx
curl -k -s -I -H "Host: actionbuilder.loom-weaver.com" https://127.0.0.1/ | head -n 5
curl -k -s -H "Host: actionbuilder.loom-weaver.com" "https://127.0.0.1/api/v2/actions/health"
echo ""
curl -k -s -H "Host: actionbuilder.loom-weaver.com" "https://127.0.0.1/api/v2/actions/context?campaignId=1&accountId=acc-player-dal" | head -c 450
echo ""
curl -k -s -H "Host: actionbuilder.loom-weaver.com" "https://127.0.0.1/api/v2/actions/context?campaignId=1&accountId=acc-player-fivi" | head -c 450
echo ""
"""
    with sftp.open("/tmp/deploy_actionbuilder_unified.sh", "w") as f:
        f.write(remote_script)
    sftp.close()

    out = env.run(ssh, "bash /tmp/deploy_actionbuilder_unified.sh", sudo=True, check=False)
    print(out)
    ssh.close()
    if os.path.exists(DEPLOY_TAR):
        os.remove(DEPLOY_TAR)


def push_repos() -> None:
    username, token = get_github_credentials()
    ab_remote = ensure_github_repo(
        username,
        token,
        "LoomWeaver-ActionBuilder",
        "ActionBuilder Studio for actionbuilder.loom-weaver.com (unified LoomWeaver .NET 10 backend)",
    )

    ab_gitignore = os.path.join(AB_ROOT, ".gitignore")
    with open(ab_gitignore, "w", encoding="utf-8") as f:
        f.write("node_modules/\ndist/\n.angular/\n*.tar.gz\n")

    if not os.path.exists(os.path.join(AB_ROOT, ".git")):
        run_git(AB_ROOT, "init", "-b", "master")

    run_git(AB_ROOT, "config", "user.name", username)
    run_git(AB_ROOT, "config", "user.email", f"{username}@users.noreply.github.com")
    run_git(AB_ROOT, "add", "-A")
    status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=AB_ROOT, text=True, capture_output=True
    ).stdout.strip()
    if status:
        run_git(
            AB_ROOT,
            "commit",
            "-m",
            "Build standalone Angular 22 ActionBuilder Studio with If/Then/When/Contains rules engine bindings and DM-scoped campaign access",
        )

    remotes = subprocess.run(
        ["git", "remote"], cwd=AB_ROOT, text=True, capture_output=True
    ).stdout.splitlines()
    if "origin" in remotes:
        run_git(AB_ROOT, "remote", "set-url", "origin", ab_remote)
    else:
        run_git(AB_ROOT, "remote", "add", "origin", ab_remote)

    run_git(AB_ROOT, "branch", "-M", "master")
    run_git(AB_ROOT, "push", "-u", "origin", "master", "--force")
    run_git(AB_ROOT, "push", "origin", "master:dev", "--force")
    print(f"Pushed ActionBuilder Studio to {ab_remote} (master + dev)")

    shutil.rmtree(os.path.join(AB_ROOT, ".git"), ignore_errors=True)

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
            "Add standalone ActionBuilder Studio (actionbuilder.loom-weaver.com) and unified .NET 10 ActionStudio backend module",
        )
    run_git(ROOT, "push", "-u", "origin", "master", "--force")
    run_git(ROOT, "push", "origin", "master:dev", "--force")
    print("Pushed LoomWeaverV2 to origin (master + dev)")


if __name__ == "__main__":
    deploy_to_server()
    push_repos()
