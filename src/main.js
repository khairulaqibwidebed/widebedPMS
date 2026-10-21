import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router.js';
import { applyTheme } from './lib/theme.js';
import { esc, clickOutside } from './directives.js';
import './app.css';

applyTheme();
createApp(App).use(createPinia()).use(router).directive('esc', esc).directive('click-outside', clickOutside).mount('#app');
