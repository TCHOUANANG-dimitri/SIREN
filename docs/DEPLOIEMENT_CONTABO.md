# Déploiement de production — VPS Contabo

État au 2026-10-21 : **préparé, revu (agent `devsecops`) et répété localement deux fois, jamais exécuté sur un vrai VPS** (aucun accès fourni — `docs/TACHES_DIFFEREES.md` T-CONTABO-DEPLOY). Aucune étape ci-dessous ne doit être présentée comme réalisée en production tant que la checklist §9 n'a pas été cochée sur le serveur.

## 1. Architecture cible

```
Internet ──443/80──▶ Caddy (proxy, TLS Let's Encrypt, HSTS)      réseau siren_edge
                         │ /api/*, /health, /health/ready, /ws/*   (tout le reste : 404)
                         ▼
                      API FastAPI (gunicorn/uvicorn, FS en lecture seule)  ── siren_egress ──▶ SMS / WhatsApp / e-mail / push
                         │                                                   (sortant uniquement)
             réseau siren_data (internal : AUCUN accès Internet, aucun port publié)
          ┌──────────────┼──────────────────┬──────────────┐
      PostgreSQL/PostGIS   Redis       worker Celery     beat Celery
      (rôle siren_app pour l'API ; propriétaire siren pour migrations et sauvegardes)
```

- Seul le proxy publie des ports (80/443). Docker publiant ses ports **en dehors d'UFW**, aucun autre service ne doit en publier : contrôlé en CI par `deploy/contabo/check_compose.py`.
- Images applicatives : `ghcr.io/<propriétaire>/siren-api|siren-worker:<vX.Y.Z>` (construites par `cd.yml`, provenance + SBOM). Images tierces épinglées par digest (`docker-compose.prod.yml`).
- L'API se connecte en `siren_app` (DML, pas de DDL — `sql/app_role.sql`) ; les migrations en propriétaire du schéma (service `migration`).
- Secrets : `.env.prod` est lu par l'API, le worker et beat, mais le mot de passe du propriétaire de la base (`POSTGRES_PASSWORD`) y est **effacé** ; le proxy ne reçoit que `DOMAIN` et `CADDY_EMAIL` (contrôlé par `check_compose.py`). Le paramètre `token` du WebSocket est retiré des journaux Caddy.

## 2. Environnements

| Environnement | Où | Configuration | Données |
|---|---|---|---|
| dev | poste développeur | `server/.env` (depuis `.env.example`), `docker compose up` + `docker-compose.dev.yml` | mock ou base locale |
| test | GitHub Actions (`ci.yml`) | variables de job, base PostGIS jetable | jeux de tests |
| prod | VPS Contabo | `deploy/contabo/.env.prod` (mode 600, depuis `env.prod.example`) + surcouche `docker-compose.prod.yml` | réelles |

## 3. Prérequis (à fournir — voir T-CONTABO-DEPLOY)

1. VPS Contabo sous Ubuntu 24.04 LTS (offres et prix : `docs/CAHIER_DES_COUTS.md`). Recommandation pilote : 4 vCPU / 8 Go (PostGIS + Celery + API).
2. Nom de domaine ; enregistrement **A** (et AAAA si IPv6) de `api.<domaine>` vers l'IP du VPS **avant** le premier démarrage de Caddy (le certificat est obtenu au démarrage).
3. Clé SSH ed25519 dédiée à l'exploitant ; une seconde, dédiée au déploiement GitHub.
4. Comptes fournisseurs OTP (T-OTP-PROVIDERS) pour un service utilisable.

## 4. Préparation du serveur (une fois)

```bash
# Depuis la console de secours Contabo ouverte en parallèle (une erreur SSH peut couper l'accès) :
scp deploy/contabo/install.sh root@<IP>:/root/
ssh root@<IP> 'DEPLOY_PUBKEY="ssh-ed25519 AAAA… exploitant" bash /root/install.sh'
# Ensuite uniquement en « deploy » (root et mot de passe SSH désactivés) :
ssh deploy@<IP>
git clone https://github.com/<propriétaire>/SIREN.git ~/siren && cd ~/siren
cp deploy/contabo/env.prod.example deploy/contabo/.env.prod && chmod 600 deploy/contabo/.env.prod
# Générer CHAQUE secret sur le serveur (jamais copié dans une conversation ni dans Git) :
openssl rand -base64 48 | tr -d '\n=/+' | cut -c1-48
nano deploy/contabo/.env.prod      # DOMAIN, CADDY_EMAIL, mots de passe, SECRET_KEY, JWT_SECRET_KEY, fournisseurs
# Clé publique de la clé de déploiement GitHub :
echo "ssh-ed25519 AAAA… github-deploy" >> ~/.ssh/authorized_keys
```

`install.sh` : utilisateur `deploy`, SSH par clé seule (pas de root), UFW (22/80/443), fail2ban, mises à jour de sécurité automatiques, Docker (dépôt officiel), journaux bornés, `age` et `rclone`, crontab des sauvegardes et du test de restauration.

Si le dépôt est privé, l'accès en lecture (clé de déploiement GitHub en lecture seule) et la connexion à GHCR (`docker login ghcr.io` avec un jeton `read:packages`) sont à configurer sur le serveur.

## 5. Configuration GitHub (CD)

*Settings → Environments → `production`* :
- **Required reviewers** : au moins une personne autorisée à valider la mise en production.
- Variables : `CONTABO_HOST`, `CONTABO_USER` (= `deploy`), `SIREN_DOMAIN`.
- Secrets : `CONTABO_SSH_KEY` (clé privée de déploiement), `CONTABO_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 <IP>`, vérifié contre l'empreinte affichée dans la console Contabo).
- *Settings → Actions → General* : jetons en lecture seule par défaut ; packages GHCR liés au dépôt.
- Règle de déploiement de l'environnement `production` : **tags `v*` uniquement** (*Deployment branches and tags*).

Tant que ces éléments manquent, le job `deploy` s'arrête à « Prérequis présents » sans rien modifier.

## 6. Déploiement

- **Automatique** : `git tag v1.2.0 && git push origin v1.2.0` → `cd.yml` : CI complète → images GHCR → approbation → SSH : `git checkout v1.2.0 && deploy/contabo/deploy.sh v1.2.0` → contrôle de santé public.
- **Relance manuelle** : *Actions → CD → Run workflow* en choisissant **le tag** dans « Use workflow from » (refusé depuis une branche : la CI testerait un autre commit). Une version déjà publiée sur GHCR n'est pas reconstruite (tag immuable) : ses images sont redéployées.
- **Manuel** (serveur) : `deploy/contabo/deploy.sh v1.2.0`.

`deploy.sh` (verrou `flock` : une seule opération à la fois) : sauvegarde préalable → `pull` des images → migrations (propriétaire) → rôle `siren_app` (idempotent, mot de passe transmis par l'entrée standard, jamais en argument) → démarrage → contrôle `https://<domaine>/health/ready` (code 200, version attendue **et** base joignable avec le rôle applicatif). `SIREN_VERSION` n'est inscrite dans `.env.prod` qu'**après** ce contrôle : un `pull` ou une migration en échec laisse le fichier, donc la cible d'un retour arrière, inchangé. En cas d'échec du démarrage ou du contrôle : retour automatique à la version précédente, et le script échoue (la CD est rouge).

## 7. Retour arrière

| Situation | Action |
|---|---|
| Nouvelle version en échec au déploiement | automatique (`deploy.sh`) |
| Défaut constaté après coup | `deploy/contabo/rollback.sh` (version précédente enregistrée) ou `rollback.sh v1.1.0` ; registre injoignable → images en cache local |
| Données corrompues | **décision humaine** : arrêter l'API, `restore.sh <sauvegarde> siren_restore_check`, vérifier, puis seulement `PRODUCTION_RESTORE=oui restore.sh <sauvegarde> siren` (confirmation tapée) |

Les migrations sont additives : une version applicative antérieure fonctionne sur le schéma plus récent. Le rollback SQL de chaque migration est commenté en fin de fichier et ne s'applique jamais automatiquement.

## 8. Sauvegardes et restauration

- `backup.sh daily|weekly|monthly|pre-deploy` : `pg_dump -Fc`, contrôle du format et lecture complète (`pg_restore --list`) **avant** chiffrement, empreinte SHA-256, aucun fichier partiel laissé en cas d'échec, rétention 7 / 4 / 6 / 5, chiffrement `age` si `BACKUP_AGE_RECIPIENT`, copie `rclone` si `BACKUP_RCLONE_REMOTE`. Planification (cron, `install.sh`) : quotidienne 02:15, hebdomadaire dimanche 02:30, mensuelle le 1er 02:45.
- `restore.sh` : empreinte **exigée** (`ALLOW_NO_CHECKSUM=1` pour passer outre), clé `age` vérifiée, sauvegarde déchiffrée et lue en entier **avant** toute suppression de la base cible.
- `verify-restore.sh` (lundi 04:30) : restaure la dernière quotidienne dans `siren_restore_check`, vérifie les tables clés, le nombre de comptes par rapport à la source, l'égalité des migrations et PostGIS, puis supprime la base de contrôle (même en cas d'échec).
- **Sauvegardes chiffrées** (recommandé) : la clé privée `age` n'est **pas** sur le serveur ; le test hebdomadaire du serveur échoue alors volontairement avec un message explicite, et le test de restauration se fait **hors serveur**, là où se trouve la clé : copier la dernière sauvegarde et son `.sha256`, puis `AGE_IDENTITY=… PG_CONTAINER=… PG_USER=… PG_DB=… BACKUP_DIR=… deploy/contabo/verify-restore.sh <fichier>` sur une base PostGIS jetable. Sur le serveur, l'intégrité de chaque sauvegarde reste contrôlée avant chiffrement. Alerte en cas d'échec : T-OPS-ALERTING.
- **Testé le 2026-10-21 sur Docker local** (base de dev et pile de production répétée) : sauvegarde, rétention, restauration, vérification, refus d'écraser la production, détection d'un fichier altéré, vérification après copie dans un autre dossier. **Non testés** : chiffrement `age`, copie `rclone` (T-BACKUP-OFFSITE).

### Répétition locale du déploiement (2026-10-21)

Pile complète (`server/docker-compose.yml` + `docker-compose.prod.yml`, proxy sur 127.0.0.1:18443, certificat interne Caddy pour `localhost`, images construites localement) :

| Scénario | Résultat |
|---|---|
| Premier déploiement | OK (rôle créé, migrations, santé v0.0.1) |
| Ports publiés | proxy seul (80/443) ; db, redis, api, worker, beat : aucun |
| Accès Internet depuis la base | refusé (`Network is unreachable`) |
| Rôle de connexion de l'API | `siren_app` ; écritures de limitation de débit OK |
| FS de l'API | lecture seule (`Read-only file system`) |
| En-têtes publics | HSTS, CSP stricte, `nosniff`, `DENY`, `Cache-Control: no-store` sur `/api/*` ; `/docs` → 404 |
| Mise à jour v0.0.2 | OK, sauvegarde `pre-deploy` créée |
| Version cassée v0.0.3 | démarrage en échec → retour automatique à v0.0.2, santé OK |
| `rollback.sh` registre injoignable | OK avec les images locales |

Défauts trouvés par cette répétition et corrigés : `respond 404` de Caddy qui interceptait l'API ; retour arrière jamais atteint (`set -e` sur l'échec de `compose up`) ; `rollback.sh` bloqué par un `pull` en échec ; URL de santé de `rollback.sh`.

### Seconde répétition, après la revue DevSecOps (2026-10-21)

| Scénario | Résultat |
|---|---|
| Premier déploiement (version d'exemple dans `.env.prod`) | OK ; aucune version « précédente » enregistrée ; ordre migrations → rôle vérifié sur base neuve |
| Environnement des conteneurs | proxy : `DOMAIN`, `CADDY_EMAIL` seulement ; api/worker/beat : `POSTGRES_PASSWORD` vide |
| `/health/ready` | `{"status":"ok","version":…}` via Caddy |
| Jeton WebSocket dans l'URL | 0 occurrence dans les journaux du proxy et de l'API |
| HTTP/3 | aucun en-tête `Alt-Svc` |
| Mise à jour, puis version cassée | sauvegarde `pre-deploy`, retour automatique ; `.env.prod` reste sur la version saine |
| `pull` impossible (version inexistante) | échec, `.env.prod` et service inchangés |
| Deux opérations simultanées | la seconde est refusée (verrou) |
| `rollback.sh` | OK, version inscrite après le contrôle |
| `siren_app` | sans superuser / createdb / createrole ; `SELECT` seul sur `schema_migrations` |
| Restauration : empreinte absente, fichier tronqué, fichier chiffré sans clé | refus ; base cible intacte (marqueur conservé) |
| Sauvegarde en échec (base inexistante) | aucun fichier restant |

## 9. Checklist de mise en production

- [ ] DNS résolu vers le VPS ; certificat Let's Encrypt obtenu (journal Caddy).
- [ ] `ssh root@` refusé ; `ssh -o PasswordAuthentication=yes` refusé.
- [ ] `nmap -Pn <IP>` depuis l'extérieur : seulement 22, 80, 443.
- [ ] `.env.prod` en 600, secrets générés sur le serveur, `ENVIRONMENT=production` (refus de démarrer avec les secrets d'exemple : vérifié par `unsafe_production_settings`).
- [ ] `ALLOWED_ORIGINS` sans `*`.
- [ ] Au moins un canal OTP opérationnel (`GET /api/v1/auth/otp/channels`).
- [ ] `docker compose … exec db psql -c "\du"` : `siren_app` sans superuser/createdb/createrole.
- [ ] Première sauvegarde quotidienne présente ; `verify-restore.sh` réussi (sur le serveur si non chiffrée, hors serveur avec `AGE_IDENTITY` sinon).
- [ ] Copie hors site et clé `age` en place (clé privée hors serveur) ; règle de cycle de vie du stockage distant définie.
- [ ] `https://<domaine>/health/ready` répond 200 avec la version déployée.
- [ ] Environnement GitHub `production` restreint aux tags `v*`, approbateurs définis.
- [ ] Un `rollback.sh` réel testé après le premier déploiement.
- [ ] Application mobile construite avec `EXPO_PUBLIC_API_MODE=live`, `EXPO_PUBLIC_API_BASE_URL=https://api.<domaine>` ; `EXPO_PUBLIC_WS_URL=wss://api.<domaine>/ws` si WebSocket souhaité.
- [ ] Personne autorisée et fenêtre de mise en production confirmées.

## 10. Exploitation courante

- Journaux : `docker compose … logs -f api` (JSON, bornés 3 × 10 Mo par conteneur). Les codes OTP n'y figurent jamais ; destinations masquées.
- Tâches planifiées (beat) : expiration des commandes (1 min), purge des compteurs de limitation (horaire), partitions mensuelles, purge des positions (rétention), réentraînement.
- Mises à jour système : automatiques (sécurité) ; redémarrage hors heures de pointe si le noyau change.
