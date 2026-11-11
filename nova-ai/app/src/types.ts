export type Role = 'user' | 'assistant';

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** Set when the reply failed; such messages are not sent back to the model. */
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

export interface Settings {
  serverUrl: string;
  apiToken: string;
  systemPrompt: string;
}
