import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export default function Composer({ isStreaming, onSend, onStop }: Props) {
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !isStreaming;

  const send = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Message Nova AI"
        placeholderTextColor={colors.textMuted}
        multiline
        onKeyPress={(e) => {
          // On web, Enter sends and Shift+Enter adds a new line.
          const event = e.nativeEvent as { key: string; shiftKey?: boolean };
          if (Platform.OS === 'web' && event.key === 'Enter' && !event.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      {isStreaming ? (
        <Pressable accessibilityLabel="Stop generating" onPress={onStop} style={styles.button}>
          <Ionicons name="stop" size={16} color={colors.background} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel="Send message"
          onPress={send}
          disabled={!canSend}
          style={[styles.button, !canSend && styles.buttonDisabled]}
        >
          <Ionicons name="arrow-up" size={20} color={colors.background} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 160,
    minHeight: 36,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.md,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.3,
  },
});
