// Themed replacement for window.confirm: `await askConfirm({ title, message, confirmText, danger })` -> true / false.
import { reactive } from 'vue';

export const confirmState = reactive({ open: false, title: '', message: '', confirmText: 'OK', danger: false, resolve: null });

export function askConfirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => Object.assign(confirmState, { open: true, title, message, confirmText, danger, resolve }));
}

export function answerConfirm(yes) {
  const r = confirmState.resolve;
  confirmState.open = false; confirmState.resolve = null;
  if (r) r(yes);
}
