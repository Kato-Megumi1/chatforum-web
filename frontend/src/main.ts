import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import { ArrowDown, ChatDotRound, ChatLineSquare, Collection, Delete, Document, DocumentCopy, Edit,
  MagicStick, MoreFilled, Plus, Promotion, Service, Setting, Star, SwitchButton, Top, User, VideoPause, View } from '@element-plus/icons-vue';
import { marked } from 'marked';
import App from './App.vue';
import router from './router';
import './styles/index.scss';

marked.setOptions({
  breaks: true,
  gfm: true,
});

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

app.use(pinia);
app.use(router);
app.use(ElementPlus);

for (const [key, component] of Object.entries({ ArrowDown, ChatDotRound, ChatLineSquare, Collection, Delete, Document, DocumentCopy, Edit,
  MagicStick, MoreFilled, Plus, Promotion, Service, Setting, Star, SwitchButton, Top, User, VideoPause, View })) {
  app.component(key, component);
}

app.mount('#app');
