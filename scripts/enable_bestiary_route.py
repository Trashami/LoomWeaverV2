"""Add the authenticated bestiary route to the existing nginx CSR whitelist."""
from pathlib import Path
import shutil
import subprocess
path = Path('/etc/nginx/sites-enabled/loom-weaver').resolve()
source = path.read_text()
old = '|npcs|monsters|spells|items)(/|$)'
new = '|npcs|monsters|bestiary|spells|items)(/|$)'
if new in source:
    print('Bestiary route already enabled.')
elif old in source:
    backup = Path('/etc/nginx/sites-available/loom-weaver.active.before-bestiary')
    if not backup.exists(): shutil.copy2(path, backup)
    path.write_text(source.replace(old, new))
    try:
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except BaseException:
        path.write_text(source)
        raise
    print('Bestiary CSR route enabled; previous nginx configuration retained.')
else:
    raise RuntimeError('Expected CSR route whitelist not found; configuration left unchanged.')
