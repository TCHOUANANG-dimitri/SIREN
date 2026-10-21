import { storage } from '@/utils/storage';
import type { OutboxItem, OutboxStore } from './outbox';

export const OUTBOX_STORAGE_KEY = 'siren.deviceLink.outbox.v1';

/** File persistée dans le stockage de l'app ; effacée à la déconnexion (signOut). */
export const storageOutbox: OutboxStore = {
  load: () => storage.getItem<OutboxItem[]>(OUTBOX_STORAGE_KEY),
  save: (items) => storage.setItem(OUTBOX_STORAGE_KEY, items),
};
