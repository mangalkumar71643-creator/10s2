import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { streamChat } from '../api/chat';
import type { Conversation, Message } from '../types';
import { useSettings } from './SettingsContext';

const STORAGE_KEY = 'nova-ai/conversations';
const TITLE_LENGTH = 40;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function makeTitle(text: string) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > TITLE_LENGTH ? `${oneLine.slice(0, TITLE_LENGTH)}…` : oneLine;
}

interface ChatContextValue {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  /** Id of the conversation currently receiving a reply, if any. */
  streamingId: string | null;
  sendMessage: (text: string) => void;
  stopGenerating: () => void;
  startNewChat: () => void;
  openConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setConversations(JSON.parse(raw)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // While a reply streams, save at most every 500ms instead of on every token;
  // otherwise save right away so nothing is lost if the app is closed.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(
      () => {
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)).catch(() => {});
      },
      streamingId ? 500 : 0,
    );
    return () => clearTimeout(timer);
  }, [conversations, loaded, streamingId]);

  const updateMessage = useCallback(
    (conversationId: string, messageId: string, update: (m: Message) => Partial<Message>) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...update(m) } : m)),
              }
            : c,
        ),
      );
    },
    [],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || streamingId) return;

      const existing = conversations.find((c) => c.id === activeId);
      const conversationId = existing?.id ?? newId();
      const now = Date.now();
      const userMessage: Message = { id: newId(), role: 'user', content, createdAt: now };
      const reply: Message = { id: newId(), role: 'assistant', content: '', createdAt: now };
      const history = [...(existing?.messages ?? []), userMessage]
        .filter((m) => !m.error && m.content)
        .map(({ role, content }) => ({ role, content }));

      setConversations((prev) => {
        const conversation: Conversation = existing
          ? { ...existing, messages: [...existing.messages, userMessage, reply], updatedAt: now }
          : { id: conversationId, title: makeTitle(content), messages: [userMessage, reply], updatedAt: now };
        return [conversation, ...prev.filter((c) => c.id !== conversationId)];
      });
      setActiveId(conversationId);
      setStreamingId(conversationId);

      const controller = new AbortController();
      abortRef.current = controller;

      streamChat({
        settings,
        messages: history,
        signal: controller.signal,
        onDelta: (delta) => updateMessage(conversationId, reply.id, (m) => ({ content: m.content + delta })),
      })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          const message = err instanceof Error ? err.message : String(err);
          updateMessage(conversationId, reply.id, () => ({
            error: `${message}\n\nCheck that the server is running and the Server URL in Settings is correct.`,
          }));
        })
        .finally(() => {
          abortRef.current = null;
          setStreamingId(null);
        });
    },
    [activeId, conversations, settings, streamingId, updateMessage],
  );

  const stopGenerating = useCallback(() => abortRef.current?.abort(), []);

  const startNewChat = useCallback(() => setActiveId(null), []);

  const openConversation = useCallback((id: string) => setActiveId(id), []);

  const deleteConversation = useCallback(
    (id: string) => {
      if (id === streamingId) abortRef.current?.abort();
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setActiveId((current) => (current === id ? null : current));
    },
    [streamingId],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      conversations,
      activeConversation: conversations.find((c) => c.id === activeId) ?? null,
      streamingId,
      sendMessage,
      stopGenerating,
      startNewChat,
      openConversation,
      deleteConversation,
    }),
    [
      conversations,
      activeId,
      streamingId,
      sendMessage,
      stopGenerating,
      startNewChat,
      openConversation,
      deleteConversation,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside ChatProvider');
  return ctx;
}
