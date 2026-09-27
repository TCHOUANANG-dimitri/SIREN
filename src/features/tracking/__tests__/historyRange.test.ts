import { historyRange } from '../historyRange';

// Le runner tourne en UTC (jest-expo) : les minuits locaux sont donc des minuits UTC.
const NOW = new Date('2026-09-27T15:42:00Z');

describe('plages d’historique', () => {
  it('aujourd’hui : depuis minuit local, sans borne de fin (points à venir inclus)', () => {
    expect(historyRange('today', NOW)).toEqual({ from: new Date(2026, 8, 27).toISOString() });
  });
  it('hier : de minuit à minuit', () => {
    expect(historyRange('yesterday', NOW)).toEqual({
      from: new Date(2026, 8, 26).toISOString(),
      to: new Date(2026, 8, 27).toISOString(),
    });
  });
  it('7 jours : aujourd’hui compris', () => {
    expect(historyRange('7days', NOW).from).toBe(new Date(2026, 8, 21).toISOString());
  });
  it('plage libre : dates inclusives, ordre indifférent', () => {
    expect(historyRange('custom', NOW, { from: new Date(2026, 8, 20, 18), to: new Date(2026, 8, 18, 9) })).toEqual({
      from: new Date(2026, 8, 18).toISOString(),
      to: new Date(2026, 8, 21).toISOString(),
    });
  });
  it('passage de mois', () => {
    expect(historyRange('yesterday', new Date(2026, 9, 1, 8)).from).toBe(new Date(2026, 8, 30).toISOString());
  });
});
