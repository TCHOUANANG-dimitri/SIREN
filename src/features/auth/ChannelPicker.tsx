import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fontFamily, radii, spacing, typography, makeStyles } from '@/theme';
import type { OtpChannel } from '@/api/contracts';

interface ChannelPickerProps {
  channels: OtpChannel[];
  value: OtpChannel | null;
  onChange: (channel: OtpChannel) => void;
  disabled?: boolean;
  label?: string;
}

/** Choix du canal de réception du code (SMS, WhatsApp, e-mail) — uniquement les canaux proposés. */
export function ChannelPicker({ channels, value, onChange, disabled, label }: ChannelPickerProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  if (channels.length === 0) return null;
  return (
    <View style={styles.wrapper} accessibilityRole="radiogroup" accessibilityLabel={label ?? t('auth.channelTitle')}>
      <Text style={styles.label}>{label ?? t('auth.channelTitle')}</Text>
      <View style={styles.row}>
        {channels.map((channel) => {
          const selected = channel === value;
          return (
            <Pressable
              key={channel}
              onPress={() => onChange(channel)}
              disabled={disabled}
              style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              hitSlop={4}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{t(`auth.channels.${channel}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrapper: { marginBottom: spacing.lg, width: '100%', maxWidth: 680, alignSelf: 'center' },
  label: { ...typography.label, fontFamily: fontFamily.semiBold, color: colors.slate, marginBottom: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  chipDisabled: { opacity: 0.5 },
  chipText: { ...typography.body, color: colors.ink },
  chipTextSelected: { fontFamily: fontFamily.semiBold },
}));
