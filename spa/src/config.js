// Runtime settings come from config.js, which Corteza's webapp server
// generates for every app in HTTP_WEBAPP_LIST (and the Vite dev server
// imitates). The one exception is the namespace slug, which Vite bakes in
// at build time from VITE_NAMESPACE.
const trim = (url) => url.replace(/\/$/, '')

// <base href> is rewritten by Corteza to where the app is mounted, e.g. /tickets/.
const basePath = new URL(document.baseURI).pathname

export const config = {
  apiUrl: trim(window.CortezaAPI || '/api'),
  authUrl: trim(window.CortezaAuth || '/auth'),
  basePath,
  // Same callback path Corteza's own webapps use.
  redirectUri: new URL('auth/callback', document.baseURI).href,
  scope: 'profile api',
  namespace: import.meta.env.VITE_NAMESPACE || '',
  // The app's main module (its handle); related modules such as Customer
  // are found through its Record fields.
  module: 'ticket',
}
