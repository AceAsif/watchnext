// Sent with every Google sign-in. `select_account` makes Google show its account chooser each
// time, instead of silently reusing the one Google account the browser is already signed into
// (which is why a second account could never be picked, even after signing out of WatchNext).
export const GOOGLE_SIGN_IN_PARAMS = Object.freeze({ prompt: 'select_account' });
