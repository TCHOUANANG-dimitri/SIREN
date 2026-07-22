import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle } from 'react-native-maps';
import Slider from '@react-native-community/slider';
import { MapPin } from 'lucide-react-native';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';

interface MapPointRadiusPickerProps {
  latitude: number;
  longitude: number;
  radiusM: number;
  minRadius?: number;
  maxRadius?: number;
  height?: number;
  onChange: (value: { lat: number; lon: number; radiusM: number }) => void;
}

/**
 * Sélecteur point + rayon réutilisé par la Maison/École/Lieux fréquents (assistant contexte)
 * et par l'éditeur de périmètre — CDC1 §9.8, §9.26.
 */
export function MapPointRadiusPicker({
  latitude,
  longitude,
  radiusM,
  minRadius = 50,
  maxRadius = 1500,
  height = 200,
  onChange,
}: MapPointRadiusPickerProps) {
  const [center, setCenter] = useState({ lat: latitude, lon: longitude });
  const [radius, setRadius] = useState(radiusM);

  return (
    <View>
      <View style={[styles.mapWrapper, { height }]}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta: (radiusM * 4) / 111000,
            longitudeDelta: (radiusM * 4) / 111000,
          }}
          onRegionChangeComplete={(region) => {
            const next = { lat: region.latitude, lon: region.longitude };
            setCenter(next);
            onChange({ ...next, radiusM: radius });
          }}
        >
          <Circle
            center={{ latitude: center.lat, longitude: center.lon }}
            radius={radius}
            strokeColor={colors.primary}
            fillColor="rgba(211,47,46,0.12)"
            strokeWidth={2}
          />
        </MapView>
        <View style={styles.pinOverlay} pointerEvents="none">
          <MapPin size={32} color={colors.primary} fill={colors.surfaceAlt} />
        </View>
      </View>

      <View style={styles.sliderCard}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Rayon de protection</Text>
          <Text style={styles.sliderValue}>{radius} m</Text>
        </View>
        <Slider
          minimumValue={minRadius}
          maximumValue={maxRadius}
          step={5}
          value={radius}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
          onValueChange={(value) => {
            setRadius(value);
            onChange({ ...center, radiusM: value });
          }}
        />
        <View style={styles.sliderBounds}>
          <Text style={styles.sliderBoundText}>{minRadius} m</Text>
          <Text style={styles.sliderBoundText}>{maxRadius} m</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrapper: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  pinOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sliderCard: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  sliderLabel: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.slate },
  sliderValue: { ...typography.bodyStrong, fontFamily: fontFamily.bold, color: colors.primary },
  sliderBounds: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderBoundText: { ...typography.caption, color: colors.muted },
});
