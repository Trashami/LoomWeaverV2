import os
import lw_deploy_env as env

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL_FILE = os.path.join(ROOT, "scripts", "provision_loomweaver_mysql.sql")
CYPHER_FILE = os.path.join(ROOT, "scripts", "provision_loomweaver_neo4j.cypher")

env.require("LW_DB_ROOT_PASSWORD")
env.require("LW_DB_PASSWORD")
env.require("LW_NEO4J_PASSWORD")
ssh = env.connect()

sftp = ssh.open_sftp()
with open(SQL_FILE, encoding="utf-8") as sql_handle:
    provision_sql = sql_handle.read().replace("__LW_DB_PASSWORD__", env.DB_PASSWORD.replace("\\", "\\\\").replace("'", "\\'"))
with sftp.open("/tmp/provision_loomweaver_mysql.sql", "w") as remote_sql:
    remote_sql.chmod(0o600)
    remote_sql.write(provision_sql)
sftp.put(CYPHER_FILE, "/tmp/provision_loomweaver_neo4j.cypher")
sftp.close()

ROOT_CNF = "/tmp/.lw_mysql_root.cnf"
APP_CNF = "/tmp/.lw_mysql_app.cnf"
NEO_ENV = "/tmp/.lw_neo4j.env"
env.put_mysql_cnf(ssh, ROOT_CNF, "root", env.DB_ROOT_PASSWORD)
env.put_mysql_cnf(ssh, APP_CNF, "loomweaver_app", env.DB_PASSWORD)
env.put_secret_file(ssh, NEO_ENV, f"NEO4J_USERNAME=neo4j\nNEO4J_PASSWORD={env.NEO4J_PASSWORD}\n")

try:
    print("Applying MySQL schema & seed to 'loomweaver' database...")
    print(env.run(ssh, f'mysql --defaults-extra-file={ROOT_CNF} < /tmp/provision_loomweaver_mysql.sql', check=False))

    out = env.run(ssh, f'mysql --defaults-extra-file={APP_CNF} loomweaver -e "SHOW TABLES; SELECT id, slug, name, system_code FROM lw_campaigns; SELECT COUNT(*) AS total_entities FROM lw_entities;"', check=False)
    print("=== Verified 'loomweaver' MySQL Database ===")
    print(out)

    print("Applying Neo4j graph schema & seed to 'loomweaver' namespace...")
    cypher_cmd = (
        'docker cp /tmp/provision_loomweaver_neo4j.cypher mythweaver-neo4j:/tmp/provision_loomweaver_neo4j.cypher && '
        f'docker exec --env-file {NEO_ENV} mythweaver-neo4j cypher-shell -f /tmp/provision_loomweaver_neo4j.cypher'
    )
    print(env.run(ssh, cypher_cmd, sudo=True, check=False))

    verify_cypher = f'docker exec --env-file {NEO_ENV} mythweaver-neo4j cypher-shell "MATCH (n:Entity {{namespace: \'loomweaver\'}}) OPTIONAL MATCH (n)-[r]->() RETURN count(DISTINCT n) AS loomweaver_nodes, count(r) AS loomweaver_edges;"'
    out = env.run(ssh, verify_cypher, sudo=True, check=False)
    print("=== Verified 'loomweaver' Neo4j Graph ===")
    print(out)
finally:
    env.run(ssh, f"rm -f {ROOT_CNF} {APP_CNF} {NEO_ENV} /tmp/provision_loomweaver_mysql.sql", check=False)
    ssh.close()
