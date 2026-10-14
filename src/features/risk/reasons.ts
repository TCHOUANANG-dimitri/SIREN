type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Raisons émises par le moteur de fusion serveur (server/app/services/fusion_score.py) :
 *   « concordance:<n> signaux actifs », « contexte:nuit », « contexte:hors_perimetre ».
 * Toute autre raison (texte libre du mock ou futur module IA) est affichée telle quelle.
 */
export function explainReason(t: Translate, reason: string): { label: string; detail: string } | null {
  const [code, arg] = reason.split(':', 2);
  if (code === 'concordance') {
    const count = Number.parseInt(arg ?? '', 10);
    return { label: t('risk.reason.concordance.label', { count: Number.isFinite(count) ? count : 2 }), detail: t('risk.reason.concordance.detail') };
  }
  if (code === 'contexte' && (arg === 'nuit' || arg === 'hors_perimetre')) {
    return { label: t(`risk.reason.${arg}.label`), detail: t(`risk.reason.${arg}.detail`) };
  }
  return null;
}
