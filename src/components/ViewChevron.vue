<!--
  25 Nov 2026 (Khairul): the one "open" sign on clickable rows and cards, in place of the old eye icons and View links.
  A small right chevron, grey at rest; turns brand colour and moves 2px right when its row or card is hovered (styles in app.css, .view-chev).
  It is still a real button, so keyboard users can Tab to it and press Enter. Use @click.stop="..." the same way as the old eye button.
-->
<template>
  <button type="button" class="view-chev" :title="label" :aria-label="label">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
  </button>
</template>

<script>
export default {
  name: 'ViewChevron',
  props: { label: { type: String, default: 'Open' } },
};
</script>
