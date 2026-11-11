import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useRef } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Composer from '../components/Composer';
import MessageBubble from '../components/MessageBubble';
import type { RootStackParamList } from '../navigation/types';
import { useChat } from '../state/ChatContext';
import { colors, radius, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

const SUGGESTIONS = [
  'Mujhe Python seekhne ka plan bana do',
  'Explain AI training in simple words',
  'Ek chhoti si kahani likho',
  'Healthy breakfast ideas batao',
];

function IconButton({
  name,
  label,
  onPress,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityLabel={label} hitSlop={8} onPress={onPress} style={styles.iconButton}>
      <Ionicons name={name} size={22} color={colors.textPrimary} />
    </Pressable>
  );
}

export default function ChatScreen({ navigation }: Props) {
  const { activeConversation, streamingId, sendMessage, stopGenerating, startNewChat } = useChat();
  const listRef = useRef<FlatList>(null);
  const messages = activeConversation?.messages ?? [];
  const isStreaming = streamingId !== null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton name="menu" label="Open chats" onPress={() => navigation.navigate('Conversations')} />
        <Text style={styles.title} numberOfLines={1}>
          {activeConversation?.title ?? 'Nova AI'}
        </Text>
        <IconButton name="create-outline" label="New chat" onPress={startNewChat} />
        <IconButton name="settings-outline" label="Settings" onPress={() => navigation.navigate('Settings')} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.logo}>
              <Ionicons name="sparkles" size={28} color={colors.textPrimary} />
            </View>
            <Text style={styles.emptyTitle}>Aaj main aapki kya madad karun?</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} style={styles.suggestion} onPress={() => sendMessage(s)}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.flex}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item, index }) => (
              <MessageBubble
                message={item}
                isStreaming={isStreaming && index === messages.length - 1}
              />
            )}
            contentContainerStyle={styles.list}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        <Composer
          isStreaming={streamingId === activeConversation?.id && isStreaming}
          onSend={sendMessage}
          onStop={stopGenerating}
        />
        <Text style={styles.disclaimer}>Nova AI galti kar sakta hai. Zaroori baatein check karein.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconButton: {
    padding: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  list: {
    paddingVertical: spacing.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.xl,
    fontWeight: '600',
    textAlign: 'center',
  },
  suggestions: {
    width: '100%',
    maxWidth: 520,
    gap: spacing.sm,
  },
  suggestion: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  suggestionText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
  },
  disclaimer: {
    color: colors.textMuted,
    fontSize: typography.xs,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
