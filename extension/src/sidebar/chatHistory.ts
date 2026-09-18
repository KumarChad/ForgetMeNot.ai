import type { ChatMessage, ChatConversation, SearchResponse } from './types';

const STORAGE_KEY = 'forgetmenot_conversations';
const MAX_CONVERSATIONS = 50;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function loadConversations(): Promise<ChatConversation[]> {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const convos: ChatConversation[] = data[STORAGE_KEY] || [];
    // Sort newest first
    return convos.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.error('Failed to load conversations:', err);
    return [];
  }
}

export async function saveConversation(conversation: ChatConversation): Promise<void> {
  try {
    const all = await loadConversations();
    const idx = all.findIndex((c) => c.id === conversation.id);
    if (idx >= 0) {
      all[idx] = conversation;
    } else {
      all.unshift(conversation);
    }
    // Cap at MAX_CONVERSATIONS
    const trimmed = all.slice(0, MAX_CONVERSATIONS);
    await chrome.storage.local.set({ [STORAGE_KEY]: trimmed });
  } catch (err) {
    console.error('Failed to save conversation:', err);
  }
}

export async function deleteConversation(conversationId: string): Promise<void> {
  try {
    const all = await loadConversations();
    const filtered = all.filter((c) => c.id !== conversationId);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  } catch (err) {
    console.error('Failed to delete conversation:', err);
  }
}

export async function clearAllConversations(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear conversations:', err);
  }
}

export function createConversation(): ChatConversation {
  const now = Date.now();
  return {
    id: generateId(),
    messages: [],
    createdAt: now,
    updatedAt: now,
    title: 'New conversation',
  };
}

export function addMessageToConversation(
  conversation: ChatConversation,
  query: string,
  response: SearchResponse
): ChatConversation {
  const message: ChatMessage = {
    id: generateId(),
    query,
    response,
    timestamp: Date.now(),
  };
  const updated = {
    ...conversation,
    messages: [...conversation.messages, message],
    updatedAt: Date.now(),
    title: conversation.messages.length === 0 ? query : conversation.title,
  };
  return updated;
}
