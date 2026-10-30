// lib/agreements/history.js — undo/redo and auto-save for the form builder and the designer.
import { ref, computed, onBeforeUnmount } from 'vue';

// read() returns the state to remember; write(state) puts an older one back. Call commit() after a change.
export function useUndo(read, write, limit = 80) {
  const past = ref([]), future = ref([]);
  let last = JSON.stringify(read());
  function commit() {
    const now = JSON.stringify(read());
    if (now === last) return;
    past.value.push(last);
    if (past.value.length > limit) past.value.shift();
    future.value = [];
    last = now;
  }
  function undo() { if (!past.value.length) return; future.value.push(last); last = past.value.pop(); write(JSON.parse(last)); }
  function redo() { if (!future.value.length) return; past.value.push(last); last = future.value.pop(); write(JSON.parse(last)); }
  function reset() { last = JSON.stringify(read()); past.value = []; future.value = []; }
  return { commit, undo, redo, reset, canUndo: computed(() => past.value.length > 0), canRedo: computed(() => future.value.length > 0) };
}

// Calls save() a moment after the last change. status: saved | waiting | saving | error.
export function useAutosave(save, delay = 1200) {
  const status = ref('saved'), error = ref('');
  let timer = null, running = null, again = false;
  async function run() {
    timer = null;
    if (running) { again = true; return; }
    status.value = 'saving';
    running = (async () => {
      try { await save(); status.value = 'saved'; error.value = ''; }
      catch (e) { console.error(e); status.value = 'error'; error.value = e.code === 'permission-denied' ? 'You don\'t have permission to save this.' : (e.message || 'Could not save.'); }
    })();
    await running;
    running = null;
    if (again) { again = false; run(); }
  }
  function touch() { status.value = 'waiting'; clearTimeout(timer); timer = setTimeout(run, delay); }
  async function flush() { if (timer) { clearTimeout(timer); await run(); } else if (running) await running; }
  const label = computed(() => ({ saved: 'All changes saved', waiting: 'Unsaved changes…', saving: 'Saving…', error: 'Not saved: ' + error.value }[status.value]));
  const warn = e => { if (status.value === 'waiting' || status.value === 'saving') { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);
  onBeforeUnmount(() => { window.removeEventListener('beforeunload', warn); flush(); });
  return { status, label, touch, flush };
}
