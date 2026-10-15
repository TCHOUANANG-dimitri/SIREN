import { useEffect } from 'react';
import { useChildren } from '@/api/hooks/useChildren';
import { useUiStore } from '@/stores/uiStore';
import type { Child } from '@/models/entities';

/**
 * Enfant courant, partagé par Accueil, Carte et Partage (source unique :
 * `uiStore.selectedChildId`). Si l'identifiant mémorisé ne correspond plus à
 * aucun enfant (supprimé, changement de compte), la sélection est corrigée dans
 * le store : l'écran ne peut pas afficher l'enfant A en agissant sur l'enfant B.
 */
export function useSelectedChild(): {
  children: Child[] | undefined;
  activeChild: Child | undefined;
  isLoading: boolean;
  select: (id: string) => void;
} {
  const { data: children, isLoading } = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);

  const activeChild = pickActiveChild(children, selectedChildId);

  useEffect(() => {
    const nextId = activeChild?.id ?? null;
    if (children && nextId !== selectedChildId) setSelectedChildId(nextId);
  }, [children, activeChild?.id, selectedChildId, setSelectedChildId]);

  return { children, activeChild, isLoading, select: setSelectedChildId };
}

/** Enfant sélectionné s'il existe encore, sinon le premier de la liste. */
export function pickActiveChild(children: Child[] | undefined, selectedId: string | null): Child | undefined {
  if (!children || children.length === 0) return undefined;
  return children.find((c) => c.id === selectedId) ?? children[0];
}
