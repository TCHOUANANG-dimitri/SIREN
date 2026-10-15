import { useEffect, useState } from 'react';
import { storage } from '@/utils/storage';

/**
 * Photos d'enfant choisies sur ce téléphone.
 *
 * Le serveur n'accepte qu'une adresse http(s) (contrainte ck_children_photo_url)
 * et n'expose pas encore d'envoi de fichier : une photo locale (file://…) n'est
 * donc jamais envoyée. Elle reste sur ce téléphone, liée à l'enfant, et est
 * effacée à la déconnexion (donnée personnelle d'un mineur).
 */
export const CHILD_PHOTOS_KEY = 'siren.childPhotos';

export function isRemotePhoto(uri: string | null | undefined): uri is string {
  return !!uri && /^https?:\/\//i.test(uri);
}

export async function saveLocalChildPhoto(childId: string, uri: string): Promise<void> {
  const current = (await storage.getItem<Record<string, string>>(CHILD_PHOTOS_KEY)) ?? {};
  await storage.setItem(CHILD_PHOTOS_KEY, { ...current, [childId]: uri });
}

/** Photo à afficher : celle du serveur si elle existe, sinon la photo locale. */
export function useChildPhoto(child: { id: string; photoUrl?: string } | undefined): string | undefined {
  const [local, setLocal] = useState<string | undefined>();
  useEffect(() => {
    if (!child || isRemotePhoto(child.photoUrl)) return;
    let active = true;
    storage
      .getItem<Record<string, string>>(CHILD_PHOTOS_KEY)
      .then((map) => active && setLocal(map?.[child.id]))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [child]);
  if (!child) return undefined;
  return isRemotePhoto(child.photoUrl) ? child.photoUrl : (local ?? child.photoUrl);
}
