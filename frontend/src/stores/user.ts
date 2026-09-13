import { defineStore } from 'pinia';
import { ref } from 'vue';
import request from '@/utils/request';
import { useChatStore } from './chat';

interface User {
  id: number;
  email: string;
  username: string;
  avatar?: string;
  bio?: string;
  role: string;
  level: number;
  points: number;
  createdAt: string;
}

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const useUserStore = defineStore(
  'user',
  () => {
    const user = ref<User | null>(null);
    const token = ref<string>('');
    const refreshToken = ref<string>('');

    const setUser = (userData: User) => {
      if (user.value?.id !== userData.id) useChatStore().resetForUser();
      user.value = userData;
    };

    const setToken = (accessToken: string, refresh: string) => {
      token.value = accessToken;
      refreshToken.value = refresh;
    };

    const login = async (email: string, password: string) => {
      const data = await request.post<AuthResponse>('/auth/login', {
        email,
        password,
      });
      setUser(data.user);
      setToken(data.accessToken, data.refreshToken);
      return data;
    };

    const register = async (email: string, username: string, password: string, phone?: string) => {
      const data = await request.post<AuthResponse>('/auth/register', {
        email,
        username,
        password,
        phone,
      });
      setUser(data.user);
      setToken(data.accessToken, data.refreshToken);
      return data;
    };

    const clearAuth = () => {
      useChatStore().resetForUser();
      user.value = null;
      token.value = '';
      refreshToken.value = '';
    };

    const logout = async () => {
      try {
        await request.post('/auth/logout', {
          refreshToken: refreshToken.value,
        });
      } finally {
        clearAuth();
      }
    };

    const refresh = async () => {
      const data = await request.post<AuthResponse>('/auth/refresh', {
        refreshToken: refreshToken.value,
      });
      setUser(data.user);
      setToken(data.accessToken, data.refreshToken);
      return data;
    };

    const updateProfile = async (data: any) => {
      const userData = await request.put<User>('/users/profile', data);
      setUser(userData);
      return userData;
    };

    return {
      user,
      token,
      refreshToken,
      setUser,
      setToken,
      login,
      register,
      clearAuth,
      logout,
      refresh,
      updateProfile,
    };
  },
  {
    persist: {
      key: 'chatforum-user',
      storage: localStorage,
    },
  }
);
