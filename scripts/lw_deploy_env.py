"""Local-only deployment settings for LoomWeaver. NEVER commit this file.

Secrets live outside the repository in ~/.loomweaver/deploy.env (override the
path with LW_DEPLOY_ENV). Every deploy/ops script imports this module instead of
hard-coding hosts, users, or passwords.

deploy.env format (KEY=VALUE per line, # comments allowed):
    LW_SSH_HOST=...
    LW_SSH_USER=...
    LW_SSH_KEY=C:/Users/<you>/.ssh/id_ed25519_mythweaver
    LW_SSH_PASS=...            # sudo password (SSH login uses the key)
    LW_DB_ROOT_PASSWORD=...
    LW_DB_PASSWORD=...         # loomweaver_app MySQL user
    LW_NEO4J_PASSWORD=...
    LOOMWEAVER_JWT_SECRET=...
"""
from __future__ import annotations

import os
import shlex
from pathlib import Path

import paramiko

ENV_FILE = Path(os.environ.get("LW_DEPLOY_ENV", Path.home() / ".loomweaver" / "deploy.env"))


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        raise SystemExit(f"Missing local deployment secrets file: {path}")
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_env_file(ENV_FILE)


def require(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise SystemExit(f"{name} is not set in {ENV_FILE}")
    return value


HOST = require("LW_SSH_HOST")
USER = require("LW_SSH_USER")
KEY = os.environ.get("LW_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_mythweaver"))
PASS = os.environ.get("LW_SSH_PASS", "")  # sudo password only
DB_ROOT_PASSWORD = os.environ.get("LW_DB_ROOT_PASSWORD", "")
DB_PASSWORD = os.environ.get("LW_DB_PASSWORD", "")
NEO4J_PASSWORD = os.environ.get("LW_NEO4J_PASSWORD", "")
JWT_SECRET = os.environ.get("LOOMWEAVER_JWT_SECRET", "")

# Re-exported so legacy scripts can keep using `connection.paramiko`.
paramiko = paramiko


def connect(timeout: int = 30) -> paramiko.SSHClient:
    """Open an SSH session using the private key (password fallback only if no key)."""
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    if KEY and Path(KEY).is_file():
        ssh.connect(HOST, username=USER, key_filename=KEY, timeout=timeout,
                    look_for_keys=False, allow_agent=False)
    else:
        ssh.connect(HOST, username=USER, password=require("LW_SSH_PASS"), timeout=timeout)
    return ssh


def put_secret_file(ssh: paramiko.SSHClient, remote_path: str, content: str) -> None:
    """Write a 0600 file on the server so secrets never appear on a command line."""
    sftp = ssh.open_sftp()
    try:
        with sftp.open(remote_path, "w") as handle:
            handle.chmod(0o600)
            handle.write(content)
    finally:
        sftp.close()


def put_mysql_cnf(ssh: paramiko.SSHClient, remote_path: str, user: str, password: str) -> None:
    """Create a 0600 MySQL option file for `mysql --defaults-extra-file=<remote_path>`."""
    if '"' in password or "\\" in password or "\n" in password:
        raise SystemExit("MySQL password contains characters unsupported in an option file")
    put_secret_file(ssh, remote_path, f'[client]\nuser={user}\npassword="{password}"\n')


def run(ssh: paramiko.SSHClient, script: str, sudo: bool = False, check: bool = True) -> str:
    """Run a remote shell script. sudo passwords go over stdin, never on the command line."""
    if sudo:
        script = "sudo -S -p '' bash -c " + shlex.quote(script)
    stdin, stdout, stderr = ssh.exec_command(script)
    if sudo:
        stdin.write(require("LW_SSH_PASS") + "\n")
        stdin.flush()
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    if check and stdout.channel.recv_exit_status():
        raise RuntimeError(f"Remote command failed:\n{out}\n{err}")
    return out + (("\n" + err) if err.strip() else "")
