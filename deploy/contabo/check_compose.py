"""Contrôle CI : la configuration de production ne publie aucun port interne.

Lit `docker compose ... config --format json` sur l'entrée standard.
Seul le proxy (80/443) peut publier des ports ; la base n'est que sur un réseau interne.
Secrets : le mot de passe du propriétaire de la base n'atteint aucun service applicatif,
et le proxy ne reçoit que ses propres variables.
"""
import json
import sys

config = json.load(sys.stdin)
services = config["services"]
problems = []
nginx_host_mode = "proxy" not in services
for name, service in services.items():
    for port in service.get("ports") or []:
        # En mode Nginx hôte, seule l'API peut être publiée sur loopback.
        if name == "api" and port.get("host_ip") == "127.0.0.1":
            continue
        if name != "proxy" or port.get("published") not in ("80", "443"):
            problems.append(f"{name} publie des ports : {service['ports']}")
if nginx_host_mode:
    api_ports = services.get("api", {}).get("ports") or []
    if len(api_ports) != 1 or api_ports[0].get("host_ip") != "127.0.0.1" or api_ports[0].get("target") != 8000:
        problems.append(f"en mode Nginx, l'API doit publier uniquement 127.0.0.1:<port>:8000 : {api_ports}")
db_networks = set((services.get("db", {}).get("networks") or {}).keys())
for network in db_networks:
    if not config.get("networks", {}).get(network, {}).get("internal"):
        problems.append(f"la base est sur un réseau non interne : {network}")
if "siren_app" not in services.get("api", {}).get("environment", {}).get("DATABASE_URL", ""):
    problems.append("l'API ne se connecte pas avec le rôle applicatif")
for name in ("db", "redis", "proxy"):
    if name not in services:
        continue
    image = services.get(name, {}).get("image", "")
    if "@sha256:" not in image:
        problems.append(f"{name} : image non épinglée par digest ({image})")
for name in ("api", "worker", "beat"):
    env = services.get(name, {}).get("environment", {}) or {}
    if env.get("POSTGRES_PASSWORD"):
        problems.append(f"{name} reçoit le mot de passe du propriétaire de la base (POSTGRES_PASSWORD)")
proxy_env = set((services.get("proxy", {}).get("environment") or {}).keys())
if proxy_env - {"DOMAIN", "CADDY_EMAIL"}:
    problems.append(f"le proxy reçoit des variables superflues : {sorted(proxy_env - {'DOMAIN', 'CADDY_EMAIL'})}")
if problems:
    print("\n".join(problems))
    sys.exit(1)
print("configuration de production conforme")
