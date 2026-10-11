// PURE: the signed-in account's email address, as stored on the user's own Firestore document
// (users/{uid}) so you can tell whose data you are looking at in the Firebase console.
// Only the email is kept: never the name, the photo or anything else from the Google profile.

// -> a tidy lower-case address, or null when there isn't a usable one.
export function cleanEmail(raw) {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(e) ? e : null;
}
