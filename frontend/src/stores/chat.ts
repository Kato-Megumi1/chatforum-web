import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import request from '@/utils/request';
import { watchChatRun } from '@/utils/chat-stream';
import { disconnectLocalWorkspace, localWorkspace } from '@/utils/local-workspace';
import { CHAT_NAVIGATION_KEY, emptyChatNavigation, readChatNavigation, type ChatSpace } from '@/utils/chat-navigation';
import { chatFileRef, type ChatFile } from '@/utils/chat-files';
import { selectedChatModel } from '@/utils/chat-model-selection';
import { conversationResponseOptions, ensureConversationSettings, type ConversationSettings } from '@/utils/roleplay-defaults';
import { readFileResume, readRecoverableFileGeneration, type FileResumePointer } from '@/utils/file-resume';

interface Conversation { id: number; title: string; isPinned: boolean; userId: number; createdAt: string; updatedAt: string;
  conversationType: 'ASSISTANT' | 'ROLEPLAY' | 'LEGACY'; personaKey?: string; personaLabel?: string;
  customPersonaPrompt?: string; sharedMemory?: boolean }
interface Message { id: number; role: 'system' | 'user' | 'assistant'; content: string;
  ragMetadata?: any; conversationId: number; createdAt: string; pending?: boolean; localAttempt?: boolean;
  failure?: { message: string; elapsedMs: number; cancelled: boolean; retryable: boolean } }
interface FailedAttempt { question: Message; reply: Message; runId?: string }
interface ConversationRun { controller: AbortController; epoch: number; runId?: string;
  question?: Message; reply?: Message; settled?: boolean }
interface ChatModel { id: string; label: string; available: boolean; unavailableReason: string | null }
interface Run { id?: string; status: string; error?: string; result?: { content?: string; ragMetadata?: any;
  failure?: { code?: string; message?: string } } }
const failureMessageFor = (run: Run) => run.result?.failure?.message || run.error || '本次回答未生成，请重新发送';
const retainFailedFileRecovery = (reply: Message | undefined, run: Run) => {
  const generation = readRecoverableFileGeneration(run.result?.ragMetadata?.generation);
  if (reply && generation) reply.ragMetadata = { ...reply.ragMetadata, generation };
};

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
  const conversationSettings = ref<Record<number, ConversationSettings>>({});
  const conversationRuns = ref<Record<number, ConversationRun>>({});
  const preparingRun = ref<ConversationRun | null>(null);
  const currentRun = computed(() => currentConversation.value
    ? conversationRuns.value[currentConversation.value.id] : preparingRun.value);
  const isStreaming = computed(() => !!currentRun.value);
  const abortController = computed(() => currentRun.value?.controller || null);
  const isConversationStreaming = (id: number) => !!conversationRuns.value[id];
  let selection = 0;
  let identityEpoch = 0;
  const navigation = ref(emptyChatNavigation(0));
  const drafts = ref<Record<number, string>>({}); // In-memory only; never persist message/draft contents in navigation storage.
  const draftAttachments = ref<Record<number,ChatFile[]>>({}); // Per-conversation pending selection, never the whole library.
  // Failed attempts are local UI state, never model history or persisted browser storage.
  const failedAttempts = ref<Record<number, FailedAttempt>>({});
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

  const getConversationSettings = (id: number): ConversationSettings => ensureConversationSettings(
    conversationSettings.value, id,
    currentConversation.value?.id === id ? currentConversation.value : conversations.value.find(conversation => conversation.id === id),
  );
  const saveConversationSettings = (id: number, settings: Partial<ConversationSettings>) =>
    Object.assign(getConversationSettings(id), settings);
  const selectedModelId = (id?: number) => selectedChatModel(llmConfig.value.models, llmConfig.value.defaultModelId,
    id ? getConversationSettings(id).modelId : undefined, preferredModelId.value);
  const loadConversations = async () => {
    const epoch = identityEpoch, data = await request.get<Conversation[]>('/chat/conversations');
    if (epoch === identityEpoch) conversations.value = data;
  };
  const loadDefaultConfig = async () => {
    const data = await request.get('/chat/config');
    llmConfig.value = { configured: data.configured, model: data.model, defaultModelId: data.defaultModelId || '', models: data.models || [] };
  };
  const createConversation = async (title?: string, identity: { conversationType?: string; persona?: string; personaLabel?: string; customPersonaPrompt?: string } = {}) => {
    const epoch = identityEpoch;
    const data = await request.post<Conversation>('/chat/conversations', { title, ...identity });
    if (epoch !== identityEpoch) throw new Error('登录账号已切换，请重新操作');
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
    let data = await request.get<Message[]>('/chat/conversations/' + conversation.id + '/messages');
    const failed = failedAttempts.value[conversation.id];
    if (failed?.runId && failed.reply.failure && !failed.reply.failure.retryable) {
      try {
        const state = await request.get<Run>('/chat/runs/' + failed.runId);
        if (stamp === selection && failedAttempts.value[conversation.id] === failed) {
          if (state.status === 'COMPLETED') {
            delete failedAttempts.value[conversation.id];
            data = await request.get<Message[]>('/chat/conversations/' + conversation.id + '/messages');
          } else if (state.status === 'FAILED' || state.status === 'CANCELLED') {
            retainFailedFileRecovery(failed.reply, state);
            failed.reply.failure.cancelled = state.status === 'CANCELLED';
            failed.reply.failure.retryable = true;
            failed.reply.failure.message = state.status === 'CANCELLED' ? '已停止生成' : failureMessageFor(state);
          }
        }
      } catch { /* Retain the interrupted attempt until its durable result is known. */ }
    }
    const active = conversationRuns.value[conversation.id];
    let appendPending = !!active?.question && !!active.reply && !active.settled;
    if (appendPending && active.runId) {
      const state = await request.get<Run>('/chat/runs/' + active.runId);
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(state.status)) {
        appendPending = false;
        if (state.status === 'COMPLETED') data = await request.get<Message[]>('/chat/conversations/' + conversation.id + '/messages');
      }
    }
    if (stamp === selection) {
      messages.value = data.map(m => ({ ...m, role: m.role.toLowerCase() as Message['role'] }));
      if (appendPending && active?.question && active.reply)
        messages.value.push(active.question, active.reply);
      else if (failedAttempts.value[conversation.id]) {
        const attempt = failedAttempts.value[conversation.id];
        messages.value.push(attempt.question, attempt.reply);
      }
    }
    } finally { if (stamp === selection) isLoadingConversation.value = false; }
  };
  const stopGeneration = (conversationId = currentConversation.value?.id) => {
    const active = conversationId ? conversationRuns.value[conversationId] : preparingRun.value;
    if (!active) return;
    if (localWorkspace?.value?.conversationId === conversationId) disconnectLocalWorkspace();
    active.controller.abort();
    if (active.runId) void request.delete('/chat/runs/' + active.runId).catch(() => undefined);
    // This conversation's finally owns its lock; other conversations remain available.
  };
  const deleteConversation = async (id: number) => {
    stopGeneration(id);
    await request.delete('/chat/conversations/' + id);
    conversations.value = conversations.value.filter(c => c.id !== id);
    delete conversationSettings.value[id];
    delete navigation.value.scroll[id]; delete drafts.value[id];
    delete draftAttachments.value[id];
    delete failedAttempts.value[id];
    if (currentConversation.value?.id === id) clearSelection(); else persistNavigation();
  };
  const deleteMessage = async (id: number) => {
    if (!currentConversation.value || isStreaming.value) return;
    await request.delete('/chat/conversations/' + currentConversation.value.id + '/messages/' + id);
    messages.value = messages.value.filter(m => m.id !== id);
  };
  const dismissFailedAttempt = (cid: number) => {
    delete failedAttempts.value[cid];
    if (currentConversation.value?.id === cid)
      messages.value = messages.value.filter(message => !message.localAttempt);
  };

  const send = async (question: string, mode: 'normal' | 'agent', enabledSkills?: string[],
    persona?: string, customSystemPrompt?: string, knowledgeBaseId?: number, onStream?: (text: string) => void, codingWorkspaceId?: string,
    attachments?:{files:ChatFile[];onAccepted?:()=>void}, resumeInput?: FileResumePointer) => {
    const resumeFile = readFileResume(resumeInput);
    if (resumeInput !== undefined && !resumeFile) throw new Error('文件草稿信息无效，请刷新对话后重试');
    const initialConversation = currentConversation.value, initialSelection = selection;
    if ((initialConversation ? isConversationStreaming(initialConversation.id) : !!preparingRun.value) ||
      (!question.trim()&&!attachments?.files.length&&!resumeFile)) return false;
    if (resumeFile && initialConversation?.conversationType !== 'ASSISTANT') throw new Error('请在原普通 AI 会话继续完成文件');
    const visibleQuestion = resumeFile ? '继续完成文件' : question;
    let completed=false;
    const controller = new AbortController();
    const sendingEpoch = identityEpoch, startedAt = Date.now();
    let cid = initialConversation?.id;
    let runtime: ConversationRun = { controller, epoch: sendingEpoch };
    if (cid) { conversationRuns.value[cid] = runtime; runtime = conversationRuns.value[cid]; }
    else { preparingRun.value = runtime; runtime = preparingRun.value; }
    const ownsAttempt = () => sendingEpoch === identityEpoch &&
      (cid ? conversationRuns.value[cid]?.controller === controller : preparingRun.value?.controller === controller);
    let questionMessage: Message | undefined, reply: Message | undefined;
    let failureMessage = '', cancelled = false, retryable = true;
    let runId: string | undefined;
    try {
      let conversation = initialConversation;
      if (!conversation) {
        conversation = await createConversation(question.slice(0, 30), {
          conversationType: persona ? 'ROLEPLAY' : 'ASSISTANT', persona, customPersonaPrompt: customSystemPrompt });
        if (!ownsAttempt() || controller.signal.aborted) return false;
        cid = conversation.id;
        conversationRuns.value[cid] = runtime; runtime = conversationRuns.value[cid];
        if (preparingRun.value?.controller === controller) preparingRun.value = null;
        if (selection === initialSelection && !currentConversation.value) await selectConversation(conversation);
      }
      if (!ownsAttempt() || controller.signal.aborted) return false;
      cid = conversation.id;
      dismissFailedAttempt(cid);
      runtime.question = { id: -Date.now(), role: 'user', content: visibleQuestion,
        conversationId: cid, createdAt: new Date().toISOString(),
        ...(attachments?.files.length || resumeFile ? { ragMetadata: {
          ...(attachments?.files.length ? { messageAttachments: attachments.files } : {}), ...(resumeFile ? { resumeFile } : {}) } } : {}) };
      const responseOptions = conversationResponseOptions(getConversationSettings(cid), conversation.conversationType);
      runtime.reply = { id: -Date.now() - 1, role: 'assistant', content: '', pending: true,
        conversationId: cid, createdAt: new Date().toISOString(), ragMetadata: { responseOptions } };
      questionMessage = runtime.question; reply = runtime.reply;
      if (currentConversation.value?.id === cid) messages.value.push(questionMessage, reply);
      // Admit once; subscribe/reconnect to the durable run without repeating model calls.
      const run = await request.post<Run>('/chat/runs', { requestId: crypto.randomUUID(),
        conversationId: cid, question: visibleQuestion, mode, enabledSkills: enabledSkills?.filter(skill => skill !== 'web_search'),
        ...(resumeFile ? { resumeFile } : {}),
        ...responseOptions, codingWorkspaceId, persona: persona || undefined,
        attachments:attachments?.files.length?attachments.files.map(chatFileRef):undefined,
        customSystemPrompt: customSystemPrompt || undefined, knowledgeBaseId: knowledgeBaseId || undefined,
        modelId: selectedModelId(cid) });
      if (!ownsAttempt() || !run.id) return false;
      runId = runtime.runId = run.id;
      attachments?.onAccepted?.();
      if (controller.signal.aborted) { await request.delete('/chat/runs/' + run.id); return false; }
      const status: Run = await watchChatRun(run.id, controller.signal, text => {
        if (ownsAttempt() && reply) { reply.content += text; onStream?.(text); }
      }, progress => { if (ownsAttempt() && reply) reply.ragMetadata = { ...reply.ragMetadata, performance: progress }; });
      if (!ownsAttempt()) return false;
      if (status.status === 'COMPLETED') {
        completed=true;
        reply.content = status.result?.content || reply.content;
        reply.ragMetadata = status.result?.ragMetadata;
      } else {
        retainFailedFileRecovery(reply, status);
        cancelled = status.status === 'CANCELLED';
        failureMessage = cancelled ? '已停止生成' : failureMessageFor(status);
      }
    } catch (error: any) {
      cancelled = controller.signal.aborted;
      failureMessage = cancelled ? '已停止生成' : error?.message || '本次回答未生成，请重新发送';
      if (!questionMessage && ownsAttempt() && !cancelled) throw error;
      if (ownsAttempt() && runId && !cancelled) {
        // A broken connection does not imply that the durable model task failed.
        // Inspect its existing state before offering an action that creates a new task.
        retryable = false;
        try {
          const state = await request.get<Run>('/chat/runs/' + runId);
          if (state.status === 'COMPLETED' && reply) {
            completed = true; reply.content = state.result?.content || reply.content;
            reply.ragMetadata = state.result?.ragMetadata;
          } else if (state.status === 'FAILED' || state.status === 'CANCELLED') {
            retainFailedFileRecovery(reply, state);
            cancelled = state.status === 'CANCELLED'; retryable = true;
            failureMessage = cancelled ? '已停止生成' : failureMessageFor(state);
          } else failureMessage = '连接已中断，回答可能仍在生成，请稍后重新打开对话查看';
        } catch { failureMessage = '连接已中断，暂时无法确认生成结果，请稍后重新打开对话查看'; }
      }
    } finally {
      if (ownsAttempt()) {
        runtime.settled = true;
        if (reply) reply.pending = false;
        if (!completed && cid && questionMessage && reply && conversations.value.some(conversation => conversation.id === cid)) {
          const measured = reply.ragMetadata?.performance?.elapsedMs;
          const elapsedMs = Math.max(Date.now() - startedAt, typeof measured === 'number' && Number.isFinite(measured) ? measured : 0);
          questionMessage.localAttempt = true; reply.localAttempt = true;
          reply.content = '';
          reply.failure = { message: failureMessage || '已停止生成', elapsedMs, cancelled: cancelled || controller.signal.aborted, retryable };
          failedAttempts.value[cid] = { question: questionMessage, reply, runId };
        }
        if (currentConversation.value && currentConversation.value.id === cid) {
          try { await selectConversation(currentConversation.value); } catch { /* The visible local attempt survives network loss. */ }
        }
        if (cid && conversationRuns.value[cid]?.controller === controller) delete conversationRuns.value[cid];
        if (preparingRun.value?.controller === controller) preparingRun.value = null;
        void loadConversations().catch(() => undefined);
      }
    }
    return completed;
  };
  const sendMessage = (question: string, onStream?: (text: string) => void) =>
    send(question, 'normal', [], undefined, undefined, undefined, onStream);
  const resetForUser = () => {
    disconnectLocalWorkspace(false); // Credentials are changing; expired browser leases fail closed.
    identityEpoch++; navigation.value = emptyChatNavigation(0); drafts.value = {}; draftAttachments.value={}; failedAttempts.value={}; isLoadingConversation.value = false;
    try { sessionStorage.removeItem(CHAT_NAVIGATION_KEY); } catch { /* Storage may be blocked. */ }
    selection++;
    for (const active of Object.values(conversationRuns.value)) active.controller.abort();
    preparingRun.value?.controller.abort();
    conversationRuns.value = {}; preparingRun.value = null;
    conversations.value = []; currentConversation.value = null; messages.value = [];
    conversationSettings.value = {};
    preferredModelId.value = '';
  };
  const sendMessageAgent = (question: string, enabledSkills?: string[], persona?: string,
    customSystemPrompt?: string, knowledgeBaseId?: number, onStream?: (text: string) => void) =>
    send(question, 'agent', enabledSkills, persona, customSystemPrompt, knowledgeBaseId, onStream);

  return { conversations, currentConversation, messages, llmConfig, preferredModelId, isStreaming, conversationSettings,
    navigation, drafts, draftAttachments, failedAttempts, dismissFailedAttempt, isLoadingConversation, initializeNavigation, setSpace, saveView,
    getConversationSettings, saveConversationSettings, selectedModelId, loadConversations, loadDefaultConfig,
    createConversation, configureIdentity, clearSelection, updateConversation, deleteConversation, deleteMessage, selectConversation,
    sendMessage, sendMessageAgent, sendConfigured: send, stopGeneration, abortController, isConversationStreaming, resetForUser };
}, { persist: { key: 'chatforum-chat', storage: localStorage, paths: ['conversationSettings', 'preferredModelId'] } });
