<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>KPI management</h1>
        <div class="sub">Self-assessment, review and discussion. Each employee's KPI weightages must total 100% before activation.</div>
      </div>
      <div class="head-tools">
        <select class="select" v-model="quarterId" v-if="quarters.length">
          <option v-for="q in quarters" :key="q.id" :value="q.id">{{ q.name }}</option>
        </select>
      </div>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>

    <div class="pills" role="group" style="margin-bottom:12px;" v-if="canManageKpi">
      <button class="pill-btn" :class="{ on: tab === 'mine' }" @click="tab = 'mine'">My KPIs</button>
      <button class="pill-btn" :class="{ on: tab === 'admin' }" @click="tab = 'admin'">Review KPIs</button>
      <button class="pill-btn" :class="{ on: tab === 'director' }" @click="tab = 'director'">All employees</button>
    </div>

    <template v-if="!loading && tab === 'mine'">
      <div class="kpi-panel">
        <h2 class="sr-only">KPI self-evaluation</h2>

        <div class="kpi-summary">
          <div class="kpi-summary-score">
            <div class="kpi-summary-value">{{ myScore.score != null ? myScore.score.toFixed(2) : '—' }}<small> / {{ kpiMaxMarks }}</small></div>
            <div class="kpi-muted">{{ myScoreStatusText }}</div>
          </div>
          <div class="kpi-summary-stats">
            <div class="kpi-stat"><b>{{ myDoneCount }}</b><span class="kpi-muted">done</span></div>
            <div class="kpi-stat"><b>{{ myAssignments.length - myDoneCount }}</b><span class="kpi-muted">in progress</span></div>
            <div class="kpi-stat"><b :class="{ 'kpi-warn': myAssignments.length > 0 && myTotalWeightage !== 100 }">{{ myTotalWeightage }}%</b><span class="kpi-muted">weightage</span></div>
          </div>
        </div>

        <div class="notice warn" v-if="myAssignments.length > 0 && myTotalWeightage !== 100">
          Your assigned KPIs total {{ myTotalWeightage }}%, not 100% — ask your supervisor to fix the weightages before you can submit.
        </div>

        <div class="kpi-cards">
          <div class="kpi-task-card" v-for="a in myAssignments" :key="a.id">
            <div class="kpi-task-head">
              <div style="min-width:0;">
                <div class="kpi-task-title">{{ a.title }}</div>
                <p class="kpi-task-desc" v-if="a.description">{{ a.description }}</p>
              </div>
              <span class="kpi-status-badge" :class="simpleStatusClass(mySub(a.id)?.status)">{{ simpleStatus(mySub(a.id)?.status) }}</span>
            </div>

            <div class="kpi-task-meta">
              <div><span class="kpi-muted">Due</span><b>{{ a.deadline || 'No deadline' }}</b></div>
              <div><span class="kpi-muted">Weight</span><b>{{ a.weightage }}%</b></div>
              <div><span class="kpi-muted">Task score</span><b>{{ taskScoreText(a) }}</b></div>
            </div>

            <div class="kpi-task-details" v-if="a.target || a.description || a.completionCriteria">
              <details style="margin-bottom: 12px;">
                <summary style="cursor: pointer; font-weight: 500; color: var(--text); margin-bottom: 8px;">KPI Details</summary>
                <div style="padding-left: 12px; border-left: 2px solid var(--border);">
                  <div v-if="a.target" style="margin-bottom: 8px;">
                    <span class="kpi-muted">Target</span>
                    <p style="margin: 4px 0; color: var(--text);">{{ a.target }}</p>
                  </div>
                  <div v-if="a.description" style="margin-bottom: 8px;">
                    <span class="kpi-muted">Description</span>
                    <p style="margin: 4px 0; color: var(--text);">{{ a.description }}</p>
                  </div>
                  <div v-if="a.completionCriteria">
                    <span class="kpi-muted">Completion Criteria</span>
                    <p style="margin: 4px 0; color: var(--text);">{{ a.completionCriteria }}</p>
                  </div>
                </div>
              </details>
            </div>

            <template v-if="!['approved', 'rejected', 'done'].includes(mySub(a.id)?.status)">
              <div class="field"><label>Your completed date</label><input class="input" type="date" v-model="drafts[a.id].completionTimestamp"></div>
              <div class="field"><label>Self-rating (1–5)</label>
                <RatingPicker variant="buttons" v-model="drafts[a.id].selfRating" label="Self-rating" />
                <span class="kpi-muted" style="font-size:12px; display:block; margin-top:6px;" v-if="suggestion(a) != null">Deadline-based suggestion: {{ suggestion(a) }} — you still choose your own rating.</span>
              </div>
              <div class="field"><label>Comments</label><textarea class="input" v-model="drafts[a.id].selfComments"></textarea></div>
              <button class="btn btn-primary" :disabled="saving || myTotalWeightage !== 100 || drafts[a.id].selfRating == null" @click="submitMine(a)">
                {{ mySub(a.id) ? 'Resubmit self-assessment' : 'Submit self-assessment' }}
              </button>
            </template>
            <template v-else>
              <!-- Rating comparison section -->
              <div class="kpi-rating-section" :class="{ 'discussion-needed': mySub(a.id)?.status === 'discussionRequested' }">
                <div class="kpi-rating-compare">
                  <div>
                    <span class="kpi-muted">Your rating</span>
                    <div style="margin-top: 6px;">
                      <RatingPicker :model-value="mySub(a.id)?.selfRating" disabled label="Your rating" />
                    </div>
                  </div>
                  <div>
                    <span class="kpi-muted">Supervisor rating</span>
                    <div style="margin-top: 6px;">
                      <RatingPicker :model-value="mySub(a.id)?.directorRating || mySub(a.id)?.finalApprovedRating" disabled label="Supervisor rating" />
                    </div>
                  </div>
                </div>

                <!-- Unified Discussion Chat -->
                <div v-if="mySub(a.id)?.status === 'discussionRequested' || mySub(a.id)?.status === 'resubmitted'" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                  <h4 style="margin: 0 0 12px; font-size: 14px;">💬 Discussion Chat</h4>

                  <!-- Chat Messages -->
                  <div class="kpi-chat-container">
                    <div v-if="getEmployeeDiscussionThread(a.id)?.thread && getEmployeeDiscussionThread(a.id).thread.length > 0" class="kpi-discussion-chat">
                      <div v-for="comment in getEmployeeDiscussionThread(a.id).thread.filter(c => !c.deleted)" :key="comment.id" class="kpi-chat-msg" :class="{ 'by-me': comment.byUid === session.user.uid }">
                        <div class="kpi-chat-avatar" :style="{ backgroundColor: roleColor(comment.role) }">
                          {{ initialOf(comment.by) }}
                        </div>
                        <div class="kpi-chat-bubble">
                          <div class="kpi-chat-msg-header">
                            <span class="kpi-chat-sender">{{ comment.by }}</span>
                            <span class="kpi-chat-badge">{{ comment.role === 'director' ? 'Supervisor' : 'Employee' }}</span>
                            <span class="kpi-chat-time">{{ formatWhen(comment.at) }}</span>
                            <span v-if="comment.edited" class="kpi-chat-edited">(edited)</span>
                          </div>
                          <p class="kpi-chat-msg-text">{{ comment.message }}</p>
                          <div class="kpi-chat-actions" v-if="comment.byUid === session.user.uid">
                            <button class="kpi-chat-action" @click="startEditComment(comment)">✏️ Edit</button>
                            <button class="kpi-chat-action" @click="removeComment(a.id, comment.id)">🗑️ Delete</button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div v-else class="kpi-chat-empty">
                      No messages yet. Start the discussion!
                    </div>
                  </div>

                  <!-- Chat Input -->
                  <div class="kpi-chat-input-section">
                    <textarea
                      v-model="discussionReplies[a.id]"
                      :placeholder="mySub(a.id)?.status === 'resubmitted' ? 'Add more comments...' : 'Reply to supervisor...'"
                      class="kpi-chat-input"
                      @keydown.enter.ctrl="submitDiscussionReply(a)"
                    ></textarea>
                    <div class="kpi-chat-input-actions">
                      <span class="kpi-chat-hint">Ctrl+Enter to send</span>
                      <button class="btn btn-primary" @click="submitDiscussionReply(a)" :disabled="saving || !discussionReplies[a.id]?.trim()">
                        {{ saving ? 'Sending...' : 'Send' }}
                      </button>
                    </div>
                  </div>

                  <!-- For resubmitted, show resubmit option -->
                  <div v-if="mySub(a.id)?.status === 'resubmitted'" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
                    <button class="btn btn-primary" style="width: 100%;" @click="submitMine(a)" :disabled="saving">
                      {{ saving ? 'Submitting...' : 'Resubmit for approval' }}
                    </button>
                  </div>
                </div>

                <!-- For done/approved status -->
                <p v-else class="kpi-muted" style="font-size:13px; margin-top: 12px;" v-if="mySub(a.id)?.directorComments || mySub(a.id)?.reviewerComments">
                  <b>Supervisor comment:</b> {{ mySub(a.id)?.directorComments || mySub(a.id)?.reviewerComments }}
                </p>
              </div>
            </template>
          </div>
          <div class="kpi-card-empty" v-if="!myAssignments.length">No KPIs assigned to you this quarter.</div>
        </div>
      </div>
    </template>

    <!-- Director Review Dashboard -->
    <template v-if="!loading && tab === 'admin' && canManageKpi">
      <div class="card" style="margin-bottom: 16px;">
        <h3 style="margin-top: 0;">Submissions pending review</h3>
        <p class="sub" style="margin: 0 0 12px;">KPIs awaiting your rating and decision.</p>
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>Employee</th><th>KPI</th><th>Self-rating</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr v-for="row in allRows.filter(r => ['submitted', 'discussionRequested', 'resubmitted'].includes(r.submission?.status))" :key="row.assignment.id">
                <td>{{ row.assignment.employeeName }}</td>
                <td>{{ row.assignment.title }}</td>
                <td>{{ row.submission.selfRating }} / 5</td>
                <td><span class="pill" :class="statusClass(row.submission.status)">{{ statusLabel(row.submission.status) }}</span></td>
                <td><button class="act-pill" @click="openReview(row)">Review</button></td>
              </tr>
              <tr v-if="!allRows.some(r => ['submitted', 'discussionRequested', 'resubmitted'].includes(r.submission?.status))"><td colspan="5" class="muted">Nothing pending.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top: 0;">Approved KPIs</h3>
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>Employee</th><th>KPI</th><th>Self-rating</th><th>Your rating</th><th>Final score</th><th></th></tr></thead>
            <tbody>
              <tr v-for="row in allRows.filter(r => r.submission?.status === 'done')" :key="row.assignment.id">
                <td>{{ row.assignment.employeeName }}</td>
                <td>{{ row.assignment.title }}</td>
                <td>{{ row.submission.selfRating }} / 5</td>
                <td>{{ row.submission.finalApprovedRating }} / 5</td>
                <td>{{ taskScoreText(row.assignment, row.submission) }}</td>
                <td><button class="act-pill" @click="openReview(row)">View</button></td>
              </tr>
              <tr v-if="!allRows.some(r => r.submission?.status === 'done')"><td colspan="6" class="muted">No approved KPIs yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <template v-if="!loading && tab === 'director' && canManageKpi">
      <div class="card" style="margin-bottom:16px;">
        <h3 style="margin-top:0;">All employees — {{ participants.length }}</h3>
        <p class="sub" style="margin:0 0 12px;">Click an employee to see their assigned KPIs, add a new one, or edit an existing one.</p>
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>Employee</th><th>KPIs assigned</th><th>Weightage</th><th>Pending review</th><th></th></tr></thead>
            <tbody>
              <tr v-for="p in participants" :key="p.employeeId" style="cursor:pointer;" @click="openEmployeeKpis(p)">
                <td>{{ p.employeeName }}</td>
                <td>{{ kpisFor(p.employeeId).length }}</td>
                <td>
                  <span class="pill" :class="totalWeightage(kpisFor(p.employeeId)) === 100 ? 'green' : 'amber'">{{ totalWeightage(kpisFor(p.employeeId)) }}%</span>
                </td>
                <td>{{ kpisFor(p.employeeId).filter(a => subOf(a.id)?.status === 'submitted').length }}</td>
                <td><button class="act-pill" @click.stop="openEmployeeKpis(p)">View KPIs</button></td>
              </tr>
              <tr v-if="!participants.length"><td colspan="5" class="muted">No participants in this quarter yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">Submissions awaiting review</h3>
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>Employee</th><th>KPI</th><th>Self-rating</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr v-for="row in allRows.filter(r => r.submission?.status === 'submitted')" :key="row.assignment.id">
                <td>{{ row.assignment.employeeName }}</td>
                <td>{{ row.assignment.title }}</td>
                <td>{{ row.submission.selfRating }}</td>
                <td><span class="pill amber">Submitted</span></td>
                <td><button class="act-pill" @click="openReview(row)">Review</button></td>
              </tr>
              <tr v-if="!allRows.some(r => r.submission?.status === 'submitted')"><td colspan="5" class="muted">Nothing pending.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- One employee's assigned KPIs: view, add, edit -->
    <div class="modal-back" v-if="employeeKpis" @click.self="employeeKpis = null">
      <div class="modal" style="max-width: 680px;">
        <h2>{{ employeeKpis.employeeName }}'s KPIs</h2>
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>KPI</th><th>Weight</th><th>Deadline</th><th>Self</th><th>Supervisor</th><th>Score</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr v-for="a in kpisFor(employeeKpis.employeeId)" :key="a.id" :class="{ 'row-selected': editingId === a.id }">
                <td>{{ a.title }}</td>
                <td>{{ a.weightage }}%</td>
                <td>{{ a.deadline || '—' }}</td>
                <td>{{ subOf(a.id)?.selfRating ?? '—' }}</td>
                <td>{{ subOf(a.id)?.finalApprovedRating ?? '—' }}</td>
                <td>{{ taskScoreText(a) }}</td>
                <td><span class="kpi-status-badge" :class="simpleStatusClass(subOf(a.id)?.status)">{{ simpleStatus(subOf(a.id)?.status) }}</span></td>
                <td style="display:flex; gap:6px;">
                  <button class="act-pill" @click="startEdit(a)">Edit</button>
                  <button class="act-pill" v-if="subOf(a.id)?.status === 'submitted'" @click="openReview({ assignment: a, submission: subOf(a.id) }); employeeKpis = null">Review</button>
                </td>
              </tr>
              <tr v-if="!kpisFor(employeeKpis.employeeId).length"><td colspan="8" class="muted">No KPIs assigned yet.</td></tr>
            </tbody>
          </table>
        </div>

        <div style="border-top:1px solid var(--border); margin-top:16px; padding-top:14px;">
          <h3 style="margin:0 0 10px;">{{ editingId ? 'Edit KPI' : 'Add a KPI' }}</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <FormField label="Title" req v-model="assignForm.title" />
            <FormField label="Weightage %" req type="number" min="0" max="100" v-model="assignForm.weightage" />
            <FormField label="Target" v-model="assignForm.target" />
            <FormField label="Deadline" type="date" v-model="assignForm.deadline" />
          </div>
          <FormField label="Description" v-model="assignForm.description" />
          <FormField label="Completion criteria" v-model="assignForm.completionCriteria" />
          <p class="note" :class="{ error: Number(otherWeightage) + Number(assignForm.weightage || 0) !== 100 }">
            Weightage so far (excluding this one): {{ otherWeightage }}% + {{ assignForm.weightage || 0 }}% here
            = {{ Number(otherWeightage) + Number(assignForm.weightage || 0) }}% (must reach exactly 100% across all this employee's KPIs)
          </p>

          <p class="kpi-muted" style="font-size:12px; margin:12px 0 8px;">Deadline-based scoring for this task (optional — leave blank to use the default: 7+ days early = 5, 4–6 early = 4, 1–3 early = 4, on-time = 3, late = 1).</p>
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
            <FormField label="Early if ≥ (days)" type="number" min="1" v-model="assignForm.scoringRules.earlyDays" />
            <FormField label="Early rating" type="number" min="1" max="5" v-model="assignForm.scoringRules.earlyRating" />
            <FormField label="On-time rating" type="number" min="1" max="5" v-model="assignForm.scoringRules.onTimeRating" />
            <FormField label="Overdue rating" type="number" min="1" max="5" v-model="assignForm.scoringRules.overdueRating" />
          </div>

          <div style="display:flex; gap:8px; margin-top:12px;">
            <button class="btn btn-primary" :disabled="saving" @click="saveAssignForm">{{ editingId ? 'Save changes' : 'Add KPI' }}</button>
            <button class="btn" v-if="editingId" @click="startAdd">Cancel edit</button>
          </div>
        </div>

        <div class="modal-foot">
          <button class="btn" @click="employeeKpis = null">Close</button>
        </div>
      </div>
    </div>

    <!-- Edit Comment Modal -->
    <div class="modal-back" v-if="editingComment" @click.self="editingComment = null">
      <div class="modal" style="max-width: 500px;">
        <h2>Edit Comment</h2>
        <textarea class="input" v-model="editingCommentText" style="min-height: 120px;"></textarea>
        <div class="modal-foot">
          <button class="btn" @click="editingComment = null">Cancel</button>
          <button class="btn btn-primary" :disabled="saving" @click="saveEditedComment">Save</button>
        </div>
      </div>
    </div>

    <!-- Director Review Modal -->
    <div class="modal-back" v-if="reviewing" @click.self="reviewing = null">
      <div class="modal" style="max-width: 720px; max-height: 90vh; display: flex; flex-direction: column;">
        <h2>Review KPI — {{ reviewing.assignment.title }}</h2>
        <p class="muted">{{ reviewing.assignment.employeeName }} | Completed: {{ reviewing.submission.completionTimestamp || '—' }} | Due: {{ reviewing.assignment.deadline || '—' }}</p>

        <div style="flex: 1; overflow-y: auto; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 16px; margin: 12px 0;">
          <div class="kpi-review-section">
            <h3 style="margin: 0 0 10px;">Employee self-assessment</h3>
            <div class="kpi-rating-compare">
              <div><span class="kpi-muted">Self-rating</span><b>{{ reviewing.submission.selfRating }} / 5</b></div>
              <div><span class="kpi-muted">Completion date</span><b>{{ reviewing.submission.completionTimestamp || '—' }}</b></div>
            </div>
            <p class="kpi-muted" style="margin: 8px 0; font-size: 13px;">{{ reviewing.submission.selfComments || '(no comments)' }}</p>

            <div v-if="discussionThread && discussionThread.thread && discussionThread.thread.length > 0" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
              <h3 style="margin: 0 0 16px; font-size: 14px;">💬 Discussion Chat</h3>
              <div class="kpi-chat-container">
                <div class="kpi-discussion-chat">
                  <div v-for="comment in discussionThread.thread.filter(c => !c.deleted)" :key="comment.id" class="kpi-chat-msg" :class="{ 'by-me': comment.byUid === session.user.uid }">
                    <div class="kpi-chat-avatar" :style="{ backgroundColor: roleColor(comment.role) }">
                      {{ initialOf(comment.by) }}
                    </div>
                    <div class="kpi-chat-bubble">
                      <div class="kpi-chat-msg-header">
                        <span class="kpi-chat-sender">{{ comment.by }}</span>
                        <span class="kpi-chat-badge">{{ comment.role === 'director' ? 'Supervisor' : 'Employee' }}</span>
                        <span class="kpi-chat-time">{{ formatWhen(comment.at) }}</span>
                        <span v-if="comment.edited" class="kpi-chat-edited">(edited)</span>
                      </div>
                      <p class="kpi-chat-msg-text">{{ comment.message }}</p>
                      <div class="kpi-chat-actions" v-if="comment.byUid === session.user.uid">
                        <button class="kpi-chat-action" @click="startEditComment(comment)">✏️ Edit</button>
                        <button class="kpi-chat-action" @click="removeComment(discussionThread.submissionId, comment.id)">🗑️ Delete</button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Chat input for director to continue discussion -->
                <div class="kpi-chat-input-section">
                  <textarea
                    v-model="reviewComments"
                    placeholder="Reply to discussion or add comments..."
                    class="kpi-chat-input"
                    @keydown.enter.ctrl="postReply"
                  ></textarea>
                  <div class="kpi-chat-input-actions">
                    <span class="kpi-chat-hint">Ctrl+Enter to send</span>
                    <button class="btn" @click="postReply" :disabled="saving || !reviewComments?.trim()">
                      {{ saving ? 'Sending...' : 'Reply' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="padding: 16px; background: var(--surface);">
          <h3 style="margin: 0 0 12px;">Your review</h3>
          <div class="field"><label>Your rating (1–5)</label>
            <RatingPicker v-model="reviewRating" label="Director rating" />
          </div>
          <FormField label="Comments" v-model="reviewComments" type="textarea" />
          <div class="modal-foot">
            <button class="btn" @click="reviewing = null">Cancel</button>

            <!-- For pending/discussion KPIs -->
            <template v-if="['submitted', 'discussionRequested', 'resubmitted', 'pendingReview'].includes(reviewing.submission.status)">
              <button class="btn" v-if="reviewing.submission.status === 'discussionRequested' || reviewing.submission.status === 'resubmitted'" @click="postReply">Reply & Continue Discussion</button>
              <button class="btn" @click="sendBack">Send Back for Discussion</button>
              <button class="btn btn-primary" @click="approve">Approve Final Rating</button>
            </template>

            <!-- For done KPIs - allow reopening -->
            <template v-else-if="reviewing.submission.status === 'done'">
              <button class="btn" @click="rerateOnly">Just Re-rate</button>
              <button class="btn btn-primary" @click="reopenForDiscussion">Reopen & Send Back for Discussion</button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import FormField from '@/components/FormField.vue';
import RatingPicker from '@/components/RatingPicker.vue';
import { useSession } from '@/stores/session.js';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { listQuarters, listParticipants, getQuarter } from '@/lib/performance/quarters.js';
import {
  listAssignmentsFor, listAllAssignments, listSubmissionsFor, totalWeightage, kpiScoreFor,
  createAssignment, updateAssignment, submitSelfAssessment, provideDirectorReview, sendBackForDiscussion,
  approveKpiRating, rerateKpi, reopenAndSendBack, postDiscussionReply, postDirectorReply, getDiscussionThread,
  editDiscussionComment, deleteDiscussionComment,
  getConversation, addChatMessage, editChatMessage, deleteChatMessage, addSystemMessage, markConversationAsRead,
  suggestDeadlineRating, customThresholds, getSubmission
} from '@/lib/performance/kpi.js';
import { avatarSrc, initialOf, roleColor } from '@/lib/avatars.js';

const session = useSession();
// Confirmed business rule: KPI management (assign/edit/review) is Director-only — narrower than COH, which
// also allows HR. can('performance.edit') no longer grants this; firestore.rules enforces the same boundary.
const canManageKpi = computed(() => session.role === 'director');

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const okMsg = ref('');
// Director lands on the review dashboard by default; everyone else only ever sees their own KPIs.
const tab = ref(session.role === 'director' ? 'admin' : 'mine');

const quarters = ref([]);
const quarterId = ref('');
const quarter = ref(null);
const myAssignments = ref([]);
const mySubs = ref({});
const allRows = ref([]);
const participants = ref([]);
const employeeKpis = ref(null);
const drafts = reactive({});

const editingId = ref(null);
const blankScoringRules = () => ({ earlyDays: '', earlyRating: '', onTimeRating: '', overdueRating: '' });
const assignForm = ref({ title: '', description: '', target: '', weightage: '', deadline: '', completionCriteria: '', scoringRules: blankScoringRules() });
const otherWeightage = computed(() => {
  if (!employeeKpis.value) return 0;
  return totalWeightage(kpisFor(employeeKpis.value.employeeId).filter(a => a.id !== editingId.value));
});

const reviewing = ref(null);
const reviewRating = ref(3);
const reviewComments = ref('');
const reviewReason = ref('');
const discussionThread = ref(null);
const discussionReplies = reactive({});
const editingComment = ref(null);
const editingCommentText = ref('');
const employeeDiscussionThreads = reactive({});
const chatModalOpen = ref(null);
const currentConversation = ref(null);
const chatInput = ref('');
const editingMessageId = ref(null);
const editingMessageText = ref('');

const mySub = id => mySubs.value[id] || null;
const getEmployeeDiscussionThread = assignmentId => employeeDiscussionThreads[assignmentId] || null;
// Uses this specific task's Director-configured early/on-time/overdue rule when set, otherwise the app-wide
// default (DEFAULT_DEADLINE_THRESHOLDS, unchanged) — suggestDeadlineRating itself never changed.
const suggestion = a => suggestDeadlineRating(a.deadline, drafts[a.id]?.completionTimestamp || null, a.scoringRules ? customThresholds(a.scoringRules) : undefined);

// Four display-only buckets (Not Submitted / Submitted / Pending / Done) over the five real stored statuses —
// the underlying kpiSubmissions.status values and the scoring they feed are unchanged, only how they're shown.
function simpleStatus(s) {
  // Handle new status values
  if (s === 'submitted') return 'Submitted';
  if (s === 'pendingReview') return 'Pending Review';
  if (s === 'discussionRequested') return 'Discussion Requested';
  if (s === 'resubmitted') return 'Resubmitted';
  if (s === 'done') return 'Done';
  // Handle old status values for backwards compatibility
  if (s === 'approved' || s === 'rejected') return 'Done';
  if (s === 'revisionRequested' || s === 'underReview') return 'Pending Review';
  if (s === 'inProgress') return 'Submitted';
  return 'Not Submitted';
}
function simpleStatusClass(s) {
  // Handle new status values
  if (s === 'submitted') return 'amber';
  if (s === 'pendingReview') return 'blue';
  if (s === 'discussionRequested') return 'orange';
  if (s === 'resubmitted') return 'blue';
  if (s === 'done') return 'green';
  // Handle old status values
  if (s === 'approved' || s === 'rejected') return 'green';
  if (s === 'revisionRequested' || s === 'underReview') return 'blue';
  if (s === 'inProgress') return 'amber';
  return 'grey';
}

function statusLabel(s) {
  return { 'submitted': 'Submitted', 'pendingReview': 'Pending Review', 'discussionRequested': 'Discussion Requested', 'resubmitted': 'Resubmitted', 'done': 'Done' }[s] || 'Not Submitted';
}
function statusClass(s) {
  return { 'submitted': 'amber', 'pendingReview': 'blue', 'discussionRequested': 'orange', 'resubmitted': 'blue', 'done': 'green' }[s] || 'grey';
}

function formatWhen(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleString();
}

// Max 40 marks (or whatever the quarter's actually configured for KPI) split across tasks by weightage; each
// task's live score uses the supervisor's rating once reviewed, else the employee's own self-rating as a
// provisional preview — never silently zero before either exists.
const kpiMaxMarks = computed(() => quarter.value?.weights?.kpi ?? 40);
const taskMaxPoints = a => Math.round((Number(a.weightage || 0) / 100) * kpiMaxMarks.value * 100) / 100;
function taskScoreText(a, sub) {
  if (sub) {
    // Handle both new (directorRating/finalApprovedRating) and old field names
    const dirRating = sub.directorRating ?? sub.finalApprovedRating;
    const ratingUsed = dirRating ?? sub.selfRating ?? null;
    const max = taskMaxPoints(a);
    if (ratingUsed == null) return `— / ${max}`;
    return `${Math.round((ratingUsed / 5) * max * 100) / 100} / ${max}`;
  }
  const subFromMap = (employeeKpis.value ? subOf(a.id) : mySub(a.id));
  const dirRating = subFromMap?.directorRating ?? subFromMap?.finalApprovedRating;
  const ratingUsed = dirRating ?? subFromMap?.selfRating ?? null;
  const max = taskMaxPoints(a);
  if (ratingUsed == null) return `— / ${max}`;
  return `${Math.round((ratingUsed / 5) * max * 100) / 100} / ${max}`;
}

const myTotalWeightage = computed(() => totalWeightage(myAssignments.value));
const myDoneCount = computed(() => myAssignments.value.filter(a => ['approved', 'rejected'].includes(mySub(a.id)?.status)).length);
const myScore = computed(() => kpiScoreFor(myAssignments.value, mySubs.value, kpiMaxMarks.value));
const myScoreStatusText = computed(() => {
  const s = myScore.value;
  if (s.status === 'n/a') return 'No KPIs assigned this quarter';
  if (s.status === 'pending') return `${s.rated} of ${s.total} tasks reviewed so far`;
  return 'All tasks reviewed';
});

async function load() {
  loading.value = true;
  try {
    quarters.value = (await listQuarters()).filter(q => q.status !== 'draft' && q.status !== 'archived');
    if (!quarterId.value && quarters.value.length) quarterId.value = quarters.value[0].id;
    if (!quarterId.value) return;
    quarter.value = await getQuarter(quarterId.value);
    myAssignments.value = await listAssignmentsFor(quarterId.value, session.user.uid);
    // Seed a blank draft for every assignment IMMEDIATELY, before the next await — myAssignments.value just
    // changed, which can trigger a re-render on the next microtask tick (any await is a scheduler checkpoint).
    // If drafts[a.id] isn't guaranteed to exist yet at that point, the template crashes reading
    // drafts[a.id].completionTimestamp. This also means a transient failure fetching submissions below (e.g.
    // a permission hiccup on a brand-new, not-yet-submitted task) can no longer break the whole page.
    for (const a of myAssignments.value) if (!drafts[a.id]) drafts[a.id] = { selfRating: null, selfComments: '', completionTimestamp: '', seeded: false };
    const subRows = await listSubmissionsFor(myAssignments.value);
    mySubs.value = Object.fromEntries(subRows.map(r => [r.assignment.id, r.submission]));
    // selfRating starts null, not a default of 3 — a pre-highlighted "Good" that nobody actually chose would
    // let an employee submit without ever touching the rating picker (same category of bug fixed in the COH
    // redesign). The Submit button stays disabled until a real rating is picked. Only seed from the existing
    // submission once, so this doesn't clobber whatever the employee is already mid-typing on a later reload.
    for (const a of myAssignments.value) {
      const d = drafts[a.id];
      if (!d.seeded) {
        const existing = mySubs.value[a.id];
        Object.assign(d, { selfRating: existing?.selfRating ?? null, selfComments: existing?.selfComments || '', completionTimestamp: existing?.completionTimestamp || '', seeded: true });
      }
      // Load discussion threads for KPIs in discussion
      if (mySubs.value[a.id]?.status === 'discussionRequested' || mySubs.value[a.id]?.status === 'resubmitted') {
        try {
          const thread = await getDiscussionThread(a.id);
          if (thread) employeeDiscussionThreads[a.id] = thread;
        } catch (e) { console.warn('Failed to load discussion thread:', e); }
      }
    }
    if (canManageKpi.value) {
      participants.value = (await listParticipants(quarterId.value)).filter(p => p.participationStatus === 'active');
      const all = await listAllAssignments(quarterId.value);
      allRows.value = await listSubmissionsFor(all);
    }
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(load);
watch(quarterId, load);

const kpisFor = uid => allRows.value.filter(r => r.assignment.employeeId === uid).map(r => r.assignment);
const subOf = assignmentId => allRows.value.find(r => r.assignment.id === assignmentId)?.submission || null;
function openEmployeeKpis(p) { employeeKpis.value = p; startAdd(); }

function startAdd() {
  editingId.value = null;
  assignForm.value = { title: '', description: '', target: '', weightage: '', deadline: '', completionCriteria: '', scoringRules: blankScoringRules() };
}
function startEdit(a) {
  editingId.value = a.id;
  assignForm.value = {
    title: a.title, description: a.description || '', target: a.target || '', weightage: a.weightage,
    deadline: a.deadline || '', completionCriteria: a.completionCriteria || '',
    scoringRules: a.scoringRules ? { ...a.scoringRules } : blankScoringRules()
  };
}
// null unless every field was actually filled in — a half-filled override would silently apply default values
// for the fields left blank, which isn't what "leave blank to use the default" should mean.
function builtScoringRules() {
  const r = assignForm.value.scoringRules;
  const filled = ['earlyDays', 'earlyRating', 'onTimeRating', 'overdueRating'].every(k => r[k] !== '' && r[k] != null);
  if (!filled) return null;
  return { earlyDays: Number(r.earlyDays), earlyRating: Number(r.earlyRating), onTimeRating: Number(r.onTimeRating), overdueRating: Number(r.overdueRating) };
}
async function saveAssignForm() {
  if (!assignForm.value.title || !assignForm.value.weightage) { error.value = 'Title and weightage are required.'; return; }
  saving.value = true; error.value = '';
  try {
    const patch = {
      title: assignForm.value.title, description: assignForm.value.description, target: assignForm.value.target,
      weightage: Number(assignForm.value.weightage), deadline: assignForm.value.deadline,
      completionCriteria: assignForm.value.completionCriteria, scoringRules: builtScoringRules()
    };
    if (editingId.value) {
      await updateAssignment(editingId.value, patch);
      okMsg.value = 'KPI updated.';
    } else {
      await createAssignment({ ...patch, quarterId: quarterId.value, employeeId: employeeKpis.value.employeeId, employeeName: employeeKpis.value.employeeName });
      okMsg.value = 'KPI added.';
    }
    const keepOpenFor = employeeKpis.value;
    await load();
    employeeKpis.value = keepOpenFor;
    startAdd();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

async function submitMine(a) {
  const d = drafts[a.id];
  if (d.selfRating == null) { error.value = 'Choose a self-rating before submitting.'; return; }
  if (myTotalWeightage.value !== 100) { error.value = 'Your KPI weightages must total 100% before you can submit.'; return; }
  saving.value = true; error.value = '';
  try {
    await submitSelfAssessment(a, { selfRating: d.selfRating, selfComments: d.selfComments, completionTimestamp: d.completionTimestamp });
    okMsg.value = 'Self-assessment submitted.'; await load();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

async function openReview(row) {
  reviewing.value = row;
  // Handle both new (directorRating) and old (finalApprovedRating) field names
  const dirRating = row.submission?.directorRating ?? row.submission?.finalApprovedRating;
  reviewRating.value = dirRating || row.submission?.selfRating || 3;
  reviewComments.value = row.submission?.directorComments || row.submission?.reviewerComments || '';
  discussionThread.value = await getDiscussionThread(row.assignment.id);
}

async function sendBack() {
  if (!reviewRating.value) { error.value = 'Please provide a rating.'; return; }
  if (!reviewComments.value) { error.value = 'Please add comments.'; return; }
  saving.value = true; error.value = '';
  try {
    await sendBackForDiscussion(reviewing.value.assignment.id, { directorRating: reviewRating.value, directorComments: reviewComments.value });
    okMsg.value = 'KPI sent back for discussion.'; reviewing.value = null; await load();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

async function approve() {
  if (!reviewRating.value) { error.value = 'Please provide a final rating.'; return; }
  saving.value = true; error.value = '';
  try {
    await approveKpiRating(reviewing.value.assignment.id, { directorRating: reviewRating.value, directorComments: reviewComments.value });
    okMsg.value = 'KPI approved and finalized.'; reviewing.value = null; await load();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

async function postReply() {
  if (!reviewComments.value) { error.value = 'Please add a comment.'; return; }
  saving.value = true; error.value = '';
  try {
    await postDirectorReply(reviewing.value.assignment.id, reviewComments.value);
    okMsg.value = 'Reply posted.'; reviewComments.value = '';
    discussionThread.value = await getDiscussionThread(reviewing.value.assignment.id);
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

async function rerateOnly() {
  if (!reviewRating.value) { error.value = 'Please provide a rating.'; return; }
  saving.value = true; error.value = '';
  try {
    await rerateKpi(reviewing.value.assignment.id, reviewRating.value);
    okMsg.value = 'Rating updated.'; reviewing.value = null; await load();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

async function reopenForDiscussion() {
  if (!reviewRating.value) { error.value = 'Please provide a rating.'; return; }
  if (!reviewComments.value) { error.value = 'Please add comments for reopening.'; return; }
  saving.value = true; error.value = '';
  try {
    await reopenAndSendBack(reviewing.value.assignment.id, { directorRating: reviewRating.value, directorComments: reviewComments.value });
    okMsg.value = 'KPI reopened and sent back for discussion.'; reviewing.value = null; await load();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

async function submitDiscussionReply(a) {
  const reply = discussionReplies[a.id];
  if (!reply || !reply.trim()) { error.value = 'Please type a message.'; return; }
  saving.value = true; error.value = '';
  try {
    await postDiscussionReply(a.id, reply);
    discussionReplies[a.id] = '';
    // Update status to resubmitted
    await updateDoc(doc(db, 'kpiSubmissions', a.id), { status: 'resubmitted' });
    okMsg.value = 'Reply sent. Please resubmit when ready for approval.';
    await load();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

function startEditComment(comment) {
  editingComment.value = comment;
  editingCommentText.value = comment.message;
}

async function saveEditedComment() {
  if (!editingComment.value) return;
  if (!editingCommentText.value.trim()) { error.value = 'Comment cannot be empty.'; return; }
  saving.value = true; error.value = '';
  try {
    await editDiscussionComment(discussionThread.value.submissionId, editingComment.value.id, editingCommentText.value);
    okMsg.value = 'Comment updated.';
    editingComment.value = null;
    discussionThread.value = await getDiscussionThread(discussionThread.value.submissionId);
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

async function removeComment(submissionId, commentId) {
  if (!confirm('Delete this comment? This cannot be undone.')) return;
  saving.value = true; error.value = '';
  try {
    await deleteDiscussionComment(submissionId, commentId);
    okMsg.value = 'Comment deleted.';
    discussionThread.value = await getDiscussionThread(submissionId);
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}
</script>

<style scoped>
.row-selected { background: var(--hover); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* Follows the account's theme (Settings > Appearance) throughout, same as the COH redesign — var(--surface),
   var(--accent) etc. already flip for light/dark mode, nothing here is a fixed palette. */
.kpi-muted { color: var(--text-2); font-size: 12px; }

.kpi-summary {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; margin-bottom: 16px;
}
.kpi-summary-value { font-size: 28px; font-weight: 700; color: var(--text); }
.kpi-summary-value small { font-size: 14px; font-weight: 500; color: var(--text-2); }
.kpi-summary-stats { display: flex; gap: 22px; }
.kpi-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.kpi-stat b { font-size: 18px; color: var(--text); }
.kpi-stat .kpi-warn { color: var(--amber); }

.kpi-cards { display: flex; flex-direction: column; gap: 12px; }
.kpi-card-empty { color: var(--text-2); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; text-align: center; }

.kpi-task-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.kpi-task-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.kpi-task-title { font-weight: 600; font-size: 15px; color: var(--text); }
.kpi-task-desc { font-size: 13px; color: var(--text-2); margin: 4px 0 0; }

.kpi-status-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; white-space: nowrap; background: var(--chip); color: var(--text-2); }
.kpi-status-badge.amber { background: var(--amber-soft); color: var(--amber); }
.kpi-status-badge.blue { background: var(--blue-soft); color: var(--blue); }
.kpi-status-badge.green { background: var(--green-soft); color: var(--green); }
.kpi-status-badge.red { background: var(--red-soft); color: var(--red); }

.kpi-task-meta { display: flex; gap: 20px; flex-wrap: wrap; margin: 10px 0 14px; padding: 10px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.kpi-task-meta > div { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.kpi-task-meta b { color: var(--text); }

.kpi-rating-compare { display: flex; gap: 24px; margin-bottom: 8px; }
.kpi-rating-compare > div { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.kpi-rating-compare b { font-size: 16px; color: var(--text); }

.kpi-review-section {
  padding: 12px; background: var(--chip); border-radius: var(--radius);
}

.kpi-review-section.discussion-needed {
  background: var(--orange-soft); border: 2px solid var(--orange);
}

.kpi-rating-section {
  padding: 12px; background: var(--surface); border-radius: var(--radius);
  border: 1px solid var(--border);
}

.kpi-rating-section.discussion-needed {
  border: 2px solid var(--orange); background: var(--orange-soft);
  box-shadow: 0 0 0 4px rgba(255, 152, 0, 0.1);
}

.kpi-chat-container {
  display: flex; flex-direction: column; gap: 12px;
}

.kpi-discussion-chat {
  display: flex; flex-direction: column; gap: 12px;
  background: var(--chip); padding: 16px; border-radius: var(--radius);
  max-height: 400px; overflow-y: auto; min-height: 120px;
}

.kpi-chat-empty {
  text-align: center; color: var(--text-2); padding: 24px;
  font-style: italic;
}

.kpi-chat-msg {
  display: flex; gap: 10px; align-items: flex-end;
}

.kpi-chat-msg.by-me {
  flex-direction: row-reverse;
}

.kpi-chat-avatar {
  width: 36px; height: 36px; min-width: 36px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: white; font-weight: 600; font-size: 14px;
}

.kpi-chat-bubble {
  flex: 1; max-width: 70%;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 10px 12px;
}

.kpi-chat-msg.by-me .kpi-chat-bubble {
  background: var(--accent); border: 1px solid var(--accent);
}

.kpi-chat-msg-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
  flex-wrap: wrap; font-size: 12px;
}

.kpi-chat-sender {
  font-weight: 600; color: var(--text);
}

.kpi-chat-msg.by-me .kpi-chat-sender {
  color: white;
}

.kpi-chat-badge {
  background: var(--chip); padding: 2px 6px; border-radius: 3px;
  font-size: 10px; color: var(--text-2); font-weight: 500;
}

.kpi-chat-msg.by-me .kpi-chat-badge {
  background: rgba(255,255,255,0.2); color: white;
}

.kpi-chat-time {
  color: var(--text-2); font-size: 11px;
}

.kpi-chat-msg.by-me .kpi-chat-time {
  color: rgba(255,255,255,0.7);
}

.kpi-chat-edited {
  color: var(--text-2); font-size: 10px; font-style: italic;
}

.kpi-chat-msg.by-me .kpi-chat-edited {
  color: rgba(255,255,255,0.7);
}

.kpi-chat-msg-text {
  margin: 0; color: var(--text); line-height: 1.5;
  word-wrap: break-word; white-space: pre-wrap;
}

.kpi-chat-msg.by-me .kpi-chat-msg-text {
  color: white;
}

.kpi-chat-actions {
  display: flex; gap: 8px; margin-top: 8px;
}

.kpi-chat-action {
  background: none; border: none; font-size: 11px; cursor: pointer;
  padding: 0; color: var(--text-2); text-decoration: none;
}

.kpi-chat-msg.by-me .kpi-chat-action {
  color: rgba(255,255,255,0.8);
}

.kpi-chat-action:hover {
  color: var(--text);
}

.kpi-chat-msg.by-me .kpi-chat-action:hover {
  color: white;
}

.kpi-chat-input-section {
  display: flex; flex-direction: column; gap: 8px;
  background: var(--chip); padding: 12px; border-radius: var(--radius);
}

.kpi-chat-input {
  width: 100%; padding: 10px; font-size: 13px;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--text);
  font-family: inherit; resize: vertical; min-height: 60px;
}

.kpi-chat-input:focus {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft);
}

.kpi-chat-input-actions {
  display: flex; justify-content: space-between; align-items: center;
}

.kpi-chat-hint {
  font-size: 11px; color: var(--text-2);
}

.kpi-chat-box {
  background: var(--chip); border-radius: var(--radius); padding: 10px;
  max-height: 200px; overflow-y: auto;
}

.kpi-chat-message {
  background: var(--surface); padding: 10px; border-radius: 6px;
  margin-bottom: 8px; font-size: 13px;
}

.kpi-chat-message.supervisor {
  border-left: 4px solid var(--accent);
}

.kpi-chat-header {
  display: flex; justify-content: space-between; gap: 8px;
  margin-bottom: 6px; font-size: 12px;
}

.kpi-chat-name {
  font-weight: 600; color: var(--text);
}

.kpi-chat-time {
  color: var(--text-2); font-size: 11px;
}

.kpi-chat-text {
  margin: 0; color: var(--text); line-height: 1.4; word-wrap: break-word;
}

.kpi-discussion-thread {
  display: flex; flex-direction: column; gap: 10px; background: var(--chip); padding: 10px; border-radius: var(--radius);
}

.kpi-thread-msg {
  background: var(--surface); padding: 10px 12px; border-radius: 6px; font-size: 13px;
}

.kpi-thread-msg.by-director { border-left: 3px solid var(--accent); }

.kpi-thread-head {
  display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; font-size: 12px;
}

.kpi-thread-head b { color: var(--text); }

.kpi-thread-text {
  margin: 0; color: var(--text); line-height: 1.4;
}

@media (max-width: 640px) {
  .kpi-summary { flex-direction: column; align-items: flex-start; }
  .kpi-task-meta { gap: 12px; }
}
</style>
