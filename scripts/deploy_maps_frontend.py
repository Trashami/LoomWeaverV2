"""Deploy the standalone map editor without replacing the main site or API.

Run npm run build in loommaps-studio and dotnet build before invoking.
Uses the existing deployment connection settings; LW_SSH_PASS overrides them.
"""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import re
import shlex
import tarfile
import tempfile
import sys

import deploy_loommaps as connection


def command(ssh, script, sudo=False):
    if sudo:
        script = "sudo -S -p '' bash -c " + shlex.quote(script)
    stdin, stdout, stderr = ssh.exec_command(script)
    if sudo:
        stdin.write(connection.PASS + "\n")
        stdin.flush()
    output = stdout.read().decode()
    error = stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(output + error)
    return output


def main():
    root = Path(__file__).resolve().parents[1]
    dist = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root / 'loommaps-studio/dist/loommaps-studio/browser'
    html = (dist / 'index.html').read_bytes().decode('utf-8')
    if 'lw-maps-studio-root' not in html:
        raise RuntimeError('Build is not the standalone map editor')
    release = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target = f'/var/www/loommaps/releases/{release}/client'
    ssh = connection.paramiko.SSHClient()
    ssh.set_missing_host_key_policy(connection.paramiko.AutoAddPolicy())
    ssh.connect(connection.HOST, username=connection.USER,
                password=connection.PASS, timeout=30)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / 'maps.tar.gz'
            with tarfile.open(archive, 'w:gz') as tar:
                for item in dist.iterdir():
                    # Shared assets stay on the server; never publish local uploads.
                    if item.is_file():
                        tar.add(item, arcname=item.name)
            config = connection.NGINX_MAPS_CONF
            with ssh.open_sftp() as sftp:
                sftp.put(str(archive), f'/tmp/maps-{release}.tar.gz')
                with sftp.open(f'/tmp/maps-{release}.conf', 'w') as file:
                    file.write(config)
            script = f'''set -eu
conf=/etc/nginx/sites-available/maps-loom-weaver
cp -a "$conf" "$conf.backup-{release}"
old=$(readlink /var/www/loommaps/current || true)
rollback() {{
  cp -a "$conf.backup-{release}" "$conf"
  if [ -n "$old" ]; then ln -sfn "$old" /var/www/loommaps/current; else unlink /var/www/loommaps/current; fi
  nginx -t && systemctl reload nginx
}}
mkdir -p {target}
tar -xzf /tmp/maps-{release}.tar.gz -C {target}
test -s {target}/index.html
chmod -R a+rX /var/www/loommaps/releases/{release}
test ! -e /var/www/loommaps/current || test -L /var/www/loommaps/current
ln -sfn /var/www/loommaps/releases/{release} /var/www/loommaps/current
trap rollback EXIT
cp /tmp/maps-{release}.conf "$conf"
nginx -t
systemctl reload nginx
curl -fsS --resolve maps.loom-weaver.com:443:127.0.0.1 https://maps.loom-weaver.com/ | grep -q lw-maps-studio-root
trap - EXIT
systemctl is-active nginx loom-weaver
'''
            print(command(ssh, script, sudo=True))
        live = command(ssh, 'curl -fsS https://maps.loom-weaver.com/')
        if hashlib.sha256(live.encode()).digest() != hashlib.sha256(html.encode()).digest():
            raise RuntimeError('Public HTML does not match the deployed build')
        bundles = re.findall(r'(?:src|href)="([^"/]+\.(?:js|css))"', html)
        for bundle in bundles:
            command(ssh, 'curl -fsS -o /dev/null ' + shlex.quote(
                'https://maps.loom-weaver.com/' + bundle))
        print(f'Deployed {release}; public HTML and {len(bundles)} entry bundles verified.')
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
