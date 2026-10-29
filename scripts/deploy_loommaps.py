"""
Deploys LoomMaps Studio (https://maps.loom-weaver.com), updated LoomWeaver V2 frontend (/maps),
updated .NET 10 backend API, Python 3D-to-PNG thumbnail script, and the 526 pre-rendered PNG
thumbnails to production.
"""
import os
import sys
import tarfile
import time
import lw_deploy_env as env
from lw_deploy_env import paramiko

HOST = env.HOST
USER = env.USER
PASS = env.PASS

ROOT = r"C:\repos\Jane\Jane\LoomWeaverV2"
MAPS_DIST = os.path.join(ROOT, "loommaps-studio", "dist", "loommaps-studio", "browser")
FE_DIST = os.path.join(ROOT, "frontend", "dist", "loomweaver-v2", "browser")
BE_PUBLISH = os.path.join(ROOT, "backend", "publish")
PNG_DIR = r"C:\map assets\previews-png"
PY_RENDER_SCRIPT = os.path.join(ROOT, "scripts", "render_3d_asset_thumbnails.py")

MAPS_TAR = os.path.join(ROOT, "loommaps_deploy.tar.gz")
PNG_TAR = os.path.join(ROOT, "previews_png_deploy.tar.gz")
BE_TAR = os.path.join(ROOT, "backend_maps_deploy.tar.gz")
FE_TAR = os.path.join(ROOT, "frontend_maps_deploy.tar.gz")

NGINX_MAPS_CONF = r"""server {
    listen 80;
    server_name maps.loom-weaver.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name maps.loom-weaver.com;

    ssl_certificate /etc/ssl/certs/loom-weaver.pem;
    ssl_certificate_key /etc/ssl/private/loom-weaver.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    client_max_body_size 100M;

    root /var/www/loommaps/current/client;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /hubs/ {
        proxy_pass http://127.0.0.1:5000/hubs/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location ^~ /assets/ {
        alias /var/www/loomweaver/assets/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
        add_header Access-Control-Allow-Origin "*";
    }

    location ^~ /landing-assets/ {
        alias /var/www/loomweaver/client/landing-assets/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
    }

    location / {
        add_header Cache-Control "no-cache" always;
        try_files $uri $uri/ /index.html;
    }
}
"""


def run_sudo(ssh: paramiko.SSHClient, cmd: str) -> str:
    stdin, stdout, stderr = ssh.exec_command(f"sudo -S bash -c '{cmd}'", get_pty=True)
    stdin.write(PASS + "\n")
    stdin.flush()
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return out + err


def build_tar(source_dir: str, tar_path: str, exclude_subpath: str = "") -> None:
    if os.path.exists(tar_path):
        os.remove(tar_path)
    with tarfile.open(tar_path, "w:gz") as tar:
        for item in os.listdir(source_dir):
            if exclude_subpath and item == exclude_subpath:
                continue
            tar.add(os.path.join(source_dir, item), arcname=item)


def main() -> int:
    print("1. Packaging archives...")
    build_tar(MAPS_DIST, MAPS_TAR, exclude_subpath="assets")
    build_tar(PNG_DIR, PNG_TAR)
    build_tar(BE_PUBLISH, BE_TAR)
    if os.path.exists(FE_DIST):
        build_tar(FE_DIST, FE_TAR, exclude_subpath="assets")

    print("2. Connecting to the production server...")
    ssh = env.connect()

    sftp = ssh.open_sftp()
    print("3. Uploading archives and Python thumbnail script to /tmp...")
    sftp.put(MAPS_TAR, "/tmp/loommaps_deploy.tar.gz")
    sftp.put(PNG_TAR, "/tmp/previews_png_deploy.tar.gz")
    sftp.put(BE_TAR, "/tmp/backend_maps_deploy.tar.gz")
    sftp.put(PY_RENDER_SCRIPT, "/tmp/render_3d_asset_thumbnails.py")
    if os.path.exists(FE_TAR):
        sftp.put(FE_TAR, "/tmp/frontend_maps_deploy.tar.gz")
    with sftp.open("/tmp/maps-loom-weaver.nginx", "w") as f:
        f.write(NGINX_MAPS_CONF)
    sftp.close()

    print("4. Extracting archives and restarting services on production...")
    remote_script = " && ".join([
        "mkdir -p /var/www/loommaps/current/client",
        "rm -rf /var/www/loommaps/current/client/*",
        "tar -xzf /tmp/loommaps_deploy.tar.gz -C /var/www/loommaps/current/client",
        "mkdir -p /var/www/loomweaver/assets/previews-png",
        "tar -xzf /tmp/previews_png_deploy.tar.gz -C /var/www/loomweaver/assets/previews-png",
        "mkdir -p /var/www/loomweaver/scripts",
        "cp /tmp/render_3d_asset_thumbnails.py /var/www/loomweaver/scripts/render_3d_asset_thumbnails.py",
        "chmod +x /var/www/loomweaver/scripts/render_3d_asset_thumbnails.py",
        "if [ -f /tmp/frontend_maps_deploy.tar.gz ]; then rm -rf /var/www/loomweaver/client/* && tar -xzf /tmp/frontend_maps_deploy.tar.gz -C /var/www/loomweaver/client && ln -sfn /var/www/loomweaver/assets /var/www/loomweaver/client/assets; fi",
        "systemctl stop loom-weaver.service || true",
        "mkdir -p /var/www/loomweaver/server",
        "tar -xzf /tmp/backend_maps_deploy.tar.gz -C /var/www/loomweaver/server",
        "rm -f /etc/nginx/sites-enabled/maps.loom-weaver.com /etc/nginx/sites-available/maps.loom-weaver.com",
        "cp /tmp/maps-loom-weaver.nginx /etc/nginx/sites-available/maps-loom-weaver",
        "ln -sf /etc/nginx/sites-available/maps-loom-weaver /etc/nginx/sites-enabled/maps-loom-weaver",
        "chown -R www-data:www-data /var/www/loommaps /var/www/loomweaver/assets/previews-png /var/www/loomweaver/server /var/www/loomweaver/client",
        "systemctl start loom-weaver.service",
        "nginx -t && systemctl reload nginx",
    ])
    print(run_sudo(ssh, remote_script))

    time.sleep(3)
    print("5. Verifying live endpoints...")
    _, stdout, _ = ssh.exec_command(
        "curl -s -o /dev/null -w 'MAPS_HTML:%{http_code} ' https://maps.loom-weaver.com/ && "
        "curl -s -o /dev/null -w 'THUMB_API:%{http_code} ' https://maps.loom-weaver.com/api/v2/maps/assets/thumbnails && "
        "curl -s -o /dev/null -w 'PNG_FILE:%{http_code}\\n' https://maps.loom-weaver.com/assets/previews-png/obj-4f9776736fb571f1.png"
    )
    print(stdout.read().decode("utf-8", errors="replace"))
    ssh.close()

    for f in [MAPS_TAR, PNG_TAR, BE_TAR, FE_TAR]:
        if os.path.exists(f):
            os.remove(f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
