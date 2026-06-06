import { API_ENDPOINTS } from './config'

export class AuraMirrorApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message)
    this.name = 'AuraMirrorApiError'
    this.status = status
    this.payload = payload
  }
}

export function unwrapData(payload) {
  return payload?.data ?? payload ?? {}
}

export function pickFirstObject(payload, keys = []) {
  const data = unwrapData(payload)

  for (const key of keys) {
    if (data?.[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
      return data[key]
    }
    if (payload?.[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key])) {
      return payload[key]
    }
  }

  return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
}

export function pickFirstArray(payload, keys = []) {
  const data = unwrapData(payload)

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
    if (Array.isArray(payload?.[key])) return payload[key]
  }

  if (Array.isArray(data)) return data
  if (Array.isArray(payload)) return payload

  return []
}

export async function apiRequest(endpoint, options = {}) {
  const {
    method = 'GET',
    token = '',
    body,
    headers = {},
    signal,
  } = options

  const requestHeaders = { ...headers }

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`
  }

  const init = {
    method,
    headers: requestHeaders,
    signal,
  }

  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json'
    init.body = JSON.stringify(body)
  }

  const response = await fetch(endpoint, init)
  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.success === false) {
    throw new AuraMirrorApiError(
      String(
        payload?.message ||
          payload?.error ||
          `Request failed (${response.status})`
      ),
      {
        status: response.status,
        payload,
      }
    )
  }

  return payload ?? {}
}

export function buildEndpoint(path, params = {}) {
  return Object.entries(params).reduce((next, [key, value]) => {
    return next.replace(`{${key}}`, encodeURIComponent(String(value)))
  }, path)
}

export function normalizeServerUser(user) {
  if (!user || typeof user !== 'object') return null
  const hasIdentity = Boolean(
    user.id ||
      user.user_id ||
      user._id ||
      user.name ||
      user.username ||
      user.display_name ||
      user.email ||
      user.mail
  )

  if (!hasIdentity) return null

  return {
    id: String(user.id || user.user_id || user._id || ''),
    name: String(user.name || user.username || user.display_name || 'Aura Member'),
    email: String(user.email || user.mail || ''),
    createdAt: user.created_at || user.date_create
      ? new Date(user.created_at || user.date_create).getTime()
      : Number(user.createdAt || Date.now()),
  }
}

export function normalizeClothRecord(item) {
  if (!item || typeof item !== 'object') return null

  const id = String(item._id || item.id || item.cloth_id || '')
  const attributes = item.attributes || item.metadata || {}
  const rawTags = item.tags || attributes.tags || []
  const rawSeason = item.season || attributes.season || []
  const rawOccasion = item.occasion || attributes.occasion || []

  return {
    _id: id,
    category: String(item.category || attributes.category || 'misc'),
    name: String(item.name || item.title || 'Unnamed garment'),
    imageUrl: String(
      item.image_url ||
        item.imageUrl ||
        item.image ||
        item.public_url ||
        ''
    ),
    indexed:
      typeof item.indexed === 'boolean'
        ? item.indexed
        : typeof attributes.indexed === 'boolean'
          ? attributes.indexed
          : null,
    attributes: {
      color: String(item.color || attributes.color || 'unknown'),
      material: String(item.material || attributes.material || 'unspecified'),
      season: Array.isArray(rawSeason)
        ? rawSeason.map(String)
        : String(rawSeason || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
      occasion: Array.isArray(rawOccasion)
        ? rawOccasion.map(String)
        : String(rawOccasion || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
      tags: Array.isArray(rawTags)
        ? rawTags.map(String)
        : String(rawTags || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    },
  }
}

export function normalizeFigureRecord(item) {
  if (!item || typeof item !== 'object') return null

  return {
    id: String(item.figure_id || item.id || item._id || ''),
    imageUrl: String(item.image_url || item.source_image_url || item.public_url || ''),
    avatarUrl: String(item.avatar_url || item.avatar_image_url || item.result_url || ''),
    status: String(item.status || 'uploaded'),
    createdAt: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
  }
}

export function normalizeTaskRecord(item) {
  if (!item || typeof item !== 'object') return null

  return {
    id: String(item.task_id || item.id || item._id || ''),
    type: String(item.type || item.task_type || item.result_type || 'task'),
    status: String(item.status || 'unknown'),
    progress: item.progress == null ? null : Number(item.progress),
    result: item.result || item,
    resultUrl: String(item.result_url || item.result?.result_url || item.result?.image_url || ''),
    error: String(item.error || item.error_code || ''),
    createdAt: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
  }
}

export function normalizeStyleRecord(item) {
  if (!item || typeof item !== 'object') return null

  const id = String(item.style_id || item.id || item._id || '')
  const recommendations = Array.isArray(item.recommendations)
    ? item.recommendations
    : Array.isArray(item.recommended_items)
      ? item.recommended_items
      : []

  return {
    id,
    headline: String(item.headline || item.name || `${item.occasion || 'AI'} recommendation`),
    summary: String(item.summary || item.description || ''),
    occasion: String(item.occasion || item.context?.occasion || 'office'),
    recommendations,
    previewImage: String(item.preview_image_url || item.image_url || item.result_image_url || ''),
    createdAt: item.created_at ? new Date(item.created_at).getTime() : Number(item.generatedAt || Date.now()),
  }
}

export function normalizeTryOnRecord(item) {
  if (!item || typeof item !== 'object') return null

  return {
    id: String(item.tryon_id || item.id || item._id || ''),
    figureId: String(item.figure_id || ''),
    clothIds: Array.isArray(item.cloth_ids) ? item.cloth_ids.map(String) : [],
    imageUrl: String(item.result_image_url || item.image_url || item.result_url || ''),
    status: String(item.status || 'unknown'),
    createdAt: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
  }
}

export function normalizeHistoryRecord(item) {
  if (!item || typeof item !== 'object') return null

  const type = String(item.type || item.mode || 'recommendation')
  const context = item.context || {}
  const createdAt = item.created_at
    ? new Date(item.created_at).getTime()
    : Number(item.generatedAt || item.timestamp || Date.now())

  return {
    id: String(item.history_id || item.id || item._id || ''),
    headline: String(item.headline || item.summary || `${type} history`),
    summary: String(item.summary || item.description || ''),
    rationale: String(item.rationale || item.reason || ''),
    mode: type,
    source: String(item.source || 'server'),
    generatedAt: createdAt,
    bulletPoints: Array.isArray(item.bulletPoints)
      ? item.bulletPoints.map(String)
      : Array.isArray(item.bullets)
        ? item.bullets.map(String)
        : [],
    context: {
      city: String(context.city || 'Unknown'),
      weatherLabel: String(context.weatherLabel || context.weather || 'controlled'),
      temperatureC:
        context.temperatureC == null && context.temperature == null
          ? null
          : Number(context.temperatureC ?? context.temperature),
      humidity: context.humidity == null ? null : Number(context.humidity),
      occasion: String(context.occasion || item.occasion || 'office'),
      source: String(context.source || item.source || 'server'),
    },
    cloths: Array.isArray(item.cloths)
      ? item.cloths.map(normalizeClothRecord).filter(Boolean)
      : [],
    previewImage: String(item.previewImage || item.result_image_url || item.result_url || ''),
    relatedTaskId: String(item.related_task_id || item.task_id || ''),
    styleId: String(item.style_id || ''),
    tryonId: String(item.tryon_id || ''),
    raw: item,
  }
}

export const endpoints = {
  authMe: API_ENDPOINTS.authMe,
  figureUpload: API_ENDPOINTS.figureUpload,
  figureGenerateAvatar: (figureId) =>
    buildEndpoint(API_ENDPOINTS.figureGenerateAvatar, { figureId }),
  figureDetail: (figureId) =>
    buildEndpoint(API_ENDPOINTS.figureDetail, { figureId }),
  clothDetail: (clothId) =>
    buildEndpoint(API_ENDPOINTS.clothDetail, { clothId }),
  clothIndex: (clothId) =>
    buildEndpoint(API_ENDPOINTS.clothIndex, { clothId }),
  clothIndexStatus: (clothId) =>
    buildEndpoint(API_ENDPOINTS.clothIndexStatus, { clothId }),
  styleDetail: (styleId) =>
    buildEndpoint(API_ENDPOINTS.styleDetail, { styleId }),
  tryonDetail: (tryonId) =>
    buildEndpoint(API_ENDPOINTS.tryonDetail, { tryonId }),
  historyDetail: (historyId) =>
    buildEndpoint(API_ENDPOINTS.historyDetail, { historyId }),
  historyFeedback: (historyId) =>
    buildEndpoint(API_ENDPOINTS.historyFeedback, { historyId }),
  taskDetail: (taskId) =>
    buildEndpoint(API_ENDPOINTS.taskDetail, { taskId }),
}
