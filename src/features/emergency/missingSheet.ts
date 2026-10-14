import type { Child, SearchZone, User } from '@/models/entities';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Fiche « enfant disparu » à transmettre aux autorités / proches (CDC App §4.4) :
 * texte structuré, partagé explicitement par le parent via le partage système.
 * Les coordonnées ne sortent de l'app que par ce geste volontaire.
 */
export function buildMissingSheet(params: {
  t: Translate;
  child: Pick<Child, 'prenom'>;
  zone: SearchZone | null;
  lastSeenAt: string | null;
  lastPoint: { lat: number; lon: number } | null;
  parent: Pick<User, 'nom' | 'telephone'> | null;
  formatDateTime: (iso: string | null) => string;
}): string {
  const { t, child, zone, lastPoint, parent } = params;
  const lines = [
    t('missingSheet.header', { child: child.prenom }),
    t('missingSheet.lastSeen', { when: params.formatDateTime(params.lastSeenAt) }),
  ];
  if (lastPoint) {
    const lat = lastPoint.lat.toFixed(5);
    const lon = lastPoint.lon.toFixed(5);
    lines.push(t('missingSheet.lastPosition', { lat, lon }));
    lines.push(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`);
  }
  if (zone && zone.topZones.length > 0) {
    lines.push(t('missingSheet.priorityZones'));
    zone.topZones.slice(0, 5).forEach((z) => lines.push(`${z.rank}. ${z.label}`));
  }
  if (parent) {
    lines.push(t('missingSheet.contact', { name: parent.nom, phone: parent.telephone ?? '—' }));
  }
  lines.push(t('missingSheet.footer'));
  return lines.join('\n');
}
