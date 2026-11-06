<template>
  <main class="content soft-page">
    <!-- One SOP: /HR/sops/<key> -->
    <SopView v-if="key" :key="key" :sop-key="key" :edit-first="$route.query.edit === '1'" />

    <!-- All SOPs: /HR/sops -->
    <template v-else>
      <div class="page-head">
        <div><h1>SOPs</h1><div class="sub">How things are done at Widebed. Everyone can read them; HR keeps them up to date.</div></div>
      </div>
      <div class="notice error" v-show="err">{{ err }}</div>
      <div class="loading-bar" v-show="loading"></div>
      <SopList :sops="sops" :loading="loading" :can-edit="canEdit" @new="newOpen = true" />
      <SopNewModal v-if="newOpen" :taken-keys="new Set(sops.map(s => s.key))" @close="newOpen = false" @created="created" />
    </template>
  </main>
</template>

<script>
// HR > SOPs (6 Nov 2026). Replaces the four separate SOP pages (Attendance, Advance, Allowance, Claim SOCSO);
// their old addresses redirect to /HR/sops/<key> (router.js). The page is a shell: the list, the new-SOP popup and
// one SOP are components in components/sops/, and Firestore is in ./sops-data.js.
import SopList from '@/components/sops/SopList.vue';
import SopNewModal from '@/components/sops/SopNewModal.vue';
import SopView from '@/components/sops/SopView.vue';
import { listSops } from './sops-data.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { can } from '@/lib/access.js';

export default {
  components: { SopList, SopNewModal, SopView },
  data() { return { sops: [], loading: false, err: '', newOpen: false, canEdit: can(useSession(), 'sops.edit') }; },
  computed: { key() { return this.$route.params.key || ''; } },
  // Coming back from one SOP to the list loads the list again (titles or steps may have changed).
  watch: { key: { immediate: true, handler(k) { if (!k) this.load(); } } },
  methods: {
    async load() {
      this.loading = true; this.err = '';
      try { this.sops = await listSops(); } catch (e) { this.err = friendlyError(e, 'load the SOPs'); }
      this.loading = false;
    },
    created(sop) { this.newOpen = false; this.$router.push({ path: `/HR/sops/${sop.key}`, query: { edit: '1' } }); }
  }
};
</script>
