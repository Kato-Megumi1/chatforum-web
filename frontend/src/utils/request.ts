import axios from 'axios';
import { API_BASE, apiUrl, normalizeMedia } from './api';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';

const http = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

http.interceptors.request.use(
  (config) => {
    const userStore = useUserStore();
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

http.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (response.config.responseType === 'blob') return res;
    if (res.success) {
      return normalizeMedia(res.data);
    } else {
      ElMessage.error(res.message || '请求失败');
      return Promise.reject(new Error(res.message || '请求失败'));
    }
  },
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.data instanceof Blob) {
      try { error.response.data = JSON.parse(await error.response.data.text()); } catch { /* safe generic error below */ }
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      const userStore = useUserStore();

      if (userStore.refreshToken) {
        originalRequest._retry = true;

        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            refreshQueue.push({
              resolve: (token: string) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                resolve(http(originalRequest));
              },
              reject,
            });
          });
        }

        isRefreshing = true;

        try {
          const res = await axios.post(apiUrl('/auth/refresh'), {
            refreshToken: userStore.refreshToken,
          });

          if (res.data.success) {
            const { accessToken, refreshToken: newRefreshToken, user } = res.data.data;
            userStore.setToken(accessToken, newRefreshToken);
            if (user) userStore.setUser(normalizeMedia(user));

            refreshQueue.forEach(q => q.resolve(accessToken));
            refreshQueue = [];

            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return http(originalRequest);
          }
          throw new Error(res.data.message || '刷新登录状态失败');
        } catch (refreshError) {
          refreshQueue.forEach(q => q.reject(refreshError));
          refreshQueue = [];
          userStore.clearAuth();
          ElMessage.error('登录已过期，请重新登录');
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        userStore.clearAuth();
        ElMessage.error('登录已过期，请重新登录');
      }
    } else if (error.response?.data?.message) {
      ElMessage.error(error.response.data.message);
    } else {
      ElMessage.error(error.message || '请求失败');
    }
    return Promise.reject(error);
  }
);

// Type-safe wrapper: axios interceptors unwrap ApiResponse, return data directly
const request = {
  get<T = any>(url: string, config?: any): Promise<T> { return http.get(url, config) as any; },
  post<T = any>(url: string, data?: any, config?: any): Promise<T> { return http.post(url, data, config) as any; },
  put<T = any>(url: string, data?: any, config?: any): Promise<T> { return http.put(url, data, config) as any; },
  delete<T = any>(url: string, config?: any): Promise<T> { return http.delete(url, config) as any; },
};

export default request;
