<template>
  <div class="profile-container">
    <div class="profile-wrapper">
      <el-page-header @back="$router.back()" title="返回" class="page-header" />
      <div class="profile-main" v-if="userStore.user">
        <el-button v-if="CONNECTION_SETTINGS_ENABLED" class="mobile-profile-connection" plain @click="openConnection"><el-icon><Connection /></el-icon>后端连接设置</el-button>
        <div class="profile-card">
          <div class="avatar-section">
            <input
              ref="avatarInput"
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.webp"
              style="display:none"
              @change="handleAvatarFile"
            />
            <el-avatar :size="88" :src="userStore.user.avatar" :key="userStore.user.avatar" class="profile-avatar clickable" @click="avatarInput?.click()">
              {{ userStore.user.username.charAt(0).toUpperCase() }}
            </el-avatar>
            <div class="avatar-hint">点击更换头像</div>
          </div>
          <div class="info-section">
            <h1 class="profile-name">{{ userStore.user.username }}</h1>
            <div class="user-badges">
              <el-tag type="primary" effect="plain" round>Lv.{{ userStore.user.level }}</el-tag>
              <el-tag type="success" effect="plain" round>{{ userStore.user.points }} 积分</el-tag>
            </div>
            <p class="profile-bio" v-if="userStore.user.bio">{{ userStore.user.bio }}</p>
            <p class="profile-bio placeholder" v-else>还没有填写个人简介...</p>
          </div>
        </div>
        <el-tabs v-model="activeTab" class="profile-tabs">
          <el-tab-pane label="编辑资料" name="info">
            <el-form :model="profileForm" label-position="top" class="profile-form">
              <el-form-item label="用户名">
                <el-input v-model="profileForm.username" size="large" />
              </el-form-item>
              <el-form-item label="邮箱">
                <el-input v-model="profileForm.email" disabled size="large" />
              </el-form-item>
              <el-form-item label="个人简介">
                <el-input
                  v-model="profileForm.bio"
                  type="textarea"
                  :rows="4"
                  placeholder="介绍一下自己..."
                  maxlength="200"
                  show-word-limit
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" size="large" round @click="handleUpdateProfile" :loading="updating">
                  保存修改
                </el-button>
              </el-form-item>
            </el-form>
          </el-tab-pane>
          <el-tab-pane label="账号安全" name="security">
            <div class="security-section">
              <div class="security-item">
                <div class="security-info">
                  <div class="security-label">邮箱</div>
                  <div class="security-value">{{ userStore.user.email }}</div>
                </div>
                <el-tag type="success" effect="plain" size="small">已绑定</el-tag>
              </div>
              <div class="security-item">
                <div class="security-info">
                  <div class="security-label">密码</div>
                  <div class="security-value">········</div>
                </div>
                <el-button link type="primary" size="small">修改</el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const openConnection = () => window.dispatchEvent(new Event('chatforum:connection-settings'));
import { apiUrl, normalizeMedia, CONNECTION_SETTINGS_ENABLED } from '@/utils/api';
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();

const activeTab = ref('info');
const updating = ref(false);

const avatarInput = ref<HTMLInputElement | null>(null);

const handleAvatarFile = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowed.includes(file.type)) {
    ElMessage.error('仅支持 JPG/PNG/GIF/WebP 格式');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('头像不能超过 5MB');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  const tokenStr = localStorage.getItem('chatforum-user');
  let authToken = '';
  if (tokenStr) {
    try { authToken = JSON.parse(tokenStr).token || ''; } catch { authToken = tokenStr; }
  }

  try {
    const res = await fetch(apiUrl('/users/avatar'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });
    const data = await res.json();
    if (data.success && data.data?.url) {
      // Refresh full profile from server to get updated avatar
      try {
        const profileRes = await fetch(apiUrl('/users/profile'), {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const profileData = await profileRes.json();
        if (profileData.success && profileData.data) {
          userStore.setUser(normalizeMedia(profileData.data));
        }
      } catch {}
      ElMessage.success('头像更新成功');
    } else {
      ElMessage.error(data.message || '上传失败');
    }
  } catch {
    ElMessage.error('头像上传失败');
  }

  // Reset input so same file can be re-selected
  input.value = '';
};

const profileForm = reactive({
  username: '',
  email: '',
  bio: '',
});

const handleUpdateProfile = async () => {
  if (!profileForm.username.trim()) {
    ElMessage.warning('用户名不能为空');
    return;
  }
  updating.value = true;
  try {
    await userStore.updateProfile({
      username: profileForm.username.trim(),
      bio: profileForm.bio.trim(),
    });
    ElMessage.success('保存成功');
  } finally {
    updating.value = false;
  }
};

onMounted(() => {
  if (userStore.user) {
    profileForm.username = userStore.user.username;
    profileForm.email = userStore.user.email;
    profileForm.bio = userStore.user.bio || '';
  }
});
</script>

<style lang="scss" scoped>
.profile-container {
  height: 100%;
  overflow-y: auto;
  background: var(--bg-page);
}

.profile-wrapper {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 20px;
}

.page-header {
  margin-bottom: 16px;
}

.profile-main {
  background: #fff;
  border-radius: var(--radius-lg);
  padding: 36px;
  box-shadow: var(--shadow-sm);
}

.profile-card {
  display: flex;
  gap: 24px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--border-light);
}

.avatar-section {
  flex-shrink: 0;
}

.profile-avatar {
  border: 3px solid var(--primary-bg);
  box-shadow: var(--shadow-sm);

  &.clickable {
    cursor: pointer;
    transition: opacity 0.2s;

    &:hover {
      opacity: 0.8;
    }
  }
}

.avatar-hint {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
}

.info-section {
  flex: 1;
  min-width: 0;
}

.profile-name {
  margin: 0 0 10px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.user-badges {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.profile-bio {
  font-size: 14px;
  color: var(--text-regular);
  margin: 0;
  line-height: 1.6;

  &.placeholder {
    color: var(--text-placeholder);
    font-style: italic;
  }
}

.profile-tabs {
  margin-top: 20px;

  :deep(.el-tabs__header) {
    margin-bottom: 24px;
  }
}

.profile-form {
  max-width: 480px;

  :deep(.el-form-item__label) {
    font-weight: 600;
    color: var(--text-primary);
  }

  :deep(.el-input__wrapper) {
    border-radius: var(--radius-sm);
  }
}

.security-section {
  max-width: 480px;
}

.security-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.security-info {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.security-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.security-value {
  font-size: 14px;
  color: var(--text-secondary);
}
.mobile-profile-connection { display: none; }
@media (max-width: 900px) {
  .profile-container { background: #faf9f7; }
  .profile-main { border: 1px solid #eee7eb; border-radius: 20px; box-shadow: none; }
  .mobile-profile-connection { display: flex; margin-bottom: 20px; border-radius: 12px; }
  .profile-wrapper { padding: 16px 12px 48px; }
  .profile-main { padding: 20px 16px; }
  .profile-card { flex-wrap: wrap; gap: 16px; }
  .info-section { flex-basis: 150px; overflow-wrap: anywhere; }
  .user-badges { flex-wrap: wrap; }
  .security-item { gap: 12px; }
}
</style>
