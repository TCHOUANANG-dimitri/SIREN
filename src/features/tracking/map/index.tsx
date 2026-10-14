import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  ViewAnnotation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { MapPin } from 'lucide-react-native';
import { colors } from '@/theme';
import { env } from '@/config/env';
import { circlePolygon, lineString, zoomForLatitudeDelta, latitudeDeltaForZoom } from './geo';

/**
 * Couche de compatibilité MapLibre présentant l'API de `react-native-maps`.
 *
 * SIREN utilisait `react-native-maps`, qui n'a qu'un seul moteur de rendu sur
 * Android : le SDK Google Maps. Celui-ci exige une clé d'API — sans elle il
 * lève une RuntimeException qui ferme l'application. MapLibre rend des tuiles
 * vectorielles OpenStreetMap sans clé, autorise un style aux couleurs de la
 * marque et sait embarquer des tuiles hors ligne, ce qui compte pour un usage
 * en réseau 2G instable.
 *
 * L'API est volontairement calquée sur l'ancienne (`initialRegion`, `Marker`,
 * `Circle`, `Polyline`) pour que les écrans n'aient qu'à changer d'import.
 */

/** Toujours vrai depuis MapLibre : plus aucune clé d'API ne conditionne la carte. */
export const mapsAvailable = true;

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MapViewRef {
  animateToRegion: (region: Region, duration?: number) => void;
}

interface MapViewProps {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  onRegionChangeComplete?: (region: Region) => void;
  children?: ReactNode;
}

export const MapView = forwardRef<MapViewRef, MapViewProps>(function MapView(
  { style, initialRegion, scrollEnabled = true, zoomEnabled = true, onRegionChangeComplete, children },
  ref
) {
  const cameraRef = useRef<CameraRef>(null);

  const initialViewState = useMemo(
    () =>
      initialRegion
        ? {
            center: [initialRegion.longitude, initialRegion.latitude] as [number, number],
            zoom: zoomForLatitudeDelta(initialRegion.latitudeDelta),
          }
        : undefined,
    []
  );

  useImperativeHandle(ref, () => ({
    animateToRegion(region, duration = 400) {
      cameraRef.current?.easeTo({
        center: [region.longitude, region.latitude],
        zoom: zoomForLatitudeDelta(region.latitudeDelta),
        duration,
      });
    },
  }));

  return (
    <Map
      style={style ?? StyleSheet.absoluteFill}
      mapStyle={env.mapStyleUrl}
      dragPan={scrollEnabled}
      touchZoom={zoomEnabled}
      // L'attribution OpenStreetMap est obligatoire au titre de la licence ODbL.
      attribution
      logo={false}
      onRegionDidChange={
        onRegionChangeComplete
          ? (event) => {
              const { center, zoom } = event.nativeEvent;
              const latitudeDelta = latitudeDeltaForZoom(zoom);
              onRegionChangeComplete({
                latitude: center[1],
                longitude: center[0],
                latitudeDelta,
                longitudeDelta: latitudeDelta,
              });
            }
          : undefined
      }
    >
      <Camera ref={cameraRef} initialViewState={initialViewState} />
      {children}
    </Map>
  );
});

interface MarkerProps {
  coordinate: { latitude: number; longitude: number };
  pinColor?: string;
  title?: string;
  description?: string;
  children?: ReactElement;
}

export function Marker({
  coordinate,
  pinColor = colors.primary,
  title,
  description,
  children,
}: MarkerProps) {
  return (
    <ViewAnnotation
      lngLat={[coordinate.longitude, coordinate.latitude]}
      title={title}
      snippet={description}
    >
      {children ?? (
        <View
          accessibilityLabel={[title, description].filter(Boolean).join(' — ') || undefined}
          style={styles.marker}
        >
          <MapPin size={28} color={pinColor} fill={colors.white} />
        </View>
      )}
    </ViewAnnotation>
  );
}

interface CircleProps {
  center: { latitude: number; longitude: number };
  /** Rayon en **mètres** — converti en polygone, MapLibre raisonnant en pixels. */
  radius: number;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
}

export function Circle({
  center,
  radius,
  strokeColor = colors.primary,
  fillColor = 'rgba(211,47,46,0.12)',
  strokeWidth = 2,
}: CircleProps) {
  const shape = useMemo(
    () => circlePolygon(center.latitude, center.longitude, radius),
    [center.latitude, center.longitude, radius]
  );
  // L'identifiant doit être stable et unique : deux sources homonymes
  // s'écraseraient mutuellement dans le style MapLibre.
  const id = useMemo(() => `circle-${Math.random().toString(36).slice(2)}`, []);

  return (
    <GeoJSONSource id={id} data={shape}>
      <Layer id={`${id}-fill`} type="fill" paint={{ 'fill-color': fillColor }} />
      <Layer
        id={`${id}-line`}
        type="line"
        paint={{ 'line-color': strokeColor, 'line-width': strokeWidth }}
      />
    </GeoJSONSource>
  );
}

interface PolylineProps {
  coordinates: { latitude: number; longitude: number }[];
  strokeColor?: string;
  strokeWidth?: number;
}

export function Polyline({
  coordinates,
  strokeColor = colors.primary,
  strokeWidth = 3,
}: PolylineProps) {
  const shape = useMemo(() => lineString(coordinates), [coordinates]);
  const id = useMemo(() => `line-${Math.random().toString(36).slice(2)}`, []);

  return (
    <GeoJSONSource id={id} data={shape}>
      <Layer
        id={`${id}-line`}
        type="line"
        paint={{ 'line-color': strokeColor, 'line-width': strokeWidth }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </GeoJSONSource>
  );
}

const styles = StyleSheet.create({
  marker: { alignItems: 'center', justifyContent: 'center' },
});

export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  /** Poids 0..1 (probabilité relative de présence) fourni par le module IA. */
  weight: number;
}

/** Construit la collection GeoJSON du calque de densité (poids borné à 0..1). */
export function heatmapFeatures(points: HeatmapPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.weight > 0)
      .map((p) => ({
        type: 'Feature' as const,
        properties: { weight: Math.min(1, Math.max(0, p.weight)) },
        geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] },
      })),
  };
}

/**
 * Carte de chaleur (zone de recherche post-disparition — CDC IA-06) : calque
 * natif `heatmap` de MapLibre, pondéré par la probabilité de chaque cellule.
 */
export function Heatmap({ points, opacity = 0.85 }: { points: HeatmapPoint[]; opacity?: number }) {
  const shape = useMemo(() => heatmapFeatures(points), [points]);
  const id = useMemo(() => `heat-${Math.random().toString(36).slice(2)}`, []);
  return (
    <GeoJSONSource id={id} data={shape}>
      <Layer
        id={`${id}-layer`}
        type="heatmap"
        paint={{
          'heatmap-weight': ['get', 'weight'],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 18, 15, 45],
          'heatmap-intensity': 1,
          'heatmap-opacity': opacity,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(211,47,46,0)',
            0.3,
            'rgba(245,166,35,0.55)',
            0.7,
            'rgba(211,47,46,0.75)',
            1,
            'rgba(122,16,16,0.9)',
          ],
        }}
      />
    </GeoJSONSource>
  );
}
