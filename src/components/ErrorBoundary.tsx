import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { logger } from '@/utils/logger';
// Composant de classe : pas de hook possible, on lit l'instance i18n directement.
import i18n from '@/i18n';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error(error, { componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>{i18n.t('errors.unexpected')}</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Button label={i18n.t('common.retry')} onPress={() => this.setState({ error: null })} />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  title: { ...typography.title2, fontFamily: fontFamily.semiBold, color: colors.ink, textAlign: 'center' },
  message: { ...typography.caption, color: colors.muted, textAlign: 'center', marginBottom: spacing.md },
});
