// New owner listing -> Portfolio add form, handed over in memory (never in the address: it can hold the owner's
// phone and email). One pending hand-over at a time; a page reload or 10 minutes drops it.
//   { kind: 'property' | 'unit' | 'owner', listingId, property, unit, ownerName, ownerPhone, ownerEmail, portfolio: { propertyId, unitId, ownerId } }
const TTL = 10 * 60 * 1000;
let pending = null;

export function handOff(data) { pending = { ...data, at: Date.now() }; }
export function peekHandoff() {
  if (pending && Date.now() - pending.at > TTL) pending = null;
  return pending;
}
export function takeHandoff() { const h = peekHandoff(); pending = null; return h; }
