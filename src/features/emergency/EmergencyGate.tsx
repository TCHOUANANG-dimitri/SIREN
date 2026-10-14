import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useChildren } from '@/api/hooks/useChildren';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { getRealtimeChannel, type RealtimeEvent } from '@/api/realtime';
import { isMockMode } from '@/api/network';
import { notifyAlert } from '@/utils/notifications';
import { trackEvent } from '@/utils/logger';
import type { RiskScore, RiskState } from '@/models/entities';

/** Détecte un passage en urgence (y compris la première observation d'un état d'urgence). */
export function isNewEmergency(previous: RiskState | undefined, next: RiskState): boolean {
  return next === 'urgence' && previous !== 'urgence';
}

/**
 * Ouvre automatiquement l'écran d'urgence dès qu'un enfant suivi passe en
 * urgence (CDC App §4.4, parcours 3).
 *
 * Source : le cache du score de risque, alimenté indifféremment par le
 * WebSocket ou par le polling REST (o2switch mutualisé n'a pas de WebSocket).
 * Hors premier plan, c'est le push serveur qui prend le relais.
 *
 * Aucune condition de crédits ou de publicité n'intervient : une urgence n'est
 * jamais bloquée (CDC App §3, §13).
 */
export function EmergencyGate() {
  const { isAuthenticated } = useAuthGate();
  const { data: children } = useChildren();
  const queryClient = useQueryClient();
  const lastStateRef = useRef(new Map<string, RiskState>());

  useEffect(() => {
    if (!isAuthenticated) return;
    const watched = new Set((children ?? []).map((c) => c.id));

    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const [root, childId, resource] = event.query.queryKey as [string, string, string];
      if (root !== 'children' || resource !== 'risk' || event.query.queryKey.length !== 3 || !watched.has(childId)) return;
      const risk = event.query.state.data as RiskScore | undefined;
      if (!risk) return;
      const previous = lastStateRef.current.get(childId);
      lastStateRef.current.set(childId, risk.state);
      if (isNewEmergency(previous, risk.state)) {
        trackEvent('emergency_opened');
        router.push({ pathname: '/(emergency)/urgence', params: { childId } });
      }
    });
  }, [isAuthenticated, children, queryClient]);

  // Mode mock : simule le push serveur par une notification locale.
  useEffect(() => {
    if (!isAuthenticated || !isMockMode()) return;
    const names = new Map((children ?? []).map((c) => [c.id, c.prenom]));
    return getRealtimeChannel().subscribe((event: RealtimeEvent) => {
      if (event.type === 'alert' && event.alert && names.has(event.childId)) {
        trackEvent('alert_received');
        void notifyAlert(event.alert, names.get(event.childId) ?? '');
      }
    });
  }, [isAuthenticated, children]);

  return null;
}
