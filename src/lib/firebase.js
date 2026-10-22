// One place that starts Firebase. Everything imports from here.
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence, doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '../firebase-config.js';

export const configMissing = firebaseConfig.apiKey.startsWith('PASTE');

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Offline cache (persistent, shared by every tab): documents read or written are kept in this browser profile
// (IndexedDB). Pages read finished data from it first (completed statements, month summaries that are still current:
// see summary-data.js readMonthDoc and Month-end's cachedStatement), which saves free-plan reads. Because the copy stays
// in the browser profile, Log out deletes it (logOut below), so the next person on a shared computer starts empty.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true
});

// Roles that can sign in. Each sees only the pages in its sidebar (nav.js) and its route list (router.js).
export const ALLOWED_ROLES = ['director', 'finance', 'it', 'hr', 'operations', 'procurement', 'marketing'];   // every role signs in (Khairul 21 Oct)
export const ROLE_LABEL = { director: 'Director', finance: 'Finance', it: 'IT', operations: 'Operations', hr: 'HR', procurement: 'Procurement', marketing: 'Marketing' };

// A person's role lives on their staff record, users/{uid} (set on the Staff accounts page).
// The security rules read the same record, so the role here and in the rules always match.
export async function profileOf(user) {
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return { role: null, name: user.email };
    const p = snap.data();
    return { role: p.active === false ? null : (p.role || null), name: p.displayName || user.email, active: p.active !== false };
  } catch (_) {
    return { role: null, name: user.email };
  }
}

// Resolves once with { user, role, name } (user = null when signed out).
export function whoAmI() {
  return new Promise(resolve => {
    const stop = onAuthStateChanged(auth, async user => {
      stop();
      if (!user) return resolve({ user: null, role: null });
      resolve({ user, ...(await profileOf(user)) });
    });
  });
}

// Log out also clears the offline cache: Firestore is stopped first (the cache can only be cleared then), the saved
// copy is deleted from this browser profile, and the page reloads so Firestore starts again empty for the next person.
// If another tab still holds the cache open, clearing fails; signing out still happens, and the copy is cleared at the
// next Log out with one tab.
export async function logOut() {
  await signOut(auth);
  try { await terminate(db); await clearIndexedDbPersistence(db); }
  catch (e) { console.warn('Could not clear the offline copy (another Widebed tab is open?):', e.code || e.message); }
  location.replace('/');
}
