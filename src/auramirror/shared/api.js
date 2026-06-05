/**
 * Shared client API helpers for the new AuraMirror pages.
 *
 * New file (merge-safe): logic is copied from index.js rather than imported, so
 * concurrent edits to index.js never touch this module. Endpoint URLs are built
 * locally from API_BASE_URL — this file does not depend on API_ENDPOINTS.
 */
import { API_BASE_URL, STORAGE_KEYS } from '../config.js'

/** Read the stored JWT, tolerating disabled/locked localStorage. */
export function getApiToken() {
  try {
    return localStorage.getItem(STORAGE_KEYS.apiToken) || ''
  } catch {
    return ''
  }
}

/** Build request headers, adding a Bearer token when one is available. */
export function authHeaders(extra = {}) {
  const token = getApiToken()
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

function getApiOrigin() {
  try {
    return new URL(API_BASE_URL, window.location.origin).origin
  } catch {
    return window.location.origin
  }
}

/** Resolve a possibly-relative or object-store asset URL into a loadable URL. */
export function resolveAssetUrl(url) {
  if (!url) return ''

  try {
    return new URL(url, getApiOrigin()).href
  } catch {
    return url
  }
}

/**
 * Fetch + JSON parse with unified error handling.
 * Unwraps the backend's { success, data } envelope when present, but also
 * tolerates bare JSON responses (e.g. /api/config, /api/health).
 */
export async function apiFetch(url, options = {}) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(
      payload?.message || payload?.error || `Request failed (${response.status})`
    )
    error.status = response.status
    throw error
  }

  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (!payload.success) {
      throw new Error(payload.message || 'Request failed')
    }
    return payload.data ?? payload
  }

  return payload
}

/**
 * Poll an async task until it completes or fails.
 * Mirrors the polling contract used elsewhere in the app.
 */
export async function pollTaskStatus(
  taskId,
  onProgress,
  { interval = 3000, maxAttempts = 120 } = {}
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, interval))

    try {
      const data = await apiFetch(
        `${API_BASE_URL}/tasks/${encodeURIComponent(taskId)}`,
        { headers: authHeaders() }
      )

      if (onProgress) onProgress(data)
      if (data?.status === 'completed') return data
      if (data?.status === 'failed') {
        throw new Error(data?.error || data?.error_code || 'Task failed')
      }
    } catch (error) {
      if (String(error.message).includes('failed')) throw error
    }
  }

  throw new Error('Task timed out')
}
