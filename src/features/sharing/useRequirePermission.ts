import { useCurrentAccess } from './useCurrentAccess';
import type { Action } from './permissions';

/** Décide si l'écran/action courant est autorisé pour cet enfant — à utiliser en tête d'écran. */
export function useRequirePermission(childId: string | undefined, action: Action) {
  const { can, isLoading, role } = useCurrentAccess(childId);
  return { allowed: !isLoading && can(action), isLoading, role };
}
