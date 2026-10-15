import i18n from 'i18next';
import { usePreferencesStore, type AppLanguage } from '@/stores/preferencesStore';

/**
 * Langue de l'interface. Priorité (du plus fort au plus faible) :
 *   1. choix explicite fait dans SIREN sur ce téléphone ;
 *   2. langue enregistrée sur le compte (serveur) ;
 *   3. langue du téléphone (fr si ni fr ni en).
 * Le serveur reçoit la langue effective : il s'en sert pour les notifications
 * push et les emails (le téléphone ne traduit pas une notification app fermée).
 */
export function deviceLanguage(code: string | null | undefined): AppLanguage {
  return code === 'en' ? 'en' : 'fr';
}

export function resolveLanguage(input: {
  explicit: AppLanguage | null;
  account: AppLanguage | null | undefined;
  device: AppLanguage;
}): AppLanguage {
  return input.explicit ?? input.account ?? input.device;
}

async function apply(lang: AppLanguage) {
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
}

/** Au démarrage, après lecture des préférences locales. */
export async function applyStartupLanguage(): Promise<void> {
  const explicit = usePreferencesStore.getState().language;
  if (explicit) await apply(explicit);
}

/** Choix fait dans Réglages : immédiat, mémorisé sur ce téléphone. */
export async function chooseLanguage(lang: AppLanguage): Promise<void> {
  await apply(lang);
  await usePreferencesStore.getState().setLanguage(lang);
}

/**
 * À la connexion / au rafraîchissement du profil : la langue du compte
 * s'applique seulement si aucun choix explicite n'a été fait sur ce téléphone.
 * Renvoie la langue à renvoyer au serveur quand elle diffère (sinon null).
 */
export async function reconcileAccountLanguage(account: AppLanguage | null | undefined): Promise<AppLanguage | null> {
  const explicit = usePreferencesStore.getState().language;
  const effective = resolveLanguage({ explicit, account, device: deviceLanguage(i18n.language) });
  await apply(effective);
  return account && explicit && explicit !== account ? explicit : null;
}

/** Nom de chaque langue dans sa propre langue : volontairement non traduit. */
export const LANGUAGE_AUTONYMS: Record<AppLanguage, string> = { fr: 'Français', en: 'English' };
