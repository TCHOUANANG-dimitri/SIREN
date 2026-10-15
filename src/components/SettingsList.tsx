import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { fontFamily, makeStyles, radii, spacing, touchTarget, typography, useTheme } from '@/theme';

/**
 * Liste de réglages : sections titrées contenant des lignes homogènes
 * (icône, libellé, description courte, valeur, chevron). Utilisée par
 * Réglages, Sécurité, À propos et Documents juridiques.
 */
export function SettingsSection({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const styles = useStyles();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={styles.group}>
        {items.map((child, index) => (
          <View key={index} style={index > 0 && styles.separator}>
            {child}
          </View>
        ))}
      </View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

interface SettingsRowProps {
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  /** Action sensible (suppression, déconnexion) : couleur d'alerte. */
  destructive?: boolean;
  /** Élément affiché à droite à la place du chevron (interrupteur…). */
  trailing?: React.ReactNode;
  accessibilityHint?: string;
  disabled?: boolean;
}

export function SettingsRow({
  icon: Icon,
  label,
  description,
  value,
  onPress,
  destructive,
  trailing,
  accessibilityHint,
  disabled,
}: SettingsRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tint = destructive ? colors.urgence : colors.ink;
  const content = (
    <>
      {Icon ? (
        <View style={styles.iconBox}>
          <Icon size={20} color={destructive ? colors.urgence : colors.slate} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text style={[styles.label, { color: tint }]}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing ?? (onPress ? <ChevronRight size={18} color={colors.muted} /> : null)}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={[label, value, description].filter(Boolean).join(', ')}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={[label, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint ?? description}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {content}
    </Pressable>
  );
}

/** Choix exclusif compact (langue, thème) : boutons radio accessibles. */
export function SettingsChoice<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  accessibilityLabel: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.choiceRow} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={option.label}
            style={({ pressed }) => [styles.choice, selected && styles.choiceActive, pressed && !selected && styles.pressed]}
          >
            <Text style={[styles.choiceText, selected && styles.choiceTextActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    ...typography.label,
    fontFamily: fontFamily.semiBold,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  group: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  separator: { borderTopWidth: 1, borderTopColor: colors.border },
  footer: { ...typography.caption, color: colors.muted, marginTop: spacing.sm, marginHorizontal: spacing.xs },
  row: {
    minHeight: touchTarget.min + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  iconBox: { width: 24, alignItems: 'center' },
  texts: { flex: 1, gap: 2 },
  label: { ...typography.body, fontFamily: fontFamily.medium },
  description: { ...typography.caption, color: colors.muted },
  value: { ...typography.caption, color: colors.muted, maxWidth: '45%' },
  choiceRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, flexWrap: 'wrap' },
  choice: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 88,
    minHeight: touchTarget.min,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.slate },
  choiceTextActive: { color: colors.onPrimary },
}));
