<template>
  <!-- 23 Nov 2026 (Khairul): also shown inside a branch (Branch Management > Drive folder tab) with embedded + only-state -->
  <component :is="embedded ? 'div' : 'main'" :class="embedded ? 'ds-embed' : 'content'">
    <div class="page-head" v-if="!embedded">
      <div class="head-text">
        <router-link class="back-link" to="/Settings/branches">‹ Branch Management</router-link>
        <h1>Google Drive Folders</h1>
        <div class="sub">Each state's Google Drive folder (e.g. Owner Files). A property can only be added in a state set up here. Issue photos and videos go to the unit's Maintenance folder inside it.</div>
      </div>
      <div class="head-acts">
        <button class="btn info-btn" type="button" @click="infoOpen = true" aria-label="How the Drive folders work" title="How the Drive folders work">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        </button>
        <button class="btn btn-primary" v-if="canEdit && others.length" @click="openForm('')">＋ Add state</button>
      </div>
    </div>

    <div class="loading-bar" v-show="loading" style="margin-bottom:12px"></div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <!-- How it works (the info button). 17 Nov 2026: written as a guide for whoever looks after this page next, in plain words. -->
    <div class="modal-back" v-if="infoOpen" @click.self="infoOpen = false" v-esc="() => { infoOpen = false }">
      <div class="modal guide" role="dialog" aria-label="Guide: Google Drive Folders">
        <h2>Guide: Google Drive Folders</h2>
        <p class="guide-lead">This page connects the PMS to the company's Google Drive, so photos and videos from customer issues are saved in the right unit's folder without anyone having to sort them.</p>
        <div class="faq-tools"><button type="button" class="link" @click="guideOpen = guideOpen.map(() => true)">Open all</button><button type="button" class="link" @click="guideOpen = guideOpen.map(() => false)">Close all</button></div>
        <div class="guide-body">

          <section class="faq" :class="{ open: guideOpen[0] }">
            <button type="button" class="faq-q" @click="guideOpen[0] = !guideOpen[0]" :aria-expanded="String(!!guideOpen[0])"><span class="chev">{{ guideOpen[0] ? '▾' : '▸' }}</span>What do I need to do first?</button>
            <div class="faq-a" v-show="guideOpen[0]">
            <p>The PMS saves files using the account <b>support@widebed.com</b>. Every state folder you link must be shared with that account as <b>Editor</b> (in Google Drive: right-click the folder, Share, add support@widebed.com, choose Editor). Without this the PMS can't see or add to the folder.</p>
            </div>
          </section>

          <section class="faq" :class="{ open: guideOpen[1] }">
            <button type="button" class="faq-q" @click="guideOpen[1] = !guideOpen[1]" :aria-expanded="String(!!guideOpen[1])"><span class="chev">{{ guideOpen[1] ? '▾' : '▸' }}</span>How are the folders arranged in Drive?</button>
            <div class="faq-a" v-show="guideOpen[1]">
            <p>Each state has one main folder (for example "Owner Files" for Kuala Lumpur). Inside it, the PMS expects:</p>
            <div class="tree">
              <div><span class="ti"><Icon name="folder" /></span> State folder <small>e.g. Owner Files (SA, Statements)</small></div>
              <div class="l1"><span class="ti"><Icon name="folder" /></span> Property <small>e.g. D'Majestic Place</small></div>
              <div class="l2"><span class="ti"><Icon name="folder" /></span> Owner <small>holds the unit folders</small></div>
              <div class="l3"><span class="ti"><Icon name="folder" /></span> Unit <small>e.g. DM 13-11</small></div>
              <div class="l4"><span class="ti"><Icon name="folder" /></span> Maintenance</div>
              <div class="l5"><span class="ti"><Icon name="folder" /></span> One folder per issue ticket <small>e.g. Leaking sink 2026-11-17 (A1B2C)</small></div>
              <div class="l6"><span class="ti"><Icon name="image" /></span> The photos and videos</div>
            </div>
            <p class="guide-note">Some properties keep their unit folders somewhere other than "Owner" (for example D Majestic uses "Profit Sharing"). See "How do I use a different folder for one property?" below.</p>
            </div>
          </section>

          <section class="faq" :class="{ open: guideOpen[2] }">
            <button type="button" class="faq-q" @click="guideOpen[2] = !guideOpen[2]" :aria-expanded="String(!!guideOpen[2])"><span class="chev">{{ guideOpen[2] ? '▾' : '▸' }}</span>What does the PMS do by itself?</button>
            <div class="faq-a" v-show="guideOpen[2]">
            <ul>
              <li><b>Someone attaches a photo or video to an issue:</b> it goes to that unit's Maintenance folder, inside a folder for that ticket. Any missing folder on the way is made automatically.</li>
              <li><b>A new property is added:</b> its property folder and an Owner folder are made in its state's folder.</li>
              <li><b>A new unit is added:</b> its unit folder is made. The person adding it sees the folder name and path before they save.</li>
              <li><b>Bulk Upload</b> (moving old data in) makes no folders. Use Create folders afterwards.</li>
              <li>The Maintenance folder is only made when the first issue file arrives.</li>
            </ul>
            </div>
          </section>

          <section class="faq" :class="{ open: guideOpen[3] }">
            <button type="button" class="faq-q" @click="guideOpen[3] = !guideOpen[3]" :aria-expanded="String(!!guideOpen[3])"><span class="chev">{{ guideOpen[3] ? '▾' : '▸' }}</span>What do the green, orange and red dots mean?</button>
            <div class="faq-a" v-show="guideOpen[3]">
            <p>Click a state to open its list of properties. The list updates by itself while the page is open.</p>
            <div class="legend">
              <div><span class="dot green"></span><div><b>Green</b> The property's folder was found in Drive. All good.</div></div>
              <div><span class="dot orange"></span><div><b>Orange</b> The property used to be linked, but its folder can't be found now. Someone probably renamed or moved it in Drive. The old folder name is shown under the property.</div></div>
              <div><span class="dot red"></span><div><b>Red</b> No folder with this property's name was ever found.</div></div>
            </div>
            <p><b>File name</b> is the folder in Drive (click it to open Drive). <b>Units linked</b> shows how many of the property's units have a folder, for example "18 of 20". Click the property to see every unit: <span class="dot green"></span>a green unit has a folder (click to open it), <span class="dot red"></span>a red unit has none yet.</p>
            <p>The line under each state sums it up: how many properties are linked, how many are no longer linked, and how many units have folders.</p>
            </div>
          </section>

          <section class="faq" :class="{ open: guideOpen[4] }">
            <button type="button" class="faq-q" @click="guideOpen[4] = !guideOpen[4]" :aria-expanded="String(!!guideOpen[4])"><span class="chev">{{ guideOpen[4] ? '▾' : '▸' }}</span>What do the buttons do?</button>
            <div class="faq-a" v-show="guideOpen[4]">
            <ul>
              <li><b>＋ Add state</b> (top right): link a state that isn't listed yet. Paste the link of its main Drive folder. The PMS checks it can open and add to the folder before saving.</li>
              <li><b>Change link</b>: change the state's folder, or remove it. Removing never deletes anything in Drive; it only stops the PMS using that folder.</li>
              <li><b>Create folders</b>: shows when some units have no folder. It first shows a preview of every folder it would make, grouped by property. Click a property to see the full path of each new folder, with the new name highlighted. Parts marked NEW (a missing property or Owner folder) are made too. Untick any property you want to leave out, then press Create.</li>
            </ul>
            </div>
          </section>

          <section class="faq" :class="{ open: guideOpen[5] }">
            <button type="button" class="faq-q" @click="guideOpen[5] = !guideOpen[5]" :aria-expanded="String(!!guideOpen[5])"><span class="chev">{{ guideOpen[5] ? '▾' : '▸' }}</span>How do I use a different folder for one property?</button>
            <div class="faq-a" v-show="guideOpen[5]">
            <p>Normally a property's unit folders sit inside its <b>Owner</b> folder. If a property keeps them somewhere else (for example D Majestic keeps them in "Profit Sharing"), point the PMS to that folder:</p>
            <ol>
              <li>In Google Drive, open the folder that holds the unit folders (the one with "DM 13-11", "DM 15-09" and so on directly inside). Make sure it is shared with support@widebed.com as Editor.</li>
              <li>Copy its link from the address bar (it has /folders/ in it).</li>
              <li>In the PMS, go to Portfolio, Properties, open the property, and stay on the <b>Overview</b> tab.</li>
              <li>Next to <b>Units folder</b> (it says "Owner (usual)"), click <b>Change</b>.</li>
              <li>Paste the link and press <b>Save</b>. The PMS checks it can open the folder, then shows the folder's name as a link.</li>
            </ol>
            <p>From then on, issue photos, new unit folders, the unit links and the lists on this page all use that folder for this property only. Every other property keeps using Owner.</p>
            <p class="guide-note">To go back to the usual Owner folder, click Change again and press <b>Use Owner again</b>. Nothing in Drive is moved or deleted either way. Only people with Full access to Google Drive Folders see the Change button.</p>
            </div>
          </section>

          <section class="faq" :class="{ open: guideOpen[6] }">
            <button type="button" class="faq-q" @click="guideOpen[6] = !guideOpen[6]" :aria-expanded="String(!!guideOpen[6])"><span class="chev">{{ guideOpen[6] ? '▾' : '▸' }}</span>How does the PMS match folder names?</button>
            <div class="faq-a" v-show="guideOpen[6]">
            <ul>
              <li>Spaces, dashes and capital letters don't matter: "DM 1311", "dm1311" and "DM 13-11" are treated as the same.</li>
              <li>Notes in brackets are ignored: "DM 12-04 (terminated)" still counts as DM 12-04.</li>
              <li>If a unit has two folders, one marked old, terminated, ended, former or previous is passed over for the other one.</li>
              <li>A unit folder can leave out the property's code: "A1-25-07" still matches unit "LK A1-25-07".</li>
              <li>New folders copy the way the property's existing folders are named. If D Majestic's folders look like "DM 13-11", a new unit DM 1708 gets "DM 17-08". A property with no folders yet gets the name exactly as it is in the PMS.</li>
            </ul>
            </div>
          </section>

          <section class="faq" :class="{ open: guideOpen[7] }">
            <button type="button" class="faq-q" @click="guideOpen[7] = !guideOpen[7]" :aria-expanded="String(!!guideOpen[7])"><span class="chev">{{ guideOpen[7] ? '▾' : '▸' }}</span>How do I fix a red or orange property?</button>
            <div class="faq-a" v-show="guideOpen[7]">
            <ol>
              <li>Open the state folder in Drive (click its name in the table) and look for the property's folder.</li>
              <li>If it's there under a different name, rename either the folder in Drive or the property in the PMS so the names match. The dot turns green within about 2 minutes.</li>
              <li>If it isn't there at all, it will be made the next time an issue file is uploaded for that property, or use Create folders.</li>
              <li>If nothing in a whole state is found, check the state folder is shared with support@widebed.com as Editor.</li>
            </ol>
            </div>
          </section>

          <section class="faq" :class="{ open: guideOpen[8] }">
            <button type="button" class="faq-q" @click="guideOpen[8] = !guideOpen[8]" :aria-expanded="String(!!guideOpen[8])"><span class="chev">{{ guideOpen[8] ? '▾' : '▸' }}</span>Who can use this page?</button>
            <div class="faq-a" v-show="guideOpen[8]">
            <p>Directors always. Everyone else needs the <b>Google Drive Folders</b> access, set on Staff accounts (per person) or Roles (per role). <b>Base</b> lets them see this page and the lists. <b>Full</b> also lets them add and edit states, create folders and change a property's units folder. Operations have Full by default.</p>
            <p class="guide-note">The PMS never deletes or renames anything in Google Drive. It only reads folders and adds new ones.</p>
            </div>
          </section>

        </div>
        <div class="modal-foot"><button class="btn" @click="infoOpen = false">Close</button></div>
      </div>
    </div>

    <div class="table-wrap">
      <!-- Fixed column widths, so nothing shifts while the lists load -->
      <table class="table fixed">
        <colgroup><col style="width:42%"><col style="width:24%"><col style="width:20%"><col style="width:14%"></colgroup>
        <thead v-if="!embedded"><tr><th>State</th><th>Drive folder</th><th>Set by</th><th></th></tr></thead>
        <tbody>
          <!-- 23 Nov 2026 (Khairul): skeleton rows while the states load, and while a state's list is checked -->
          <SkeletonRows v-if="loading" table :cols="4" :rows="embedded ? 1 : 2" />
          <template v-for="st in (loading ? [] : shown)" :key="st">
            <!-- Click a set-up state to open its list. The list checks itself (on open, when properties change, every 2 minutes). -->
            <tr :class="{ clickable: map[st] }" @click="map[st] && toggle(st)">
              <td><span class="chev" v-if="map[st]">{{ open[st] ? '▾' : '▸' }}</span><b>{{ st }}</b>
                <div class="help" v-if="map[st] && results[st]">{{ summary(st) }}</div><span class="sk ds-sk" v-else-if="map[st]" aria-label="Checking"></span></td>
              <td>
                <template v-if="map[st]"><a class="ext" :href="map[st].link" target="_blank" rel="noopener" title="Open in Google Drive" @click.stop>{{ map[st].folderName }}<svg class="ext-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></a></template>
                <span class="help" v-else>Not set up</span>
              </td>
              <td class="help">{{ map[st] ? `${map[st].byName || '—'} · ${(map[st].at || '').slice(0, 10)}` : '' }}</td>
              <td class="acts">
                <button class="btn btn-sm" v-if="canEdit && missingIn(st)" @click.stop="openPlan(st)" :title="`Preview the ${missingIn(st)} missing unit folders, then make them`">Create folders</button>
                <button class="btn btn-sm" v-if="canEdit" @click.stop="openForm(st)">{{ map[st] ? 'Change link' : 'Set link' }}</button>
              </td>
            </tr>
            <tr class="inner-row" v-if="map[st] && open[st] && !results[st]">
              <td colspan="4" class="inner-cell"><table class="table inner fixed"><tbody><SkeletonRows table :cols="4" :rows="6" /></tbody></table></td>
            </tr>
            <tr class="inner-row" v-if="map[st] && open[st] && results[st]">
              <td colspan="4" class="inner-cell">
                <!-- Green: has its folder now. Orange: had a folder before, not found now (renamed or moved). Red: never found. -->
                <table class="table inner fixed">
                  <colgroup><col style="width:72px"><col style="width:38%"><col style="width:38%"><col></colgroup>
                  <thead><tr><th>Status</th><th>Property</th><th>File name</th><th>Units linked</th></tr></thead>
                  <tbody>
                    <template v-for="p in results[st]" :key="p.id">
                      <tr :class="{ clickable: p.link && p.ownerLink }" @click="p.link && p.ownerLink && toggleUnits(p.id)">
                        <td><span class="dot" :class="p.status" :title="statusText(p)"></span></td>
                        <td><b>{{ p.name }}</b><div class="help" v-if="p.status === 'orange'">{{ wasText(p) }}</div></td>
                        <td><a class="ext" v-if="p.link" :href="p.link" target="_blank" rel="noopener" title="Open in Google Drive" @click.stop>{{ p.folderName }}<svg class="ext-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></a><span class="help" v-else>—</span></td>
                        <td><template v-if="p.link">{{ p.ownerLink ? `${p.unitsLinked} of ${p.units.length}` : 'No Owner folder yet' }}<span class="chev" v-if="p.ownerLink && p.units.length">{{ unitsOpen[p.id] ? ' ▾' : ' ▸' }}</span></template><span class="help" v-else>—</span></td>
                      </tr>
                      <tr class="inner-row" v-if="unitsOpen[p.id] && p.link && p.ownerLink">
                        <td></td>
                        <td colspan="3"><div class="units">
                          <template v-for="u in p.units" :key="u.code">
                            <!-- 17 Nov 2026: a linked unit is one link (the whole box) that opens its folder in Drive, marked like the file names -->
                            <a v-if="u.link" class="unit unit-link" :href="u.link" target="_blank" rel="noopener" :title="`Open ${u.code}'s folder in Google Drive`"><span class="dot green"></span><span class="unit-code">{{ u.code }}</span><svg class="ext-ico" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></a>
                            <span v-else class="unit miss" :title="`${u.code}: no folder found yet`"><span class="dot red"></span><span class="unit-code">{{ u.code }}</span></span>
                          </template>
                          <span class="help" v-if="!p.units.length">No units in the PMS yet.</span>
                        </div></td>
                      </tr>
                    </template>
                    <tr v-if="!results[st].length"><td colspan="4" class="help">{{ `No PMS properties in ${st} yet.` }}</td></tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <!-- 17 Nov 2026: only Kuala Lumpur, Johor and the states set up are listed; Add state (top right) brings in another one -->

    <!-- 17 Nov 2026: Create folders. A preview first (per property, collapsible: the full path and the new folder names in
         each property's own style); nothing is made until Create is pressed. Maintenance is made later, on the first issue. -->
    <div class="modal-back" v-if="plan" @click.self="closePlan()" v-esc="() => closePlan()">
      <div class="modal plan-modal" role="dialog" :aria-label="`Create unit folders in ${plan.state}`">
        <h2>{{ `Create unit folders · ${plan.state}` }}</h2>
        <p class="help" style="margin-top:0">Nothing is made until you press Create. New names follow the folders each property already has. Parts marked new are made too.</p>
        <div class="loading-bar" v-show="plan.loading"></div>
        <div class="notice error" v-show="plan.error">{{ plan.error }}</div>
        <div class="plan-list" v-if="!plan.loading">
          <div class="plan-prop" v-for="r in plan.rows" :key="r.id" :class="{ off: !r.create.length }">
            <div class="plan-head" @click="r.open = !r.open">
              <input type="checkbox" v-model="r.on" :disabled="!r.create.length || plan.busy" @click.stop :aria-label="`Include ${r.name}`">
              <span class="chev">{{ r.open ? '▾' : '▸' }}</span>
              <b>{{ r.name }}</b>
              <span class="help plan-sum">{{ planSummary(r) }}</span>
            </div>
            <div class="plan-body" v-if="r.open">
              <div class="plan-path" v-for="c in r.create" :key="c.unit">
                <template v-for="(seg, i) in r.path" :key="i"><span :class="{ 'seg-new': seg.new }">{{ seg.name }}<small v-if="seg.new"> new</small></span><span class="sep">/</span></template>
                <b class="seg-make">{{ c.name }}</b>
                <span class="help" v-if="c.name !== c.unit">{{ `(unit ${c.unit})` }}</span>
              </div>
              <p class="help" v-if="r.skip">{{ skipText(r) }}</p>
              <p class="help" v-else-if="!r.create.length">Every unit already has a folder.</p>
            </div>
          </div>
          <p class="help" v-if="!plan.rows.length">No missing unit folders.</p>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" @click="closePlan()" :disabled="plan.busy">Cancel</button>
          <button type="button" class="btn btn-primary" @click="runPlan()" :disabled="plan.loading || plan.busy || !planCount">{{ plan.busy ? 'Creating…' : `Create ${planCount} ${planCount === 1 ? 'folder' : 'folders'}` }}</button>
        </div>
      </div>
    </div>

    <!-- Add state / Edit state popup: the state and its Google Drive folder -->
    <div class="modal-back" v-show="form" @click.self="closeForm()" v-esc="() => closeForm()">
      <template v-if="form">
        <!-- 23 Nov 2026 (Khairul): this popup only sets the link, so it says so -->
        <form class="modal ds-link-modal" role="dialog" :aria-label="form.isNew ? 'Add state' : 'Google Drive folder link'" @submit.prevent="save()">
          <h2>{{ form.isNew ? 'Add state' : 'Google Drive folder link' }}</h2>
          <p class="help ds-for" v-if="!form.isNew">{{ `The folder the PMS uses for ${form.state}. Uploads and unit folders go inside it.` }}</p>
          <div class="notice error" v-show="form.error">{{ form.error }}</div>
          <div class="field" v-if="form.isNew"><label for="dsState" class="req">State</label>
            <select class="input" id="dsState" v-model="form.state"><option value="">Choose a state</option>
              <template v-for="s in others" :key="s"><option :value="s">{{ s }}</option></template></select></div>
          <a v-if="map[form.state]" class="ds-now" :href="map[form.state].link" target="_blank" rel="noopener" title="Open in Google Drive">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>
            <span><span class="ds-now-k">Current folder</span><b>{{ map[form.state].folderName }}</b></span>
            <span class="ds-now-open">Open ↗</span>
          </a>
          <div class="field"><label for="dsLink" class="req">{{ map[form.state] ? 'New link' : 'Link' }}</label>
            <input class="input" id="dsLink" v-model="form.paste" placeholder="https://drive.google.com/drive/folders/..." @focus="$event.target.select()">
            <span class="help">Paste the folder's link from Google Drive. Share the folder with support@widebed.com as Editor first. Nothing in Drive is moved.</span></div>
          <div class="modal-foot">
            <button type="button" class="link rm ds-unlink" v-if="!form.isNew && map[form.state]" :disabled="busy" @click="remove(form.state)">Remove link</button>
            <span style="flex:1"></span>
            <button type="button" class="btn" @click="closeForm()">Cancel</button>
            <button class="btn btn-primary" :disabled="busy">{{ busy ? 'Checking…' : 'Check and save' }}</button>
          </div>
        </form>
      </template>
    </div>
  </component>
</template>

<script>
// Settings > States (17 Nov 2026): set each state's Drive folder, and check which properties and units have a folder.
// Directors and Operations edit; the link is checked through /api/drive (support@widebed.com must be able to add to it).
import { useSession } from '@/stores/session.js';
import { STATES, stateOf } from '@/lib/states.js';
import { loadDriveStates, saveDriveState, canSetUpStates, loadDriveSeen, saveDriveSeen } from '@/lib/drive-states.js';
import { folderIdOf, checkFolder, linkCheck, unitPlan, makeUnitFolders } from '@/lib/drive.js';
import { watchProperties, loadUnits, friendlyError } from '@/lib/finance-data.js';
import { forgetUnits } from '@/lib/portfolio-data.js';
import { liveMixin } from '@/lib/use-live.js';
import { askConfirm } from '@/lib/confirm.js';
import { toast } from '@/lib/toast.js';

const me = useSession();
const BASE = ['W.P. Kuala Lumpur', 'Johor'];

export default {
  mixins: [liveMixin],
  props: { embedded: { type: Boolean, default: false }, onlyState: { type: String, default: '' } },
  data() { return { map: {}, seen: {}, props: [], open: {}, unitsOpen: {}, form: null, plan: null, infoOpen: false, guideOpen: [true, false, false, false, false, false, false, false, false], loading: true, busy: false, error: '', results: {} }; },
  computed: {
    canEdit() { return canSetUpStates(me); },
    // Kuala Lumpur and Johor always; any other state once Add state has saved its folder
    shown() { return this.onlyState ? [this.onlyState] : STATES.filter(s => BASE.includes(s) || this.map[s]); },
    others() { return STATES.filter(s => !this.shown.includes(s)); },
    // Folders the open preview would make (ticked properties only)
    planCount() { return this.plan ? this.plan.rows.filter(r => r.on).reduce((n, r) => n + r.create.length, 0) : 0; }
  },
  async mounted() {
    this.map = { ...(await loadDriveStates(true)) };
    this.seen = await loadDriveSeen();
    this.loading = false;
    if (this.onlyState) this.open = { [this.onlyState]: true };   // inside a branch: its state's list starts open
    // Live: the properties as they change (added, renamed, moved state) re-check the lists; every 2 minutes (only while
    // the tab is open and showing) the states, units and Drive folders are read again too.
    this.liveUse('props', watchProperties(rows => { this.props = rows; this.checkAll(); }, e => { this.error = e.friendly || friendlyError(e, 'load the properties'); }));
    this.livePoll('drive', async () => { this.map = { ...(await loadDriveStates(true)) }; await this.checkAll(true); }, 120000, { immediate: false });
  },
  watch: { onlyState(st) { if (st) { this.open = { [st]: true }; this.checkAll(); } } },
  methods: {
    // The popup: '' = Add state (choose one not listed yet), else Edit state for that state
    openForm(st) { this.form = { isNew: !st, state: st, paste: this.map[st]?.link || '', error: '' }; },
    closeForm() { if (!this.busy) this.form = null; },
    async save() {
      const f = this.form, st = f.state;
      if (!st) return f.error = 'Choose the state.';
      const id = folderIdOf(f.paste);
      if (!id) return f.error = 'Paste a Google Drive folder link (it has /folders/ in it).';
      this.busy = true; f.error = '';
      try {
        const got = await checkFolder(id);
        this.map = { ...(await saveDriveState(me, st, got)) };
        delete this.results[st];
        this.check(st);
        this.busy = false; this.form = null;
        toast.ok(`${st} now uses "${got.name}".`);
        return;
      } catch (e) { f.error = e.code ? friendlyError(e, 'save the state') : e.message; }
      this.busy = false;
    },
    async remove(st) {
      if (!(await askConfirm({ title: `Remove the Drive folder for ${st}?`, message: `New properties can't be added in ${st} until it is set up again, and its issue files go to Widebed PMS Files. Nothing in Drive is deleted.`, confirmText: 'Remove', danger: true }))) return;
      this.busy = true;
      try { this.map = { ...(await saveDriveState(me, st, null)) }; delete this.results[st]; this.form = null; }
      catch (e) { this.error = friendlyError(e, 'remove it'); }
      this.busy = false;
    },
    toggle(st) { this.open = { ...this.open, [st]: !this.open[st] }; },
    toggleUnits(id) { this.unitsOpen = { ...this.unitsOpen, [id]: !this.unitsOpen[id] }; },
    wasText(p) { return `Was linked to "${p.was}". Not found now.`; },
    statusText(p) {
      return p.status === 'green' ? 'Linked to its Drive folder' : p.status === 'orange' ? `Was linked to "${p.was}", not found now (renamed or moved?)` : 'No Drive folder found with this name';
    },
    // Every set-up state, one after another; a call while one is running is done once it finishes
    async checkAll(fresh = false) {
      if (this.running) { this.again = true; return; }
      this.running = true;
      try { for (const st of this.shown.filter(x => this.map[x])) await this.check(st, fresh); }
      finally { this.running = false; }
      if (this.again) { this.again = false; this.checkAll(fresh); }
    },
    // Read-only: every PMS property in this state, and its units, against the folders in Drive. fresh: read units again.
    async check(st, fresh = false) {
      try {
        const props = this.props.filter(p => stateOf(p) === st);
        if (fresh) await Promise.all(props.map(p => forgetUnits(p.id)));
        const withUnits = await Promise.all(props.map(async p => ({ id: p.id, name: p.name, units: (await loadUnits(p.id)).map(u => u.unitCode).filter(Boolean) })));
        const got = (await linkCheck(st, withUnits)).properties || [];
        const byId = Object.fromEntries(got.map(r => [r.id, r]));
        const ORDER = { red: 0, orange: 1, green: 2 }, newSeen = {};
        this.results = { ...this.results, [st]: withUnits.map(p => {
          const r = byId[p.id] || {}, units = p.units.map(code => ({ code, link: r.units?.[code] || '' })), was = this.seen[p.id];
          // Remember each linked property's folder, so a later "not found" shows orange (it used to be linked)
          if (r.link && (!was || was.link !== r.link || was.folderName !== r.folderName)) newSeen[p.id] = { link: r.link, folderName: r.folderName || '', at: new Date().toISOString() };
          const status = r.link ? 'green' : was ? 'orange' : 'red';
          return { ...p, link: r.link || '', folderName: r.folderName || '', ownerLink: r.ownerLink || '', units, unitsLinked: units.filter(u => u.link).length, status, was: was?.folderName || '' };
        }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name)) };
        if (Object.keys(newSeen).length && this.canEdit) {
          this.seen = { ...this.seen, ...newSeen };
          try { await saveDriveSeen(me, newSeen); } catch (e) { console.error('Drive seen:', e); }
        }
        this.error = '';
      } catch (e) { this.error = e.code ? friendlyError(e, 'check the links') : e.message; }
    },
    // Units in this state with no folder found (unlinked properties count every unit)
    missingIn(st) { return (this.results[st] || []).reduce((n, p) => n + p.units.filter(u => !u.link).length, 0); },
    // The preview: every property with missing unit folders, read from Drive (nothing made)
    async openPlan(st) {
      const list = (this.results[st] || []).filter(p => p.units.some(u => !u.link))
        .map(p => ({ id: p.id, units: p.units.map(u => u.code), only: p.units.filter(u => !u.link).map(u => u.code) }));
      this.plan = { state: st, rows: [], loading: true, busy: false, error: '' };
      try {
        const got = (await unitPlan(list)).properties || [];
        this.plan.rows = got.map(r => ({ ...r, name: r.name || (this.results[st].find(p => p.id === r.id) || {}).name || r.id, create: r.create || [], path: r.path || [], on: !!(r.create || []).length, open: false }))
          .sort((a, b) => b.create.length - a.create.length || a.name.localeCompare(b.name));
      } catch (e) { this.plan.error = e.message; }
      this.plan.loading = false;
    },
    closePlan() { if (!this.plan?.busy) this.plan = null; },
    planSummary(r) {
      if (r.skip) return this.skipText(r);
      if (!r.create.length) return 'Nothing to make';
      const parents = r.path.filter(x => x.new).map(x => x.name);
      return `${r.create.length} to create · Style: ${r.style?.example || r.create[0].name}${parents.length ? ` · also new: ${parents.join(' / ')}` : ''}`;
    },
    skipText(r) { return r.skip === 'state' ? `Skipped: ${r.state || 'its state'} has no Drive folder.` : 'Skipped: the property could not be read.'; },
    async runPlan() {
      const p = this.plan, rows = p.rows.filter(r => r.on && r.create.length);
      if (!rows.length) return;
      p.busy = true; p.error = '';
      try {
        const made = (await makeUnitFolders(rows.map(r => ({ id: r.id, units: r.create.map(c => c.unit), only: r.create.map(c => c.unit) })))).made || [];
        toast.ok(`${made.length} ${made.length === 1 ? 'folder' : 'folders'} created in ${p.state}.`);
        p.busy = false; this.plan = null;
        await this.check(p.state, true);
      } catch (e) { p.error = e.message; p.busy = false; }
    },
    summary(st) {
      const list = this.results[st] || [], linked = list.filter(p => p.link);
      const units = linked.flatMap(p => p.units), unitsLinked = units.filter(u => u.link).length, lost = list.filter(p => p.status === 'orange').length;
      return `${linked.length} of ${list.length} properties linked${lost ? ` · ${lost} no longer linked` : ''} · ${unitsLinked} of ${units.length} units in linked properties linked`;
    }
  }
};
</script>

<style scoped>
.ds-sk { display: block; width: 260px; max-width: 90%; height: 10px; margin-top: 8px; }
.ds-link-modal { max-width: 520px; }
.ds-link-modal h2 { margin-bottom: 4px; }
.ds-for { margin: 0 0 14px; }
.ds-now { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin-bottom: 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--accent-soft); color: var(--accent); text-decoration: none; }
.ds-now > span:nth-child(2) { display: grid; flex: 1; min-width: 0; color: var(--text); }
.ds-now b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-now-k { font-size: 12px; color: var(--muted); }
.ds-now-open { font-size: 13px; font-weight: 600; white-space: nowrap; }
.ds-unlink { color: var(--danger); background: none; border: 0; font: inherit; font-weight: 600; cursor: pointer; padding: 0; }
.ds-embed { display: grid; gap: 10px; }
.ds-more { margin: 0; }
.back-link { display: inline-block; font-size: 13px; color: var(--text-2); text-decoration: none; margin-bottom: 4px; }
.back-link:hover { color: var(--accent, #C2452B); }
.head-text { flex: 1 1 320px; min-width: 0; }
.head-acts { display: flex; gap: 8px; align-items: center; margin-left: auto; }
.info-btn { display: inline-grid; place-items: center; width: 40px; height: 40px; padding: 0; border-radius: 50%; color: var(--accent); }
.info-list { margin: 8px 0 4px; padding-left: 18px; display: grid; gap: 8px; font-size: 14px; }
/* Guide popup (17 Nov 2026) */
.guide { max-width: 760px; width: calc(100% - 32px); }
.guide-lead { margin: 4px 0 8px; color: var(--muted); font-size: 14px; line-height: 1.5; }
.guide-body { max-height: 64vh; overflow: auto; padding-right: 6px; display: grid; gap: 14px; }
.guide-body { gap: 8px; }
.faq { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
.faq.open { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
.faq-q { display: flex; align-items: center; gap: 6px; width: 100%; padding: 12px 14px; border: 0; background: none; font: inherit; font-size: 15px; font-weight: 600; color: var(--text); text-align: left; cursor: pointer; border-radius: 10px; }
.faq-q:hover, .faq.open .faq-q { color: var(--accent); }
.faq-a { padding: 0 14px 12px 36px; }
.faq-tools { display: flex; gap: 14px; justify-content: flex-end; margin: 0 0 8px; font-size: 13px; }
.guide-body p, .guide-body li { font-size: 14px; line-height: 1.55; margin: 0 0 6px; }
.guide-body ul, .guide-body ol { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
.guide-note { color: var(--muted); }
.tree { font-size: 14px; display: grid; gap: 3px; margin: 6px 0 8px; padding: 10px 12px; border-radius: 8px; background: var(--chip, #f4f5f7); }
.tree small { color: var(--muted); margin-left: 6px; }
.tree .ti { margin-right: 4px; }
.tree .l1 { padding-left: 18px; } .tree .l2 { padding-left: 36px; } .tree .l3 { padding-left: 54px; }
.tree .l4 { padding-left: 72px; } .tree .l5 { padding-left: 90px; } .tree .l6 { padding-left: 108px; }
.legend { display: grid; gap: 8px; margin: 6px 0 8px; }
.legend > div { display: flex; gap: 8px; align-items: baseline; font-size: 14px; line-height: 1.5; }
.legend .dot { flex: none; width: 10px; height: 10px; }
.clickable { cursor: pointer; }
/* The row that holds a whole list is not a row to hover: only the rows inside it light up */
.table tbody tr.inner-row:hover > td { background: transparent; box-shadow: none; }
/* The app tints every cell under a hovered row, which reached into the whole inner list. Inner cells stay plain;
   only the property row under the pointer lights up. */
.table.inner tbody td { background: transparent; box-shadow: none; }
.table.inner tbody tr:not(.inner-row):hover > td { background: color-mix(in srgb, var(--accent-soft) 55%, transparent); }
.table.inner tbody tr.clickable:hover > td { background: var(--accent-soft); }
.table.inner tbody tr.clickable:hover > td:first-child { box-shadow: inset 4px 0 0 var(--accent); }
/* Links that open Google Drive: accent colour, underline on hover, an open-in-new icon */
.ext { color: var(--accent); font-weight: 500; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
.ext:hover { text-decoration: underline; }
.ext-ico { flex: none; opacity: .8; }
.chev { display: inline-block; width: 16px; color: var(--muted); }
.acts { white-space: nowrap; text-align: right; }
.acts .btn { margin-left: 6px; }
/* Create folders preview (17 Nov 2026) */
.plan-modal { max-width: 820px; width: calc(100% - 32px); }
.plan-list { display: grid; gap: 6px; max-height: 60vh; overflow: auto; margin: 8px 0 4px; }
.plan-prop { border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
.plan-prop.off { opacity: .65; }
.plan-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; }
.plan-head:hover { background: var(--accent-soft); border-radius: 8px; }
.plan-sum { margin-left: auto; text-align: right; }
.plan-body { padding: 4px 12px 10px 38px; display: grid; gap: 4px; }
.plan-path { font-size: 13px; overflow-wrap: anywhere; }
.plan-path .sep { margin: 0 5px; color: var(--muted); }
.seg-new { color: var(--accent); }
.seg-new small { font-size: 10px; font-weight: 600; text-transform: uppercase; }
.seg-make { color: var(--accent); }
.inner-cell { padding: 0 !important; }
.table.fixed { table-layout: fixed; width: 100%; }
.table.fixed td, .table.fixed th { overflow-wrap: anywhere; }
.table.inner { margin: 0; width: 100%; box-shadow: none; border: 0; border-radius: 0; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; vertical-align: middle; margin-right: 6px; }
.dot.green { background: var(--success, #2e9e5b); }
.dot.orange { background: #e8912d; }
.dot.red { background: var(--danger, #c0392b); }
/* Units: an even grid, one cell per unit, so the codes line up in columns */
/* 5 columns, so long codes (JB-CGDB 1A-1001) show in full; fewer on narrow screens */
.units { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px 12px; padding: 6px 0 8px; }
@media (max-width: 1100px) { .units { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) { .units { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.unit.miss { color: var(--danger, #c0392b); border-color: currentColor; }
.unit-link { color: var(--accent); text-decoration: none; font-weight: 500; }
.unit-link:hover { border-color: var(--accent); background: var(--accent-soft); }
.unit-link:hover .unit-code { text-decoration: underline; }
.unit-code { min-width: 0; overflow-wrap: anywhere; }
.unit .ext-ico { margin-left: auto; flex: none; opacity: .8; }
.unit { display: flex; align-items: center; gap: 2px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); font-size: 13px; font-variant-numeric: tabular-nums; min-width: 0; }
</style>
