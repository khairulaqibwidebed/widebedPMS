// lib/access.js
// One place that answers "can this person open this page?".
// A person has one main role (users/{uid}.role) plus any extra departments ticked on
// Staff accounts (users/{uid}.extraRoles). Extra departments never include 'director'.

export function myRoles(me) {
  const extras = (me && me.extraRoles) || [];
  return [me && me.role, ...extras.filter(r => r !== 'director')].filter(Boolean);
}

// Does this person have this role, as main role or as an extra department?
export function hasRole(me, role) {
  return myRoles(me).includes(role);
}

// Can this person open a page whose meta.roles is `roles`?
export function canOpen(roles, me) {
  return myRoles(me).some(r => roles.includes(r));
}