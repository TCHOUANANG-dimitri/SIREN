# Mise à jour du backend SIREN sur o2switch

Commandes à taper (SSH ou Terminal cPanel) pour déployer une nouvelle version du
code. Chemins de cette installation :

| Élément | Chemin |
|---|---|
| Dépôt cloné | `~/siren-repo` |
| Application root (code exécuté) | `~/siren-api` |
| Virtualenv | `~/virtualenv/siren-api/3.11` |

---

## 1. Depuis ton PC : pousser les changements

```bash
git add .
git commit -m "description du changement"
git push
```

---

## 2. Sur le serveur : mise à jour standard

```bash
# Récupérer la dernière version du code
cd ~/siren-repo && git pull

# Copier server/ vers l'Application root (sans écraser le .env ni les caches)
rsync -av --exclude '__pycache__' --exclude '.env' \
  ~/siren-repo/server/ ~/siren-api/

# Redémarrer l'application
touch ~/siren-api/tmp/restart.txt
```

Sans `rsync` : remplacer la deuxième commande par
`cp -r ~/siren-repo/server/. ~/siren-api/`.

---

## 3. Si `requirements-o2switch.txt` a changé

Entrer dans le venv, installer, puis redémarrer :

```bash
source ~/virtualenv/siren-api/3.11/bin/activate && cd ~/siren-api
pip install -r requirements-o2switch.txt
touch ~/siren-api/tmp/restart.txt
```

Si la commande `source` échoue, recopier celle affichée en haut de la page de
l'application dans cPanel → *Setup Python App*.

---

## 4. Si le schéma de base de données a changé

Appliquer les migrations (Alembic) depuis le venv :

```bash
source ~/virtualenv/siren-api/3.11/bin/activate && cd ~/siren-api
alembic upgrade head
touch ~/siren-api/tmp/restart.txt
```

---

## 5. Si une variable d'environnement a changé

cPanel → *Setup Python App* → modifier la variable → **Save** → **Restart**.

---

## 6. Vérifier le déploiement

```bash
curl -I https://<ton-domaine>/health
# HTTP/2 200 attendu
```

En cas d'erreur, lire le log Passenger :

```bash
tail -n 50 ~/logs/siren-api.log
```

---

## Script tout-en-un (optionnel)

Créer `~/deploy.sh` :

```bash
#!/bin/bash
set -e
cd ~/siren-repo && git pull
rsync -av --exclude '__pycache__' --exclude '.env' ~/siren-repo/server/ ~/siren-api/
source ~/virtualenv/siren-api/3.11/bin/activate
pip install -r ~/siren-api/requirements-o2switch.txt
touch ~/siren-api/tmp/restart.txt
echo "Déploiement terminé"
```

Le rendre exécutable une seule fois, puis le lancer à chaque mise à jour :

```bash
chmod +x ~/deploy.sh
~/deploy.sh
```

---

## Aide-mémoire des erreurs

| Symptôme | Cause probable | Solution |
|---|---|---|
| Modification sans effet | Pas de redémarrage, ou `rsync` oublié | `touch ~/siren-api/tmp/restart.txt` |
| Erreur 500 / page Passenger | Dépendance ou variable manquante | Lire `~/logs/siren-api.log` |
| `No such file or directory` | Mauvais chemin | Vérifier avec `ls` |
| `git pull` demande un mot de passe | Dépôt privé | Utiliser un token GitHub ou une deploy key |
