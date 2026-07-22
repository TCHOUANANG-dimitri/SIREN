import { getDb, mutateDb, genId } from '../mock/db';
import { simulateLatency } from '../network';
import { assertChildAccess, resolveCurrentUser } from '../mock/session';
import type { EmergencyContact } from '@/models/entities';

export async function listEmergencyContacts(token: string | null, childId: string): Promise<EmergencyContact[]> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  return getDb().emergencyContacts.filter((c) => c.childId === childId);
}

export async function createEmergencyContact(
  token: string | null,
  childId: string,
  input: { nom: string; telephone: string }
): Promise<EmergencyContact> {
  await simulateLatency(250, 500);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  const contact: EmergencyContact = { id: genId('contact'), childId, ...input };
  mutateDb((d) => {
    d.emergencyContacts.push(contact);
  });
  return contact;
}
