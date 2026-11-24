<template>
  <!-- Branch Management guide (23 Nov 2026, Khairul): a picture guide to the page, opened from the (i) button.
       Plain words, step cards and small drawings of the screens. Keep it in step with BranchManagement.vue. -->
  <div class="modal-back" @click.self="$emit('close')" v-esc="() => $emit('close')">
    <div class="modal bg" role="dialog" aria-label="Guide: Branch Management">
      <div class="bg-head">
        <div>
          <h2>How Branch Management works</h2>
          <p class="bg-lead">A picture guide to branches, their properties, staff, links and Drive folder.</p>
        </div>
        <button type="button" class="icon-btn bg-x" aria-label="Close" @click="$emit('close')">×</button>
      </div>

      <nav class="bg-nav" aria-label="Guide sections">
        <button v-for="s in SECTIONS" :key="s.key" type="button" class="bg-chip" :class="{ on: at === s.key }" @click="go(s.key)">{{ s.n }}. {{ s.label }}</button>
      </nav>

      <div class="bg-body" ref="body">
        <!-- 1. The big picture -->
        <section v-show="at === 'what'" id="bg-what" class="bg-sec">
          <h3><span class="bg-num">1</span>What a branch is</h3>
          <p>A branch is a group of properties run by one team, usually one city or state. Each branch keeps four things together:</p>
          <div class="bg-map">
            <div class="bg-hub"><span class="bg-av">KL</span><b>Kuala Lumpur branch</b><small>name · state · Active switch</small></div>
            <div class="bg-spokes">
              <div class="bg-spoke t1"><span class="bg-ico">🏢</span><b>Properties</b><small>Each property is in ONE branch only.</small></div>
              <div class="bg-spoke t2"><span class="bg-ico">👥</span><b>Staff</b><small>Who works here. Set on Staff accounts.</small></div>
              <div class="bg-spoke t3"><span class="bg-ico">🔗</span><b>Links</b><small>Maintenance Sheet and any other links.</small></div>
              <div class="bg-spoke t4"><span class="bg-ico">📁</span><b>Drive folder</b><small>The state's Google Drive folder.</small></div>
            </div>
          </div>
          <div class="bg-note"><b>Good to know:</b> a branch only groups things. What a staff member can SEE is still the properties ticked on their Staff account (section 5).</div>
        </section>

        <!-- 2. The page -->
        <section v-show="at === 'page'" id="bg-page" class="bg-sec">
          <h3><span class="bg-num">2</span>Finding your way around</h3>
          <div class="bg-screens">
            <div class="bg-screen">
              <div class="bg-sbar"><span></span><span></span><span></span></div>
              <div class="bg-sbody">
                <div class="bg-srow head"><i style="width:40%"></i><i style="width:20%"></i><i style="width:12%"></i></div>
                <div class="bg-srow"><span class="bg-mini-av">JO</span><i style="width:30%"></i><i class="pill" style="width:16%"></i><em>Edit</em></div>
                <div class="bg-srow hl"><span class="bg-mini-av">KL</span><i style="width:34%"></i><i class="pill" style="width:22%"></i><em>Edit</em></div>
              </div>
              <div class="bg-cap"><b>Branch list</b> (first page). Click a row or <b>Edit</b> to open that branch.</div>
            </div>
            <div class="bg-arrow" aria-hidden="true">→</div>
            <div class="bg-screen">
              <div class="bg-sbar"><span></span><span></span><span></span></div>
              <div class="bg-sbody">
                <div class="bg-shead"><span class="bg-mini-av">KL</span><i style="width:40%"></i><span class="bg-tog"></span></div>
                <div class="bg-stabs"><em class="on">Details</em><em>Properties</em><em>Links</em><em>Drive</em><em>Staff</em></div>
                <div class="bg-srow"><i style="width:45%"></i><i style="width:45%"></i></div>
                <div class="bg-sfoot"><em class="btn-p">Save</em></div>
              </div>
              <div class="bg-cap"><b>One branch</b>. Tabs along the top, Save at the bottom right, <b>‹ Branch Management</b> to go back.</div>
            </div>
          </div>
          <ul class="bg-list">
            <li><b>Details</b>: the branch name and state, plus four tiles (click one to jump to that tab).</li>
            <li><b>Active switch</b> (top right): turn off to archive a branch. Archived branches are hidden on Staff accounts. Branches are never deleted.</li>
            <li>Nothing is saved until you press <b>Save</b>. <b>Cancel</b> throws away the changes and goes back to the list.</li>
          </ul>
        </section>

        <!-- 3. New branch -->
        <section v-show="at === 'new'" id="bg-new" class="bg-sec">
          <h3><span class="bg-num">3</span>Adding a new branch</h3>
          <ol class="bg-steps">
            <li><span class="bg-step">1</span><div><b>Click + New branch</b><small>Under the page title, above the branch list.</small></div></li>
            <li><span class="bg-step">2</span><div><b>Details tab: name and state</b><small>e.g. "Malacca" and "Melaka". The state decides which Drive folder it uses.</small></div></li>
            <li><span class="bg-step">3</span><div><b>Properties tab: + Add properties</b><small>Tick the properties this branch runs (see section 4 if they are in another branch now).</small></div></li>
            <li><span class="bg-step">4</span><div><b>Links tab (optional)</b><small>The Maintenance Google Sheet and any other links the team uses.</small></div></li>
            <li><span class="bg-step">5</span><div><b>Press Create branch</b><small>Then open the <b>Drive folder</b> tab and press <b>Set link</b> if the state has no folder yet.</small></div></li>
          </ol>
        </section>

        <!-- 4. Moving a property -->
        <section v-show="at === 'move'" id="bg-move" class="bg-sec bg-feature">
          <h3><span class="bg-num">4</span>Moving a property to another branch</h3>
          <p>Example: <b>Cove Serviced Suite @ Malacca</b> is in the <b>Kuala Lumpur</b> branch today and should move to a new <b>Malacca</b> branch.</p>
          <div class="bg-move">
            <div class="bg-box from"><span class="bg-av sm">KL</span><b>Kuala Lumpur</b><span class="bg-prop">Cove Serviced Suite</span><small>26 → 25 properties</small></div>
            <div class="bg-flow" aria-hidden="true"><span>Cove</span><i></i></div>
            <div class="bg-box to"><span class="bg-av sm">MA</span><b>Malacca</b><span class="bg-prop new">Cove Serviced Suite</span><small>0 → 1 property</small></div>
          </div>
          <ol class="bg-steps">
            <li><span class="bg-step">1</span><div><b>Open the branch it is moving TO</b><small>Malacca (make it first with + New branch if it doesn't exist).</small></div></li>
            <li><span class="bg-step">2</span><div><b>Properties tab → + Add properties</b><small>Search "Cove". The list shows <span class="bg-k">· in Kuala Lumpur</span> next to it, so you know where it is now.</small></div></li>
            <li><span class="bg-step">3</span><div><b>Tick it</b><small>It joins the table with an amber tag: <span class="bg-tag">moves from Kuala Lumpur</span>. Nothing has changed yet.</small></div></li>
            <li><span class="bg-step">4</span><div><b>Press Save</b><small>It is added to Malacca AND taken out of Kuala Lumpur in one go. The audit log records the move.</small></div></li>
            <li><span class="bg-step">5</span><div><b>Drive folder (if the state changes)</b><small>On the property's own page, change its state to Melaka. New uploads then go to the Melaka folder. Move its existing folder in Drive into the Melaka folder, or point the property at it with "change units folder".</small></div></li>
            <li><span class="bg-step">6</span><div><b>Staff access</b><small>Moving a property does NOT change who can see it. On Staff accounts, untick it for the KL staff who should lose it, and give the Malacca staff the Malacca branch and tick it.</small></div></li>
          </ol>
          <div class="bg-note ok"><b>Quicker way:</b> in the branch it is in NOW, open the Properties tab, press <b>⋮</b> on its row and choose <b>Move to another branch…</b>, pick the branch and press Move. It is saved straight away (both branches). Steps 5 and 6 still apply.</div>
          <div class="bg-note warn"><b>Wrong branch?</b> Do the same from the other side: open the right branch and add the property there. A property can never be in two branches.</div>
          <div class="bg-note"><b>Removing</b> a property (⋮ › Remove from this branch, then Save) only takes it out of the branch. The property itself is not deleted.</div>
        </section>

        <!-- 5. Staff -->
        <section v-show="at === 'staff'" id="bg-staff" class="bg-sec">
          <h3><span class="bg-num">5</span>Putting staff in a branch</h3>
          <p>Staff are set on <b>Settings › Staff accounts</b>, not on this page (only Directors and HR change access). The branch's <b>Staff</b> tab shows who is in it; click a name to open their account.</p>
          <div class="bg-funnel">
            <div class="bg-fstep"><span class="bg-step">1</span><b>Branches</b><small>Pick one or more branches for the person.</small></div>
            <div class="bg-farrow" aria-hidden="true">▸</div>
            <div class="bg-fstep"><span class="bg-step">2</span><b>Properties</b><small>Only those branches' properties are offered. Tick them, or press <span class="bg-k">+ All in Kuala Lumpur</span>.</small></div>
            <div class="bg-farrow" aria-hidden="true">▸</div>
            <div class="bg-fstep ok"><span class="bg-step">✓</span><b>What they see</b><small>Exactly the ticked properties: their units, bookings, owners, payments and statements.</small></div>
          </div>
          <ul class="bg-list">
            <li>Taking a branch off a person also takes off its properties.</li>
            <li>Directors always see every property, so they have no branch.</li>
          </ul>
        </section>

        <!-- 6. Drive -->
        <section v-show="at === 'drive'" id="bg-drive" class="bg-sec">
          <h3><span class="bg-num">6</span>The Drive folder tab</h3>
          <p>Shows the Google Drive folder for the branch's <b>state</b> and checks every property in it. Click the state row to open or close the list; click a property's units to see each unit folder.</p>
          <div class="bg-dots">
            <span><i class="d g"></i><b>Green</b> has its folder</span>
            <span><i class="d o"></i><b>Orange</b> had a folder, not found now (renamed or moved?)</span>
            <span><i class="d r"></i><b>Red</b> no folder found with that name</span>
          </div>
          <ul class="bg-list">
            <li><b>Change link</b> / <b>Set link</b>: paste the state folder's link from Google Drive. Share the folder with support@widebed.com as Editor first. Nothing in Drive is moved or deleted.</li>
            <li><b>Create folders</b> appears when units are missing a folder: it shows a preview first and makes nothing until you press Create.</li>
            <li>The folder is for the whole state, so two branches in the same state share it.</li>
          </ul>
        </section>

        <!-- 7. Access -->
        <section v-show="at === 'who'" id="bg-who" class="bg-sec">
          <h3><span class="bg-num">7</span>Who can do what</h3>
          <div class="bg-table">
            <div class="bg-trow head"><span>Who</span><span>See this page</span><span>Change branches</span><span>Put staff in branches</span></div>
            <div class="bg-trow"><span><b>Directors</b></span><span class="y">Yes</span><span class="y">Yes</span><span class="y">Yes</span></div>
            <!-- 24 Nov 2026: Branch Directors -->
            <div class="bg-trow"><span><b>Branch Directors</b><small>Their own branches only</small></span><span class="y">Own branches</span><span class="y">Own branches (no new branch, no moving a property out)</span><span class="y">Own branches</span></div>
            <div class="bg-trow"><span><b>Branch Management · Full</b><small>Operations by default</small></span><span class="y">Yes</span><span class="y">Yes</span><span class="n">No</span></div>
            <div class="bg-trow"><span><b>Branch Management · Base</b></span><span class="y">Yes</span><span class="n">View only</span><span class="n">No</span></div>
            <div class="bg-trow"><span><b>HR</b></span><span class="n">If ticked</span><span class="n">If ticked</span><span class="y">Yes</span></div>
          </div>
          <p class="bg-small">The Branch Management tick is on Staff accounts (per person) or Roles (per role), under Company Settings.</p>
        </section>
      </div>
      <!-- 24 Nov 2026 (Khairul): one section per page, Back / Next instead of scrolling -->
      <div class="bg-foot">
        <button type="button" class="btn" v-if="idx > 0" @click="go(SECTIONS[idx - 1].key)">‹ Back</button>
        <span class="bg-count">{{ `${idx + 1} of ${SECTIONS.length}` }}</span>
        <button type="button" class="btn btn-primary" v-if="idx < SECTIONS.length - 1" @click="go(SECTIONS[idx + 1].key)">Next ›</button>
        <button type="button" class="btn btn-primary" v-else @click="$emit('close')">Done</button>
      </div>
    </div>
  </div>
</template>

<script>
const SECTIONS = [
  { key: 'what', n: 1, label: 'What a branch is' }, { key: 'page', n: 2, label: 'The page' }, { key: 'new', n: 3, label: 'New branch' },
  { key: 'move', n: 4, label: 'Move a property' }, { key: 'staff', n: 5, label: 'Staff' }, { key: 'drive', n: 6, label: 'Drive folder' }, { key: 'who', n: 7, label: 'Who can do what' }
];
export default {
  props: { start: { type: String, default: 'what' } },
  emits: ['close'],
  data() { return { SECTIONS, at: SECTIONS.some(x => x.key === this.start) ? this.start : 'what' }; },
  computed: { idx() { return SECTIONS.findIndex(x => x.key === this.at); } },
  methods: {
    go(key) { this.at = key; }   // each number is its own page (24 Nov 2026)
  }
};
</script>

<style scoped>
.bg { max-width: 880px; width: calc(100% - 32px); padding: 0; overflow: hidden; display: flex; flex-direction: column; }
.bg-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 22px 24px 12px; }
.bg-head h2 { margin: 0; font-size: 20px; }
.bg-lead { margin: 4px 0 0; color: var(--muted); font-size: 14px; }
.bg-x { font-size: 22px; line-height: 1; background: none; border: 0; cursor: pointer; color: var(--muted); padding: 4px 8px; }
.bg-nav { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 24px 12px; border-bottom: 1px solid var(--border); }
.bg-chip { border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 12px; font-weight: 600; color: var(--text-2); cursor: pointer; }
.bg-chip:hover { border-color: var(--accent); color: var(--accent); }
.bg-chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.bg-body { padding: 18px 24px 22px; display: grid; align-content: start; min-height: 420px; }   /* one page at a time, no scrolling; same height on every page */
.bg-foot { display: flex; align-items: center; gap: 10px; padding: 12px 24px; border-top: 1px solid var(--border); }
.bg-count { margin-right: auto; font-size: 13px; color: var(--muted); }
.bg-sec h3 { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; font-size: 17px; }
.bg-sec p { margin: 0 0 12px; font-size: 14px; line-height: 1.55; color: var(--text-2); }
.bg-num { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: var(--accent); color: #fff; font-size: 14px; flex: none; }
.bg-feature { border: 2px solid color-mix(in srgb, var(--accent) 35%, var(--border)); border-radius: 14px; padding: 18px; background: color-mix(in srgb, var(--accent-soft) 35%, var(--surface)); }
.bg-small { font-size: 12px !important; color: var(--muted) !important; margin-top: 8px !important; }
.bg-k { font-weight: 600; color: var(--text); }
.bg-tag { display: inline-block; background: #fef3c7; color: #92400e; font-weight: 600; font-size: 11px; padding: 1px 7px; border-radius: 6px; }

/* 1. hub and spokes */
.bg-map { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; align-items: center; margin-bottom: 12px; }
.bg-hub { display: grid; justify-items: center; gap: 4px; text-align: center; padding: 18px 12px; border-radius: 14px; background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); position: relative; }
.bg-hub small { color: var(--muted); font-size: 12px; }
.bg-av { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: var(--surface); color: var(--accent); font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.bg-av.sm { width: 32px; height: 32px; border-radius: 9px; font-size: 12px; }
.bg-spokes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; position: relative; }
.bg-spoke { display: grid; grid-template-columns: 34px 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); position: relative; }
.bg-spoke::before { content: ''; position: absolute; left: -16px; top: 50%; width: 16px; border-top: 2px dashed color-mix(in srgb, var(--accent) 40%, var(--border)); }
.bg-spoke:nth-child(even)::before { display: none; }
.bg-spoke .bg-ico { grid-row: 1 / 3; width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; font-size: 17px; }
.bg-spoke.t1 .bg-ico { background: #fdf2fb; } .bg-spoke.t2 .bg-ico { background: #eef6ff; } .bg-spoke.t3 .bg-ico { background: #ecfdf3; } .bg-spoke.t4 .bg-ico { background: #fff7ed; }
.bg-spoke b { font-size: 14px; } .bg-spoke small { font-size: 12px; color: var(--muted); }
.bg-note { font-size: 13px; line-height: 1.5; padding: 10px 14px; border-radius: 10px; background: #eef6ff; color: #1e3a8a; margin-top: 10px; }
.bg-note.ok { background: #ecfdf3; color: #065f46; }
.bg-note.warn { background: #fff7ed; color: #9a3412; }

/* 2. drawn screens */
.bg-screens { display: grid; grid-template-columns: minmax(0, 1fr) 32px minmax(0, 1fr); align-items: center; gap: 8px; margin-bottom: 12px; }
.bg-screen { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); box-shadow: 0 4px 14px rgba(0,0,0,.05); }
.bg-sbar { display: flex; gap: 5px; padding: 7px 10px; background: var(--chip, #f3f4f6); }
.bg-sbar span { width: 8px; height: 8px; border-radius: 50%; background: #d1d5db; }
.bg-sbody { padding: 10px; display: grid; gap: 7px; }
.bg-srow { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; border: 1px solid #f0f0f2; }
.bg-srow.head { background: #fafafa; border-color: transparent; }
.bg-srow.hl { border-color: var(--accent); background: var(--accent-soft); }
.bg-srow i, .bg-shead i { display: block; height: 8px; border-radius: 4px; background: #e5e7eb; }
.bg-srow i.pill { height: 12px; border-radius: 999px; }
.bg-srow em, .bg-sfoot em { margin-left: auto; font-style: normal; font-size: 10px; font-weight: 700; border: 1px solid var(--border); border-radius: 6px; padding: 2px 6px; background: var(--surface); }
.bg-mini-av { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font-size: 8px; font-weight: 700; background: var(--accent-soft); color: var(--accent); flex: none; }
.bg-shead { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-radius: 8px; background: var(--accent-soft); }
.bg-tog { margin-left: auto; width: 22px; height: 12px; border-radius: 999px; background: var(--accent); }
.bg-stabs { display: flex; gap: 8px; border-bottom: 1px solid var(--border); padding: 0 2px; }
.bg-stabs em { font-style: normal; font-size: 9px; font-weight: 700; color: var(--muted); padding: 4px 0; }
.bg-stabs em.on { color: var(--accent); border-bottom: 2px solid var(--accent); }
.bg-sfoot { display: flex; border-top: 1px solid #f0f0f2; padding-top: 6px; }
.bg-sfoot em.btn-p { background: var(--accent); color: #fff; border-color: var(--accent); }
.bg-arrow { font-size: 22px; color: var(--accent); text-align: center; font-weight: 700; }
.bg-cap { font-size: 12px; color: var(--text-2); padding: 8px 10px; border-top: 1px solid #f0f0f2; line-height: 1.45; }
.bg-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14px; line-height: 1.5; color: var(--text-2); }

/* step cards */
.bg-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; counter-reset: s; }
.bg-steps li { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
.bg-steps li > div { display: grid; gap: 2px; min-width: 0; }
.bg-steps b { font-size: 14px; } .bg-steps small { font-size: 13px; color: var(--text-2); line-height: 1.45; }
.bg-step { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; flex: none; background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 13px; }

/* 4. move drawing */
.bg-move { display: grid; grid-template-columns: minmax(0, 1fr) 140px minmax(0, 1fr); align-items: center; gap: 10px; margin: 4px 0 14px; }
.bg-box { display: grid; justify-items: center; gap: 6px; text-align: center; padding: 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); }
.bg-box small { font-size: 12px; color: var(--muted); }
.bg-box.to { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.bg-prop { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: var(--chip, #f3f4f6); text-decoration: line-through; color: var(--muted); }
.bg-prop.new { text-decoration: none; background: #fef3c7; color: #92400e; }
.bg-flow { position: relative; display: grid; justify-items: center; gap: 4px; }
.bg-flow span { font-size: 11px; font-weight: 700; color: var(--accent); background: var(--surface); border: 1px solid var(--accent); border-radius: 999px; padding: 2px 8px; }
.bg-flow i { display: block; width: 100%; height: 2px; background: var(--accent); position: relative; }
.bg-flow i::after { content: ''; position: absolute; right: -2px; top: -5px; border: 6px solid transparent; border-left: 9px solid var(--accent); border-right: 0; }

/* 5. funnel */
.bg-funnel { display: grid; grid-template-columns: minmax(0, 1fr) 20px minmax(0, 1fr) 20px minmax(0, 1fr); align-items: stretch; gap: 6px; margin-bottom: 12px; }
.bg-fstep { display: grid; align-content: start; gap: 4px; padding: 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); }
.bg-fstep b { font-size: 14px; } .bg-fstep small { font-size: 12px; color: var(--text-2); line-height: 1.45; }
.bg-fstep.ok { background: #ecfdf3; border-color: #a7f3d0; }
.bg-fstep.ok .bg-step { background: #047857; color: #fff; }
.bg-farrow { display: grid; place-items: center; color: var(--accent); font-size: 18px; }

/* 6. dots */
.bg-dots { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-bottom: 12px; font-size: 13px; color: var(--text-2); }
.bg-dots span { display: inline-flex; align-items: center; gap: 6px; }
.d { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.d.g { background: #16a34a; } .d.o { background: #f59e0b; } .d.r { background: #dc2626; }

/* 7. table */
.bg-table { display: grid; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; font-size: 13px; }
.bg-trow { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1.2fr; gap: 8px; padding: 10px 14px; border-top: 1px solid #f0f0f2; align-items: center; }
.bg-trow:first-child { border-top: 0; }
.bg-trow.head { background: #fafafa; font-size: 12px; font-weight: 600; color: var(--muted); }
.bg-trow > span:first-child { display: grid; } .bg-trow small { font-size: 11px; color: var(--muted); }
.bg-trow .y { color: #047857; font-weight: 600; } .bg-trow .n { color: var(--muted); }

@media (max-width: 760px) {
  .bg-map, .bg-screens, .bg-move, .bg-funnel { grid-template-columns: minmax(0, 1fr); }
  .bg-spoke::before, .bg-arrow, .bg-farrow { display: none; }
  .bg-flow i { width: 2px; height: 24px; }
  .bg-trow { grid-template-columns: 1.4fr 1fr 1fr 1fr; }
  .bg-body { min-height: 0; }
}
</style>
