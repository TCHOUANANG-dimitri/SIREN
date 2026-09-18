/**
 * Conversions entre le modèle de `react-native-maps` (régions en degrés, rayons
 * en mètres) et celui de MapLibre (centre + niveau de zoom, géométries GeoJSON).
 */

/** Résolution de la projection Web Mercator à l'équateur, en mètres par pixel au zoom 0. */
const EQUATOR_METERS_PER_PIXEL = 156543.03392;

/** Largeur de référence en pixels, pour convertir une emprise en niveau de zoom. */
const REFERENCE_VIEWPORT_PX = 360;

/** Rayon terrestre moyen, en mètres. */
const EARTH_RADIUS_M = 6_378_137;

/**
 * Niveau de zoom permettant de voir une zone d'environ `spanM` mètres de large.
 * La résolution de Mercator dépend de la latitude, d'où la correction en cosinus :
 * sans elle, un même zoom couvrirait des distances très différentes à Yaoundé
 * et à Paris.
 */
export function zoomForSpan(spanM: number, latitude: number): number {
  const metersPerPixel = Math.max(spanM, 1) / REFERENCE_VIEWPORT_PX;
  const latitudeFactor = Math.cos((latitude * Math.PI) / 180);
  const zoom = Math.log2((EQUATOR_METERS_PER_PIXEL * latitudeFactor) / metersPerPixel);
  return clampZoom(zoom);
}

/** Équivalent pour une région `react-native-maps` exprimée en degrés de latitude. */
export function zoomForLatitudeDelta(latitudeDelta: number): number {
  if (!latitudeDelta || latitudeDelta <= 0) return 14;
  return clampZoom(Math.log2(360 / latitudeDelta));
}

/** Emprise approximative, en degrés de latitude, correspondant à un niveau de zoom. */
export function latitudeDeltaForZoom(zoom: number): number {
  return 360 / Math.pow(2, zoom);
}

function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 14;
  return Math.min(20, Math.max(1, zoom));
}

export type Position = [number, number];

/**
 * Approxime un cercle métrique par un polygone GeoJSON.
 *
 * MapLibre sait dessiner des cercles, mais en rayon de **pixels** : ils
 * grossiraient donc au dézoom au lieu de représenter une distance réelle.
 * Les géofences de SIREN étant définies en mètres, il faut construire la
 * géométrie nous-mêmes.
 */
export function circlePolygon(
  latitude: number,
  longitude: number,
  radiusM: number,
  steps = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coordinates: Position[] = [];
  const latRad = (latitude * Math.PI) / 180;

  // Un degré de longitude se resserre à mesure qu'on s'éloigne de l'équateur.
  const deltaLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const deltaLon = deltaLat / Math.max(Math.cos(latRad), 1e-6);

  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    coordinates.push([
      longitude + deltaLon * Math.cos(angle),
      latitude + deltaLat * Math.sin(angle),
    ]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  };
}

export function lineString(
  points: { latitude: number; longitude: number }[]
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.longitude, p.latitude] as Position),
    },
  };
}
