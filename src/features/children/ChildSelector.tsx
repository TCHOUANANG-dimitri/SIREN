import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fontFamily, makeStyles, radii, spacing, touchTarget, typography } from '@/theme';
import type { Child } from '@/models/entities';

interface ChildSelectorProps {
  childrenList: Child[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  /** Contexte lu par le lecteur d'écran (« Carte », « Partage »…). */
  contextLabel: string;
}

/**
 * Sélecteur d'enfant horizontal (Carte, Partage).
 *
 * Correctifs par rapport aux puces précédentes :
 * - `flexGrow: 0` : un ScrollView horizontal a `flexGrow: 1` par défaut ; il
 *   occupait la moitié de l'écran (étirant les puces) et amputait la carte ou
 *   la liste placée dessous ;
 * - cible tactile ≥ 48 px (CDC §8) au lieu de ~30 px, avec retour visuel au toucher ;
 * - rôle et état accessibles : le lecteur d'écran annonce l'enfant sélectionné ;
 * - affiché dès un enfant : l'utilisateur voit toujours sur quel enfant il agit.
 */
export function ChildSelector({ childrenList, activeId, onSelect, contextLabel }: ChildSelectorProps) {
  const styles = useStyles();
  const { t } = useTranslation();

  if (childrenList.length === 0) return null;

  return (
    <View style={styles.wrapper} accessibilityRole="tablist" accessibilityLabel={t('children.selector.label', { context: contextLabel })}>
      <ScrollView
        horizontal
        style={styles.scroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {childrenList.map((child) => {
          const selected = child.id === activeId;
          return (
            <Pressable
              key={child.id}
              onPress={() => onSelect(child.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={child.prenom}
              accessibilityHint={selected ? undefined : t('children.selector.hint', { name: child.prenom })}
              hitSlop={{ top: 4, bottom: 4 }}
              style={({ pressed }) => [styles.chip, selected && styles.chipActive, pressed && !selected && styles.chipPressed]}
            >
              <View style={[styles.initial, selected && styles.initialActive]}>
                <Text style={[styles.initialText, selected && styles.initialTextActive]}>
                  {child.prenom.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.chipText, selected && styles.chipTextActive]} numberOfLines={1}>
                {child.prenom}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrapper: { flexGrow: 0 },
  scroll: { flexGrow: 0 },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  chip: {
    minHeight: touchTarget.min,
    maxWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.xs + 2,
    paddingRight: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceChip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipPressed: { opacity: 0.7 },
  initial: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  initialActive: { backgroundColor: colors.primaryDark },
  initialText: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.slate },
  initialTextActive: { color: colors.onPrimary },
  chipText: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.slate, flexShrink: 1 },
  chipTextActive: { color: colors.onPrimary },
}));
