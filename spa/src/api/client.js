import { apiClients } from '@cortezaproject/corteza-js'
import { accessToken, refresh } from '../auth/oauth'
import { config } from '../config'

// Corteza's first-party API clients. They read the current access token on
// every request through accessTokenFn, so token refreshes need no rewiring.
const opts = (svc) => ({ baseURL: `${config.apiUrl}/${svc}`, accessTokenFn: accessToken })

export const composeApi = new apiClients.Compose(opts('compose'))
export const systemApi = new apiClients.System(opts('system'))

export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message)
    this.status = status
    this.details = details
  }
}

// The clients reject with one of two shapes: Corteza's { message, meta }
// error object when the API answered 200 with { error }, or an axios error
// for non-2xx responses (body still { error: { message } }).
function toApiError(e) {
  if (e instanceof ApiError) return e
  const status = e?.response?.status ?? 0
  const body = e?.response?.data?.error ?? (e?.response ? null : e)
  const message = body?.message || (status ? `Request failed (${status})` : e?.message || 'Network error')
  return new ApiError(message, status, body)
}

// Runs a client call. An expired token (401) gets one refresh and one retry;
// if the refresh fails the session is dropped and the app returns to sign-in.
export async function call(fn) {
  try {
    return await fn()
  } catch (e) {
    const err = toApiError(e)
    if (err.status !== 401) throw err
    const token = await refresh().catch(() => null)
    if (!token) throw new ApiError('Your session has expired. Please sign in again.', 401)
    try {
      return await fn()
    } catch (e2) {
      throw toApiError(e2)
    }
  }
}
