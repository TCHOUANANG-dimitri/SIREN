# Documents juridiques — dossier de travail

> **Aucun des textes n'est validé juridiquement.** Ils sont marqués `draft` dans
> `src/legal/registry.ts` et l'application affiche « Version provisoire ». Ils
> doivent être relus par un juriste avant toute publication sur un store.

## Documents livrés

| Document | Id | Acceptation à l'inscription |
|---|---|---|
| Mentions légales | `legal-notice` | non |
| Politique de confidentialité | `privacy` | oui (version enregistrée côté serveur) |
| Conditions générales d'utilisation | `terms` | oui (version enregistrée côté serveur) |
| Règles d'utilisation | `rules` | non |
| Données des enfants (conservation, suppression) | `children-data` | non |

Versionnement : `version`, `publishedAt`, `effectiveAt`, `status` par document.
Le serveur enregistre `users.terms_version`, `privacy_version`, `legal_accepted_at`
(migration 002). Une nouvelle version d'un document à accepter devra être
ré-acceptée : [PROPOSITION — NON INTÉGRÉE] écran de ré-acceptation au démarrage.

## Sources consultées (30/09/2026)

- Loi n° 2024/017 du 23 décembre 2024 relative à la protection des données à
  caractère personnel au Cameroun — texte publié par la Présidence de la
  République : https://prc.cm/fr/multimedia/documents/10258-loi-n-2024-017-du-23-12-2024-web
  (le texte intégral n'a pas pu être lu en ligne : seuls les éléments ci-dessous,
  confirmés par plusieurs analyses, sont repris).
- Analyses : Village de la Justice (« Comprendre en 10 questions la nouvelle loi… »),
  CIO Mag (« la course contre la montre avant juin 2026 »), Cabinet Nkoyok Ngoue.

## Ce qui est considéré comme établi

- La loi 2024/017 encadre la collecte, le traitement et la conservation des données
  personnelles et crée une autorité de protection des données.
- Mise en conformité exigée à partir du 23 juin 2026 (délai de 18 mois).
- Consentement libre, éclairé, spécifique et préalable ; pour un mineur,
  consentement du parent ou représentant légal.
- Droits des personnes : accès, rectification, opposition, effacement,
  portabilité, retrait du consentement.
- Obligations : information des personnes, sécurité, notification des violations
  à l'autorité et aux personnes concernées, formalités préalables auprès de
  l'autorité (autorisation/déclaration) et pour les transferts hors du Cameroun.

## À faire valider (juriste)

1. Numéros d'articles exacts (non cités dans les textes faute d'accès au texte intégral).
2. Formalité exacte auprès de l'autorité (autorisation ou déclaration) pour SIREN,
   qui traite des données de géolocalisation de mineurs.
3. Transferts hors du Cameroun : hébergement (o2switch, France, si confirmé),
   Firebase (Google), prestataire email.
4. Durées de conservation (positions : 90 jours par défaut serveur ; purge
   définitive après suppression de compte ; journal des accès).
5. Clauses de responsabilité et droit de la consommation (CGU).
6. Écoute audio et photos du dispositif : cadre spécifique avant toute activation.
7. Politique « Familles » de Google Play si l'application y est classée.

## Informations manquantes (placeholders, jamais inventées)

Dénomination légale, forme juridique, capital, siège, RCCM, NIU, directeur de la
publication, contact, contact données personnelles / délégué, hébergeur,
prestataire email, pays de transfert, délai de purge, durée du journal des
accès, conditions commerciales des crédits, droit applicable et juridiction.
