import os
import tarfile
import lw_deploy_env as env

if len(env.JWT_SECRET) < 32:
    raise SystemExit("LOOMWEAVER_JWT_SECRET must be set to at least 32 characters in the deploy env file")
env.require("LW_DB_PASSWORD")
env.require("LW_NEO4J_PASSWORD")


def _env_value(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


API_ENV_CONTENT = "\n".join([
    "ConnectionStrings__LoomWeaverMySql=" + _env_value(
        f"Server=127.0.0.1;Port=3306;Database=loomweaver;User ID=loomweaver_app;"
        f"Password={env.DB_PASSWORD};SslMode=Preferred;"
    ),
    "Neo4j__Password=" + _env_value(env.NEO4J_PASSWORD),
    "LOOMWEAVER_JWT_SECRET=" + _env_value(env.JWT_SECRET),
]) + "\n"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENT_DIST = os.path.join(ROOT, "frontend", "dist", "loomweaver-v2", "browser")
SERVER_PUB = os.path.join(ROOT, "backend", "publish")
CLIENT_TAR = os.path.join(ROOT, "frontend", "dist", "loomweaver_client.tar.gz")
SERVER_TAR = os.path.join(ROOT, "backend", "loomweaver_server.tar.gz")

print("Creating client and server archives...")
with tarfile.open(CLIENT_TAR, "w:gz") as tf:
    for item in os.listdir(CLIENT_DIST):
        tf.add(os.path.join(CLIENT_DIST, item), arcname=item)

with tarfile.open(SERVER_TAR, "w:gz") as tf:
    for item in os.listdir(SERVER_PUB):
        tf.add(os.path.join(SERVER_PUB, item), arcname=item)

ssh = env.connect()

print("Uploading archives to the production server...")
sftp = ssh.open_sftp()
sftp.put(CLIENT_TAR, "/tmp/loomweaver_client.tar.gz")
sftp.put(SERVER_TAR, "/tmp/loomweaver_server.tar.gz")
sftp.close()
env.put_secret_file(ssh, "/tmp/.lw_api.env", API_ENV_CONTENT)

remote_script = r"""#!/usr/bin/env bash
set -e

echo "1. Stopping LoomWeaver services..."
systemctl stop loom-weaver.service mythweaver.service actionbuilder.service 2>/dev/null || true
systemctl disable actionbuilder.service 2>/dev/null || true

echo "2. Preparing /var/www/loomweaver canonical structure and reorganizing map-assets..."
mkdir -p /var/www/loomweaver/client /var/www/loomweaver/server /var/www/loomweaver/assets

# Move 24GB of map assets from /var/www/loommaps/client/assets if not already moved
if [ -d /var/www/loommaps/client/assets ] && [ ! -L /var/www/loommaps/client/assets ]; then
    mv /var/www/loommaps/client/assets/* /var/www/loomweaver/assets/ 2>/dev/null || true
fi

# Organize canonical category directories inside /var/www/loomweaver/assets
cd /var/www/loomweaver/assets
mkdir -p models-3d stamps-2d terrain-textures lighting-and-overlays battlemaps-library catalogs

# Link organized categories while preserving direct paths for existing manifests
for d in models paired-3d object-library; do
    if [ -d "$d" ] && [ ! -e "models-3d/$d" ]; then
        ln -s "../$d" "models-3d/$d"
    fi
done

for d in stamps furnished-room-stamps-v1 modular-dungeon-stamps-v1 dungeon-atmosphere-stamps-v1 dungeon-infestation-stamps-v1 table-room-decor-v1 overhead-creatures-v1 overhead-aware-replacements-v1 stackable-limestone-cliffs-v2; do
    if [ -d "$d" ] && [ ! -e "stamps-2d/$d" ]; then
        ln -s "../$d" "stamps-2d/$d"
    fi
done

for d in textures alpine-battle-terrain-v1 biome-brush-library-v1 buried-sanctuary-terrain-v1 sewer-dungeon-wall-library-v1 terrain-repairs-and-hills-v1 desert-hide-completion-v1 underdark-feywild-encounters-v1; do
    if [ -d "$d" ] && [ ! -e "terrain-textures/$d" ]; then
        ln -s "../$d" "terrain-textures/$d"
    fi
done

for d in light-aware-assets-v1 light-aware-assets-v2 light-aware-assets-v3 light-aware-assets-v4 overlays paths; do
    if [ -d "$d" ] && [ ! -e "lighting-and-overlays/$d" ]; then
        ln -s "../$d" "lighting-and-overlays/$d"
    fi
done

ln -sfn /var/www/shared-uploads /var/www/loomweaver/assets/uploads
ln -sfn /var/www/jane-assets/5etools /var/www/loomweaver/assets/5etools
ln -sfn /var/www/jane-assets/5etools/img /var/www/loomweaver/assets/5e-tools

echo "3. Cleaning previous LoomWeaver app files..."
rm -rf /var/www/vtt3d /var/www/generator /var/www/loommaps /var/www/loom-weaver /var/www/mythweaver
rm -rf /var/www/loomweaver/client/* /var/www/loomweaver/server/*

echo "4. Extracting new LoomWeaver V2 client and server..."
tar -xzf /tmp/loomweaver_client.tar.gz -C /var/www/loomweaver/client
tar -xzf /tmp/loomweaver_server.tar.gz -C /var/www/loomweaver/server
rm -rf /var/www/loomweaver/client/assets
ln -sfn /var/www/loomweaver/assets /var/www/loomweaver/client/assets
ln -sfn /var/www/loomweaver/assets /var/www/loomweaver/map-assets

echo "5. Linking domain roots to /var/www/loomweaver..."
ln -sfn /var/www/loomweaver /var/www/loom-weaver
ln -sfn /var/www/loomweaver /var/www/mythweaver
mkdir -p /var/www/loommaps /var/www/vtt3d/current /var/www/generator/current
ln -sfn /var/www/loomweaver/client /var/www/loommaps/client
ln -sfn /var/www/loomweaver/client /var/www/vtt3d/current/client
ln -sfn /var/www/loomweaver/client/client
ln -sfn /var/www/loomweaver/client /var/www/generator/current/client

install -d -m 700 -o root -g root /etc/loomweaver
install -m 600 -o root -g root /tmp/.lw_api.env /etc/loomweaver/api.env
rm -f /tmp/.lw_api.env

chown -R __SERVICE_USER__:www-data /var/www/loomweaver
chmod -R 755 /var/www/loomweaver

echo "6. Updating systemd services to run LoomWeaver.Api.dll on database 'loomweaver'..."
cat << 'EOF' > /etc/systemd/system/loom-weaver.service
[Unit]
Description=LoomWeaver V2 ASP.NET Core Backend (Production)
After=network.target mysql.service docker.service

[Service]
Type=simple
User=__SERVICE_USER__
WorkingDirectory=/var/www/loomweaver/server
ExecStart=/usr/share/dotnet/dotnet /var/www/loomweaver/server/LoomWeaver.Api.dll
Restart=always
RestartSec=5
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://127.0.0.1:5000
Environment=DOTNET_ROOT=/usr/share/dotnet
Environment=PATH=/usr/share/dotnet:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EnvironmentFile=/etc/loomweaver/api.env
Environment="Neo4j__Uri=bolt://127.0.0.1:7687"
Environment="Neo4j__Username=loomweaver"
Environment="Neo4j__Database=neo4j"

[Install]
WantedBy=multi-user.target
EOF

cat << 'EOF' > /etc/systemd/system/mythweaver.service
[Unit]
Description=LoomWeaver V2 ASP.NET Core Backend (Port 5001 Mirror)
After=network.target mysql.service docker.service

[Service]
Type=simple
User=__SERVICE_USER__
WorkingDirectory=/var/www/loomweaver/server
ExecStart=/usr/share/dotnet/dotnet /var/www/loomweaver/server/LoomWeaver.Api.dll
Restart=always
RestartSec=5
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://127.0.0.1:5001
Environment=DOTNET_ROOT=/usr/share/dotnet
Environment=PATH=/usr/share/dotnet:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EnvironmentFile=/etc/loomweaver/api.env
Environment="Neo4j__Uri=bolt://127.0.0.1:7687"
Environment="Neo4j__Username=loomweaver"
Environment="Neo4j__Database=neo4j"

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl restart loom-weaver.service mythweaver.service

echo "7. Upgrading Nginx SEO canonical redirects, subdomain SSR entry points, and EffectBuilder SEO metadata..."
python3 - << 'PYEOF'
import os, re

# 1. Patch /var/www/effectbuilder/current/client/index.html with clean UTF-8 title, canonical, JSON-LD, and pre-rendered links
eb_index = "/var/www/effectbuilder/current/client/index.html"
if os.path.exists(eb_index):
    with open(eb_index, "rb") as f:
        raw = f.read().decode("utf-8", errors="replace")
    raw = re.sub(
        r"<title>.*?</title>",
        "<title>LoomWeaver Effect Builder Studio | TTRPG Spell Animations &amp; VTT Shaders</title>",
        raw,
        flags=re.DOTALL,
    )
    seo_head = (
        '<link rel="canonical" href="https://loom-weaver.com/effect-builder">'
        '<meta property="og:type" content="website">'
        '<meta property="og:site_name" content="LoomWeaver">'
        '<meta property="og:title" content="LoomWeaver Effect Builder Studio | TTRPG Spell Animations &amp; VTT Shaders">'
        '<meta property="og:description" content="Build custom TTRPG spell animations with layered particles, 35+ effect styles, and a draggable composition timeline in LoomWeaver Effect Builder Studio.">'
        '<meta property="og:url" content="https://effectbuilder.loom-weaver.com/">'
        '<script type="application/ld+json">'
        '{"@context":"https://schema.org","@type":"WebApplication","name":"LoomWeaver Effect Builder Studio",'
        '"applicationCategory":"GameApplication","operatingSystem":"Web Browser","url":"https://effectbuilder.loom-weaver.com/",'
        '"isPartOf":{"@type":"WebSite","@id":"https://loom-weaver.com/#website","name":"LoomWeaver","url":"https://loom-weaver.com/"}}'
        '</script>'
    )
    if 'rel="canonical"' not in raw:
        raw = raw.replace("</head>", seo_head + "</head>")
    ssr_mw = (
        '<mw-root>'
        '<div style="background:#05100c;color:#e7eee9;padding:32px;font-family:Inter,system-ui,sans-serif;">'
        '<a href="https://loom-weaver.com/" style="color:#49e892;font-weight:700;">LoomWeaver — Your Campaign. One Living World.</a>'
        '<h1>LoomWeaver Effect Builder Studio — TTRPG Spell Animations &amp; VTT Shaders</h1>'
        '<p>Design custom TTRPG spell animations and particle shaders for <a href="https://loom-weaver.com/vtt">LoomWeaver VTT</a> and <a href="https://loom-weaver.com/effect-builder">LoomWeaver Effect Builder</a>.</p>'
        '</div>'
        '</mw-root>'
    )
    raw = raw.replace("<mw-root></mw-root>", ssr_mw)
    with open(eb_index, "w", encoding="utf-8") as f:
        f.write(raw)

# 2. Configure canonical 301 redirect for www.loom-weaver.com -> loom-weaver.com (preserving /google-sso.html)
loom_nginx = '''server {
    listen 80;
    listen [::]:80;
    server_name loom-weaver.com www.loom-weaver.com;
    return 301 https://loom-weaver.com$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.loom-weaver.com;

    ssl_certificate /etc/ssl/certs/loom-weaver.pem;
    ssl_certificate_key /etc/ssl/private/loom-weaver.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    root /var/www/loom-weaver/client;

    location = /google-sso.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        try_files /google-sso.html =404;
    }

    location / {
        return 301 https://loom-weaver.com$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name loom-weaver.com;

    ssl_certificate /etc/ssl/certs/loom-weaver.pem;
    ssl_certificate_key /etc/ssl/private/loom-weaver.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    root /var/www/loom-weaver/client;
    index index.html;

    client_max_body_size 100M;

    location ^~ /img/ {
        alias "/var/www/jane-assets/5etools/img/";
        expires 7d;
        add_header Cache-Control "public, no-transform";
        add_header Access-Control-Allow-Origin "*";
        try_files $uri $uri/ =404;
    }

    location ^~ /5etools/ {
        alias "/var/www/jane-assets/5etools/img/";
        expires 7d;
        add_header Cache-Control "public, no-transform";
        add_header Access-Control-Allow-Origin "*";
        try_files $uri $uri/ =404;
    }

    location ^~ /uploads/ {
        proxy_pass http://127.0.0.1:5000/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /map-studio/ {
        return 301 https://maps.loom-weaver.com/;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    location /hubs/ {
        proxy_pass http://127.0.0.1:5000/hubs/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location = /maps {
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        try_files /index.html =404;
    }
    location = /maps/ {
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        try_files /index.html =404;
    }

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        add_header Pragma "no-cache";
        expires -1;
    }

    location ~* \\.(?:js|css|woff2?|ttf|eot|png|jpe?g|webp|gif|svg|ico|map|glb|gltf|bin|env|wasm|ktx2|dds|hdr)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }

    # Replaceable public artwork must revalidate even when its filename stays the same.
    location ^~ /landing-assets/ {
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }

    # Only known studio routes receive the client app shell. Unknown URLs are 404s.
    location ~ ^/(home|campaigns|world-lore|characters|maps|arcane-screen|encounters|dice|effects|loom|weave|marketplace|statistics|dashboard|dm-game|player-game|loom-graph|quests|notes|locations|npcs|monsters|spells|items)(/|$) {
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cache-Control "no-store";
        try_files /index.html =404;
    }

    location / {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        try_files $uri $uri/ =404;
    }
}
'''
with open("/etc/nginx/sites-available/loom-weaver", "w", encoding="utf-8") as f:
    f.write(loom_nginx)

# 3. Redirect legacy loomweaver.geo-gamers.com and maps.loomweaver.geo-gamers.com with 301 to loom-weaver.com
geo_gamers_nginx = '''server {
    listen 80;
    listen 443 ssl http2;
    server_name loomweaver.geo-gamers.com www.loomweaver.geo-gamers.com;

    ssl_certificate /etc/ssl/certs/loomweaver-geo-gamers.pem;
    ssl_certificate_key /etc/ssl/private/loomweaver-geo-gamers.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    return 301 https://loom-weaver.com$request_uri;
}

server {
    listen 80;
    listen 443 ssl http2;
    server_name maps.loomweaver.geo-gamers.com;

    ssl_certificate /etc/ssl/certs/loomweaver-geo-gamers.pem;
    ssl_certificate_key /etc/ssl/private/loomweaver-geo-gamers.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    return 301 https://maps.loom-weaver.com$request_uri;
}
'''
with open("/etc/nginx/sites-available/loomweaver-geo-gamers", "w", encoding="utf-8") as f:
    f.write(geo_gamers_nginx)

# 4. Copy dedicated pre-rendered index.html to subdomain root folders so each subdomain serves its own SSR metadata
# Wait: since /var/www/loommaps/client etc. are symlinks to /var/www/loomweaver/client, we can configure Nginx `index` or `location = /` on each subdomain!
subdomain_routes = [
    ("/etc/nginx/sites-available/maps-loom-weaver", "/battlemap-builder/index.html"),
    ("/etc/nginx/sites-available/vtt-loom-weaver", "/vtt/index.html"),
    ("/etc/nginx/sites-available/actionbuilder-loom-weaver-disabled", "/encounter-builder/index.html"),
    ("/etc/nginx/sites-available/3dassets-loom-weaver", "/3d-assets/index.html"),
    ("/etc/nginx/sites-available/generator-loom-weaver", "/3d-assets/index.html"),
]
for conf_path, ssr_index in subdomain_routes:
    if os.path.exists(conf_path):
        with open(conf_path, "r", encoding="utf-8") as f:
            conf = f.read()
        if f"try_files $uri $uri/ {ssr_index};" not in conf:
            conf = conf.replace("try_files $uri $uri/ /index.html;", f"try_files $uri $uri/ {ssr_index} /index.html;")
            if "location = / {" not in conf:
                conf = conf.replace(
                    f"try_files $uri $uri/ {ssr_index} /index.html;",
                    f"try_files $uri $uri/ {ssr_index} /index.html;\n    }}\n    location = / {{\n        add_header Cache-Control \"no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0\";\n        try_files {ssr_index} /index.html =404;",
                )
            with open(conf_path, "w", encoding="utf-8") as f:
                f.write(conf)
PYEOF

nginx -t && systemctl reload nginx
sleep 2
systemctl is-active loom-weaver.service mythweaver.service nginx
curl -s http://127.0.0.1:5000/api/v2/health
echo ""
ls -la /var/www/loomweaver/assets
"""

sftp = ssh.open_sftp()
with sftp.open("/tmp/deploy_loomweaver_v2.sh", "w") as f:
    f.write(remote_script.replace("__SERVICE_USER__", env.USER))
sftp.close()

print("Executing remote production deployment...")
try:
    out = env.run(ssh, "bash /tmp/deploy_loomweaver_v2.sh", sudo=True, check=False)
finally:
    env.run(ssh, "rm -f /tmp/.lw_api.env", check=False)
print(out)
ssh.close()
for f in (CLIENT_TAR, SERVER_TAR):
    if os.path.exists(f):
        os.remove(f)
