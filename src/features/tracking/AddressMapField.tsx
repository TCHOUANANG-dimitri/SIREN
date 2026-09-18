import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MapPin, Search } from 'lucide-react-native';
import { TextField } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { searchAddress, reverseGeocode, type GeoResult } from '@/api/services/geocodingService';
import { logger } from '@/utils/logger';
import { MapPointRadiusPicker } from './MapPointRadiusPicker';
import { useTranslation } from 'react-i18next';

interface AddressMapFieldProps {
  label: string;
  placeholder?: string;
  address: string;
  onAddressChange: (value: string) => void;
  point: { lat: number; lon: number; radiusM: number };
  onPointChange: (value: { lat: number; lon: number; radiusM: number }) => void;
  minRadius?: number;
  maxRadius?: number;
}

/**
 * Adresse et position liées dans les deux sens (OpenStreetMap / Nominatim) :
 *
 *  - l'utilisateur tape une adresse → propositions → la carte s'y recentre ;
 *  - l'utilisateur déplace la carte → l'adresse la plus proche se remplit.
 *
 * Le point délicat est d'éviter la boucle : remplir l'adresse après un
 * déplacement ne doit pas relancer une recherche qui redéplacerait la carte.
 * `origin` mémorise donc qui a provoqué la dernière modification, et chaque
 * sens ignore les changements qu'il a lui-même causés.
 */
export function AddressMapField({
  label,
  placeholder,
  address,
  onAddressChange,
  point,
  onPointChange,
  minRadius,
  maxRadius,
}: AddressMapFieldProps) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lon: number } | null>(null);

  const origin = useRef<'user-typing' | 'map' | 'suggestion'>('user-typing');

  // ---- Sens 1 : adresse saisie → positions candidates -------------------
  useEffect(() => {
    if (origin.current !== 'user-typing') return;
    const query = address.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    // Nominatim plafonne à 1 requête/seconde : on attend une pause de frappe
    // plutôt que d'interroger à chaque caractère.
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        setSuggestions(await searchAddress(query, controller.signal));
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error(error, { stage: 'geocoding-search' });
          setSuggestions([]);
        }
      } finally {
        setSearching(false);
      }
    }, 700);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [address]);

  // ---- Sens 2 : position sur la carte → adresse -------------------------
  useEffect(() => {
    if (origin.current !== 'map') return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setResolving(true);
      try {
        const label = await reverseGeocode(point.lat, point.lon, controller.signal);
        if (label) onAddressChange(label);
      } catch (error) {
        if (!controller.signal.aborted) logger.error(error, { stage: 'geocoding-reverse' });
      } finally {
        setResolving(false);
      }
    }, 900);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [point.lat, point.lon]);

  const handleTyping = useCallback(
    (value: string) => {
      origin.current = 'user-typing';
      onAddressChange(value);
    },
    [onAddressChange]
  );

  const handleMapMove = useCallback(
    (value: { lat: number; lon: number; radiusM: number }) => {
      // Un simple ajustement du rayon ne doit pas relancer un géocodage inverse.
      if (value.lat !== point.lat || value.lon !== point.lon) origin.current = 'map';
      onPointChange(value);
    },
    [onPointChange, point.lat, point.lon]
  );

  const pickSuggestion = useCallback(
    (result: GeoResult) => {
      origin.current = 'suggestion';
      onAddressChange(result.label);
      onPointChange({ lat: result.lat, lon: result.lon, radiusM: point.radiusM });
      setFocusPoint({ lat: result.lat, lon: result.lon });
      setSuggestions([]);
    },
    [onAddressChange, onPointChange, point.radiusM]
  );

  return (
    <View>
      <TextField
        label={label}
        value={address}
        onChangeText={handleTyping}
        placeholder={placeholder}
        required={false}
        hint={
          resolving
            ? t('map.resolvingAddress')
            : t('map.addressHint')
        }
      />

      {searching && (
        <View style={styles.searchingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.searchingText}>{t('map.searchingAddresses')}</Text>
        </View>
      )}

      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable
              key={`${s.lat},${s.lon}`}
              onPress={() => pickSuggestion(s)}
              style={styles.suggestionRow}
              accessibilityRole="button"
            >
              <Search size={16} color={colors.muted} />
              <Text style={styles.suggestionText} numberOfLines={2}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <MapPointRadiusPicker
        latitude={point.lat}
        longitude={point.lon}
        radiusM={point.radiusM}
        minRadius={minRadius}
        maxRadius={maxRadius}
        focusPoint={focusPoint}
        onChange={handleMapMove}
      />

      {/* Les coordonnées exactes restent affichées : la carte seule ne permet
          pas de vérifier finement le point retenu, ni de le recopier. */}
      <View style={styles.coordsRow}>
        <MapPin size={14} color={colors.muted} />
        <Text style={styles.coordsText}>
          {t('map.selectedPosition', { lat: point.lat.toFixed(5), lon: point.lon.toFixed(5) })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchingText: { ...typography.caption, color: colors.muted },
  suggestions: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionText: { ...typography.caption, color: colors.ink, flex: 1, lineHeight: 18 },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  coordsText: { ...typography.caption, color: colors.muted, fontFamily: fontFamily.regular },
});
