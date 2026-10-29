"""Deploy a clean API publish directory, preserving production configuration and data.

Usage: python scripts/deploy_atlas_backend.py /absolute/path/to/publish
Only use output built from the committed baseline plus reviewed atlas files.
"""
from datetime import datetime, timezone
from pathlib import Path
import shlex
import sys
import tarfile
import tempfile
import lw_deploy_env as env
from deploy_maps_frontend import command


def main():
    publish = Path(sys.argv[1]).resolve()
    if not (publish / 'LoomWeaver.Api.dll').is_file():
        raise RuntimeError('Expected a verified LoomWeaver.Api publish directory')
    release = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    ssh = env.connect()
    try:
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp) / 'backend.tar.gz'
            with tarfile.open(archive, 'w:gz') as tar:
                for item in publish.iterdir():
                    if item.name.lower().startswith('appsettings') or item.name in ('wwwroot', 'uploads', 'assets'):
                        continue
                    tar.add(item, arcname=item.name)
            remote = f'/tmp/atlas-backend-{release}.tar.gz'
            with ssh.open_sftp() as sftp:
                sftp.put(str(archive), remote)
            backup = f'/var/www/loomweaver/backups/backend-before-atlas-{release}.tar.gz'
            script = f'''set -eu
server=/var/www/loomweaver/server
stage=/var/www/loomweaver/releases/atlas-api-{release}
mkdir -p "$stage" /var/www/loomweaver/backups
tar -xzf {shlex.quote(remote)} -C "$stage"
find "$stage" -type f -printf '%P\\n' > "$stage/files.txt"
(cd "$server" && tar -czf {shlex.quote(backup)} --ignore-failed-read -T "$stage/files.txt")
rollback() {{
  tar -xzf {shlex.quote(backup)} -C "$server"
  systemctl restart loom-weaver
}}
trap rollback ERR
rsync -a --exclude files.txt "$stage/" "$server/"
systemctl restart loom-weaver
healthy=0
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:5000/api/v2/health >/dev/null; then healthy=1; break; fi
  sleep 1
done
test "$healthy" = 1
code=$(curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:5000/api/v2/campaigns/1/atlases)
test "$code" = 401
systemctl is-active loom-weaver
trap - ERR
'''
            print(command(ssh, script, sudo=True).strip())
            print(f'Atlas API deployed; anonymous access denied. Rollback: {backup}')
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
