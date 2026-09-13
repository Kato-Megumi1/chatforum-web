<template>
  <div class="post-page"><div class="post-wrapper">
    <el-page-header @back="$router.back()" title="返回讨论" />
    <el-skeleton v-if="loading" :rows="8" animated class="post-card" />
    <el-empty v-else-if="!post" description="帖子暂时无法访问"><el-button @click="load">重试</el-button></el-empty>
    <article v-else class="post-card">
      <div class="eyebrow">COMMUNITY · 原作与日常</div>
      <h1>{{ post.title }}</h1>
      <div class="post-meta">
        <el-avatar :size="36" :src="post.user.avatar">{{ post.user.username.slice(0, 1) }}</el-avatar>
        <strong>{{ post.user.username }}</strong><span>{{ formatTime(post.createdAt) }}</span>
        <span>{{ post.viewCount }} 阅读 · {{ post.commentCount }} 条评论</span>
      </div>
      <div class="post-content">{{ post.content }}</div>
      <div class="tags"><el-tag v-for="pt in post.tags" :key="pt.tag.id" effect="plain" round>{{ pt.tag.name }}</el-tag></div>
      <div class="post-actions">
        <el-button round :type="post.isLiked ? 'primary' : 'default'" :loading="busy.has('like')" @click="togglePost('like')">{{ post.isLiked ? '已点赞' : '点赞' }} {{ post.likeCount }}</el-button>
        <el-button round :type="post.isFavorited ? 'primary' : 'default'" :loading="busy.has('favorite')" @click="togglePost('favorite')">{{ post.isFavorited ? '已收藏' : '收藏' }}</el-button>
      </div>
      <section class="discussion">
        <div class="discussion-heading"><h2>一起聊聊 <span>{{ post.commentCount }}</span></h2>
          <el-select v-model="sortOrder" aria-label="评论排序" style="width:120px" @change="changeSort">
            <el-option label="最新优先" value="desc" /><el-option label="最早优先" value="asc" />
          </el-select>
        </div>
        <p class="hint">聊聊你的看法；涉及后续剧情时，记得先提醒剧透。</p>
        <div v-if="userStore.user" class="composer">
          <el-input v-model="commentText" type="textarea" :rows="3" maxlength="4000" show-word-limit placeholder="哪一个瞬间让你印象最深？" aria-label="评论内容" />
          <div class="composer-actions"><span>友善讨论，尊重不同解读</span><el-button type="primary" round :loading="submitting" :disabled="!commentText.trim()" @click="submitComment">发表评论</el-button></div>
        </div>
        <el-button v-else plain round @click="$router.push('/login')">登录后参与讨论</el-button>
        <div v-loading="commentsLoading" class="comments">
          <el-empty v-if="!comments.length && !commentsLoading" :image-size="72" description="还没有评论，来开启这段讨论吧" />
          <div v-for="comment in comments" :key="comment.id" class="comment">
            <el-avatar :size="36" :src="comment.user.avatar">{{ comment.user.username.slice(0, 1) }}</el-avatar>
            <div class="comment-body">
              <div class="comment-meta"><strong>{{ comment.user.username }}</strong><span>{{ formatTime(comment.createdAt) }}</span></div>
              <p class="comment-text" :class="{ deleted: comment.status === 'DELETED' }">{{ comment.content }}</p>
              <div class="comment-actions" v-if="comment.status !== 'DELETED'">
                <el-button link :type="comment.isLiked ? 'primary' : 'info'" :disabled="busy.has('c' + comment.id)" @click="toggleComment(comment)">赞 {{ comment.likeCount || '' }}</el-button>
                <el-button v-if="userStore.user" link @click="beginReply(comment)">回复</el-button>
                <el-button v-if="comment.canDelete" link type="danger" :disabled="busy.has('d' + comment.id)" @click="removeComment(comment)">删除</el-button>
              </div>
              <div v-if="replyTo === comment.id" class="reply-composer">
                <el-input v-model="replyText" type="textarea" :rows="2" maxlength="4000" show-word-limit :placeholder="'回复 ' + comment.user.username" aria-label="回复内容" />
                <div class="composer-actions"><el-button link @click="replyTo = null">取消</el-button><el-button type="primary" size="small" :loading="replySubmitting" :disabled="!replyText.trim()" @click="submitReply(comment)">发送回复</el-button></div>
              </div>
              <div v-if="comment.replies?.length" class="replies">
                <div v-for="reply in comment.replies" :key="reply.id" class="reply">
                  <strong>{{ reply.user.username }}</strong><span class="reply-date">{{ formatTime(reply.createdAt) }}</span>
                  <p class="comment-text">{{ reply.content }}</p>
                  <el-button v-if="reply.canDelete" link size="small" type="danger" :disabled="busy.has('d' + reply.id)" @click="removeComment(reply)">删除</el-button>
                </div>
              </div>
              <el-button v-if="comment.replyCount > 3 && !expanded[comment.id]" link type="primary" :loading="busy.has('r' + comment.id)" @click="loadReplies(comment, 1)">查看全部 {{ comment.replyCount }} 条回复</el-button>
              <el-pagination v-if="expanded[comment.id] && comment.replyCount > 10" small layout="prev, pager, next" :pager-count="5" :page-size="10" :total="comment.replyCount" :current-page="expanded[comment.id]" @current-change="(p: number) => loadReplies(comment, p)" />
            </div>
          </div>
        </div>
        <el-pagination v-if="total > 10" class="pagination" background layout="prev, pager, next" :pager-count="5" :page-size="10" :total="total" v-model:current-page="page" @current-change="loadComments" />
      </section>
    </article>
  </div></div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '@/utils/request';
import { useUserStore } from '@/stores/user';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
dayjs.extend(relativeTime); dayjs.locale('zh-cn');
const route = useRoute(), userStore = useUserStore();
const post = ref<any>(null), comments = ref<any[]>([]), loading = ref(true), commentsLoading = ref(false);
const page = ref(1), total = ref(0), sortOrder = ref('desc'), commentText = ref(''), replyText = ref('');
const replyTo = ref<number | null>(null), submitting = ref(false), replySubmitting = ref(false);
const expanded = reactive<Record<number, number>>({}), busy = reactive(new Set<string>());
let generation = 0, commentRequest = 0;
const formatTime = (time: string) => dayjs(time).fromNow();
const loggedIn = () => { if (userStore.user) return true; ElMessage.warning('请先登录'); return false; };
async function loadComments() {
  const stamp = ++commentRequest, id = route.params.id;
  commentsLoading.value = true;
  try {
    const data: any = await request.get('/forum/posts/' + id + '/comments', { params: { page: page.value, limit: 10, sortOrder: sortOrder.value } });
    if (stamp !== commentRequest || id !== route.params.id) return;
    comments.value = data.data; total.value = data.total;
    if (post.value) post.value.commentCount = data.activeCount;
    Object.keys(expanded).forEach(key => delete expanded[Number(key)]);
  } catch { /* shared request handler displays errors; preserve editor contents */ }
  finally { if (stamp === commentRequest) commentsLoading.value = false; }
}
async function load() {
  const stamp = ++generation; loading.value = true; post.value = null;
  try { const data = await request.get('/forum/posts/' + route.params.id); if (stamp === generation) post.value = data; }
  catch { /* empty state offers retry */ }
  finally { if (stamp === generation) loading.value = false; }
  if (stamp === generation && post.value) await loadComments();
}
function changeSort() { page.value = 1; void loadComments(); }
async function locked(key: string, fn: () => Promise<void>) {
  if (busy.has(key)) return; busy.add(key);
  try { await fn(); } catch { /* request interceptor reports failures */ } finally { busy.delete(key); }
}
async function togglePost(kind: 'like' | 'favorite') {
  if (!loggedIn()) return;
  const target = post.value, field = kind === 'like' ? 'isLiked' : 'isFavorited';
  await locked(kind, async () => {
    const url = '/forum/posts/' + target.id + '/' + kind, was = !!target[field];
    if (was) await request.delete(url); else await request.post(url);
    target[field] = !was;
    if (kind === 'like') target.likeCount = Math.max(0, target.likeCount + (was ? -1 : 1));
  });
}
async function toggleComment(comment: any) {
  if (!loggedIn()) return;
  await locked('c' + comment.id, async () => {
    const url = '/forum/comments/' + comment.id + '/like', was = comment.isLiked;
    if (was) await request.delete(url); else await request.post(url);
    comment.isLiked = !was; comment.likeCount = Math.max(0, comment.likeCount + (was ? -1 : 1));
  });
}
function beginReply(comment: any) { if (replyTo.value !== comment.id) replyText.value = ''; replyTo.value = comment.id; }
async function submitComment() {
  if (submitting.value || !commentText.value.trim() || !loggedIn()) return;
  const id = post.value.id; submitting.value = true;
  try {
    await request.post('/forum/posts/' + id + '/comments', { content: commentText.value.trim() });
    if (id !== post.value?.id) return;
    commentText.value = ''; page.value = 1; sortOrder.value = 'desc'; await loadComments(); ElMessage.success('评论已发布');
  } catch { /* keep the draft on failure */ } finally { submitting.value = false; }
}
async function submitReply(comment: any) {
  if (replySubmitting.value || !replyText.value.trim() || !loggedIn()) return;
  const id = post.value.id; replySubmitting.value = true;
  try {
    await request.post('/forum/posts/' + id + '/comments', { content: replyText.value.trim(), parentId: comment.id });
    if (id !== post.value?.id) return;
    replyText.value = ''; replyTo.value = null; await loadComments(); ElMessage.success('回复已发布');
  } catch { /* keep the draft on failure */ } finally { replySubmitting.value = false; }
}
async function loadReplies(comment: any, nextPage: number) {
  await locked('r' + comment.id, async () => {
    const result: any = await request.get('/forum/posts/' + post.value.id + '/comments', { params: { parentId: comment.id, page: nextPage, limit: 10, sortOrder: 'asc' } });
    comment.replies = result.data; comment.replyCount = result.total; expanded[comment.id] = nextPage;
  });
}
async function removeComment(comment: any) {
  await locked('d' + comment.id, async () => {
    await ElMessageBox.confirm('删除后正文不再显示，其他人的回复会保留。', '删除这条评论？', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '保留' });
    await request.delete('/forum/comments/' + comment.id);
    if (comments.value.length === 1 && !comment.parentId && page.value > 1) page.value--;
    await loadComments();
  });
}
watch(() => route.params.id, () => { page.value = 1; commentText.value = ''; replyText.value = ''; replyTo.value = null; void load(); }, { immediate: true });
</script>

<style scoped lang="scss">
.post-page { height: 100%; overflow-y: auto; background: var(--bg-page); }
.post-wrapper { max-width: 860px; margin: auto; padding: 24px 20px 48px; }
.post-card { background: #fff; border: 1px solid var(--border-light); border-radius: 20px; padding: 36px; margin-top: 20px; box-shadow: 0 8px 32px #43566b08; }
.eyebrow { font-size: 11px; letter-spacing: 2px; color: var(--primary-color); font-weight: 600; }
h1 { font-size: 27px; line-height: 1.5; margin: 12px 0 18px; overflow-wrap: anywhere; }
.post-meta, .post-actions, .tags, .comment-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.post-meta, .comment-meta span, .hint, .reply-date { font-size: 12px; color: var(--text-secondary); }
.post-meta strong, .comment-meta strong { color: var(--text-primary); font-size: 14px; }
.post-content { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.95; padding: 28px 0; font-size: 15px; }
.post-actions { padding: 24px 0 4px; }
.discussion { border-top: 1px solid var(--border-light); margin-top: 32px; padding-top: 20px; }
.discussion-heading, .composer-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h2 { font-size: 19px; margin: 0; } h2 span { font-size: 12px; background: #f0f4f9; padding: 3px 8px; border-radius: 12px; margin-left: 6px; }
.hint { margin: 12px 0 20px; }
.composer { padding: 16px; background: #f7f9fc; border-radius: 14px; }
.composer-actions { margin-top: 12px; } .composer-actions span { color: var(--text-secondary); font-size: 12px; }
.comments { min-height: 80px; margin-top: 24px; }
.comment { display: flex; gap: 12px; border-bottom: 1px solid var(--border-light); padding: 22px 0; }
.comment > .el-avatar { flex-shrink: 0; } .comment-body { flex: 1; min-width: 0; }
.comment-text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.75; font-size: 14px; margin: 10px 0 6px; }
.deleted { color: var(--text-secondary); font-style: italic; }
.replies { background: #f7f9fc; border-radius: 12px; margin-top: 12px; padding: 4px 14px; }
.reply { padding: 12px 0; border-bottom: 1px solid #e8edf4; font-size: 13px; } .reply:last-child { border: none; }
.reply-date { margin-left: 10px; } .reply-composer { margin-top: 12px; }
.pagination { margin-top: 24px; justify-content: center; }
@media (max-width: 600px) { .post-wrapper { padding: 16px 12px 32px; } .post-card { padding: 22px 16px; border-radius: 14px; } h1 { font-size: 22px; } .composer { padding: 12px; } .composer-actions span { max-width: 100px; } }
</style>
