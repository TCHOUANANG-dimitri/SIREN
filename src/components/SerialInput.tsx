import { useRef, useState } from 'react';
import { Platform, Text, TextInput, View, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fontFamily, radii, spacing, typography, makeStyles, useTheme } from '@/theme';
import { SERIAL_BODY_LENGTH, SERIAL_PREFIX, formatSerialBody, nextSerialInput, serialFromBody } from '@/features/pairing/serial';

interface SerialInputProps {
  label: string;
  /** Les 10 caractères saisis (casse conservée). */
  body: string;
  onChangeBody: (body: string) => void;
  /** Appelé avec le numéro complet `SIREN-XXXXX-XXXXX` dès que les 10 caractères sont saisis. */
  onComplete?: (serial: string) => void;
  error?: string;
  editable?: boolean;
}

/**
 * Saisie manuelle du numéro de série : « SIREN- » est affiché en préfixe fixe et
 * le tiret après le 5e caractère est inséré automatiquement. Aucune conversion de
 * casse (le numéro y est sensible), collage du numéro complet accepté, caractères
 * non autorisés ignorés avec un message, curseur conservé lors d'une édition au milieu.
 */
export function SerialInput({ label, body, onChangeBody, onComplete, error, editable = true }: SerialInputProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const cursor = useRef(0);
  const formatted = formatSerialBody(body);

  function onChangeText(raw: string) {
    const next = nextSerialInput(formatted, raw, cursor.current);
    setRejected(next.rejected);
    cursor.current = next.cursor;
    setSelection({ start: next.cursor, end: next.cursor });
    onChangeBody(next.body);
    const serial = serialFromBody(next.body);
    if (serial && next.body !== body) onComplete?.(serial);
  }

  function onSelectionChange(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    cursor.current = event.nativeEvent.selection.end;
    // Le curseur redevient libre : seul un reformatage le repositionne.
    if (selection) setSelection(undefined);
  }

  const borderColor = error ? colors.urgence : focused ? colors.accent : colors.border;
  const message = error ?? (rejected ? t('children.serialInvalidChars') : undefined);
  const remaining = SERIAL_BODY_LENGTH - body.length;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label} nativeID="serial-label">
        {label}
      </Text>
      <View style={[styles.inputRow, { borderColor, borderWidth: focused || error ? 1.5 : 1 }]}>
        <Text style={styles.prefix} accessibilityElementsHidden importantForAccessibility="no">
          {SERIAL_PREFIX}
        </Text>
        <TextInput
          testID="serial-input"
          value={formatted}
          onChangeText={onChangeText}
          selection={selection}
          onSelectionChange={onSelectionChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={editable}
          style={styles.input}
          placeholder={t('children.serialPlaceholder')}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          // Clavier sans suggestions ni majuscule automatique (le numéro est sensible à la casse).
          keyboardType={Platform.OS === 'android' ? 'visible-password' : 'ascii-capable'}
          maxLength={SERIAL_BODY_LENGTH + 1 + SERIAL_PREFIX.length * 2}
          accessibilityLabel={t('children.serialA11y', { count: body.length, total: SERIAL_BODY_LENGTH })}
          accessibilityLabelledBy="serial-label"
        />
      </View>
      {message ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : (
        <Text style={styles.hint}>{remaining > 0 ? t('children.serialRemaining', { count: remaining }) : t('children.serialComplete')}</Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrapper: { marginBottom: spacing.md, maxWidth: 680, width: '100%', alignSelf: 'center' },
  label: { ...typography.label, fontFamily: fontFamily.semiBold, color: colors.slate, marginBottom: spacing.xs + 2 },
  inputRow: {
    borderRadius: radii.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  prefix: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.muted, letterSpacing: 1 },
  input: {
    flex: 1,
    ...typography.body,
    fontFamily: fontFamily.semiBold,
    color: colors.ink,
    letterSpacing: 1,
    paddingVertical: spacing.sm,
  },
  error: { ...typography.caption, color: colors.urgence, marginTop: spacing.xs },
  hint: { ...typography.caption, color: colors.muted, marginTop: spacing.xs },
}));
