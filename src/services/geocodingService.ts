import Constants from 'expo-constants';

/**
 * Géocodage via Nominatim (OpenStreetMap).
 *
 * La politique d'usage de Nominatim impose deux choses qu'on respecte ici :
 * un User-Agent identifiant l'application, et **au plus une requête par
 * seconde**. Les appels sont donc sérialisés dans une file avec espacement
 * minimal, et les résultats mis en cache — la saisie d'une adresse déclenche
 * sinon une rafale de requêtes à chaque frappe.
 *
 * Pour un déploiement à grande échelle, il faudra héberger sa propre instance
 * Nominatim ou passer par un fournisseur dédié : l'instance publique n'est pas
 * dimensionnée pour un usage applicatif intensif.
 */

const BASE_URL = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1100;

const appName = (Constants.expoConfig?.name as string) ?? 'SIREN';
const appVersion = (Constants.expoConfig?.version as string) ?? '1.0.0';
const USER_AGENT = `${appName}/${appVersion} (application de protection de l'enfance)`;

export interface GeoResult {
  label: string;
  lat: number;
  lon: number;
}

const searchCache = new Map<string, GeoResult[]>();
const reverseCache = new Map<string, string | null>();

let queueTail: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

/** Sérialise les appels en garantissant l'espacement minimal exigé par Nominatim. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return task();
  });
  // La file ne doit pas se rompre si une requête échoue.
  queueTail = run.catch(() => undefined);
  return run;
}

async function request(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  return response.json();
}

/** Adresse saisie → positions candidates (géocodage direct). */
export async function searchAddress(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const cached = searchCache.get(q.toLowerCase());
  if (cached) return cached;

  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '5',
    addressdetails: '1',
  });

  const data = (await enqueue(() => request(`/search?${params}`, signal))) as
    | { display_name?: string; lat?: string; lon?: string }[]
    | undefined;

  const results: GeoResult[] = (data ?? [])
    .filter((r) => r.lat && r.lon && r.display_name)
    .map((r) => ({ label: r.display_name as string, lat: Number(r.lat), lon: Number(r.lon) }));

  searchCache.set(q.toLowerCase(), results);
  return results;
}

/** Position sur la carte → adresse la plus proche (géocodage inverse). */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<string | null> {
  // Arrondi à ~11 m : inutile de refaire une requête pour un déplacement
  // imperceptible du centre de la carte, et ça rend le cache efficace.
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (reverseCache.has(key)) return reverseCache.get(key) ?? null;

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'jsonv2',
    zoom: '18',
  });

  const data = (await enqueue(() => request(`/reverse?${params}`, signal))) as
    | { display_name?: string }
    | undefined;

  const label = data?.display_name ?? null;
  reverseCache.set(key, label);
  return label;
}
