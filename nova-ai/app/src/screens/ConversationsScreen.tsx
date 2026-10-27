import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RootStackParamList } from '../navigation/types';
import { useChat } from '../state/ChatContext';
import { colors, radius, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Conversations'>;

function confirmDelete(title: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`Delete "${title}"?`)) onConfirm();
    return;
  }
  Alert.alert('Delete chat?', title, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function ConversationsScreen({ navigation }: Props) {
  const { conversations, activeConversation, startNewChat, openConversation, deleteConversation } =
    useChat();

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.newChat}
        onPress={() => {
          startNewChat();
          navigation.goBack();
        }}
      >
        <Ionicons name="add" size={20} color={colors.textPrimary} />
        <Text style={styles.newChatText}>New chat</Text>
      </Pressable>

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Abhi koi chat nahi hai.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, item.id === activeConversation?.id && styles.rowActive]}
            onPress={() => {
              openConversation(item.id);
              navigation.goBack();
            }}
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Pressable
              accessibilityLabel="Delete chat"
              hitSlop={8}
              onPress={() => confirmDelete(item.title, () => deleteConversation(item.id))}
            >
              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  newChatText: {
    color: colors.textPrimary,
    fontSize: typography.md,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
  },
  rowActive: {
    backgroundColor: colors.surface,
  },
  rowTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.md,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
