import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import type { Message } from '../types';
import MarkdownText from './MarkdownText';

interface Props {
  message: Message;
  isStreaming: boolean;
}

function MessageBubble({ message, isStreaming }: Props) {
  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text selectable style={styles.userText}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <View style={styles.avatar}>
        <Ionicons name="sparkles" size={14} color={colors.textPrimary} />
      </View>
      <View style={styles.assistantBody}>
        {message.content ? <MarkdownText>{message.content}</MarkdownText> : null}
        {isStreaming && !message.content ? (
          <ActivityIndicator color={colors.textSecondary} style={styles.loader} />
        ) : null}
        {message.error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{message.error}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default React.memo(MessageBubble);

const styles = StyleSheet.create({
  userRow: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  userBubble: {
    maxWidth: '85%',
    backgroundColor: colors.userBubble,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  userText: {
    color: colors.textPrimary,
    fontSize: typography.md,
    lineHeight: 22,
  },
  assistantRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  assistantBody: {
    flex: 1,
    gap: spacing.sm,
  },
  loader: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  errorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: typography.sm,
    lineHeight: 19,
  },
});
