const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const {
  getFirestore,
  FieldValue,
} = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();

exports.notifyDirectorsWhenIssueRaised = onDocumentCreated(
  'issues/{issueId}',
  async (event) => {
    const issue = event.data?.data();

    if (!issue) return;

    // Find active Director accounts.
    const directors = await db
      .collection('users')
      .where('role', '==', 'director')
      .where('active', '==', true)
      .get();

    const recipients = directors.docs.filter(
      (userDoc) => userDoc.id !== issue.raisedByUid
    );

    if (recipients.length === 0) return;

    const issueId = event.params.issueId;

    const batch = db.batch();

    for (const director of recipients) {
      const notificationRef = db.collection('notifications').doc();

      batch.set(notificationRef, {
        recipientUid: director.id,
        title: `New issue raised: ${issue.title || issueId}`,
        message: `${issue.raisedBy || 'A staff member'} raised an issue tagged to ${
          (issue.tags || []).join(', ') || 'no teams'
        }.`,
        type: 'issue',
        link: `/Issues?id=${encodeURIComponent(issueId)}`,
        read: false,
        createdByUid: issue.raisedByUid || null,
        issueId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }
);