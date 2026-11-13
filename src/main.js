import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router.js';
import { applyTheme } from './lib/theme.js';
import { esc, clickOutside } from './directives.js';
import Paged from './components/Paged.vue';
import Capped from './components/Capped.vue';
import SkeletonRows from './components/SkeletonRows.vue';
import ProgressRing from './components/ProgressRing.vue';
import { startBusyButtons } from './lib/busy-buttons.js';
import { startRouteProgress } from './lib/route-progress.js';
import { watchErrors } from './lib/scroll-to-error.js';
import { watchQuota } from './lib/quota.js';
import { startPwa } from './lib/pwa.js';
import { startCardTables } from './lib/card-tables.js';
import { startSelectMenus } from './lib/select-menu.js';
import './app.css';

applyTheme();
watchErrors();
watchQuota();
startPwa();
startCardTables();
startSelectMenus();   // every plain <select> opens the themed list (13 Nov 2026)
startBusyButtons();
startRouteProgress(router);
createApp(App).use(createPinia()).use(router).component('Paged', Paged).component('Capped', Capped).component('SkeletonRows', SkeletonRows).component('ProgressRing', ProgressRing).directive('esc', esc).directive('click-outside', clickOutside).mount('#app');
