/**
 * Catalogues de traduction, découpés par domaine (locales/<langue>/<domaine>.json).
 * Tous les domaines sont fusionnés dans l'espace de noms unique `translation` :
 * les clés restent sémantiques (`settings.language.title`, `sharing.selfInvite`…)
 * et un domaine n'est qu'un fichier, pas un préfixe supplémentaire.
 *
 * Ajouter un domaine : créer le fichier dans les DEUX langues et l'ajouter ici.
 * Vérification : `npm run i18n:check` (clés manquantes, orphelines, variables).
 */
import frAlerts from './locales/fr/alerts.json';
import frAuth from './locales/fr/auth.json';
import frChildren from './locales/fr/children.json';
import frCommon from './locales/fr/common.json';
import frCommunity from './locales/fr/community.json';
import frErrors from './locales/fr/errors.json';
import frLegal from './locales/fr/legal.json';
import frMap from './locales/fr/map.json';
import frNotifications from './locales/fr/notifications.json';
import frSettings from './locales/fr/settings.json';
import frSharing from './locales/fr/sharing.json';
import enAlerts from './locales/en/alerts.json';
import enAuth from './locales/en/auth.json';
import enChildren from './locales/en/children.json';
import enCommon from './locales/en/common.json';
import enCommunity from './locales/en/community.json';
import enErrors from './locales/en/errors.json';
import enLegal from './locales/en/legal.json';
import enMap from './locales/en/map.json';
import enNotifications from './locales/en/notifications.json';
import enSettings from './locales/en/settings.json';
import enSharing from './locales/en/sharing.json';

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;

export const fr = {
  ...frCommon,
  ...frAuth,
  ...frChildren,
  ...frAlerts,
  ...frSharing,
  ...frMap,
  ...frCommunity,
  ...frSettings,
  ...frLegal,
  ...frNotifications,
  ...frErrors,
};

export const en = {
  ...enCommon,
  ...enAuth,
  ...enChildren,
  ...enAlerts,
  ...enSharing,
  ...enMap,
  ...enCommunity,
  ...enSettings,
  ...enLegal,
  ...enNotifications,
  ...enErrors,
};
