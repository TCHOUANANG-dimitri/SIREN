# Registre des tâches différées — SIREN

> **Modèle de travail.** À remplir par Claude Code au fil de l'exécution. Ne laisser aucune tâche partielle, bloquée ou non testée uniquement dans les notes de session. Ne jamais inscrire de mots de passe, clés API, jetons, clés privées ou valeurs de secrets dans ce fichier.

## Résumé

- Date de dernière revue : `À RENSEIGNER`
- Version/branche du projet : `À RENSEIGNER`
- Nombre de tâches terminées : `À RENSEIGNER`
- Nombre de tâches partielles : `À RENSEIGNER`
- Nombre de tâches bloquées : `À RENSEIGNER`
- Risques bloquants avant production : `À RENSEIGNER`

## Tâches différées

### `[ID] — [Nom précis de la tâche]`

- **Priorité :** P0 / P1 / P2 / P3
- **Statut :** PARTIELLE / BLOQUÉE / NON COMMENCÉE
- **Date de vérification :** `AAAA-MM-JJ`
- **Exigence d'origine :** `Référence à la matrice de couverture`
- **Résultat attendu :**
- **Ce qui manque exactement :**
- **Raison concrète du blocage/non-achèvement :**
- **Actions déjà réalisées :**
- **Logique métier déjà implémentée :**
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :**
- **Fichiers concernés :**
- **Tests exécutés et résultats réels :**
- **Tests impossibles à exécuter et raison :**
- **Informations non sensibles à fournir :**
- **Accès ou secrets requis (noms des variables/secrets seulement) :**
  - Ex. `SMS_PROVIDER_API_KEY` — fournir via coffre de secrets ou variables protégées, jamais dans ce document.
- **Matériel, firmware, OS ou service tiers requis :**
- **Étapes exactes pour reprendre :**
  1. `...`
- **Critères d'acceptation de sortie :**
- **Dépendances :**
- **Risque résiduel / contournement sûr :**
- **Responsable ou agent de suivi :**

---

## Checklist d'informations et d'accès à recueillir

Cocher uniquement quand c'est réellement disponible et vérifié. Ne pas coller les valeurs secrètes ici.

- [ ] Stack et commandes de build/test confirmées par le dépôt.
- [ ] URL du dépôt distant et fournisseur CI/CD identifié.
- [ ] Secrets CI/CD créés dans le gestionnaire de secrets approprié.
- [ ] Accès administrateur VPS Contabo fourni par un canal sécurisé, avec compte non-root lorsque possible.
- [ ] Domaine, DNS et stratégie de certificats TLS confirmés.
- [ ] Ressources VPS disponibles (CPU, RAM, stockage, OS, sauvegardes).
- [ ] Accès et paramètres de l'expéditeur SMS / fournisseur SMS, sans secret stocké dans Git.
- [ ] Accès WhatsApp Business/provider, numéro expéditeur et modèles approuvés, si requis.
- [ ] Configuration e-mail (SMTP/API, domaine expéditeur et vérification SPF/DKIM/DMARC si applicable), si requise.
- [ ] Appareils physiques de test, versions Android/iOS et permissions BLE/localisation disponibles.
- [ ] Version du firmware BLE, documentation du protocole, mécanisme d'authentification/chiffrement et capacités de relais confirmés.
- [ ] Clés/certificats de dispositif disponibles via un processus sécurisé, si le protocole les requiert.
- [ ] Fournisseur cartographique, restrictions et clé API éventuelle identifiés.
- [ ] Données de test anonymisées et stratégie de migration des comptes existants validées.
- [ ] Volumes prévisionnels (utilisateurs, OTP/jour, événements BLE, rétention des données, sauvegardes) estimés pour le cahier des coûts.
- [ ] Fenêtre de déploiement et personne autorisée à valider le passage en production identifiées.

## Journal de reprise

| Date | Tâche | Changement effectué | Tests relancés | Résultat | Décision |
|---|---|---|---|---|---|
| `AAAA-MM-JJ` | `ID` | `...` | `...` | `...` | `ACCEPTER / CORRIGER / ESCALADER / BLOQUER` |
