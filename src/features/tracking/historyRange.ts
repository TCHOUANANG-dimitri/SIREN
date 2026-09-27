/**
 * Plages de l'historique (CDC App §4.3) : aujourd'hui, hier, 7 jours, plage libre.
 * Les limites de jour sont celles du fuseau du TÉLÉPHONE (minuit local), puis
 * converties en ISO UTC pour le serveur. « Aujourd'hui » reste ouvert (pas de
 * borne de fin) pour inclure les points qui arrivent pendant la consultation.
 */
export type HistoryPeriod = 'today' | 'yesterday' | '7days' | 'custom';

export interface HistoryRange {
  from: string;
  to?: string;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function historyRange(
  period: HistoryPeriod,
  now: Date = new Date(),
  custom?: { from: Date; to: Date }
): HistoryRange {
  const today = startOfLocalDay(now);
  switch (period) {
    case 'today':
      return { from: today.toISOString() };
    case 'yesterday':
      return { from: addDays(today, -1).toISOString(), to: today.toISOString() };
    case '7days':
      return { from: addDays(today, -6).toISOString() };
    case 'custom': {
      if (!custom) return { from: today.toISOString() };
      const [a, b] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
      // Fin inclusive : jusqu'à minuit du lendemain du dernier jour choisi.
      return { from: startOfLocalDay(a).toISOString(), to: addDays(startOfLocalDay(b), 1).toISOString() };
    }
  }
}
