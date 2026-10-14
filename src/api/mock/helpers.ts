/** Outils propres au backend simulé — jamais utilisés en mode live. */

export async function simulateLatency(minMs = 200, maxMs = 600): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/** Jeton opaque de démonstration : ce n'est pas un JWT et il n'a aucune valeur hors mock. */
export function makeToken(userId: string): string {
  return `tok_${userId}__${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function userIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const match = token.match(/^tok_(.+?)__[0-9a-z]+$/);
  return match?.[1] ?? null;
}
