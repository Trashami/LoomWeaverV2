"""Resolve the pseudo LoomWeaver account that owns official 5etools content."""

OFFICIAL_OWNER_USERNAME = "LoomWeaver"


def official_owner_id(cur):
    cur.execute("SELECT id FROM lw_users WHERE username = %s", (OFFICIAL_OWNER_USERNAME,))
    row = cur.fetchone()
    if row is None:
        raise RuntimeError(
            "LoomWeaver pseudo user is missing; apply scripts/migrations/20261108_loomweaver_pseudo_owner.sql first"
        )
    return row[0]
