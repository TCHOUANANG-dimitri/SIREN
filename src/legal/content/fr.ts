import type { LegalCatalog } from '../types';

/**
 * Textes juridiques — FRANÇAIS. Version provisoire (statut `draft`, voir registry.ts).
 * Les passages entre crochets « [À COMPLÉTER — …] » sont des informations que le
 * projet ne possède pas encore : elles ne doivent JAMAIS être inventées.
 * Sources et points à valider : docs/JURIDIQUE.md.
 */
export const legalFr: LegalCatalog = {
  'legal-notice': {
    title: 'Mentions légales',
    summary: "Qui édite SIREN, qui l'héberge et comment nous joindre.",
    sections: [
      {
        heading: 'Éditeur',
        paragraphs: [
          "L'application SIREN est éditée par [À COMPLÉTER — DÉNOMINATION LÉGALE], [À COMPLÉTER — FORME JURIDIQUE], au capital de [À COMPLÉTER — CAPITAL].",
          'Siège : [À COMPLÉTER — ADRESSE DU SIÈGE].',
          'Immatriculation : [À COMPLÉTER — NUMÉRO RCCM]. Identifiant fiscal : [À COMPLÉTER — NIU].',
          'Directeur de la publication : [À COMPLÉTER — NOM ET FONCTION].',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          'Email : [À COMPLÉTER — ADRESSE DE CONTACT]. Téléphone : [À COMPLÉTER — NUMÉRO DE CONTACT].',
          'Protection des données personnelles : [À COMPLÉTER — CONTACT DONNÉES PERSONNELLES / DÉLÉGUÉ].',
        ],
      },
      {
        heading: 'Hébergement',
        paragraphs: [
          'Serveurs : [À COMPLÉTER — NOM, ADRESSE ET PAYS DE L’HÉBERGEUR RETENU].',
          "Notifications push : service Firebase Cloud Messaging de Google, utilisé uniquement pour acheminer les alertes vers votre téléphone.",
        ],
      },
      {
        heading: 'Urgences',
        paragraphs: [
          "SIREN est un outil d'aide à la vigilance. Il ne remplace ni la surveillance d'un adulte ni les services publics de secours. En cas de danger, appelez la police (117) ou le numéro d'urgence adapté.",
        ],
      },
      {
        heading: 'Propriété intellectuelle',
        paragraphs: [
          "Le nom SIREN, le logo, l'application et ses contenus sont protégés. Toute reproduction non autorisée est interdite. Les fonds de carte proviennent d'OpenStreetMap (© contributeurs OpenStreetMap), diffusés sous licence ODbL.",
        ],
      },
    ],
  },

  privacy: {
    title: 'Politique de confidentialité',
    summary: 'Quelles données SIREN traite, pourquoi, combien de temps, et vos droits.',
    sections: [
      {
        heading: 'Responsable du traitement',
        paragraphs: [
          '[À COMPLÉTER — DÉNOMINATION LÉGALE ET ADRESSE] est responsable des traitements décrits ci-dessous. Contact : [À COMPLÉTER — CONTACT DONNÉES PERSONNELLES].',
          'Cette politique est établie au regard de la loi n° 2024/017 du 23 décembre 2024 relative à la protection des données à caractère personnel au Cameroun.',
        ],
      },
      {
        heading: 'Données que nous traitons',
        paragraphs: [
          'Votre compte : nom, email, téléphone (facultatif), langue, mot de passe (stocké uniquement sous forme chiffrée irréversible), préférences.',
          "L'enfant protégé : prénom, date de naissance, photo (facultative), lieux habituels et horaires que vous déclarez, contacts d'urgence.",
          'Données du dispositif : positions, vitesse, mouvements, niveau de batterie, état de connexion, et les scores de risque calculés à partir de ces données.',
          "Proches de confiance : l'identité des personnes que vous invitez, les droits que vous leur accordez et le journal de leurs consultations.",
          'Techniques : jeton de notification du téléphone, journaux de sécurité (connexions, codes de vérification envoyés), sans contenu de vos échanges.',
        ],
      },
      {
        heading: 'Pourquoi',
        paragraphs: [
          "Protéger l'enfant : afficher sa position, détecter une situation inhabituelle, vous alerter et vous aider à réagir en urgence.",
          'Faire fonctionner votre compte : connexion, sécurité (vérification en deux étapes, alertes de sécurité), partage avec vos proches.',
          "Améliorer la détection : le modèle apprend la routine de chaque enfant uniquement pour cet enfant. Les trajets d'un enfant ne sont jamais vendus ni utilisés à des fins publicitaires.",
        ],
      },
      {
        heading: 'Base légale et consentement',
        paragraphs: [
          "Le traitement repose sur votre consentement, donné à l'inscription, et sur l'exécution du service que vous demandez. Vous déclarez être le parent ou le représentant légal de l'enfant, ou agir avec son accord.",
          'Vous pouvez retirer votre consentement à tout moment en supprimant votre compte (Réglages → Supprimer mon compte).',
        ],
      },
      {
        heading: 'Qui y a accès',
        paragraphs: [
          "Vous, en tant que parent principal ; les proches que vous invitez, dans la stricte limite des droits que vous leur accordez (tous désactivés par défaut) ; les membres habilités de l'équipe SIREN pour la maintenance et la sécurité.",
          "Prestataires techniques : hébergement ([À COMPLÉTER — HÉBERGEUR]), acheminement des notifications (Google Firebase), envoi des emails ([À COMPLÉTER — PRESTATAIRE EMAIL]), fonds de carte (OpenFreeMap / OpenStreetMap, qui reçoivent l'adresse IP du téléphone et la zone affichée).",
          'Autorités : uniquement sur réquisition légale, ou lorsque vous choisissez vous-même de partager la fiche de recherche.',
        ],
      },
      {
        heading: 'Transferts hors du Cameroun',
        paragraphs: [
          "Certaines données peuvent être hébergées ou transiter hors du Cameroun (serveurs, notifications, emails). [À COMPLÉTER — PAYS CONCERNÉS ET FORMALITÉS ACCOMPLIES AUPRÈS DE L'AUTORITÉ DE PROTECTION DES DONNÉES].",
        ],
      },
      {
        heading: 'Durées de conservation',
        paragraphs: [
          "Positions de l'enfant : 90 jours, puis suppression automatique (paramètre serveur, durée à confirmer).",
          'Codes de vérification : quelques minutes de validité ; supprimés ensuite.',
          'Compte : tant que vous l’utilisez. À la suppression, les accès sont coupés immédiatement (sessions, partages, notifications) ; les données restantes sont effacées selon la politique de purge [À COMPLÉTER — DÉLAI DE PURGE DÉFINITIVE].',
          'Journal des accès des proches : [À COMPLÉTER — DURÉE].',
        ],
      },
      {
        heading: 'Sécurité',
        paragraphs: [
          'Connexions chiffrées (HTTPS), jetons de session conservés dans le coffre sécurisé du téléphone, mots de passe et codes stockés sous forme irréversible, contrôle des droits vérifié sur le serveur, masquage de l’app dans le sélecteur de tâches, verrouillage biométrique optionnel.',
          "En cas de violation de données susceptible de vous affecter, nous vous en informerons, ainsi que l'autorité compétente, conformément à la loi.",
        ],
      },
      {
        heading: 'Vos droits',
        paragraphs: [
          "Vous disposez notamment d'un droit d'accès, de rectification, d'opposition, d'effacement et de portabilité, ainsi que du droit de retirer votre consentement. Pour les exercer : [À COMPLÉTER — CONTACT DONNÉES PERSONNELLES].",
          "Vous pouvez aussi saisir l'autorité de protection des données à caractère personnel instituée par la loi n° 2024/017.",
        ],
      },
      {
        heading: 'Notifications',
        paragraphs: [
          "Les alertes (urgence, pré-alerte, informations) sont envoyées dans la langue de votre compte. Le contenu d'une notification se limite au prénom de l'enfant et au type d'alerte : aucune position n'y figure. Vous pouvez régler les notifications dans Réglages et dans les réglages du téléphone.",
        ],
      },
      {
        heading: 'Écoute audio',
        paragraphs: [
          "La fonction d'écoute encadrée est désactivée. Elle ne sera activée qu'après validation de son cadre juridique ; cette politique sera alors mise à jour.",
        ],
      },
    ],
  },

  terms: {
    title: "Conditions générales d'utilisation",
    summary: "Les règles du contrat entre vous et SIREN.",
    sections: [
      {
        heading: 'Objet',
        paragraphs: [
          "Les présentes conditions régissent l'utilisation de l'application SIREN et du service associé au dispositif porté par l'enfant. En créant un compte, vous les acceptez.",
        ],
      },
      {
        heading: 'Compte',
        paragraphs: [
          "Vous devez être majeur et être le parent ou le représentant légal de l'enfant suivi, ou agir avec son autorisation. Vous êtes responsable de la confidentialité de votre mot de passe. Nous recommandons d'activer la vérification en deux étapes.",
        ],
      },
      {
        heading: 'Ce que fait SIREN — et ce qu’il ne fait pas',
        paragraphs: [
          "SIREN aide à détecter des situations inhabituelles à partir des données du dispositif. La détection dépend du réseau, de la batterie, du GPS et de la qualité des informations que vous fournissez : elle peut être retardée ou manquer une situation.",
          "SIREN ne garantit pas la sécurité de l'enfant et ne remplace ni la vigilance d'un adulte ni les secours. En cas de danger, contactez immédiatement les autorités (police : 117).",
        ],
      },
      {
        heading: 'Proches de confiance',
        paragraphs: [
          "Vous pouvez partager l'accès avec trois proches au plus par enfant, avec des droits que vous choisissez et pouvez retirer à tout moment. Vous restez responsable des personnes que vous invitez.",
        ],
      },
      {
        heading: 'Fonctions payantes',
        paragraphs: [
          "Certaines fonctions pourront consommer des crédits achetés par le parent. Les tarifs seront affichés avant tout achat. Une urgence en cours n'est jamais interrompue faute de crédits. [À COMPLÉTER — CONDITIONS COMMERCIALES, MOYENS DE PAIEMENT ET REMBOURSEMENT, À LA MISE EN SERVICE DES CRÉDITS].",
        ],
      },
      {
        heading: 'Utilisation interdite',
        paragraphs: [
          "Il est interdit d'utiliser SIREN pour suivre une personne à son insu ou sans droit, de contourner les protections du service, ou de publier de faux signalements. Voir les règles d'utilisation.",
        ],
      },
      {
        heading: 'Responsabilité',
        paragraphs: [
          '[À COMPLÉTER — CLAUSES DE RESPONSABILITÉ, À RÉDIGER AVEC UN JURISTE AU REGARD DU DROIT CAMEROUNAIS DE LA CONSOMMATION].',
        ],
      },
      {
        heading: 'Résiliation',
        paragraphs: [
          'Vous pouvez supprimer votre compte à tout moment depuis les Réglages. Nous pouvons suspendre un compte en cas de violation des présentes conditions, après information sauf urgence.',
        ],
      },
      {
        heading: 'Droit applicable',
        paragraphs: ['[À COMPLÉTER — DROIT APPLICABLE ET JURIDICTION COMPÉTENTE].'],
      },
    ],
  },

  rules: {
    title: "Règles d'utilisation",
    summary: 'Les bons usages de SIREN, du partage et des signalements.',
    sections: [
      {
        heading: 'Suivre uniquement dans l’intérêt de l’enfant',
        paragraphs: [
          "SIREN sert à protéger l'enfant qui porte le dispositif. Ne l'utilisez pas pour surveiller un adulte, un conjoint ou toute autre personne.",
        ],
      },
      {
        heading: 'Partager avec discernement',
        paragraphs: [
          "N'invitez que des personnes de confiance et accordez le minimum de droits nécessaires. Chaque consultation d'un proche est enregistrée dans le journal des accès que vous pouvez consulter.",
        ],
      },
      {
        heading: 'Signalements communautaires',
        paragraphs: [
          "Publiez uniquement des faits observés, sans nom, sans photo d'un tiers et sans accusation. Les signalements sont modérés avant publication. Les faux signalements peuvent entraîner la suspension du compte.",
        ],
      },
      {
        heading: 'En cas d’urgence',
        paragraphs: [
          "Si SIREN signale une urgence, vérifiez la situation et contactez l'enfant et vos proches. Si le danger est réel, appelez la police (117) sans attendre. La fiche de recherche ne doit être partagée qu'en cas de disparition avérée.",
        ],
      },
    ],
  },

  'children-data': {
    title: 'Données des enfants',
    summary: "Comment nous protégeons les données de l'enfant, et comment les supprimer.",
    sections: [
      {
        heading: 'Principes',
        paragraphs: [
          "L'enfant n'a pas de compte et n'utilise pas l'application. Ses données sont confiées par son parent ou représentant légal, qui en garde le contrôle.",
          'Nous ne collectons que ce qui est nécessaire à sa protection. Aucune publicité ne cible un enfant ; ses trajets ne sont jamais vendus.',
        ],
      },
      {
        heading: 'Données sensibles',
        paragraphs: [
          "Les positions d'un enfant sont des données particulièrement sensibles : elles ne sont visibles que par vous et par les proches à qui vous en donnez expressément le droit. Elles n'apparaissent jamais dans les notifications ni dans les journaux techniques.",
          "Le fonctionnement « relais » entre dispositifs SIREN, s'il est activé par le dispositif, sert uniquement à acheminer les données jusqu'au serveur ; les autres familles n'y ont pas accès. [À COMPLÉTER — À CONFIRMER AVEC LE PÔLE DISPOSITIF].",
        ],
      },
      {
        heading: 'Supprimer les données',
        paragraphs: [
          "Retirer un enfant du compte ou supprimer votre compte coupe immédiatement tous les accès, y compris ceux des proches. L'effacement définitif suit la durée de conservation indiquée dans la politique de confidentialité.",
        ],
      },
    ],
  },
};
