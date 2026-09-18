import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Clock } from 'lucide-react-native';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';

interface TimeFieldProps {
  label: string;
  /** Heure au format « HH:mm » (24 h). */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}

/**
 * Saisie d'une heure via le sélecteur natif plutôt qu'au clavier.
 *
 * Un champ texte libre laissait passer « 7h », « 25:00 » ou « 07:5 », qu'il
 * fallait ensuite valider à la main ; l'horloge native ne peut produire qu'une
 * heure valide et évite au parent de basculer le clavier en mode numérique.
 */
export function TimeField({ label, value, onChange, error, hint }: TimeFieldProps) {
  const [open, setOpen] = useState(false);

  function handleChange(event: DateTimePickerEvent, date?: Date) {
    // Sur Android le sélecteur est une boîte de dialogue : elle se referme au
    // premier événement, qu'on ait validé ou annulé. Sur iOS il reste affiché
    // en ligne, on le laisse ouvert jusqu'à fermeture explicite.
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed' || !date) return;
    onChange(formatTime(date));
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.inputRow, { borderColor: error ? colors.urgence : colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${value || 'non défini'}`}
      >
        <Text style={[styles.value, !value && styles.placeholder]}>{value || '--:--'}</Text>
        <Clock size={18} color={colors.muted} />
      </Pressable>

      {open && (
        <DateTimePicker
          value={parseTime(value)}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
          onChange={handleChange}
        />
      )}

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** « HH:mm » → Date d'aujourd'hui à cette heure. Retombe sur 08:00 si invalide. */
function parseTime(value: string): Date {
  const date = new Date();
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  const h = match ? Number(match[1]) : 8;
  const m = match ? Number(match[2]) : 0;
  date.setHours(h > 23 ? 8 : h, m > 59 ? 0 : m, 0, 0);
  return date;
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md, maxWidth: 680, width: '100%', alignSelf: 'center' },
  label: {
    ...typography.label,
    fontFamily: fontFamily.semiBold,
    color: colors.slate,
    marginBottom: spacing.xs + 2,
  },
  inputRow: {
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  value: { ...typography.body, color: colors.ink },
  placeholder: { color: colors.muted },
  error: { ...typography.caption, color: colors.urgence, marginTop: spacing.xs },
  hint: { ...typography.caption, color: colors.muted, marginTop: spacing.xs },
});
