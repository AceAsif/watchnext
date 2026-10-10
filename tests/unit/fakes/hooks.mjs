// Node module hooks for cloud_hidden.test.mjs: swap Firebase for the in-memory fakes in this folder,
// so the REAL store/cloudEngine.js can run in plain Node.
const here = new URL('./', import.meta.url);
export async function resolve(specifier, context, next) {
  if (specifier === 'firebase/auth') return { url: new URL('firebase-auth.mjs', here).href, shortCircuit: true };
  if (specifier === 'firebase/firestore') return { url: new URL('firestore.mjs', here).href, shortCircuit: true };
  if (specifier === '../firebase.js' && context.parentURL && context.parentURL.endsWith('/store/cloudEngine.js')) return { url: new URL('firebase-app.mjs', here).href, shortCircuit: true };
  return next(specifier, context);
}
