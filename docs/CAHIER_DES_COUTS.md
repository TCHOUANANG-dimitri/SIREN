# Cahier des coûts — SIREN

Mise à jour : **2026-10-21**. Complète le rapport du 15/10/2026 (`docs/RAPPORT_SERVICES_ET_COUTS_SIREN.pdf`), dont les montants sont repris tels quels avec leur source. Seuls les services ajoutés par la finalisation (VPS Contabo, OTP multi-canal, CI/CD, sauvegardes hors site) sont nouveaux.

**Légende** — [V] tarif lu sur une page officielle à la date indiquée ; [E] estimation (sources tierces ou hypothèse explicite) ; [ND] donnée non disponible : **aucun montant n'est inventé**, la case reste à compléter. Conversion : 1 € = 655,957 FCFA (parité fixe) ; 1 $ ≈ 585 FCFA (Forbes Advisor, 14/10/2026, repris du rapport du 15/10). Tarifs à revérifier au moment de la commande.

## 1. Coûts fixes

| Poste | Offre | Tarif | ≈ FCFA / mois | Statut | Source |
|---|---|---|---|---|---|
| VPS Contabo (pilote) | Cloud VPS 4 — 4 vCPU, 8 Go, 100 Go SSD | 4,40 €/mois TTC, prix « effectif » d'un engagement 24 mois | ≈ 2 890 | [V]* | contabo.com/en/vps, consulté le 2026-10-21 |
| VPS Contabo (croissance) | Cloud VPS 6 — 6 vCPU, 12 Go | 6,00 €/mois TTC (24 mois) | ≈ 3 940 | [V]* | idem |
| VPS Contabo (marge) | Cloud VPS 8 — 8 vCPU, 24 Go | 11,20 €/mois TTC (24 mois) | ≈ 7 350 | [V]* | idem |
| Frais d'installation Contabo, prix sans engagement | — | non affichés de façon lisible | — | [ND] | idem |
| Nom de domaine | .com / .cm selon choix | ≈ 10–15 €/an | ≈ 550–820 | [E] | rapport du 15/10 |
| Certificat TLS | Let's Encrypt via Caddy | 0 | 0 | [V] | letsencrypt.org (gratuit) |
| Google Play Console | paiement unique | 25 $ | ≈ 1 200 (lissé 12 mois) | [E] | rapport du 15/10 |
| GitHub Actions / GHCR | selon plan du compte GitHub (minutes et stockage de paquets) | non vérifié pour ce compte | — | [ND] | à lire dans *Settings → Billing* du compte |
| Stockage hors site des sauvegardes | non choisi (S3 compatible) | — | — | [ND] | T-BACKUP-OFFSITE |

\* Les prix Contabo de la page sont TTC et calculés sur un engagement de 24 mois ; leur lecture automatique a été signalée comme fragmentaire pour les offres au-delà de « Cloud VPS 4 » (seul le prix d'appel « à partir de 4,40 € » est confirmé par l'en-tête de la page). **À reconfirmer au panier**, avec la durée d'engagement réellement choisie.

Le VPS remplace, à terme, l'hébergement o2switch + Supabase du rapport du 15/10 (≈ 4 600 à 10 500 + ≈ 14 600 FCFA/mois [V/E]) : la base PostGIS est hébergée sur le VPS. Cette substitution reste une décision à prendre (le mode o2switch reste supporté par le code).

## 2. Coûts variables — codes à usage unique

| Canal | Tarif | ≈ FCFA | Statut | Source |
|---|---|---|---|---|
| SMS Twilio vers le Cameroun | 0,317 $/SMS | ≈ 185 / SMS | [V] | twilio.com/en-us/sms/pricing/cm, consulté le 15/10/2026 |
| SMS Africa's Talking vers le Cameroun | non publié de façon lisible | — | [ND] | à demander au commercial (dépend du volume et du Sender ID) |
| WhatsApp Cloud API — catégorie « authentication » | tarification **par message** livré depuis le 1er juillet 2025 ; le Cameroun relève du marché « Reste de l'Afrique » ; montant non lisible sur la grille | — | [ND] | developers.facebook.com/docs/whatsapp/pricing, whatsappbusiness.com/products/platform-pricing (consultés le 2026-10-21) |
| E-mail (SMTP de l'hébergeur ou prestataire) | inclus / offre gratuite selon prestataire | 0 | [E] | rapport du 15/10 |

### Hypothèse de volume (pilote, à valider)

100 familles, 150 dispositifs (rapport du 15/10). Les volumes OTP dépendent de la politique de 2FA, non décidée :

| Scénario | Codes / mois | Coût SMS Twilio | Statut |
|---|---|---|---|
| Vérification à l'inscription seule (100 comptes + 50 proches) | ≈ 150 | ≈ 27 750 FCFA (une fois) | [E] |
| 2FA activée par 30 % des comptes, 1 connexion / semaine | ≈ 200 | ≈ 37 000 FCFA / mois | [E] |
| WhatsApp à la place du SMS | idem | [ND] (tarif non lisible) | [ND] |

Les limites de débit (`OTP_MAX_PER_HOUR`, `OTP_MAX_PER_DESTINATION_PER_HOUR`, `OTP_MAX_PER_IP_PER_HOUR`) bornent aussi le coût d'un abus (« SMS pumping »).

## 3. Récapitulatif mensuel indicatif (pilote, Android)

| Poste | ≈ FCFA / mois | Statut |
|---|---|---|
| VPS Contabo Cloud VPS 4 | ≈ 2 890 | [V]* |
| Domaine | ≈ 550–820 | [E] |
| Google Play (lissé) | ≈ 1 200 | [E] |
| SMS OTP (scénario 2FA 30 %) | ≈ 37 000 | [E] |
| Commission Mobile Money (rapport du 15/10) | ≈ 10 000–11 000 | [E] |
| GitHub, stockage hors site, WhatsApp, Africa's Talking | à compléter | [ND] |
| **Total connu** | **≈ 51 600 – 52 900** + postes [ND] | — |

## 4. Informations à fournir pour fiabiliser ce cahier

- Volumes réels prévus : comptes, connexions, OTP/jour, part de la 2FA, canal préféré (SMS ou WhatsApp).
- Offre Contabo choisie et durée d'engagement ; prix au panier (HT/TTC).
- Grille WhatsApp « authentication » pour le Cameroun (téléchargeable depuis le gestionnaire WhatsApp Business) ; devis Africa's Talking.
- Plan GitHub du compte propriétaire ; stockage hors site retenu.
