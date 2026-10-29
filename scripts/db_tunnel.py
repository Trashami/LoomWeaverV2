"""Forward the server's MySQL and Neo4j ports to localhost over SSH.

Keep this running while you use the VS Code MySQL / Neo4j extensions:
    python scripts/db_tunnel.py

Local ports (chosen to avoid clashing with a local MySQL/Neo4j install):
    127.0.0.1:13306 -> server 127.0.0.1:3306  (MySQL)
    127.0.0.1:17687 -> server 127.0.0.1:7687  (Neo4j Bolt)
    127.0.0.1:17474 -> server 127.0.0.1:7474  (Neo4j Browser, optional)

Credentials come from ~/.loomweaver/deploy.env via lw_deploy_env; nothing is printed or stored.
"""
from __future__ import annotations

import select
import socketserver
import threading

from lw_deploy_env import connect

FORWARDS = {
    13306: ("127.0.0.1", 3306),
    17687: ("127.0.0.1", 7687),
    17474: ("127.0.0.1", 7474),
}


def make_handler(transport, remote):
    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            try:
                channel = transport.open_channel(
                    "direct-tcpip", remote, self.request.getpeername()
                )
            except Exception as exc:
                print(f"channel to {remote} failed: {exc}")
                return
            try:
                while True:
                    ready, _, _ = select.select([self.request, channel], [], [])
                    if self.request in ready:
                        data = self.request.recv(32768)
                        if not data:
                            break
                        channel.sendall(data)
                    if channel in ready:
                        data = channel.recv(32768)
                        if not data:
                            break
                        self.request.sendall(data)
            finally:
                channel.close()
                self.request.close()

    return Handler


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> None:
    ssh = connect()
    transport = ssh.get_transport()
    transport.set_keepalive(30)
    servers = []
    for local_port, remote in FORWARDS.items():
        server = Server(("127.0.0.1", local_port), make_handler(transport, remote))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
        print(f"127.0.0.1:{local_port} -> {remote[0]}:{remote[1]}")
    print("Tunnel is up. Press Ctrl+C to stop.")
    try:
        while transport.is_active():
            transport.join(2)
    except KeyboardInterrupt:
        pass
    finally:
        for server in servers:
            server.shutdown()
        ssh.close()


if __name__ == "__main__":
    main()
