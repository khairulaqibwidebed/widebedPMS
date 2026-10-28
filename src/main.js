import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router.js';
import { applyTheme } from './lib/theme.js';
import { esc, clickOutside } from './directives.js';
import Paged from './components/Paged.vue';
import Capped from './components/Capped.vue';
import { watchErrors } from './lib/scroll-to-error.js';
import { watchQuota } from './lib/quota.js';
import './app.css';

applyTheme();
watchErrors();
watchQuota();
createApp(App).use(createPinia()).use(router).component('Paged', Paged).component('Capped', Capped).directive('esc', esc).directive('click-outside', clickOutside).mount('#app');
