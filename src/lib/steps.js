// Step strips on forms (components/StepStrip.vue). A form lists its steps; this works out each card's state.
// A step: { key, label, required: [{ label, filled }], notNeeded: bool, problem: '' | 'what is wrong', review: bool }
//   required  : the fields that must be filled for the step to be Done (labels are shown in the "still missing" list)
//   notNeeded : the step doesn't apply (e.g. deposit on a short stay) - greyed, counts as done
//   problem   : something entered is invalid - red "Check this", the text is shown in the review list
//   review    : the last "Review & save" card (ready when every other step is done)

// state: 'skip' | 'bad' | 'done' | 'part' | 'todo' | 'optional', note: the small text under the label
export function stepState(s) {
  if (s.notNeeded) return { state: 'skip', note: 'Not needed', missing: [] };
  const req = s.required || [];
  const missing = req.filter(r => !r.filled).map(r => r.label);
  if (s.problem) return { state: 'bad', note: 'Check this', missing };
  if (!req.length) return { state: 'optional', note: 'Optional', missing };
  if (!missing.length) return { state: 'done', note: 'Done', missing };
  const got = req.length - missing.length;
  return { state: got ? 'part' : 'todo', note: `${got}/${req.length} done`, missing };
}

// Every step but the review one is done (or not needed, or has nothing required) and nothing is invalid
export function allDone(steps) {
  return steps.filter(s => !s.review).every(s => ['done', 'skip', 'optional'].includes(stepState(s).state));
}

// What still stops the save, one line per step: { index, label, items: [missing labels, or the problem] }
export function stillMissing(steps) {
  return steps.map((s, index) => ({ s, index })).filter(({ s }) => !s.review).map(({ s, index }) => {
    const st = stepState(s);
    const items = [...(s.problem ? [s.problem] : []), ...st.missing];
    return { index, label: s.label, items };
  }).filter(x => x.items.length);
}
