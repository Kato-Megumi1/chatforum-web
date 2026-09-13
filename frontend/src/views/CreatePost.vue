<template>
  <div class="create-post-container">
    <div class="create-post-wrapper">
      <el-page-header @back="$router.back()" title="返回" class="page-header" />
      <div class="create-post-main">
        <h1 class="page-title">发布帖子</h1>
        <el-form :model="form" label-position="top" class="post-form">
          <el-form-item label="标题">
            <el-input
              v-model="form.title"
              placeholder="请输入帖子标题"
              maxlength="100"
              show-word-limit
              size="large"
            />
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="分类">
                <el-select v-model="form.categoryId" placeholder="请选择分类" size="large" style="width: 100%">
                  <el-option
                    v-for="cat in categories"
                    :key="cat.id"
                    :label="cat.name"
                    :value="cat.id"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="标签">
                <el-select
                  v-model="form.tags"
                  multiple
                  filterable
                  allow-create
                  placeholder="选择或创建标签"
                  size="large"
                  style="width: 100%"
                >
                  <el-option v-for="tag in tags" :key="tag.id" :label="tag.name" :value="tag.name" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="内容">
            <el-input
              v-model="form.content"
              type="textarea"
              :rows="18"
              placeholder="想说什么就直接写吧..."
              class="content-textarea"
            />
          </el-form-item>
          <el-form-item>
            <div class="form-actions">
              <el-button type="primary" :loading="submitting" @click="handleSubmit" size="large" round class="btn-submit">
                发布帖子
              </el-button>
              <el-button size="large" round @click="$router.back()">取消</el-button>
            </div>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import request from '@/utils/request';

const router = useRouter();

const categories = ref<any[]>([]);
const tags = ref<any[]>([]);
const submitting = ref(false);

const form = reactive({
  title: '',
  categoryId: null as number | null,
  tags: [] as string[],
  content: '',
});

const loadCategories = async () => {
  const data = await request.get('/forum/categories');
  categories.value = (data as any).data || (data as unknown as any[]);
};

const loadTags = async () => {
  const data = await request.get('/forum/tags');
  tags.value = (data as any).data || (data as unknown as any[]);
};

const handleSubmit = async () => {
  if (!form.title.trim()) {
    ElMessage.warning('请输入标题');
    return;
  }

  if (!form.categoryId) {
    ElMessage.warning('请选择分类');
    return;
  }

  if (!form.content.trim()) {
    ElMessage.warning('请输入内容');
    return;
  }

  submitting.value = true;
  try {
    const data = await request.post('/forum/posts', {
      title: form.title.trim(),
      categoryId: form.categoryId,
      tags: form.tags,
      content: form.content.trim(),
    });
    ElMessage.success('发布成功');
    router.push(`/forum/post/${(data as any).id}`);
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  loadCategories();
  loadTags();
});
</script>

<style lang="scss" scoped>
.create-post-container {
  height: 100%;
  overflow-y: auto;
  background: var(--bg-page);
}

.create-post-wrapper {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px 20px;
}

.page-header {
  margin-bottom: 16px;
}

.create-post-main {
  background: #fff;
  border-radius: var(--radius-lg);
  padding: 36px;
  box-shadow: var(--shadow-sm);
}

.page-title {
  margin: 0 0 28px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.post-form {
  :deep(.el-form-item__label) {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 14px;
  }

  :deep(.el-input__wrapper),
  :deep(.el-select .el-input__wrapper) {
    border-radius: var(--radius-sm);
  }
}

.content-textarea {
  :deep(.el-textarea__inner) {
    border-radius: var(--radius-sm);
    resize: vertical;
    font-size: 14px;
    line-height: 1.8;
    box-shadow: none;
  }
}

.form-actions {
  display: flex;
  gap: 12px;
}

.btn-submit {
  box-shadow: 0 4px 14px rgba(22, 93, 255, 0.3);
  transition: all var(--transition);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(22, 93, 255, 0.4);
  }
}
</style>
