# Emails transactionnels

## État

| Élément | État |
|---|---|
| Modèles FR/EN versionnés | Implémenté — `server/app/services/email/templates.py` (`TEMPLATE_VERSION`) |
| Envoi | Implémenté par SMTP (`EMAIL_BACKEND=smtp`), **non configuré** : aucun identifiant fourni |
| Prestataire | **Non choisi** (CDC App §10 : Resend / Mailgun…). SMTP fonctionne avec la messagerie o2switch comme avec ces prestataires. |
| Sans canal configuré | Les routes concernées répondent `503 email_unavailable` ; l'app l'affiche. Aucun « email envoyé » simulé. |
| Mode démonstration (app) | Aucun email : le code est affiché à l'écran avec la mention « Test uniquement ». |

## Modèles

| Modèle | Déclencheur | Contenu | Sécurité |
|---|---|---|---|
| `signup_verify` | Inscription (`OTP_MODE=email`) | Code à 6 chiffres | Valable `OTP_TTL_MINUTES` (10), usage unique, 5 essais |
| `login_2fa` | Connexion avec vérification en deux étapes | Code | Idem ; « ne communiquez ce code à personne » |
| `password_reset` | Mot de passe oublié | Code | Idem ; réponse identique si le compte n'existe pas |
| `share_granted` | Création d'un partage | Qui partage, pour quel enfant, où répondre | Aucune donnée de l'enfant hormis le prénom |
| `password_changed` | Changement / réinitialisation du mot de passe | Alerte de sécurité | Que faire si ce n'est pas vous |
| `twofa_changed` | Activation / désactivation de la 2FA | Alerte de sécurité | Idem |

Chaque email : sujet, préheader, titre, paragraphes, code éventuel, note de
sécurité, pied de page ; version texte + HTML (variables échappées), en-tête
`X-SIREN-Template: <modèle>@<version>/<langue>`. Langue = `users.langue` du
destinataire. Même variables en FR et EN (test `test_email_templates_have_same_variables_in_fr_and_en`).

## Codes à usage unique

`server/app/services/otp.py` : code `secrets`, stocké en HMAC-SHA256 (clé
`SECRET_KEY`), jeton de challenge aléatoire haché, expiration, usage unique,
5 essais, délai de 60 s entre deux envois, 5 codes par heure. L'application
n'est jamais la source de vérité du code.

## À faire par l'équipe (bloquant pour la production)

1. Choisir l'expéditeur (adresse du domaine SIREN) et le serveur SMTP.
2. Renseigner `EMAIL_BACKEND=smtp`, `EMAIL_FROM`, `SMTP_*` dans le `.env` du serveur (jamais dans Git).
3. Configurer SPF, DKIM et DMARC du domaine d'envoi (délivrabilité).
4. Passer `OTP_MODE=email` si la confirmation d'email doit être exigée à l'inscription.
5. Appliquer la migration `server/migrations/002_otp_email_legal.sql`.

Non implémenté : changement d'adresse email (aucune route), invitation d'une
personne sans compte (voir `RAPPORT-MISSION-REGLAGES-I18N.md`, propositions).
