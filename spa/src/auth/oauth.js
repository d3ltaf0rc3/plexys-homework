import { reactive, computed } from 'vue'
import { config } from '../config'

// Sign-in through Corteza's default auth client, the same flow Corteza's own
// webapps use (lib/vue/src/plugins/auth.ts in the Corteza monorepo). That
// plugin targets Vue 2, so this is a small Vue 3 port of the parts we need.
//
// /auth/oauth2/default-client starts the authorization-code flow and, on POST,
// exchanges the code or refresh token. The server adds the default client's
// secret itself and only accepts redirect URIs on Corteza's own origin (plus
// AUTH_DEFAULT_REDIRECT_URIS), so no client ID or secret lives in this app.
//
// The access token is kept in memory only; the refresh token lives in
// sessionStorage so a reload can resume the session without a new login.

const FLOW_URL = `${config.authUrl}/oauth2/default-client`
const REFRESH_KEY = 'auth.refresh-token'
const STATE_KEY = 'auth.state'
const REFRESH_FACTOR = 0.75

const state = reactive({
  accessToken: null,
  user: null, // { userID, name, handle, email }
})

let refreshTimer = null
let refreshing = null

function storage(key, value) {
  try {
    if (value === undefined) return JSON.parse(sessionStorage.getItem(key))
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    return null
  }
}

// Only paths inside this app; anything else (other origins, "//host",
// "/\host") falls back to the start page.
function safeReturnTo(path) {
  return typeof path === 'string' && /^\/(?![/\\])/.test(path) ? path : '/'
}

export function login(returnTo = '/') {
  const s = crypto.randomUUID()
  storage(STATE_KEY, { state: s, returnTo: safeReturnTo(returnTo) })
  const params = new URLSearchParams({ redirect_uri: config.redirectUri, scope: config.scope, state: s })
  window.location.assign(`${FLOW_URL}?${params}`)
}

async function tokenRequest(body) {
  const res = await fetch(FLOW_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) {
    const err = new Error(data.error_description || data.error?.message || data.error || `Token request failed (${res.status})`)
    err.code = data.error
    throw err
  }
  return data
}

// Who the token belongs to. Neither the token response nor /oauth2/info
// carries a name (only `sub`), so validate the token there and then read
// the user through the system API.
async function loadUser(accessToken) {
  const res = await fetch(`${config.authUrl}/oauth2/info`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const claims = await res.json().catch(() => ({}))
  if (!res.ok || claims.active === false) throw new Error('Could not verify the session.')

  // Imported lazily: the API client itself depends on this module for tokens.
  // The token is passed explicitly because it is not in the session yet.
  const { systemApi } = await import('../api/client')
  const u = await systemApi.userRead({ userID: claims.sub }, { headers: { Authorization: `Bearer ${accessToken}` } })
  return { userID: u.userID, name: u.name || '', handle: u.handle || '', email: u.email || '', claims }
}

// The user is loaded before anything is stored, so a failed lookup leaves no
// half-signed-in session behind (token set, but no user).
async function applyTokens(data) {
  const user = state.user ?? await loadUser(data.access_token)
  clearTimeout(refreshTimer)
  storage(REFRESH_KEY, data.refresh_token)
  state.accessToken = data.access_token
  state.user = user
  refreshTimer = setTimeout(() => refresh().catch(() => {}), (data.expires_in || 3600) * REFRESH_FACTOR * 1000)
}

export async function handleCallback(query) {
  const saved = storage(STATE_KEY)
  storage(STATE_KEY, null)

  if (query.error) throw new Error(query.error_description || query.error)
  if (!saved || query.state !== saved.state) throw new Error('Login state mismatch, please try again.')

  await applyTokens(await tokenRequest({ code: query.code, scope: config.scope, redirect_uri: config.redirectUri }))
  return safeReturnTo(saved.returnTo)
}

// Exchanges the stored refresh token for a new access token. Concurrent
// callers share one request. On failure the session is dropped.
export function refresh() {
  const token = storage(REFRESH_KEY)
  if (!token) return Promise.resolve(null)
  refreshing ??= tokenRequest({ refresh_token: token })
    .then(applyTokens)
    .then(() => state.accessToken)
    .catch((e) => {
      clearSession()
      throw e
    })
    .finally(() => { refreshing = null })
  return refreshing
}

// Resume a session after a reload. Resolves either way; check isAuthenticated.
export async function restoreSession() {
  if (state.accessToken || !storage(REFRESH_KEY)) return
  await refresh().catch(() => {})
}

function clearSession() {
  clearTimeout(refreshTimer)
  state.accessToken = null
  state.user = null
  storage(REFRESH_KEY, null)
}

// Synchronous accessor, as corteza-js API clients expect (accessTokenFn).
export function accessToken() {
  return state.accessToken || undefined
}

// Ends the local session and the Corteza session, then comes back here.
export function logout() {
  clearSession()
  const back = new URL(config.basePath, window.location.origin).href
  window.location.assign(`${config.authUrl}/logout?${new URLSearchParams({ back })}`)
}

export function useAuth() {
  return {
    isAuthenticated: computed(() => !!state.accessToken),
    user: computed(() => state.user),
    userName: computed(() => state.user?.name || state.user?.handle || state.user?.email || ''),
    login,
    logout,
  }
}
