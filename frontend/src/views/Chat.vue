<template>
  <div class="chat-layout">
    <el-button class="mobile-conversations" @click="mobileSidebar = !mobileSidebar" :aria-expanded="mobileSidebar">对话列表</el-button>
    <button v-if="mobileSidebar" class="sidebar-backdrop" aria-label="关闭对话列表" @click="mobileSidebar = false"></button>
    <aside class="chat-sidebar" :class="{ 'mobile-open': mobileSidebar }">
      <div class="sidebar-header">
        <el-button type="primary" class="btn-new-chat" @click="handleNewChat(); mobileSidebar = false">
          <el-icon><Plus /></el-icon>
          新建对话
        </el-button>
      </div>
      <div class="sidebar-content">
        <div class="conversation-list">
          <div
            v-for="conv in chatStore.conversations"
            :key="conv.id"
            class="conversation-item"
            :class="{ active: chatStore.currentConversation?.id === conv.id }"
            @click="chatStore.selectConversation(conv); mobileSidebar = false"
          >
            <div class="conversation-icon">
              <el-icon><ChatDotRound /></el-icon>
            </div>
            <div class="conversation-info">
              <div class="conversation-title">{{ conv.title }}</div>
              <div class="conversation-time">{{ formatTime(conv.updatedAt) }}</div>
            </div>
            <el-dropdown trigger="click" @click.stop>
              <el-icon class="conversation-more"><MoreFilled /></el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="handleRenameConversation(conv)">
                    <el-icon><Edit /></el-icon>
                    重命名
                  </el-dropdown-item>
                  <el-dropdown-item @click="handlePinConversation(conv)">
                    <el-icon><Top /></el-icon>
                    {{ conv.isPinned ? '取消置顶' : '置顶' }}
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="handleDeleteConversation(conv)">
                    <el-icon><Delete /></el-icon>
                    删除
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <div v-if="chatStore.conversations.length === 0" class="sidebar-empty">
            <el-icon :size="40" color="#C9CDD4"><ChatDotRound /></el-icon>
            <p>暂无对话</p>
            <span>点击上方按钮开始</span>
          </div>
        </div>
      </div>
      <div class="sidebar-footer">
        <el-button class="btn-settings" @click="showSettings = true">
          <el-icon><Setting /></el-icon>
          模型设置
        </el-button>
      </div>
    </aside>
    <main class="chat-main" :class="{ 'persona-theme': hasPersonaActive }">
      <div v-if="!chatStore.currentConversation" class="chat-empty">
        <div class="empty-icon">
          <el-icon :size="56" color="var(--primary-color)">
            <ChatDotRound />
          </el-icon>
        </div>
        <h2>开始对话</h2>
        <p>选择一个对话或创建新对话以开始</p>
        <el-button type="primary" size="large" class="btn-start" @click="handleNewChat(); mobileSidebar = false">
          <el-icon><Plus /></el-icon>
          新建对话
        </el-button>
      </div>
      <div v-else class="chat-content">
        <div v-if="hasPersonaActive" class="persona-bar">
          <div class="persona-bar-avatar">
            <img v-if="selectedPersona === 'kato_megumi_persona'" :src="publicAsset('kato-megumi-avatar.jpg')" alt="加藤惠" />
            <div v-else class="persona-avatar-placeholder" :class="personaAvatarClass">{{ personaDisplayName[0] }}</div>
          </div>
          <span class="persona-bar-text">正在与 <strong>{{ personaDisplayName }}</strong> 对话中</span>
          <el-tag size="small" type="danger" effect="plain">角色扮演模式</el-tag>
        </div>
        <div class="chat-toolbar">
          <div class="toolbar-left">
            <div class="toolbar-item persona-select">
              <span class="toolbar-label">角色扮演</span>
              <el-select v-model="selectedPersona" size="small" placeholder="选择角色" class="toolbar-select" :class="{ 'has-persona': hasPersonaActive }">
                <el-option label="无" value="" />
                <el-option label="加藤惠" value="kato_megumi_persona" />
                <el-option label="雪之下雪乃" value="yukinoshita_yukino_persona" />
                <el-option label="自定义角色..." value="custom" />
              </el-select>
            </div>
            <div class="toolbar-item mode-toggle">
              <span class="toolbar-label">对话模式</span>
              <el-radio-group v-model="agentMode" size="small">
                <el-radio-button value="normal">普通</el-radio-button>
                <el-radio-button value="agent">Agent</el-radio-button>
              </el-radio-group>
            </div>
            <div class="toolbar-item kb-select">
              <span class="toolbar-label">知识库</span>
              <el-select v-model="selectedKnowledgeBaseId" aria-label="选择知识库" size="small" placeholder="不使用知识库" class="toolbar-select" clearable
                :loading="knowledgeLoading" :disabled="chatStore.isStreaming" @visible-change="(v: boolean) => v && loadKnowledgeBases()">
                <el-option label="不使用知识库" :value="0" />
                <el-option v-for="kb in knowledgeBases" :key="kb.id" :label="kb.name + (kb.chatReady ? '' : '（暂不可用）')"
                  :value="kb.id" :disabled="!kb.chatReady" :title="kb.chatUnavailableReason || kb.name" />
              </el-select>
            </div>
          </div>
          <div class="toolbar-right">
            <el-button size="small" @click="showSettings = true">
              <el-icon><Setting /></el-icon>
              设置
            </el-button>
          </div>
        </div>
        <div v-if="knowledgeError || selectedKnowledgeIssue" class="knowledge-notice" role="status">
          {{ knowledgeError || selectedKnowledgeIssue }}
          <el-button text type="primary" @click="loadKnowledgeBases">刷新列表</el-button>
        </div>
        <div v-if="selectedPersona === 'custom'" class="custom-persona-inline">
          <el-input v-model="customPersonaName" placeholder="角色名称" size="small" class="custom-name" />
          <el-input v-model="customPersonaPrompt" type="textarea" :rows="2" placeholder="自定义系统提示词..." size="small" class="custom-prompt" />
        </div>
        <div class="chat-messages" ref="messagesRef">
          <div
            v-for="(msg, idx) in chatStore.messages"
            :key="msg.id || idx"
            class="chat-message"
            :class="msg.role"
          >
            <div class="message-avatar">
              <div v-if="msg.role === 'user'" class="avatar-inner user-avatar-bg">
                <el-icon :size="18"><User /></el-icon>
              </div>
              <div v-else class="avatar-inner" :class="hasPersonaActive ? personaAvatarBgClass : 'ai-avatar-bg'">
                <img v-if="hasPersonaActive && selectedPersona === 'kato_megumi_persona'" :src="publicAsset('kato-megumi-avatar.jpg')" class="persona-avatar-img" alt="加藤惠" />
                <span v-else-if="hasPersonaActive" class="persona-avatar-text">{{ personaDisplayName[0] }}</span>
                <el-icon v-else :size="18"><Service /></el-icon>
              </div>
            </div>
            <div class="message-body">
              <div class="message-role">{{ msg.role === 'user' ? userDisplayName : aiDisplayName }}</div>
              <div class="message-bubble" :class="[msg.role, { 'thinking-bubble': msg.pending && !msg.content }]">
                <span v-if="msg.pending && !msg.content" class="typing-indicator" role="status" aria-label="正在思考"></span>
                <template v-else>
                <div v-if="hasToolResults(msg.content)" class="tool-results">
                  <div v-for="(result, idx) in getToolResults(msg.content)" :key="idx" class="tool-result-item">
                    <div class="tool-result-header">
                      <el-icon class="tool-icon"><MagicStick /></el-icon>
                      <span>技能调用结果</span>
                    </div>
                    <div class="tool-result-content" v-html="renderMarkdown(result)"></div>
                  </div>
                  <el-divider />
                </div>
                <div class="message-text" v-html="renderMarkdown(getCleanContent(msg.content))"></div>
                <RagEvidence :metadata="msg.ragMetadata" />
                </template>
              </div>
              <div
                v-if="msg.content && !msg.pending"
                class="message-actions"
                :class="{ 'is-pinned': clickedMsgId === msg.id }"
                @click.stop="clickedMsgId = clickedMsgId === msg.id ? null : msg.id"
              >
                <span class="actions-trigger">…</span>
                <span class="actions-menu">
                  <el-button link type="primary" size="small" @click.stop="copyMessage(msg.content)">
                    <el-icon><DocumentCopy /></el-icon>
                    复制
                  </el-button>
                  <el-button link type="danger" size="small" @click.stop="handleDeleteMessage(msg)">
                    <el-icon><Delete /></el-icon>
                    删除
                  </el-button>
                </span>
              </div>
            </div>
          </div>
          <div class="scroll-anchor" ref="scrollAnchor"></div>
        </div>
        <div class="chat-input-area">
          <div class="chat-input-wrapper">
            <el-input
              v-model="inputText"
              type="textarea"
              :rows="3"
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              @keydown.enter.prevent="handleKeyDown"
              :disabled="chatStore.isStreaming"
              class="chat-textarea"
            />
            <el-button
              v-if="chatStore.isStreaming"
              type="danger"
              circle
              class="btn-stop"
              @click="handleStopGeneration"
            >
              <el-icon><VideoPause /></el-icon>
            </el-button>
            <el-button
              v-else
              type="primary"
              :disabled="!inputText.trim()"
              class="btn-send"
              @click="handleSendMessage"
            >
              <el-icon><Promotion /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </main>
    <el-drawer v-model="showSettings" title="模型设置" size="min(420px, 100vw)" class="settings-drawer">
      <el-form label-position="top">
        <el-form-item label="对话模型（仅选择，不配置密钥）">
          <el-select v-model="selectedModelId" aria-label="设置中的对话模型" style="width: 100%" :disabled="chatStore.isStreaming">
            <el-option v-for="model in chatStore.llmConfig.models" :key="model.id" :label="model.label + (model.available ? '' : '（未配置）')"
              :value="model.id" :disabled="!model.available" />
          </el-select>
        </el-form-item>
        <p class="model-help">选择按对话保存在当前浏览器。普通聊天、Agent 和知识库回答均使用所选模型；密钥和接口地址仅由服务端维护。</p>
        <p v-for="model in chatStore.llmConfig.models.filter(m => !m.available)" :key="model.id" class="model-help">{{ model.label }}：{{ model.unavailableReason }}</p>
        <div v-if="agentMode === 'agent'" class="skills-section">
          <div class="skills-header">
            <span class="skills-label">已启用的技能</span>
            <el-button text type="primary" size="small" @click="toggleAllSkills">
              {{ enabledSkills.length === toolSkills.length ? '全部禁用' : '全部启用' }}
            </el-button>
          </div>
          <div class="skills-grid">
            <el-checkbox-group v-model="enabledSkills">
              <div v-for="skill in toolSkills" :key="skill.name" class="skill-item">
                <el-checkbox :value="skill.name" :label="skill.name" border>
                  <div class="skill-info">
                    <span class="skill-name">{{ skill.description }}</span>
                    <el-tag size="small" type="info" effect="plain">{{ skill.category }}</el-tag>
                  </div>
                </el-checkbox>
              </div>
            </el-checkbox-group>
          </div>
        </div>
        <el-divider />
        <el-alert :type="chatStore.llmConfig.configured ? 'success' : 'warning'" :closable="false"
          :title="selectedModel?.available ? '当前选择：' + selectedModel.label : '所选模型不可用，请联系管理员'"
          description="提问与相关原文片段会发送给所选模型的服务商；小说正文不会获得工具权限。不会自动改用其他模型。" />
      </el-form>
    </el-drawer>
    <el-dialog v-model="showRenameDialog" title="重命名对话" width="400px" class="rename-dialog">
      <el-input v-model="renameTitle" placeholder="请输入新标题" size="large" />
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmRename">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import RagEvidence from '@/components/RagEvidence.vue';
import { publicAsset } from '@/utils/api';
import { useChatStore } from '@/stores/chat';
import { useUserStore } from '@/stores/user';
import dayjs from 'dayjs';
import request from '@/utils/request';
import { useRoute, useRouter } from 'vue-router';

const chatStore = useChatStore();
const router = useRouter(), route = useRoute();
const mobileSidebar = ref(false);
const userStore = useUserStore();
const messagesRef = ref<HTMLElement>();
const scrollAnchor = ref<HTMLElement>();
const inputText = ref('');
const showSettings = ref(false);
const showRenameDialog = ref(false);
const renameTitle = ref('');
const renamingConversation = ref<any>(null);
const skills = ref<any[]>([]);
const enabledSkills = ref<string[]>([]);
const knowledgeBases = ref<any[]>([]);
const knowledgeLoading = ref(false), knowledgeError = ref('');
const clickedMsgId = ref<number | null>(null);

// Mode & persona settings, persisted per-conversation via chat store
const agentMode = computed({
  get: () => {
    const cid = chatStore.currentConversation?.id;
    return cid ? chatStore.getConversationSettings(cid).agentMode : 'normal';
  },
  set: (val: string) => {
    const cid = chatStore.currentConversation?.id;
    if (cid) chatStore.saveConversationSettings(cid, { agentMode: val });
  },
});

const selectedPersona = computed({
  get: () => {
    const cid = chatStore.currentConversation?.id;
    return cid ? chatStore.getConversationSettings(cid).selectedPersona : '';
  },
  set: (val: string) => {
    const cid = chatStore.currentConversation?.id;
    if (cid) chatStore.saveConversationSettings(cid, { selectedPersona: val });
  },
});

const customPersonaName = computed({
  get: () => {
    const cid = chatStore.currentConversation?.id;
    return cid ? chatStore.getConversationSettings(cid).customPersonaName : '';
  },
  set: (val: string) => {
    const cid = chatStore.currentConversation?.id;
    if (cid) chatStore.saveConversationSettings(cid, { customPersonaName: val });
  },
});

const customPersonaPrompt = computed({
  get: () => {
    const cid = chatStore.currentConversation?.id;
    return cid ? chatStore.getConversationSettings(cid).customPersonaPrompt : '';
  },
  set: (val: string) => {
    const cid = chatStore.currentConversation?.id;
    if (cid) chatStore.saveConversationSettings(cid, { customPersonaPrompt: val });
  },
});

const selectedKnowledgeBaseId = computed({
  get: () => {
    const cid = chatStore.currentConversation?.id;
    return cid ? chatStore.getConversationSettings(cid).knowledgeBaseId : 0;
  },
  set: (val: number) => {
    const cid = chatStore.currentConversation?.id;
    if (cid) chatStore.saveConversationSettings(cid, { knowledgeBaseId: val || 0 });
  },
});

const selectedModelId = computed({
  get: () => (chatStore.currentConversation ? chatStore.getConversationSettings(chatStore.currentConversation.id).modelId : '') ||
    chatStore.preferredModelId || chatStore.llmConfig.defaultModelId,
  set: (modelId: string) => {
    if (chatStore.currentConversation) chatStore.saveConversationSettings(chatStore.currentConversation.id, { modelId });
    else chatStore.preferredModelId = modelId;
  },
});
const selectedModel = computed(() => chatStore.llmConfig.models.find(m => m.id === selectedModelId.value));
const selectedKnowledgeIssue = computed(() => {
  if (!selectedKnowledgeBaseId.value || knowledgeLoading.value) return '';
  const kb = knowledgeBases.value.find(k => k.id === selectedKnowledgeBaseId.value);
  return !kb ? '所选知识库已不可访问，请重新选择；不会自动改为无知识库回答。' : !kb.chatReady ? kb.chatUnavailableReason : '';
});

const toolSkills = computed(() => {
  return skills.value.filter(s => s.category !== '角色扮演');
});

const personaMap: Record<string, { name: string; color: string }> = {
  kato_megumi_persona: { name: '加藤惠', color: '#E8A0BF' },
  yukinoshita_yukino_persona: { name: '雪之下雪乃', color: '#7B9EC7' },
};

const hasPersonaActive = computed(() => {
  return !!selectedPersona.value;
});

const personaDisplayName = computed(() => {
  if (selectedPersona.value === 'custom') return customPersonaName.value || '自定义角色';
  return personaMap[selectedPersona.value]?.name || '';
});

const personaAvatarClass = computed(() => {
  if (selectedPersona.value === 'kato_megumi_persona') return 'persona-avatar-megumi';
  if (selectedPersona.value === 'yukinoshita_yukino_persona') return 'persona-avatar-yukino';
  return 'persona-avatar-custom';
});

const personaAvatarBgClass = computed(() => {
  if (selectedPersona.value === 'kato_megumi_persona') return 'persona-avatar-bg persona-avatar-megumi';
  if (selectedPersona.value === 'yukinoshita_yukino_persona') return 'persona-avatar-bg persona-avatar-yukino';
  return 'persona-avatar-bg persona-avatar-custom';
});

const userDisplayName = computed(() => {
  return userStore.user?.username || '你';
});

const aiDisplayName = computed(() => {
  if (hasPersonaActive.value) return personaDisplayName.value;
  return 'AI 助手';
});

const scrollToBottom = () => {
  nextTick(() => {
    scrollAnchor.value?.scrollIntoView({ behavior: 'smooth' });
  });
};

const renderMarkdown = (content: string) => {
  return DOMPurify.sanitize(marked.parse(content, { async: false }) as string, { FORBID_TAGS: ['img', 'form', 'input'], FORBID_ATTR: ['style'] });
};

const formatTime = (time: string) => {
  const now = dayjs();
  const date = dayjs(time);
  if (now.isSame(date, 'day')) {
    return date.format('HH:mm');
  } else if (now.subtract(1, 'day').isSame(date, 'day')) {
    return '昨天 ' + date.format('HH:mm');
  } else {
    return date.format('MM-DD HH:mm');
  }
};

const copyMessage = (content: string) => {
  navigator.clipboard.writeText(content).then(() => {
    ElMessage.success('已复制');
  });
};

const handleDeleteMessage = async (msg: any) => {
  try {
    await ElMessageBox.confirm('确定要删除这条消息吗？', '删除消息', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  // Temp messages (string ID from Date.now()) just remove locally
  if (typeof msg.id === 'string') {
    chatStore.messages = chatStore.messages.filter((m) => m.id !== msg.id);
  } else {
    try {
      await chatStore.deleteMessage(msg.id);
    } catch (e: any) {
      ElMessage.error(e.message || '删除失败');
    }
  }
};

const handleStopGeneration = () => {
  chatStore.stopGeneration();
};

// Parse tool results from message content
const TOOL_RESULT_MARKER = '\n\n---SKILL_RESULT_START---\n\n';

const hasToolResults = (content: string): boolean => {
  return content.includes(TOOL_RESULT_MARKER);
};

const getToolResults = (content: string): string[] => {
  const parts = content.split(TOOL_RESULT_MARKER);
  const results: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    const endIdx = parts[i].indexOf('\n\n---SKILL_RESULT_END---\n\n');
    if (endIdx !== -1) {
      results.push(parts[i].substring(0, endIdx));
    } else {
      results.push(parts[i].replace(/\n\n$/, ''));
    }
  }
  return results;
};

const getCleanContent = (content: string): string => {
  // Remove tool result sections
  let clean = content;
  const marker = TOOL_RESULT_MARKER;
  let idx;
  while ((idx = clean.indexOf(marker)) !== -1) {
    const endMarker = '\n\n---SKILL_RESULT_END---\n\n';
    const endIdx = clean.indexOf(endMarker, idx);
    if (endIdx !== -1) {
      clean = clean.substring(0, idx) + clean.substring(endIdx + endMarker.length);
    } else {
      clean = clean.substring(0, idx);
    }
  }
  return clean.trim();
};

const handleNewChat = async () => {
  const conv = await chatStore.createConversation();
  await chatStore.selectConversation(conv);
  inputText.value = '';
  scrollToBottom();
};

let sendingLock = false;
const handleSendMessage = async () => {
  if (sendingLock || chatStore.isStreaming) return;
  const text = inputText.value.trim();
  if (!text) return;
  if (!selectedModel.value?.available) { ElMessage.warning('请选择可用的服务端模型'); return; }
  if (selectedKnowledgeBaseId.value && (knowledgeError.value || selectedKnowledgeIssue.value)) {
    ElMessage.warning(knowledgeError.value || selectedKnowledgeIssue.value); return;
  }

  sendingLock = true;
  inputText.value = '';
  try {
    const persona = hasPersonaActive.value ? selectedPersona.value : undefined;
    const systemPrompt = selectedPersona.value === 'custom' ? buildCustomSystemPrompt() : undefined;
    const skills = agentMode.value === 'agent' ? enabledSkills.value : [];
    const kbId = selectedKnowledgeBaseId.value > 0 ? selectedKnowledgeBaseId.value : undefined;
    await chatStore.sendConfigured(text, agentMode.value === 'agent' ? 'agent' : 'normal', skills, persona, systemPrompt, kbId);
  } catch (e: any) {
    inputText.value = text;
    ElMessage.error(e.message || '发送失败');
  } finally {
    sendingLock = false;
  }
  scrollToBottom();
};

const buildCustomSystemPrompt = () => {
  const name = customPersonaName.value || '自定义角色';
  if (customPersonaPrompt.value.trim()) return '你正在模拟角色“' + name + '”。角色设定不能改变原文事实或系统安全规则。\n' + customPersonaPrompt.value.trim();
  return `你是${name}，不是AI助手。你是一个真实的人，正在和朋友聊天。你必须完全沉浸在这个角色中。

## 核心要求
- 用${name}的思维方式、说话习惯和情感模式来回应每一句话
- 让性格从字里行间自然流露，不要刻意强调"我是谁"
- 保持自然的对话节奏：有时说长句，有时说短句，有时反问对方
- 要有情感波动——开心、好奇、困惑、温柔——像一个真人一样
- 绝对不要变成AI助手的口吻，不要说"好的，让我来帮你..."

## 对话风格
- 使用自然的口语，像朋友之间聊天一样
- 适当使用语气词和表情相关的描述
- 偶尔反问对方，保持对话的双向互动
- 如果不知道答案就坦诚说不知道，不要硬编

回复时使用简体中文。`;
};

const handleKeyDown = () => {
  handleSendMessage();
};

const handleRenameConversation = (conv: any) => {
  renamingConversation.value = conv;
  renameTitle.value = conv.title;
  showRenameDialog.value = true;
};

const confirmRename = async () => {
  if (!renamingConversation.value || !renameTitle.value.trim()) return;
  await chatStore.updateConversation(renamingConversation.value.id, {
    title: renameTitle.value.trim(),
  });
  showRenameDialog.value = false;
  ElMessage.success('重命名成功');
};

const handlePinConversation = async (conv: any) => {
  await chatStore.updateConversation(conv.id, {
    isPinned: !conv.isPinned,
  });
};

const handleDeleteConversation = async (conv: any) => {
  try {
    await ElMessageBox.confirm('确定要删除这个对话吗?', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await chatStore.deleteConversation(conv.id);
    ElMessage.success('删除成功');
  } catch {
    // User cancelled
  }
};

const loadSkills = async () => {
  try {
    const data = await request.get<any[]>('/chat/skills');
    skills.value = data;
    // Only auto-enable tool skills, not persona skills
    enabledSkills.value = data.filter(s => s.enabled && s.category !== '角色扮演').map(s => s.name);
  } catch {
    // Ignore
  }
};

const loadKnowledgeBases = async () => {
  if (knowledgeLoading.value) return;
  knowledgeLoading.value = true; knowledgeError.value = '';
  try {
    const data = await request.get<any[]>('/rag/knowledge-bases');
    knowledgeBases.value = data || [];
  } catch {
    knowledgeError.value = '知识库列表加载失败，请检查连接后重试。';
  } finally { knowledgeLoading.value = false; }
};

const toggleAllSkills = () => {
  if (enabledSkills.value.length === toolSkills.value.length) {
    enabledSkills.value = [];
  } else {
    enabledSkills.value = toolSkills.value.map(s => s.name);
  }
};

watch(
  () => chatStore.messages,
  () => scrollToBottom(),
  { deep: true }
);

onMounted(async () => {
  await Promise.allSettled([chatStore.loadDefaultConfig(), loadSkills(), loadKnowledgeBases()]);
  await chatStore.loadConversations();
  if (chatStore.conversations.length > 0) {
    await chatStore.selectConversation(chatStore.conversations[0]);
  }
  const requestedKb = Number(route.query.knowledgeBaseId);
  if (requestedKb > 0) {
    if (!chatStore.currentConversation) await chatStore.selectConversation(await chatStore.createConversation('知识库问答'));
    selectedKnowledgeBaseId.value = requestedKb;
    await router.replace({ path: '/chat', query: {} });
  }
});
</script>

<style lang="scss" scoped>
.knowledge-notice { padding: 8px 20px; color: #7e6040; font-size: 13px; background: #fff9ed; line-height: 1.6; }
.model-help { color: #677387; font-size: 13px; line-height: 1.7; margin: 8px 0 16px; }
.chat-layout {
  display: flex;
  height: 100%;
}

.chat-sidebar {
  width: 280px;
  background: #fff;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 16px;
}

.btn-new-chat {
  width: 100%;
  border-radius: var(--radius-sm);
  height: 42px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(22, 93, 255, 0.2);
  transition: all var(--transition);

  &:hover {
    box-shadow: 0 4px 14px rgba(22, 93, 255, 0.35);
    transform: translateY(-1px);
  }
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.sidebar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 16px;
  color: var(--text-secondary);

  p {
    margin: 12px 0 4px;
    font-size: 14px;
    color: var(--text-regular);
  }

  span {
    font-size: 12px;
  }
}

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.conversation-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
  position: relative;

  &:hover {
    background: var(--bg-page);

    .conversation-more {
      opacity: 1;
    }
  }

  &.active {
    background: var(--primary-bg);

    .conversation-icon {
      background: var(--primary-color);
      box-shadow: 0 2px 8px rgba(22, 93, 255, 0.3);
    }

    .conversation-title {
      color: var(--primary-color);
      font-weight: 600;
    }
  }
}

.conversation-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: #86909C;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  margin-right: 10px;
  flex-shrink: 0;
  transition: all var(--transition);
}

.conversation-info {
  flex: 1;
  min-width: 0;
}

.conversation-title {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.conversation-time {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.conversation-more {
  color: var(--text-secondary);
  padding: 4px;
  opacity: 0;
  transition: all var(--transition);
  border-radius: 4px;

  &:hover {
    background: #E5E6EB;
    color: var(--text-primary);
  }
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-light);
}

.btn-settings {
  width: 100%;
  border-radius: var(--radius-sm);
  color: var(--text-regular);
  transition: all var(--transition);

  &:hover {
    color: var(--primary-color);
    border-color: var(--primary-color);
  }
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  background: var(--bg-page);
}

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  .empty-icon {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: var(--primary-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 22px;
    color: var(--text-primary);
    font-weight: 600;
  }

  p {
    color: var(--text-secondary);
    margin: 0 0 28px;
    font-size: 14px;
  }
}

.btn-start {
  border-radius: 24px;
  padding: 12px 32px;
  height: 44px;
  font-weight: 500;
  box-shadow: 0 4px 14px rgba(22, 93, 255, 0.3);
}

.chat-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
}

.persona-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  margin: 16px 20px 0;
  background: linear-gradient(135deg, #FFF5F9, #FEF0F5);
  border: 1px solid #F2BED1;
  border-radius: var(--radius-md);
}

.persona-bar-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  border: 2px solid #E8A0BF;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.persona-bar-text {
  flex: 1;
  font-size: 13px;
  color: var(--text-regular);
}

/* Chat Toolbar */
.chat-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  margin: 0 20px;
  background: #fff;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-right: 6px;
  white-space: nowrap;
  line-height: 1;
  flex-shrink: 0;
}

.toolbar-item {
  display: flex;
  align-items: center;
  gap: 0;
}

.toolbar-select {
  width: 140px;
}

.toolbar-select.has-persona :deep(.el-input__wrapper) {
  border-color: #E8A0BF;
  box-shadow: 0 0 0 2px rgba(232, 160, 191, 0.15);
}

.custom-persona-inline {
  display: flex;
  gap: 8px;
  padding: 8px 20px;
  margin: 0 20px;
  background: #FFFBFC;
  border: 1px dashed #F2BED1;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  border-top: none;
}

.custom-persona-inline .custom-name {
  width: 140px;
  flex-shrink: 0;
}

.custom-persona-inline .custom-prompt {
  flex: 1;
}

/* Pink theme overrides when persona is active */
.chat-main.persona-theme {
  --primary-color: #E8A0BF;
  --primary-light: #F2BED1;
  --primary-bg: #FFF5F9;
}

.chat-main.persona-theme .btn-start {
  background: linear-gradient(135deg, #E8A0BF, #F2BED1);
  box-shadow: 0 4px 14px rgba(232, 160, 191, 0.35);
}

.chat-main.persona-theme .btn-new-chat {
  background: linear-gradient(135deg, #E8A0BF, #F2BED1);
  border-color: #E8A0BF;
}

.chat-main.persona-theme .btn-send {
  background: linear-gradient(135deg, #E8A0BF, #F2BED1);
  box-shadow: 0 2px 8px rgba(232, 160, 191, 0.35);
}

.chat-main.persona-theme .btn-send:hover:not(:disabled) {
  box-shadow: 0 4px 14px rgba(232, 160, 191, 0.45);
}

.chat-main.persona-theme .chat-input-wrapper:focus-within {
  border-color: #E8A0BF;
  box-shadow: 0 0 0 3px rgba(232, 160, 191, 0.12);
}

.chat-main.persona-theme .conversation-item.active {
  background: #FFF5F9;
}

.chat-main.persona-theme .conversation-item.active .conversation-icon {
  background: linear-gradient(135deg, #E8A0BF, #F2BED1);
}

.chat-main.persona-theme .conversation-item.active .conversation-title {
  color: #E8A0BF;
}

.chat-main.persona-theme .typing-indicator,
.chat-main.persona-theme .typing-indicator::before,
.chat-main.persona-theme .typing-indicator::after {
  background: #E8A0BF;
}

.chat-main.persona-theme .assistant .message-bubble {
  border-left: 3px solid #F2BED1;
  background: #FFFBFC;
}

.chat-main.persona-theme .user-avatar-bg {
  background: linear-gradient(135deg, #E8A0BF, #F2BED1);
}

/* Additional beautification */
.chat-messages {
  scroll-behavior: smooth;
  padding: 20px 24px;
}

.chat-messages::-webkit-scrollbar {
  width: 5px;
}

.chat-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: #E5E6EB;
  border-radius: 10px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: #C9CDD4;
}

.btn-send {
  transition: all 0.25s ease;
}

.chat-input-wrapper {
  transition: all 0.25s ease;
  border-radius: 12px;
}

.chat-input-wrapper:focus-within {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(22, 93, 255, 0.1);
}

.message-bubble {
  transition: all 0.2s ease;
}

.message-bubble:hover {
  transform: translateY(-1px);
}

.conversation-item {
  transition: all 0.2s ease;
  border-radius: 10px;
  margin: 1px 0;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
}

.chat-message {
  display: flex;
  gap: 12px;
  margin-bottom: 28px;
  animation: messageIn 0.3s ease-out;

  &.user {
    flex-direction: row-reverse;

    .message-body {
      align-items: flex-end;
    }

    .message-bubble {
      background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
      color: #fff;
      border-radius: 16px 4px 16px 16px;

      :deep(.markdown-body) {
        color: rgba(255, 255, 255, 0.95);
        code {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }
        pre {
          background: rgba(0, 0, 0, 0.3);
        }
        a {
          color: #fff;
        }
      }
    }

    .message-actions {
      justify-content: flex-end;
    }
  }

  &.assistant {
    .message-bubble {
      background: #fff;
      border-radius: 4px 16px 16px 16px;
      box-shadow: var(--shadow-sm);
    }
  }
}

@keyframes messageIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-avatar {
  flex-shrink: 0;
  padding-top: 4px;
}

.avatar-inner {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.user-avatar-bg {
  background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
}

.ai-avatar-bg {
  background: linear-gradient(135deg, #10B981, #34D399);
}

.persona-avatar-bg {
  background: linear-gradient(135deg, #E8A0BF, #F2BED1);
  overflow: hidden;
  padding: 0;
}

.persona-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.persona-avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  border-radius: 50%;
}

.persona-avatar-text {
  color: #fff;
  font-weight: 600;
  font-size: 14px;
}

.persona-avatar-megumi {
  background: linear-gradient(135deg, #E8A0BF, #F2BED1);
}

.persona-avatar-yukino {
  background: linear-gradient(135deg, #7B9EC7, #A8C5E2);
}

.persona-avatar-custom {
  background: linear-gradient(135deg, #C9B1FF, #E0D4FF);
}

.persona-selector {
  width: 100%;
}

.persona-selector :deep(.el-radio-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.custom-persona-section {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-persona-name {
  width: 100%;
}

.custom-persona-prompt {
  width: 100%;
}

.message-body {
  max-width: 75%;
  display: flex;
  flex-direction: column;
}

.message-role {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  padding: 0 4px;
  font-weight: 500;
}

.tool-results {
  margin-bottom: 8px;
}

.tool-result-item {
  margin-bottom: 10px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #f0fdf4, #dcfce7);
  border-radius: var(--radius-sm);
  border-left: 3px solid #10b981;
}

.tool-result-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #059669;
  font-weight: 600;
  margin-bottom: 6px;
}

.tool-icon {
  font-size: 14px;
}

.tool-result-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.user .tool-result-item {
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.08), rgba(22, 93, 255, 0.15));
  border-left-color: var(--primary-color);
}

.user .tool-result-header {
  color: var(--primary-color);
}

.message-bubble {
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
  transition: box-shadow var(--transition);

  &:hover {
    box-shadow: var(--shadow-md);
  }
}

.message-text {
  :deep(.markdown-body) {
    font-size: 14px;
    line-height: 1.7;

    p:first-child { margin-top: 0; }
    p:last-child { margin-bottom: 0; }
    pre { margin: 8px 0; }
    code { font-size: 0.88em; }
  }
}

.thinking-bubble {
  padding: 16px 20px;
  display: flex;
  align-items: center;
}

.typing-indicator {
  display: inline-block;
  position: relative;
  width: 8px;
  height: 8px;
  background: var(--primary-color);
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out;

  &::before,
  &::after {
    content: '';
    position: absolute;
    top: 0;
    width: 8px;
    height: 8px;
    background: var(--primary-color);
    border-radius: 50%;
    animation: typing 1.4s infinite ease-in-out;
  }

  &::before {
    left: -16px;
    animation-delay: -0.32s;
  }

  &::after {
    left: 16px;
    animation-delay: 0.32s;
  }
}

@keyframes typing {
  0%, 80%, 100% {
    transform: scale(0.75);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.message-actions {
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  position: relative;
  cursor: default;

  .actions-trigger {
    display: inline-block;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-secondary, #909399);
    letter-spacing: 2px;
    padding: 0 6px;
    border-radius: 4px;
    transition: background 0.2s;
    user-select: none;
    line-height: 1.3;
    flex-shrink: 0;
  }

  .actions-menu {
    display: none;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  :deep(.el-button) {
    font-size: 12px;
  }

  // Hover → menu floats to left of …, … stays fixed
  &:hover .actions-menu {
    display: flex;
  }

  // Clicked/pinned → keep menu visible
  &.is-pinned .actions-menu {
    display: flex;
  }
}

// User (right): reverse flex so … stays at right, menu to its left
.chat-message.user .message-actions {
  justify-content: flex-end;
  flex-direction: row-reverse;
}

// Assistant (left): natural flex order — … then menu
// no override needed

.chat-input-area {
  padding: 16px 20px 20px;
}

.chat-input-wrapper {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  background: #fff;
  border-radius: var(--radius-md);
  padding: 10px 10px 10px 14px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
  transition: all var(--transition);

  &:focus-within {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(22, 93, 255, 0.1);
  }
}

.chat-textarea {
  flex: 1;

  :deep(.el-textarea__inner) {
    border: none;
    box-shadow: none;
    resize: none;
    padding: 4px 0;
    font-size: 14px;
    line-height: 1.6;
    background: transparent;

    &:focus {
      box-shadow: none;
    }
  }
}

.btn-send {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(22, 93, 255, 0.3);
  transition: all var(--transition);

  :deep(.el-icon) {
    margin: 0;
  }

  &:not(:disabled):hover {
    transform: scale(1.05);
    box-shadow: 0 4px 14px rgba(22, 93, 255, 0.4);
  }
}

.btn-stop {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(245, 63, 63, 0.3);
  animation: pulse-stop 1.5s infinite ease-in-out;

  :deep(.el-icon) {
    margin: 0;
  }

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 14px rgba(245, 63, 63, 0.45);
  }
}

@keyframes pulse-stop {
  0%, 100% { box-shadow: 0 2px 8px rgba(245, 63, 63, 0.3); }
  50% { box-shadow: 0 2px 16px rgba(245, 63, 63, 0.55); }
}

.settings-drawer {
  :deep(.el-drawer__header) {
    margin-bottom: 0;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color);
  }

  :deep(.el-drawer__body) {
    padding: 24px;
  }
}

.temp-slider {
  width: 100%;
}

.skills-section {
  margin-bottom: 16px;
}

.skills-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.skills-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.skills-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-item {
  :deep(.el-checkbox) {
    width: 100%;
    height: auto;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    transition: all var(--transition);
    margin: 0;
    
    .el-checkbox__label {
      width: 100%;
    }
  }
  
  :deep(.el-checkbox.is-checked) {
    background: var(--primary-bg);
    border-color: var(--primary-color);
  }
}

.skill-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 8px;
}

.skill-name {
  font-size: 13px;
  color: var(--text-regular);
  flex: 1;
}

.persona-skill {
  :deep(.el-checkbox) {
    border-color: #E8A0BF;
    background: linear-gradient(135deg, #FFF5F9, #FEF0F5);

    &.is-checked {
      background: linear-gradient(135deg, #FEF0F5, #FCE4EC);
      border-color: #E8A0BF;
    }
  }
}

.persona-tag {
  margin-left: 6px;
  font-size: 11px;
}

.mobile-conversations, .sidebar-backdrop { display: none; }
@media (max-width: 640px) {
  .chat-layout { flex-direction: column; position: relative; }
  .mobile-conversations { display: block; margin: 4px 8px; align-self: flex-start; min-height: 30px; }
  .chat-sidebar { position: absolute; left: 0; top: 38px; bottom: 0; z-index: 30;
    width: min(280px, 88vw); transform: translateX(-110%); transition: transform .2s; }
  .chat-sidebar.mobile-open { transform: translateX(0); }
  .sidebar-backdrop { display: block; position: absolute; inset: 38px 0 0; z-index: 29; border: 0; background: #0005; }
  .chat-main { min-width: 0; min-height: 0; }
  .chat-toolbar { margin: 0 8px; padding: 8px; gap: 8px; flex-wrap: wrap; }
  .toolbar-left { flex-wrap: wrap; gap: 8px; }
  .chat-messages { padding: 12px 8px; }
  .persona-bar { padding: 8px; flex-wrap: wrap; }
  .message-body { max-width: calc(100% - 44px); min-width: 0; }
  .message-bubble { max-width: 100%; }
}
</style>
