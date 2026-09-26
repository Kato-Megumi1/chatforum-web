import { defineStore } from 'pinia';
import { ref } from 'vue';
import request from '@/utils/request';
import { watchChatRun } from '@/utils/chat-stream';
import { disconnectLocalWorkspace } from '@/utils/local-workspace';
import { CHAT_NAVIGATION_KEY, emptyChatNavigation, readChatNavigation, type ChatSpace } from '@/utils/chat-navigation';
import { chatFileRef, type ChatFile } from '@/utils/chat-files';

interface Conversation { id: number; title: string; isPinned: boolean; userId: number; createdAt: string; updatedAt: string;
  conversationType: 'ASSISTANT' | 'ROLEPLAY' | 'LEGACY'; personaKey?: string; personaLabel?: string;
  customPersonaPrompt?: string; sharedMemory?: boolean }
interface Message { id: number; role: 'system' | 'user' | 'assistant'; content: string; reasoningContent?: string;
  ragMetadata?: any; conversationId: number; createdAt: string; pending?: boolean }
interface ConversationSettings { agentMode: string; selectedPersona: string; customPersonaName: string;
  customPersonaPrompt: string; knowledgeBaseId: number; modelId?: string; codingEnabled?: boolean }
interface ChatModel { id: string; label: string; available: boolean; unavailableReason: string | null }
interface Run { id: string; status: string; error?: string; result?: { content: string; ragMetadata?: any } }

// Drop provider secrets written by older app versions, without dropping role settings.
try {
  const saved = JSON.parse(localStorage.getItem('chatforum-chat') || '{}');
  delete saved.llmConfig;
  localStorage.setItem('chatforum-chat', JSON.stringify(saved));
} catch { localStorage.removeItem('chatforum-chat'); }

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([]);
  const currentConversation = ref<Conversation | null>(null);
  const messages = ref<Message[]>([]);
  const llmConfig = ref({ configured: false, model: '', defaultModelId: '', models: [] as ChatModel[] });
  const preferredModelId = ref('');
  const isStreaming = ref(false);
  const conversationSettings = ref<Record<number, ConversationSettings>>({});
  const abortController = ref<AbortController | null>(null);
  let activeRun: string | null = null;
  const pendingReply = ref<Message | null>(null);
  const pendingQuestion = ref<Message | null>(null);
  let selection = 0;
  let identityEpoch = 0;
  const navigation = ref(emptyChatNavigation(0));
  const drafts = ref<Record<number, string>>({}); // In-memory only; never persist message/draft contents in navigation storage.
  const draftAttachments = ref<Record<number,ChatFile[]>>({}); // Per-conversation pending selection, never the whole library.
  const isLoadingConversation = ref(false);
  const persistNavigation = () => {
    if (!navigation.value.userId) return;
    try { sessionStorage.setItem(CHAT_NAVIGATION_KEY, JSON.stringify(navigation.value)); } catch { /* In-memory restoration still works. */ }
  };
  const initializeNavigation = (userId: number) => {
    if (navigation.value.userId === userId) return;
    try { navigation.value = readChatNavigation(sessionStorage.getItem(CHAT_NAVIGATION_KEY), userId); }
    catch { navigation.value = emptyChatNavigation(userId); }
  };
  const setSpace = (space: ChatSpace) => { navigation.value.space = space; persistNavigation(); };
  const saveView = (id: number, scroll: number, draft: string) => {
    navigation.value.scroll[id] = Math.max(0, scroll); drafts.value[id] = draft;
    const keys = Object.keys(navigation.value.scroll);
    if (keys.length > 100) for (const key of keys.filter(k => Number(k) !== id).slice(0, keys.length - 100)) {
      delete navigation.value.scroll[Number(key)]; delete drafts.value[Number(key)];
    }
    persistNavigation();
  };

  const getConversationSettings = (id: number): ConversationSettings => conversationSettings.value[id] ||= {
    agentMode: 'normal', selectedPersona: '', customPersonaName: '', customPersonaPrompt: '', knowledgeBaseId: 0,
  };
  const saveConversationSettings = (id: number, settings: Partial<ConversationSettings>) =>
    Object.assign(getConversationSettings(id), settings);
  const loadConversations = async () => {
    const epoch = identityEpoch, data = await request.get<Conversation[]>('/chat/conversations');
    if (epoch === identityEpoch) conversations.value = data;
  };
  const loadDefaultConfig = async () => {
    const data = await request.get('/chat/config');
    llmConfig.value = { configured: data.configured, model: data.model, defaultModelId: data.defaultModelId || '', models: data.models || [] };
  };
  const createConversation = async (title?: string, identity: { conversationType?: string; persona?: string; personaLabel?: string; customPersonaPrompt?: string } = {}) => {
    const data = await request.post<Conversation>('/chat/conversations', { title, ...identity });
    conversations.value.unshift(data);
    return data;
  };
  const configureIdentity = async (id: number, identity: { conversationType: string; persona?: string; personaLabel?: string; customPersonaPrompt?: string }) => {
    const updated = await request.put<Conversation>('/chat/conversations/' + id + '/identity', identity);
    conversations.value = conversations.value.map(c => c.id === id ? updated : c);
    if (currentConversation.value?.id === id) currentConversation.value = updated;
  };
  const clearSelection = () => {
    ++selection; currentConversation.value = null; messages.value = []; isLoadingConversation.value = false;
    navigation.value.conversationId = null; persistNavigation();
  };
  const updateConversation = async (id: number, data: Partial<Conversation>) => {
    const updated = await request.put<Conversation>('/chat/conversations/' + id, data);
    conversations.value = conversations.value.map(c => c.id === id ? updated : c);
    if (currentConversation.value?.id === id) currentConversation.value = updated;
  };
  const selectConversation = async (conversation: Conversation) => {
    const stamp = ++selection;
    isLoadingConversation.value = true;
    try {
    const changed = currentConversation.value?.id !== conversation.id;
    currentConversation.value = conversation;
    navigation.value.space = conversation.conversationType || 'LEGACY';
    navigation.value.conversationId = conversation.id; persistNavigation();
    if (changed) messages.value = [];
    const data = await request.get<Message[]>('/chat/conversations/' + conversation.id + '/messages');
    let appendPending = pendingReply.value?.conversationId === conversation.id;
    if (appendPending && activeRun) {
      const state = await request.get<Run>('/chat/runs/' + activeRun);
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(state.status)) appendPending = false;
    }
    if (stamp === selection) {
      messages.value = data.map(m => ({ ...m, role: m.role.toLowerCase() as Message['role'] }));
      if (appendPending && pendingQuestion.value && pendingReply.value)
        messages.value.push(pendingQuestion.value, pendingReply.value);
    }
    } finally { if (stamp === selection) isLoadingConversation.value = false; }
  };
  const stopGeneration = () => {
    disconnectLocalWorkspace();
    abortController.value?.abort();
    if (activeRun) void request.delete('/chat/runs/' + activeRun).catch(() => undefined);
    // The pending sender's finally owns the lock; don't admit a second request early.
  };
  const deleteConversation = async (id: number) => {
    if (currentConversation.value?.id === id) stopGeneration();
    await request.delete('/chat/conversations/' + id);
    conversations.value = conversations.value.filter(c => c.id !== id);
    delete conversationSettings.value[id];
    delete navigation.value.scroll[id]; delete drafts.value[id];
    delete draftAttachments.value[id];
    if (currentConversation.value?.id === id) clearSelection(); else persistNavigation();
  };
  const deleteMessage = async (id: number) => {
    if (!currentConversation.value || isStreaming.value) return;
    await request.delete('/chat/conversations/' + currentConversation.value.id + '/messages/' + id);
    messages.value = messages.value.filter(m => m.id !== id);
  };

  const send = async (question: string, mode: 'normal' | 'agent', enabledSkills?: string[],
    persona?: string, customSystemPrompt?: string, knowledgeBaseId?: number, onStream?: (text: string) => void, codingWorkspaceId?: string,
    attachments?:{files:ChatFile[];onAccepted?:()=>void}) => {
    if (isStreaming.value || (!question.trim()&&!attachments?.files.length)) return false;
    let completed=false;
    isStreaming.value = true;
    const controller = new AbortController();
    abortController.value = controller;
    let cid: number | undefined;
    try {
      if (!currentConversation.value) await selectConversation(await createConversation(question.slice(0, 30), {
        conversationType: persona ? 'ROLEPLAY' : 'ASSISTANT', persona, customPersonaPrompt: customSystemPrompt }));
      cid = currentConversation.value!.id;
      pendingQuestion.value = { id: -Date.now(), role: 'user', content: question,
        conversationId: cid, createdAt: new Date().toISOString(),
        ...(attachments?.files.length?{ragMetadata:{messageAttachments:attachments.files}}:{}) };
      pendingReply.value = { id: -Date.now() - 1, role: 'assistant', content: '', pending: true,
        conversationId: cid, createdAt: new Date().toISOString() };
      messages.value.push(pendingQuestion.value, pendingReply.value);
      // Admit once; subscribe/reconnect to the durable run without repeating model calls.
      const run = await request.post<Run>('/chat/runs', { requestId: crypto.randomUUID(),
        conversationId: cid, question, mode, enabledSkills, codingWorkspaceId, persona: persona || undefined,
        attachments:attachments?.files.length?attachments.files.map(chatFileRef):undefined,
        customSystemPrompt: customSystemPrompt || undefined, knowledgeBaseId: knowledgeBaseId || undefined,
        modelId: getConversationSettings(cid).modelId || preferredModelId.value || llmConfig.value.defaultModelId });
      activeRun = run.id;
      attachments?.onAccepted?.();
      if (controller.signal.aborted) { await request.delete('/chat/runs/' + run.id); return false; }
      const reply = pendingReply.value;
      const status = await watchChatRun(run.id, controller.signal, text => {
        reply.content += text; onStream?.(text);
      });
      if (status.status === 'COMPLETED') {
        completed=true;
        reply.content = status.result?.content || reply.content;
        reply.ragMetadata = status.result?.ragMetadata;
      } else if (status.status !== 'CANCELLED') throw new Error(status.error || '生成失败');
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      activeRun = null;
      abortController.value = null;
      if (pendingReply.value) pendingReply.value.pending = false;
      pendingReply.value = null; pendingQuestion.value = null;
      if (currentConversation.value && currentConversation.value.id === cid) {
        try { await selectConversation(currentConversation.value); } catch { /* Keep visible draft on network loss. */ }
      }
      isStreaming.value = false;
      void loadConversations().catch(() => undefined);
    }
    return completed;
  };
  const sendMessage = (question: string, onStream?: (text: string) => void) =>
    send(question, 'normal', [], undefined, undefined, undefined, onStream);
  const resetForUser = () => {
    disconnectLocalWorkspace(false); // Credentials are changing; expired browser leases fail closed.
    identityEpoch++; navigation.value = emptyChatNavigation(0); drafts.value = {}; draftAttachments.value={}; isLoadingConversation.value = false;
    try { sessionStorage.removeItem(CHAT_NAVIGATION_KEY); } catch { /* Storage may be blocked. */ }
    selection++; abortController.value?.abort(); activeRun = null;
    pendingReply.value = null; pendingQuestion.value = null;
    conversations.value = []; currentConversation.value = null; messages.value = [];
    conversationSettings.value = {};
    preferredModelId.value = '';
  };
  const sendMessageAgent = (question: string, enabledSkills?: string[], persona?: string,
    customSystemPrompt?: string, knowledgeBaseId?: number, onStream?: (text: string) => void) =>
    send(question, 'agent', enabledSkills, persona, customSystemPrompt, knowledgeBaseId, onStream);

  return { conversations, currentConversation, messages, llmConfig, preferredModelId, isStreaming, conversationSettings,
    navigation, drafts, draftAttachments, isLoadingConversation, initializeNavigation, setSpace, saveView,
    getConversationSettings, saveConversationSettings, loadConversations, loadDefaultConfig,
    createConversation, configureIdentity, clearSelection, updateConversation, deleteConversation, deleteMessage, selectConversation,
    sendMessage, sendMessageAgent, sendConfigured: send, stopGeneration, abortController, resetForUser };
}, { persist: { key: 'chatforum-chat', storage: localStorage, paths: ['conversationSettings', 'preferredModelId'] } });
