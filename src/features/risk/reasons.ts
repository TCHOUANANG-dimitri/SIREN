type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Raisons d'un score, telles qu'émises par le serveur (et reproduites par le mock) :
 *
 * Couche déclarative (server/app/rules/declarative.py, scoring._evaluate_declarative) :
 *   « zone_interdite:<geofenceId> »  R1 — l'enfant est dans un lieu interdit
 *   « hors_perimetre:<id>[,<id>…] »  R2 — hors de tout périmètre de vie autorisé
 *   « hors_horaire_attendu »          R3 — absent du lieu prévu à cette heure
 * Couche universelle (server/app/rules/universal.py) :
 *   « vitesse_critique:<n>km/h » (> 80 km/h), « vitesse_elevee:<n>km/h » (> 50 km/h),
 *   « signal_perdu », « precision_degradee:<n>m » (> 500 m),
 *   « choc_critique:<x>m/s2 », « choc_modere:<x>m/s2 », « ecart_soudain:<m>m/<s>s ».
 * Fusion (server/app/services/fusion_score.py) :
 *   « concordance:<n> signaux actifs », « contexte:nuit », « contexte:hors_perimetre ».
 *
 * Une raison inconnue (futur module IA, ancienne donnée en texte libre) est
 * affichée telle quelle si elle est lisible, jamais sous forme de code brut.
 */
export interface ReasonContext {
  /** Nom des périmètres de l'enfant, pour nommer le lieu interdit ou le périmètre quitté. */
  zoneNames?: Record<string, string>;
}

export interface ExplainedReason {
  label: string;
  detail: string;
}

const firstNumber = (value: string | undefined): number | null => {
  const match = value?.match(/-?\d+(?:[.,]\d+)?/);
  return match ? Number.parseFloat(match[0].replace(',', '.')) : null;
};

export function explainReason(t: Translate, reason: string, context: ReasonContext = {}): ExplainedReason | null {
  const separator = reason.indexOf(':');
  const code = separator >= 0 ? reason.slice(0, separator) : reason;
  const arg = separator >= 0 ? reason.slice(separator + 1) : undefined;
  const zone = (ids: string | undefined) =>
    (ids ?? '')
      .split(',')
      .map((id) => context.zoneNames?.[id.trim()])
      .filter(Boolean)
      .join(', ');
  const simple = (key: string, vars?: Record<string, unknown>): ExplainedReason => ({
    label: t(`risk.reason.${key}.label`, vars),
    detail: t(`risk.reason.${key}.detail`, vars),
  });

  switch (code) {
    case 'concordance': {
      const count = firstNumber(arg);
      return simple('concordance', { count: count !== null && Number.isFinite(count) ? count : 2 });
    }
    case 'contexte':
      return arg === 'nuit' || arg === 'hors_perimetre' ? simple(arg) : null;
    case 'zone_interdite': {
      const name = zone(arg);
      return name ? simple('zone_interdite_named', { zone: name }) : simple('zone_interdite');
    }
    case 'hors_perimetre': {
      const name = zone(arg);
      return name ? simple('sortie_perimetre_named', { zone: name }) : simple('sortie_perimetre');
    }
    case 'hors_horaire_attendu':
      return simple('hors_horaire');
    case 'vitesse_critique':
    case 'vitesse_elevee':
    case 'precision_degradee':
    case 'choc_critique':
    case 'choc_modere': {
      const value = firstNumber(arg);
      return simple(code, { value: value === null ? '—' : Math.round(value * 10) / 10 });
    }
    case 'signal_perdu':
      return simple('signal_perdu');
    case 'ecart_soudain': {
      const [distance, seconds] = (arg ?? '').split('/');
      return simple('ecart_soudain', { distance: firstNumber(distance) ?? '—', seconds: firstNumber(seconds) ?? '—' });
    }
    default:
      return null;
  }
}

/** Texte court d'une raison (listes) : libellé traduit, sinon texte lisible, sinon libellé générique. */
export function reasonLabel(t: Translate, reason: string, context?: ReasonContext): string {
  const explained = explainReason(t, reason, context);
  if (explained) return explained.label;
  // Code technique inconnu (« mot_cle:valeur ») : ne pas l'afficher brut.
  return /^[a-z_]+(:|$)/.test(reason) ? t('risk.reason.unknown') : reason;
}

/** Index id → nom des périmètres d'un enfant. */
export function zoneNamesOf(geofences: { id: string; nom: string }[] | undefined): Record<string, string> {
  return Object.fromEntries((geofences ?? []).map((g) => [g.id, g.nom]));
}
