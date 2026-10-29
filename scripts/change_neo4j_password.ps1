<#
.SYNOPSIS
Changes the LoomWeaver Neo4j password on the production server.

.DESCRIPTION
Connects over SSH using the settings in deploy.env, then on the server:
  1. Runs ALTER CURRENT USER SET PASSWORD inside the mythweaver-neo4j container.
  2. Updates Neo4j__Password in /etc/loomweaver/api.env.
  3. Restarts loom-weaver and mythweaver and checks a Neo4j login with the new password.
  4. Updates LW_NEO4J_PASSWORD in the local deploy.env.

Secrets are sent over SSH stdin, never on a command line. Nothing is printed.

.EXAMPLE
pwsh -File scripts\change_neo4j_password.ps1
#>
[CmdletBinding()]
param(
    [string]$EnvFile = (Join-Path $HOME ".loomweaver\deploy.env"),
    [string]$Neo4jUser = "loomweaver",
    [string]$Container = "mythweaver-neo4j"
)

$ErrorActionPreference = "Stop"

function Read-DeployEnv([string]$Path) {
    if (-not (Test-Path $Path)) { throw "deploy.env not found: $Path" }
    $values = @{}
    foreach ($line in Get-Content $Path) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            $value = $matches[2]
            if ($value.Length -ge 2 -and ($value[0] -eq '"' -or $value[0] -eq "'") -and $value[-1] -eq $value[0]) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $values[$matches[1]] = $value
        }
    }
    return $values
}

function ConvertFrom-SecureText([securestring]$Secure) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-ShellQuoted([string]$Value) {
    return "'" + $Value.Replace("'", "'\''") + "'"
}

function Get-CypherLiteral([string]$Value) {
    return "'" + $Value.Replace('\', '\\').Replace("'", "\'") + "'"
}

$envValues = Read-DeployEnv $EnvFile
$sshHost = $envValues['LW_SSH_HOST']
$sshUser = $envValues['LW_SSH_USER']
$sudoPass = $envValues['LW_SSH_PASS']
$keyPath = if ($envValues['LW_SSH_KEY']) { $envValues['LW_SSH_KEY'] } else { Join-Path $HOME ".ssh\id_ed25519_mythweaver" }
if (-not $sshHost -or -not $sshUser) { throw "LW_SSH_HOST and LW_SSH_USER must be set in $EnvFile" }
if (-not (Test-Path $keyPath)) { throw "SSH key not found: $keyPath" }

$currentPw = ConvertFrom-SecureText (Read-Host "Current Neo4j password for '$Neo4jUser' (Enter to use LW_NEO4J_PASSWORD from deploy.env)" -AsSecureString)
if (-not $currentPw) { $currentPw = $envValues['LW_NEO4J_PASSWORD'] }
if (-not $currentPw) { throw "No current Neo4j password available." }

$newPw = ConvertFrom-SecureText (Read-Host "New Neo4j password" -AsSecureString)
$confirmPw = ConvertFrom-SecureText (Read-Host "Confirm new Neo4j password" -AsSecureString)

if ($newPw -ne $confirmPw) { throw "New passwords do not match." }
if ($newPw.Length -lt 8) { throw "Use at least 8 characters." }
if ($newPw -eq $currentPw) { throw "New password must differ from the current one." }
if ($newPw -match '[\s"''\\$#`]') { throw "Avoid whitespace, quotes, backslash, dollar, hash, and backtick (they break api.env / systemd parsing)." }

$remoteTemplate = @'
set -euo pipefail
umask 077
NEO_USER=__NEO_USER__
CONTAINER=__CONTAINER__
CUR=__CUR__
NEW_PW=__NEW__
CYPHER_FILE_BODY=__CYPHER__

cleanup() { docker exec "$CONTAINER" rm -f /tmp/lw_pw.cypher >/dev/null 2>&1 || true; }
trap cleanup EXIT

printf '%s\n' "$CYPHER_FILE_BODY" | docker exec -i "$CONTAINER" sh -c 'umask 077; cat > /tmp/lw_pw.cypher'
docker exec "$CONTAINER" cypher-shell -a bolt://localhost:7687 -u "$NEO_USER" -p "$CUR" -d system -f /tmp/lw_pw.cypher >/dev/null
echo "Neo4j password changed for $NEO_USER"

export NEW_PW
python3 - <<'PY'
import os
path = "/etc/loomweaver/api.env"
pw = os.environ["NEW_PW"]
lines = open(path).read().splitlines()
out, found = [], False
for line in lines:
    if line.startswith("Neo4j__Password="):
        out.append("Neo4j__Password=" + pw)
        found = True
    else:
        out.append(line)
if not found:
    out.append("Neo4j__Password=" + pw)
open(path, "w").write("\n".join(out) + "\n")
PY
echo "Updated Neo4j__Password in /etc/loomweaver/api.env"

systemctl restart loom-weaver mythweaver
sleep 3
systemctl is-active loom-weaver mythweaver
docker exec "$CONTAINER" cypher-shell -a bolt://localhost:7687 -u "$NEO_USER" -p "$NEW_PW" -d neo4j 'RETURN 1 AS ok;' >/dev/null
echo "Neo4j login with the new password: OK"
'@

$cypherBody = "ALTER CURRENT USER SET PASSWORD FROM " + (Get-CypherLiteral $currentPw) + " TO " + (Get-CypherLiteral $newPw) + ";"

$script = $remoteTemplate.
    Replace('__NEO_USER__', (Get-ShellQuoted $Neo4jUser)).
    Replace('__CONTAINER__', (Get-ShellQuoted $Container)).
    Replace('__CUR__', (Get-ShellQuoted $currentPw)).
    Replace('__NEW__', (Get-ShellQuoted $newPw)).
    Replace('__CYPHER__', (Get-ShellQuoted $cypherBody))

# Windows line endings would make bash read "pipefail\r" and fail.
$script = $script -replace "`r", ""
$sudoCmd = if ($sudoPass) { "sudo -S -p '' bash -s" } else { "sudo -n bash -s" }
$payload = if ($sudoPass) { $sudoPass + "`n" + $script } else { $script }

Write-Host "Connecting to $sshUser@$sshHost ..."
$payload | & ssh -i $keyPath "$sshUser@$sshHost" $sudoCmd
if ($LASTEXITCODE -ne 0) { throw "Remote password change failed (exit $LASTEXITCODE). Check the output above." }

$deployLines = [IO.File]::ReadAllLines($EnvFile)
$updated = foreach ($line in $deployLines) {
    if ($line -match '^\s*LW_NEO4J_PASSWORD\s*=') { "LW_NEO4J_PASSWORD=$newPw" } else { $line }
}
[IO.File]::WriteAllLines($EnvFile, [string[]]$updated)
Write-Host "Updated LW_NEO4J_PASSWORD in $EnvFile. Done."
