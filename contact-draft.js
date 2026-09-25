// Person contact values have one source of truth in both profile and intake forms.
// Keep deliberate edits (including clearing a field), but refresh untouched fields.
export function reconcileContactDraft(draft, person) {
  if (draft.pending) return draft;
  const latest = Object.fromEntries(['name', 'email', 'phone'].map(key => [key, person[key] ?? '']));
  for (const key of Object.keys(latest)) {
    if (!draft.dirty || !draft.contactBaseline || draft[key] === draft.contactBaseline[key]) draft[key] = latest[key];
  }
  draft.contactBaseline = latest;
  return draft;
}
