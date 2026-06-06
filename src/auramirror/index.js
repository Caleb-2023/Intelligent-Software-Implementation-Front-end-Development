import { ensureMeta, escapeHtml } from './dom'
import { state } from './state'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  API_BASE_URL,
  API_ENDPOINTS,
  DEFAULT_WEATHER_CONTEXT,
  FALLBACK_CLOTHS,
  GEOCODE_API_BASE_URL,
  MAX_STYLING_SELECTIONS,
  STORAGE_KEYS,
  WEATHER_API_BASE_URL,
} from './config'
import {
  AuraMirrorApiError,
  apiRequest,
  endpoints,
  normalizeClothRecord,
  normalizeHistoryRecord,
  normalizeServerUser,
  normalizeStyleRecord,
  normalizeTaskRecord,
  normalizeTryOnRecord,
  pickFirstArray,
  pickFirstObject,
  unwrapData,
} from './api'

gsap.registerPlugin(ScrollTrigger)

const OVERLAY_TRANSITION_MS = 280
const MAX_CLOTH_IMAGE_SIZE = 10 * 1024 * 1024
const VALID_CLOTH_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

function markReady() {
  document.documentElement.dataset.auramirror = 'ready'
  document.body?.setAttribute('data-auramirror', 'ready')
}

function primeRuntimeState() {
  document.documentElement.style.setProperty(
    '--am-selection-limit',
    String(MAX_STYLING_SELECTIONS)
  )
}

function applyBaseMetadata() {
  ensureMeta(
    'auramirror:bootstrap',
    `storage=${STORAGE_KEYS.history};api=${API_BASE_URL}`
  )
}

function getApiToken() {
  try {
    return localStorage.getItem(STORAGE_KEYS.apiToken) || ''
  } catch {
    return ''
  }
}

function getStoredAuthUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.authUser)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function setStoredAuth(token, user) {
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEYS.apiToken, token)
    } else {
      localStorage.removeItem(STORAGE_KEYS.apiToken)
    }

    if (user) {
      localStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify(user))
    } else {
      localStorage.removeItem(STORAGE_KEYS.authUser)
    }
  } catch {
    // Ignore localStorage write failures.
  }
}

function readStoredUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.authUsers)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveStoredUsers(users) {
  try {
    localStorage.setItem(STORAGE_KEYS.authUsers, JSON.stringify(users))
  } catch {
    // Ignore localStorage write failures.
  }
}

function normalizeAuthUser(user) {
  const normalized = normalizeServerUser(user)
  if (!normalized) return null

  return {
    ...normalized,
    id:
      normalized.id ||
      `local-user-${String(normalized.email || '').toLowerCase()}`,
  }
}

function createSessionToken(email) {
  return `local-demo-token:${String(email || '').toLowerCase()}:${Date.now()}`
}

function formatMemberSince(timestamp) {
  const value = Number(timestamp)
  if (!value) return 'Today'

  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return 'Today'
  }
}

function getTimeGreeting() {
  const hour = new Date().getHours()

  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

function smoothScrollToElement(target) {
  if (!(target instanceof HTMLElement)) return

  const lenis = window.lenis
  if (lenis && typeof lenis.scrollTo === 'function') {
    lenis.scrollTo(target, {
      offset: -24,
    })
    return
  }

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

function navigateFromDashboard({ target = null, trigger = null, triggerDelay = 0 } = {}) {
  const shouldExitDashboard = Boolean(state.dashboardOpen)

  if (shouldExitDashboard) {
    state.dashboardOpen = false
    updateAccountDashboard()
  }

  const runNavigation = () => {
    if (target instanceof HTMLElement) {
      smoothScrollToElement(target)
    }

    if (trigger instanceof HTMLElement) {
      window.setTimeout(() => {
        trigger.click()
      }, triggerDelay)
    }
  }

  if (shouldExitDashboard) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(runNavigation)
    })
    return
  }

  runNavigation()
}

function updateDashboardScene(isDashboardMode) {
  document.documentElement.classList.toggle('am-dashboard-mode', isDashboardMode)

  const lenis = window.lenis
  if (lenis) {
    isDashboardMode ? lenis.stop() : lenis.start()
  }
}

function normalizeCloth(item) {
  return normalizeClothRecord(item) || {
    _id: '',
    category: 'misc',
    name: 'Unnamed garment',
    imageUrl: '',
    indexed: null,
    attributes: {
      color: 'unknown',
      material: 'unspecified',
      season: [],
      occasion: [],
      tags: [],
    },
  }
}

function rebuildClothLookup(items) {
  state.clothLookup = items.reduce((acc, item) => {
    acc[item._id] = item
    return acc
  }, {})
}

function dispatchWardrobeUpdated() {
  document.dispatchEvent(
    new CustomEvent('am:wardrobe-updated', {
      detail: {
        items: state.clothCatalog,
        mode: state.wardrobeMode,
      },
    })
  )
}

function updatePhotoStatus(text) {
  const status = document.getElementById('am-photo-status')
  if (status) {
    status.textContent = text
  }
}

function updateFigureStatus(text) {
  const status = document.getElementById('am-figure-status')
  if (status) {
    status.textContent = text
  }

  const stylingStatus = document.getElementById('am-styling-figure-status')
  if (stylingStatus) {
    stylingStatus.textContent = text
  }

  updateAccountDashboard()
}

function updateWardrobeStatus(text) {
  state.wardrobeStatus = text

  const status = document.getElementById('am-wardrobe-status')
  if (status) {
    status.textContent = text
  }

  updateAccountDashboard()
}

function getApiOrigin() {
  try {
    return new URL(API_BASE_URL, window.location.origin).origin
  } catch {
    return window.location.origin
  }
}

function resolveAssetUrl(url) {
  if (!url) return ''

  try {
    return new URL(url, getApiOrigin()).href
  } catch {
    return url
  }
}

function updateSelectionStatus() {
  const status = document.getElementById('am-selection-status')
  if (status) {
    status.textContent = `${state.selectedClothIds.length} garments selected`
  }

  updateAccountDashboard()
}

function updatePreviewStageStatus(title, detail) {
  const status = document.getElementById('am-preview-stage-status')
  const screenState = document.getElementById('am-preview-stage-screen-state')

  if (status) {
    status.textContent = title
  }

  if (screenState) {
    screenState.textContent = detail
  }
}

function mountOverlayToBody(overlayId) {
  const overlay = document.getElementById(overlayId)
  const { body } = document

  if (!(overlay instanceof HTMLElement) || !body || overlay.parentElement === body) {
    return
  }

  body.append(overlay)
}

function primeOverlayLayers() {
  mountOverlayToBody('am-styling-overlay')
  mountOverlayToBody('am-ai-overlay')
}

function clearOverlayTransitionState(overlay) {
  if (!(overlay instanceof HTMLElement)) return

  if (overlay._amOpenFrameId) {
    window.cancelAnimationFrame(overlay._amOpenFrameId)
    overlay._amOpenFrameId = 0
  }

  if (overlay._amCloseTimeoutId) {
    window.clearTimeout(overlay._amCloseTimeoutId)
    overlay._amCloseTimeoutId = 0
  }
}

function openOverlayElement(overlay) {
  if (!(overlay instanceof HTMLElement)) return

  clearOverlayTransitionState(overlay)
  overlay.hidden = false
  overlay.setAttribute('aria-hidden', 'false')
  overlay.dataset.open = 'false'
  overlay._amOpenFrameId = window.requestAnimationFrame(() => {
    overlay.dataset.open = 'true'
    overlay._amOpenFrameId = 0
  })
}

function closeOverlayElement(overlay, { onHidden } = {}) {
  if (!(overlay instanceof HTMLElement)) return

  clearOverlayTransitionState(overlay)
  overlay.setAttribute('aria-hidden', 'true')
  overlay.dataset.open = 'false'
  overlay._amCloseTimeoutId = window.setTimeout(() => {
    overlay.hidden = true
    overlay._amCloseTimeoutId = 0
    if (typeof onHidden === 'function') {
      onHidden()
    }
  }, OVERLAY_TRANSITION_MS)
}

function bindOverlayWheelLock(overlay, dialog) {
  if (!(overlay instanceof HTMLElement) || !(dialog instanceof HTMLElement)) {
    return
  }

  overlay.addEventListener(
    'wheel',
    (event) => {
      if (overlay.hidden) return

      event.preventDefault()
      event.stopPropagation()

      if (!(event.target instanceof Node) || !dialog.contains(event.target)) {
        return
      }

      dialog.scrollTop += event.deltaY
      dialog.scrollLeft += event.deltaX
    },
    { passive: false }
  )
}

function syncOverlayLock() {
  const stylingOverlay = document.getElementById('am-styling-overlay')
  const aiOverlay = document.getElementById('am-ai-overlay')
  const authOverlay = document.getElementById('am-auth-overlay')
  const hasOpenOverlay =
    Boolean(stylingOverlay && !stylingOverlay.hidden) ||
    Boolean(aiOverlay && !aiOverlay.hidden) ||
    Boolean(authOverlay && authOverlay.dataset.open === 'true')

  document.documentElement.classList.toggle('am-overlay-open', hasOpenOverlay)

  const lenis = window.lenis
  if (lenis && typeof lenis.stop === 'function' && typeof lenis.start === 'function') {
    if (hasOpenOverlay) {
      lenis.stop()
    } else {
      lenis.start()
    }
  }
}

function updateAvatarPreviewState({ hasAvatar }) {
  const placeholder = document.getElementById('am-avatar-placeholder')
  const canvas = document.getElementById('am-avatar-canvas')

  if (!canvas) return

  if (placeholder) {
    placeholder.hidden = hasAvatar
  }

  canvas.hidden = !hasAvatar
}

function paintTryOnCanvasSurface(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#120001')
  gradient.addColorStop(0.42, '#2a080d')
  gradient.addColorStop(1, '#f40c3f')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.save()
  ctx.strokeStyle = 'rgba(243, 236, 229, 0.7)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44)
  ctx.restore()
}

function updateTryOnPreviewState({ hasPreview, imageUrl = '' }) {
  const canvas = document.getElementById('am-tryon-canvas')
  if (!(canvas instanceof HTMLCanvasElement)) return

  canvas.hidden = false
  canvas.dataset.previewReady = hasPreview ? 'true' : 'false'
  canvas.dataset.previewSource = imageUrl

  if (!hasPreview) {
    paintTryOnCanvasSurface(canvas)
  }
}

function updateAiWeatherContext() {
  const city = document.getElementById('am-ai-weather-city')
  const temperature = document.getElementById('am-ai-weather-temperature')
  const humidity = document.getElementById('am-ai-weather-humidity')

  if (city) {
    city.textContent = `City: ${state.weatherContext.city || 'Unknown'}`
  }

  if (temperature) {
    temperature.textContent =
      state.weatherContext.temperatureC == null
        ? 'Temperature: --'
        : `Temperature: ${state.weatherContext.temperatureC} C`
  }

  if (humidity) {
    humidity.textContent =
      state.weatherContext.humidity == null
        ? 'Humidity: --'
        : `Humidity: ${state.weatherContext.humidity}%`
  }

  updateAccountDashboard()
}

function updateAiStatus(text) {
  const status = document.getElementById('am-ai-status')
  if (status) {
    status.textContent = text
  }
}

function updateAuthStatus(text) {
  const status = document.getElementById('am-auth-status')
  if (status) {
    status.textContent = text
  }
}

function updateAuthNavigation() {
  const authItem = document.querySelector('[data-auth-action="auth"]')
  const headerSignOut = document.querySelector('[data-header-signout]')
  const isAuthenticated = Boolean(state.authToken)

  if (authItem instanceof HTMLElement) {
    authItem.hidden = isAuthenticated
  }

  if (headerSignOut instanceof HTMLElement) {
    headerSignOut.hidden = !isAuthenticated
  }

  document.documentElement.classList.toggle('am-authenticated', isAuthenticated)
}

function switchAuthTab(mode) {
  const loginTab = document.getElementById('am-auth-tab-login')
  const registerTab = document.getElementById('am-auth-tab-register')
  const loginPanel = document.getElementById('am-auth-panel-login')
  const registerPanel = document.getElementById('am-auth-panel-register')
  const isLogin = mode !== 'register'

  state.authMode = isLogin ? 'login' : 'register'

  loginTab?.classList.toggle('is-active', isLogin)
  loginTab?.setAttribute('aria-selected', isLogin ? 'true' : 'false')
  registerTab?.classList.toggle('is-active', !isLogin)
  registerTab?.setAttribute('aria-selected', !isLogin ? 'true' : 'false')

  if (loginPanel) {
    loginPanel.hidden = !isLogin
  }

  if (registerPanel) {
    registerPanel.hidden = isLogin
  }
}

function updateAiResultsSummary(message = '') {
  const results = document.getElementById('am-ai-results')
  if (!results) return

  const weatherLabel = state.weatherContext.weatherLabel || 'controlled'
  const temperature =
    state.weatherContext.temperatureC == null
      ? '--'
      : `${state.weatherContext.temperatureC} C`
  const humidity =
    state.weatherContext.humidity == null
      ? '--'
      : `${state.weatherContext.humidity}%`

  results.innerHTML = `
    <strong>Context Snapshot</strong><br />
    Occasion: ${escapeHtml(state.selections.occasion || 'office')}<br />
    Weather: ${escapeHtml(weatherLabel)}<br />
    Temperature: ${escapeHtml(temperature)}<br />
    Humidity: ${escapeHtml(humidity)}<br />
    Source: ${escapeHtml(state.weatherContext.source || 'fallback')}
    ${message ? `<br /><br />${escapeHtml(message)}` : ''}
  `
}

function getPreviewImageSource() {
  const canvas = document.getElementById('am-tryon-canvas')
  if (canvas instanceof HTMLCanvasElement && canvas.dataset.previewReady === 'true') {
    if (canvas.dataset.previewSource) {
      return canvas.dataset.previewSource
    }

    return canvas.toDataURL('image/png')
  }

  return state.avatarDataUrl || ''
}

async function renderRemoteTryOnToCanvas(source) {
  const canvas = document.getElementById('am-tryon-canvas')
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Preview canvas unavailable')
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Preview canvas unavailable')
  }

  const image = await loadImage(source)
  paintTryOnCanvasSurface(canvas)

  ctx.save()
  ctx.globalAlpha = 0.96
  drawCoverImage(ctx, image, canvas.width, canvas.height)
  ctx.restore()

  ctx.save()
  ctx.fillStyle = 'rgba(22, 0, 0, 0.2)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

async function renderAiVisualFromCurrentPreview(recommendation) {
  const canvas = document.getElementById('am-ai-canvas')
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('AI canvas unavailable')
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#160000')
  gradient.addColorStop(0.5, '#3e0f18')
  gradient.addColorStop(1, '#f40c3f')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(243, 236, 229, 0.78)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44)

  const source = getPreviewImageSource()
  if (!source) {
    return
  }

  const image = await loadImage(source)

  ctx.save()
  ctx.globalAlpha = 0.84
  drawCoverImage(ctx, image, canvas.width, canvas.height)
  ctx.restore()

  ctx.fillStyle = 'rgba(22, 0, 0, 0.56)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(243, 236, 229, 0.78)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44)

  ctx.fillStyle = '#f3ece5'
  ctx.font = '700 17px "PPFraktionMono", monospace'
  ctx.fillText('AI STYLIST OUTPUT', 30, 44)
  ctx.font = '400 12px "PPFraktionMono", monospace'
  ctx.fillText(
    `${recommendation.mode.toUpperCase()} MODE / ${recommendation.context.occasion.toUpperCase()}`,
    30,
    66
  )

  const lines = [
    `Weather: ${recommendation.context.weatherLabel}`,
    `Temperature: ${
      recommendation.context.temperatureC == null
        ? '--'
        : `${recommendation.context.temperatureC} C`
    }`,
    `Focus: ${recommendation.headline}`,
  ]

  ctx.font = '400 12px "PPFraktionMono", monospace'
  lines.forEach((line, index) => {
    ctx.fillText(line, 30, 110 + index * 22)
  })
}

function formatClothList(cloths) {
  if (!cloths.length) {
    return 'the current base wardrobe'
  }

  if (cloths.length === 1) {
    return cloths[0].name
  }

  return `${cloths
    .slice(0, -1)
    .map((cloth) => cloth.name)
    .join(', ')} and ${cloths[cloths.length - 1].name}`
}

function inferWeatherAdjustment(weatherLabel, temperatureC) {
  if (temperatureC != null && temperatureC <= 10) {
    return 'Keep the silhouette insulated with heavier layers and tactile fabrics.'
  }

  if (temperatureC != null && temperatureC >= 26) {
    return 'Bias the look toward breathability and lighter visual density.'
  }

  if (weatherLabel === 'rainy' || weatherLabel === 'showers' || weatherLabel === 'storm') {
    return 'Anchor the palette with dependable darker tones that stay composed in wet conditions.'
  }

  if (weatherLabel === 'clear') {
    return 'Use cleaner contrast and lighter accents to keep the outfit feeling open and sharp.'
  }

  return 'Balance texture and contrast so the outfit feels versatile across changing conditions.'
}

function inferOccasionDirection(occasion) {
  const strategies = {
    office:
      'Keep the recommendation polished and legible, with structure leading over novelty.',
    casual:
      'Let comfort drive the look, but preserve one strong focal garment for identity.',
    travel:
      'Prioritize movement, layering flexibility, and low-maintenance coordination.',
    formal:
      'Tighten the palette and emphasize refinement, restraint, and surface quality.',
    sport:
      'Favor mobility, airflow, and an energetic shape language over formality.',
  }

  return strategies[occasion] || strategies.office
}

function buildRecommendationCopy(cloths, context) {
  const garmentList = formatClothList(cloths)
  const occasionDirection = inferOccasionDirection(context.occasion)
  const weatherAdjustment = inferWeatherAdjustment(
    context.weatherLabel,
    context.temperatureC
  )

  return {
    headline: `${context.occasion} styling recommendation`,
    summary: `Use ${garmentList} as the anchor set for this ${context.occasion} look.`,
    rationale: `${occasionDirection} ${weatherAdjustment}`,
    bulletPoints: [
      `Base the outfit around ${garmentList}.`,
      `Respond to ${context.weatherLabel} weather with a temperature profile of ${
        context.temperatureC == null ? '--' : `${context.temperatureC} C`
      }.`,
      `Keep the final impression aligned with a ${context.occasion} scenario.`,
    ],
  }
}

function buildRecommendationContext() {
  return {
    occasion: state.selections.occasion || 'office',
    weatherLabel: state.weatherContext.weatherLabel || 'controlled',
    temperatureC: state.weatherContext.temperatureC,
    humidity: state.weatherContext.humidity,
    city: state.weatherContext.city || 'Unknown',
    source: state.weatherContext.source || 'fallback',
  }
}

function createLocalRecommendation() {
  const cloths = getSelectedCloths()
  const context = buildRecommendationContext()
  const copy = buildRecommendationCopy(cloths, context)

  return {
    mode: 'local',
    source: 'local-engine',
    cloths,
    context,
    generatedAt: Date.now(),
    ...copy,
  }
}

async function requestRemoteRecommendation() {
  const token = getApiToken()
  if (!token) {
    throw new Error('No API token available for remote recommendation mode.')
  }

  if (!state.figureId) {
    throw new Error('Please generate an AI avatar first before requesting recommendations.')
  }

  const context = buildRecommendationContext()

  const payload = await apiRequest(API_ENDPOINTS.recommendations, {
    method: 'POST',
    token,
    body: {
      figure_id: state.figureId,
      occasion: state.selections.occasion || context.occasion || '',
      weather: {
        temperature: context.temperatureC,
        condition: context.weatherLabel,
        city: context.city,
        humidity: context.humidity,
      },
      style_preference: '',
      selected_cloth_ids: state.selectedClothIds,
      top_k: 20,
      need_visual_preview: true,
    },
  })

  const data = unwrapData(payload)
  const taskId = String(data.task_id || payload.task_id || '')
  if (!taskId) {
    throw new Error('No task_id returned from recommendation request')
  }

  const taskResult = await pollTaskStatus(taskId, (data) => {
    const elapsed = Math.round(data.elapsed_seconds || 0)
    updateAiStatus(`AI recommendation processing... ${data.progress || 'working'} (${elapsed}s)`)
  })

  const result = taskResult.result || taskResult
  const outfits = result.outfits || result.recommendations || []
  const bestOutfit = outfits[0] || {}
  const cloths = getSelectedCloths()

  const items = Array.isArray(bestOutfit.items) ? bestOutfit.items : []
  const bulletPoints = items.map((item) =>
    `${item.source || 'item'}: ${item.item_id || 'unknown'}${item.score ? ` (score: ${item.score.toFixed(2)})` : ''}`
  )

  return {
    mode: 'api',
    source: 'remote-api',
    cloths,
    context,
    generatedAt: Date.now(),
    headline: String(bestOutfit.name || `${context.occasion || 'AI'} recommendation`),
    summary: String(bestOutfit.description || 'AI stylist recommendation generated.'),
    rationale: String(
      bestOutfit.description ||
        'The AI stylist analyzed your wardrobe and recommended the best outfit combination.'
    ),
    bulletPoints: bulletPoints.length > 0
      ? bulletPoints.slice(0, 4)
      : ['AI recommendation completed'],
    imageUrl: bestOutfit.image_url || '',
    scores: bestOutfit.scores || {},
    styleId: String(result.style_id || data.style_id || ''),
  }
}

async function requestLogin(credentials) {
  const email = String(credentials?.email || '').trim().toLowerCase()
  const password = String(credentials?.password || '')

  if (!email || !password) {
    throw new Error('Email and password are required.')
  }

  const payload = await apiRequest(API_ENDPOINTS.authLogin, {
    method: 'POST',
    body: { email, mail: email, password },
  })
  const data = unwrapData(payload)
  const user =
    normalizeAuthUser(pickFirstObject(payload, ['user', 'profile', 'account'])) ||
    normalizeAuthUser({ email })

  return {
    token: String(
      data.token ||
        data.access_token ||
        data.accessToken ||
        data.jwt ||
        payload.token ||
        payload.access_token ||
        ''
    ),
    user,
  }
}

async function requestRegister(payloadInput) {
  const name = String(payloadInput?.name || '').trim()
  const email = String(payloadInput?.email || '').trim().toLowerCase()
  const password = String(payloadInput?.password || '')

  if (!name || !email || !password) {
    throw new Error('Name, email, and password are required.')
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }

  const payload = await apiRequest(API_ENDPOINTS.authRegister, {
    method: 'POST',
    body: { username: name, name, email, mail: email, password },
  })
  const data = unwrapData(payload)
  const user =
    normalizeAuthUser(pickFirstObject(payload, ['user', 'profile', 'account'])) ||
    normalizeAuthUser({ name, email })

  return {
    token: String(
      data.token ||
        data.access_token ||
        data.accessToken ||
        data.jwt ||
        payload.token ||
        payload.access_token ||
        ''
    ),
    user,
  }
}

function applyAuthenticatedSession({ token, user }) {
  state.authToken = token
  state.authUser = normalizeAuthUser(user)
  state.authVerificationStatus = 'verified'
  state.dashboardOpen = false
  setStoredAuth(token, state.authUser)
  updateAuthNavigation()
  updateAccountDashboard()
}

async function restoreAuthenticatedSession() {
  const token = getApiToken()
  const storedUser = normalizeAuthUser(getStoredAuthUser())

  if (!token) {
    state.authVerificationStatus = 'idle'
    updateAuthNavigation()
    updateAccountDashboard()
    return
  }

  state.authToken = token
  state.authUser = storedUser
  state.authVerificationStatus = 'checking'
  updateAuthNavigation()
  updateAccountDashboard()

  try {
    const payload = await apiRequest(endpoints.authMe, { token })
    const user = normalizeAuthUser(
      pickFirstObject(payload, ['user', 'profile', 'account'])
    )

    if (!user) {
      throw new Error('Current user response was empty.')
    }

    applyAuthenticatedSession({ token, user })
    updateAuthStatus(`Session restored for ${user.name || user.email}.`)
    await Promise.allSettled([
      loadWardrobeCatalog({ force: true }),
      loadRemoteHistoryEntries({ force: true }),
      loadDashboardAggregate({ force: true }),
    ])
  } catch (error) {
    state.authVerificationStatus =
      error instanceof AuraMirrorApiError && [401, 403].includes(error.status)
        ? 'expired'
        : 'unverified'

    if (state.authVerificationStatus === 'expired') {
      state.authToken = ''
      state.authUser = null
      setStoredAuth('', null)
      updateAuthStatus('Session expired. Please sign in again.')
    } else {
      updateAuthStatus(
        `Could not verify saved session: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      )
    }

    updateAuthNavigation()
    updateAccountDashboard()
  }
}

async function signOutAndResetWardrobe() {
  state.authToken = ''
  state.authUser = null
  state.authVerificationStatus = 'idle'
  state.dashboardOpen = false
  state.dashboardAggregate = {
    ...state.dashboardAggregate,
    source: 'local',
    status: 'idle',
    error: '',
    histories: [],
    styles: [],
    tryons: [],
    tasks: [],
    lastSyncedAt: 0,
  }
  setStoredAuth('', null)
  updateAuthNavigation()
  updateAccountDashboard()
  updateWardrobeStatus('Signed out. Demo garments restored for local preview.')

  await loadWardrobeCatalog({ force: true })
}

async function loadDashboardAggregate({ force = false } = {}) {
  const token = getApiToken()

  if (!token) {
    state.dashboardAggregate = {
      ...state.dashboardAggregate,
      source: 'local',
      status: 'idle',
      error: '',
      histories: [],
      styles: [],
      tryons: [],
      tasks: [],
      lastSyncedAt: 0,
    }
    updateAccountDashboard()
    return state.dashboardAggregate
  }

  if (
    !force &&
    state.dashboardAggregate.status === 'ready' &&
    Date.now() - state.dashboardAggregate.lastSyncedAt < 30 * 1000
  ) {
    updateAccountDashboard()
    return state.dashboardAggregate
  }

  state.dashboardAggregate = {
    ...state.dashboardAggregate,
    source: 'server',
    status: 'loading',
    error: '',
  }
  updateAccountDashboard()

  try {
    const [histories, styles, tryons, tasks] = await Promise.all([
      apiRequest(API_ENDPOINTS.histories, { token }),
      apiRequest(API_ENDPOINTS.styles, { token }),
      apiRequest(API_ENDPOINTS.tryons, { token }),
      apiRequest(API_ENDPOINTS.tasks, { token }),
    ])

    state.dashboardAggregate = {
      source: 'server',
      status: 'ready',
      error: '',
      histories: pickFirstArray(histories, ['histories', 'records', 'items', 'results'])
        .map(normalizeHistoryRecord)
        .filter(Boolean),
      styles: pickFirstArray(styles, ['styles', 'recommendations', 'items', 'results'])
        .map(normalizeStyleRecord)
        .filter(Boolean),
      tryons: pickFirstArray(tryons, ['tryons', 'try_on_records', 'items', 'results'])
        .map(normalizeTryOnRecord)
        .filter(Boolean),
      tasks: pickFirstArray(tasks, ['tasks', 'items', 'results'])
        .map(normalizeTaskRecord)
        .filter(Boolean),
      lastSyncedAt: Date.now(),
    }
  } catch (error) {
    state.dashboardAggregate = {
      ...state.dashboardAggregate,
      source: 'local',
      status: 'error',
      error: error instanceof Error ? error.message : 'Dashboard sync failed.',
      lastSyncedAt: Date.now(),
    }
  }

  updateAccountDashboard()
  return state.dashboardAggregate
}

function updateAccountDashboard() {
  const section = document.getElementById('account')
  const heroTitle = document.querySelector('.s__title')
  const heroGreeting = document.querySelector('[data-auth-greeting]')
  const heroGreetingLine1 = document.getElementById('am-auth-greeting-line-1')
  const heroGreetingLine2 = document.getElementById('am-auth-greeting-line-2')
  const isAuthenticated = Boolean(state.authToken && state.authUser)
  const user = normalizeAuthUser(state.authUser)
  const firstName = user?.name?.split(/\s+/).filter(Boolean)[0] || 'Member'
  const aggregate = state.dashboardAggregate
  const hasServerAggregate = aggregate.status === 'ready'
  const historyCount = hasServerAggregate
    ? aggregate.histories.length
    : state.historyEntries.length
  const remoteTryonCount = hasServerAggregate ? aggregate.tryons.length : 0
  const remoteTaskCount = hasServerAggregate ? aggregate.tasks.length : 0
  const remoteStyleCount = hasServerAggregate ? aggregate.styles.length : 0
  const selectedCount = state.selectedClothIds.length
  const latestServerStyle = aggregate.styles[0] || null
  const latestTryon = aggregate.tryons[0] || null
  const recommendation = state.lastRecommendation
  const greetingLine1Text =
    isAuthenticated && user
      ? `${user.name}, good ${getTimeGreeting()}.`
      : 'Aura Member, good evening.'
  const greetingLine2Text = 'Ready to style your outfit for today?'
  const isDashboardMode = isAuthenticated && state.dashboardOpen

  updateDashboardScene(isDashboardMode)

  if (section instanceof HTMLElement) {
    if (isDashboardMode) {
      section.hidden = false
      section.setAttribute('aria-hidden', 'false')
      requestAnimationFrame(() => {
        section.classList.add('is-open')
      })
    } else {
      section.classList.remove('is-open')
      section.setAttribute('aria-hidden', 'true')
    }
  }

  if (heroTitle instanceof HTMLElement) {
    heroTitle.hidden = isAuthenticated
    heroTitle.setAttribute('aria-hidden', isAuthenticated ? 'true' : 'false')
  }

  if (heroGreeting instanceof HTMLElement) {
    heroGreeting.hidden = !isAuthenticated
    heroGreeting.setAttribute('aria-hidden', isAuthenticated ? 'false' : 'true')
    heroGreeting.dataset.line1 = greetingLine1Text
    heroGreeting.dataset.line2 = greetingLine2Text
  }

  if (heroGreetingLine1) {
    heroGreetingLine1.textContent = isAuthenticated ? '' : greetingLine1Text
  }

  if (heroGreetingLine2) {
    heroGreetingLine2.textContent = isAuthenticated ? '' : greetingLine2Text
  }

  document.dispatchEvent(
    new CustomEvent('am:greeting-update', {
      detail: {
        active: isAuthenticated,
        line1: greetingLine1Text,
        line2: greetingLine2Text,
      },
    })
  )

  const setText = (id, value) => {
    const node = document.getElementById(id)
    if (node) {
      node.textContent = value
    }
  }

  if (!isAuthenticated || !user) {
    setText('am-account-greeting', 'Your private styling workspace appears here after login.')
    setText('am-account-name', 'Aura Member')
    setText('am-account-email', 'you@example.com')
    setText('am-account-member-since', 'Today')
    setText('am-account-mode', 'Local Demo')
    setText('am-account-server-sync', 'Local session')
    setText('am-account-remote-counts', '0 histories / 0 try-ons / 0 tasks')
    setText(
      'am-account-avatar-status',
      state.avatarDataUrl ? 'Avatar ready for preview' : 'Waiting for portrait'
    )
    setText('am-account-wardrobe-status', state.wardrobeStatus || 'Demo wardrobe standby')
    setText(
      'am-account-preview-status',
      state.avatarDataUrl ? 'Avatar ready for try-on' : 'No try-on preview yet'
    )
    setText('am-account-history-count', `${historyCount} saved runs`)
    setText(
      'am-account-weather',
      `${state.weatherContext.city || 'Fallback Studio'} / ${state.weatherContext.weatherLabel || 'controlled'} / ${
        state.weatherContext.temperatureC == null ? '--' : `${state.weatherContext.temperatureC} C`
      }`
    )
    setText('am-account-selection-count', `${selectedCount} garments selected`)
    setText(
      'am-account-next-step',
      'Register or sign in to unlock your personal dashboard and local demo session.'
    )
    setText(
      'am-account-recommendation',
      'Your first styling recommendation will be summarized here after the AI Stylist runs.'
    )
    return
  }

  setText('am-account-greeting', `Welcome back, ${firstName}. Your styling workspace is live.`)
  setText('am-account-name', user.name)
  setText('am-account-email', user.email)
  setText('am-account-member-since', formatMemberSince(user.createdAt))
  setText(
    'am-account-mode',
    aggregate.status === 'loading'
      ? 'Syncing'
      : state.authVerificationStatus === 'unverified'
        ? 'Saved Session'
        : state.wardrobeMode === 'remote'
          ? 'Remote Ready'
          : 'Local Demo'
  )
  setText(
    'am-account-server-sync',
    aggregate.status === 'ready'
      ? `Synced ${new Date(aggregate.lastSyncedAt).toLocaleTimeString()}`
      : aggregate.status === 'loading'
        ? 'Syncing server data'
        : aggregate.status === 'error'
          ? `Server fallback: ${aggregate.error}`
          : 'Awaiting sync'
  )
  setText(
    'am-account-remote-counts',
    `${historyCount} histories / ${remoteStyleCount} styles / ${remoteTryonCount} try-ons / ${remoteTaskCount} tasks`
  )
  setText(
    'am-account-avatar-status',
    state.avatarDataUrl ? 'Avatar generated and synced' : 'Portrait upload pending'
  )
  setText(
    'am-account-wardrobe-status',
    state.wardrobeStatus ||
      (state.wardrobeMode === 'remote'
        ? 'Live wardrobe ready'
        : 'Demo wardrobe ready')
  )
  setText(
    'am-account-preview-status',
    latestTryon
      ? `${latestTryon.status} try-on available`
      : state.avatarDataUrl
        ? 'Preview pipeline armed'
        : 'No try-on preview yet'
  )
  setText('am-account-history-count', `${historyCount} saved runs`)
  setText(
    'am-account-weather',
    `${state.weatherContext.city || 'Fallback Studio'} / ${state.weatherContext.weatherLabel || 'controlled'} / ${
      state.weatherContext.temperatureC == null ? '--' : `${state.weatherContext.temperatureC} C`
    }`
  )
  setText('am-account-selection-count', `${selectedCount} garments selected`)
  setText(
    'am-account-next-step',
    state.avatarDataUrl
      ? 'Open Wardrobe or AI Stylist to continue building the next look.'
      : 'Upload a portrait photo first so avatar, wardrobe, and preview modules can sync.'
  )
  setText(
    'am-account-recommendation',
    latestServerStyle?.summary ||
      latestServerStyle?.headline ||
      recommendation?.summary ||
      'No recommendation yet. Open AI Stylist to generate your first personalized look.'
  )
}

function bindAccountDashboard() {
  const signOutButtons = document.querySelectorAll('[data-signout-trigger], [data-header-signout]')
  const openAvatar = document.getElementById('am-account-open-avatar')
  const openWardrobe = document.getElementById('am-account-open-wardrobe')
  const openAi = document.getElementById('am-account-open-ai')
  const openHistory = document.getElementById('am-account-open-history')
  const openDashboard = document.querySelector('[data-dashboard-trigger]')
  const closeDashboard = document.querySelector('[data-dashboard-close]')

  signOutButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      await signOutAndResetWardrobe()
      updateAuthStatus('Signed out. Demo wardrobe reloaded.')
    })
  })

  openDashboard?.addEventListener('click', async () => {
    if (!state.authToken) return

    state.dashboardOpen = true
    updateAccountDashboard()
    await loadDashboardAggregate({ force: true })
  })

  closeDashboard?.addEventListener('click', () => {
    state.dashboardOpen = false
    updateAccountDashboard()
  })

  openAvatar?.addEventListener('click', () => {
    navigateFromDashboard({
      target: document.getElementById('about'),
    })
  })

  openWardrobe?.addEventListener('click', () => {
    navigateFromDashboard({
      target: document.getElementById('about'),
      trigger: document.getElementById('am-styling-trigger'),
      triggerDelay: 160,
    })
  })

  openAi?.addEventListener('click', () => {
    navigateFromDashboard({
      target: document.getElementById('about'),
      trigger: document.getElementById('am-ai-trigger'),
      triggerDelay: 160,
    })
  })

  openHistory?.addEventListener('click', () => {
    navigateFromDashboard({
      target: document.getElementById('contact'),
    })
  })
}

function renderRecommendationResult(recommendation) {
  state.lastRecommendation = recommendation

  const results = document.getElementById('am-ai-results')
  if (!results) return

  const bulletMarkup = recommendation.bulletPoints
    .map((point) => `<li>${escapeHtml(point)}</li>`)
    .join('')

  results.innerHTML = `
    <div class="am-recommendation">
      <p class="am-recommendation__eyebrow">${escapeHtml(
        recommendation.mode.toUpperCase()
      )} recommendation</p>
      <h4 class="am-recommendation__title">${escapeHtml(recommendation.headline)}</h4>
      <p class="am-recommendation__summary">${escapeHtml(recommendation.summary)}</p>
      <p class="am-recommendation__rationale">${escapeHtml(
        recommendation.rationale
      )}</p>
      <ul class="am-recommendation__list">${bulletMarkup}</ul>
    </div>
  `

  updateAccountDashboard()
}

function renderPreviewRecommendationCard(recommendation) {
  const card = document.getElementById('am-recommendation-card')
  if (!card) return

  card.innerHTML = `
    <strong>${escapeHtml(recommendation.headline)}</strong><br />
    ${escapeHtml(recommendation.summary)}<br /><br />
    Context: ${escapeHtml(recommendation.context.city)} / ${escapeHtml(
      recommendation.context.weatherLabel
    )} / ${escapeHtml(recommendation.context.occasion)}
  `
}

function readHistoryEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(normalizeHistoryEntry).filter(Boolean) : []
  } catch {
    return []
  }
}

function saveHistoryEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(entries.slice(0, 30)))
  } catch {
    // Ignore storage write failures and keep the session functional.
  }
}

function normalizeHistoryEntry(entry) {
  const normalized = normalizeHistoryRecord(entry)
  if (!normalized) return null

  return {
    ...normalized,
    id:
      normalized.id ||
      `history-${normalized.generatedAt || entry?.timestamp || Date.now()}`,
    cloths: normalized.cloths.map((cloth) => ({
      _id: cloth._id,
      category: cloth.category,
      name: cloth.name,
      attributes: cloth.attributes || {},
    })),
  }
}

function createDisplacementMapCanvas(width = 256, height = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return canvas
  }

  const gradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    width * 0.08,
    width * 0.5,
    height * 0.5,
    width * 0.52
  )
  gradient.addColorStop(0, 'rgba(255, 96, 140, 0.95)')
  gradient.addColorStop(0.32, 'rgba(244, 12, 63, 0.75)')
  gradient.addColorStop(0.7, 'rgba(90, 24, 40, 0.22)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  for (let index = 0; index < 18; index += 1) {
    ctx.beginPath()
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.02 + index * 0.005})`
    ctx.lineWidth = 1 + index * 0.12
    ctx.arc(
      width * 0.5,
      height * 0.5,
      width * (0.12 + index * 0.03),
      0,
      Math.PI * 2
    )
    ctx.stroke()
  }

  return canvas
}

function destroyHistoryDistortions() {
  state.historyDistortions.forEach((instance) => {
    instance.destroy?.()
  })
  state.historyDistortions = []
}

function cleanupHistoryScrollFx() {
  if (state.historyScrollTween) {
    state.historyScrollTween.kill()
    state.historyScrollTween = null
  }

  if (state.historyScrollTrigger) {
    state.historyScrollTrigger.kill()
    state.historyScrollTrigger = null
  }
}

function setupHistoryScrollFx() {
  cleanupHistoryScrollFx()

  const section = document.querySelector('.am-history-section')
  const list = document.getElementById('am-history-list')
  if (!list) {
    return
  }

  if (!section || window.innerWidth < 900 || state.historyEntries.length < 2) {
    gsap.set(list, { clearProps: 'transform' })
    return
  }

  const totalOverflow = Math.max(0, list.scrollWidth - list.clientWidth)
  if (!totalOverflow) {
    return
  }

  state.historyScrollTween = gsap.to(list, {
    x: -totalOverflow,
    ease: 'none',
    paused: true,
  })

  state.historyScrollTrigger = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: `+=${totalOverflow + window.innerHeight * 0.55}`,
    pin: true,
    scrub: 1,
    animation: state.historyScrollTween,
    invalidateOnRefresh: true,
  })
}

function createHistoryWebGlInstance(card) {
  const canvas = card.querySelector('.am-history-card__gl')
  const image = card.querySelector('.am-history-card__image')

  if (!(canvas instanceof HTMLCanvasElement) || !(image instanceof HTMLImageElement)) {
    return null
  }

  const gl =
    canvas.getContext('webgl', { premultipliedAlpha: false }) ||
    canvas.getContext('experimental-webgl', { premultipliedAlpha: false })

  if (!gl) {
    canvas.hidden = true
    image.hidden = false
    return null
  }

  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    void main() {
      v_uv = a_uv;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `

  const fragmentShaderSource = `
    precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_image;
    uniform sampler2D u_displacement;
    uniform float u_intensity;
    uniform vec2 u_resolution;

    void main() {
      vec2 disp = texture2D(u_displacement, v_uv).rg - 0.5;
      vec2 uv = v_uv + disp * 0.11 * u_intensity;
      vec4 color = texture2D(u_image, uv);
      float vignette = smoothstep(1.2, 0.25, distance(v_uv, vec2(0.5)));
      color.rgb += disp.r * 0.08 * u_intensity;
      color.rgb *= vignette + 0.18;
      gl_FragColor = color;
    }
  `

  const compileShader = (type, source) => {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader)
      return null
    }
    return shader
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource)
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource)
  if (!vertexShader || !fragmentShader) {
    canvas.hidden = true
    image.hidden = false
    return null
  }

  const program = gl.createProgram()
  if (!program) {
    canvas.hidden = true
    image.hidden = false
    return null
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    canvas.hidden = true
    image.hidden = false
    return null
  }

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1,
      -1, 1, 0, 1, 1, -1, 1, 0, 1, 1, 1, 1,
    ]),
    gl.STATIC_DRAW
  )

  const positionLocation = gl.getAttribLocation(program, 'a_position')
  const uvLocation = gl.getAttribLocation(program, 'a_uv')
  const intensityLocation = gl.getUniformLocation(program, 'u_intensity')
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')

  const createTextureFromSource = (source, textureUnit) => {
    const texture = gl.createTexture()
    gl.activeTexture(textureUnit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    return texture
  }

  const displacementCanvas = createDisplacementMapCanvas(256, 256)
  const imageTexture = createTextureFromSource(image, gl.TEXTURE0)
  const displacementTexture = createTextureFromSource(displacementCanvas, gl.TEXTURE1)

  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0)
  gl.enableVertexAttribArray(uvLocation)
  gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8)
  gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0)
  gl.uniform1i(gl.getUniformLocation(program, 'u_displacement'), 1)

  let rafId = 0
  let intensity = 0
  let targetIntensity = 0

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width * window.devicePixelRatio))
    const height = Math.max(1, Math.round(rect.height * window.devicePixelRatio))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
  }

  const render = () => {
    intensity += (targetIntensity - intensity) * 0.085
    resize()
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)
    gl.uniform1f(intensityLocation, intensity)
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    if (Math.abs(targetIntensity - intensity) > 0.002 || targetIntensity > 0) {
      rafId = window.requestAnimationFrame(render)
    } else {
      rafId = 0
    }
  }

  const start = () => {
    targetIntensity = 1
    if (!rafId) {
      render()
    }
  }

  const stop = () => {
    targetIntensity = 0
    if (!rafId) {
      render()
    }
  }

  const onEnter = () => {
    start()
  }
  const onLeave = () => {
    stop()
  }

  card.addEventListener('pointerenter', onEnter)
  card.addEventListener('pointerleave', onLeave)
  card.addEventListener('focusin', onEnter)
  card.addEventListener('focusout', onLeave)

  canvas.hidden = false
  image.hidden = true
  resize()
  render()

  return {
    resize,
    destroy() {
      window.cancelAnimationFrame(rafId)
      card.removeEventListener('pointerenter', onEnter)
      card.removeEventListener('pointerleave', onLeave)
      card.removeEventListener('focusin', onEnter)
      card.removeEventListener('focusout', onLeave)
      if (gl.getExtension('WEBGL_lose_context')) {
        gl.getExtension('WEBGL_lose_context').loseContext()
      }
    },
  }
}

function setupHistoryDistortions() {
  destroyHistoryDistortions()

  const cards = Array.from(document.querySelectorAll('.am-history-card'))
  cards.forEach((card) => {
    const image = card.querySelector('.am-history-card__image')
    if (!(image instanceof HTMLImageElement)) return
    if (!image.getAttribute('src')) return

    const initialize = () => {
      const instance = createHistoryWebGlInstance(card)
      if (instance) {
        state.historyDistortions.push(instance)
      }
    }

    if (image.complete) {
      initialize()
    } else {
      image.addEventListener('load', initialize, { once: true })
    }
  })
}

function renderHistoryFocus(entry = null) {
  const content = document.getElementById('am-history-focus-content')
  if (!content) return

  if (!entry) {
    content.innerHTML =
      'Hover or focus a history item to inspect its styling context.'
    return
  }

  const clothList = entry.cloths.length
    ? entry.cloths.map((cloth) => cloth.name).join(', ')
    : 'No garments recorded'
  const previewMarkup = entry.previewImage
    ? `<div class="am-history-focus__media"><img src="${escapeHtml(
        entry.previewImage
      )}" alt="${escapeHtml(entry.headline)}" /></div>`
    : ''

  content.innerHTML = `
    ${previewMarkup}
    <strong>${escapeHtml(entry.headline)}</strong><br />
    ${escapeHtml(entry.summary)}<br /><br />
    Occasion: ${escapeHtml(entry.context.occasion)}<br />
    Weather: ${escapeHtml(entry.context.weatherLabel)}<br />
    City: ${escapeHtml(entry.context.city)}<br />
    Garments: ${escapeHtml(clothList)}<br />
    Mode: ${escapeHtml(entry.mode)}<br /><br />
    ${escapeHtml(entry.rationale)}
  `
}

function renderHistoryList() {
  const list = document.getElementById('am-history-list')
  if (!list) return

  cleanupHistoryScrollFx()
  destroyHistoryDistortions()

  if (!state.historyEntries?.length) {
    list.innerHTML =
      '<div class="am-empty-state">No recommendation history yet. Run the AI Stylist to create your first saved entry.</div>'
    renderHistoryFocus(null)
    return
  }

  list.innerHTML = state.historyEntries
    .map((entry) => {
      const clothCount = entry.cloths.length
      const date = new Date(entry.generatedAt)
      const timestamp = Number.isNaN(date.getTime())
        ? 'Unknown time'
        : date.toLocaleString()

      return `
        <article
          class="am-history-card"
          role="button"
          tabindex="0"
          data-history-id="${escapeHtml(entry.id)}"
        >
          <span class="am-history-card__thumb">
            <img
              class="am-history-card__image"
              src="${escapeHtml(entry.previewImage || '')}"
              alt="${escapeHtml(entry.headline)}"
              ${entry.previewImage ? '' : 'hidden'}
            />
            <canvas class="am-history-card__gl" aria-hidden="true"></canvas>
            <span class="am-history-card__thumb-fallback"${
              entry.previewImage ? ' hidden' : ''
            }>No preview captured</span>
          </span>
          <span class="am-history-card__eyebrow">${escapeHtml(
            entry.mode.toUpperCase()
          )}</span>
          <strong class="am-history-card__title">${escapeHtml(entry.headline)}</strong>
          <span class="am-history-card__meta">${escapeHtml(timestamp)}</span>
          <span class="am-history-card__meta">${escapeHtml(
            entry.context.city
          )} / ${escapeHtml(entry.context.weatherLabel)}</span>
          <span class="am-history-card__meta">${clothCount} garment${
            clothCount === 1 ? '' : 's'
          }</span>
          <span class="am-history-card__actions">
            <button
              class="am-mini-button"
              type="button"
              data-history-action="detail"
              data-history-id="${escapeHtml(entry.id)}"
            >
              Detail
            </button>
            <button
              class="am-mini-button"
              type="button"
              data-history-action="delete"
              data-history-id="${escapeHtml(entry.id)}"
            >
              Delete
            </button>
          </span>
        </article>
      `
    })
    .join('')

  renderHistoryFocus(state.historyEntries[0] || null)
  setupHistoryDistortions()
  setupHistoryScrollFx()
}

async function loadRemoteHistoryEntries({ force = false } = {}) {
  const token = getApiToken()
  const filter = state.historyFilter === 'all' ? '' : state.historyFilter

  if (!token) {
    state.historyMode = 'local'
    state.historyStatus = 'idle'
    state.historyEntries = readHistoryEntries()
    renderHistoryList()
    updateAccountDashboard()
    return state.historyEntries
  }

  if (!force && state.historyMode === 'server' && state.historyStatus === 'ready') {
    renderHistoryList()
    return state.historyEntries
  }

  state.historyStatus = 'loading'
  const list = document.getElementById('am-history-list')
  if (list) {
    list.innerHTML = '<div class="am-empty-state">Loading server history...</div>'
  }

  try {
    const params = filter ? `?type=${encodeURIComponent(filter)}` : ''
    const payload = await apiRequest(`${API_ENDPOINTS.histories}${params}`, { token })
    state.historyEntries = pickFirstArray(payload, ['histories', 'records', 'items', 'results'])
      .map(normalizeHistoryEntry)
      .filter(Boolean)
    state.historyMode = 'server'
    state.historyStatus = 'ready'
  } catch (error) {
    state.historyMode = 'local'
    state.historyStatus = 'error'
    state.historyEntries = readHistoryEntries()
    updatePreviewStageStatus(
      'History fallback',
      `Server history unavailable: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    )
  }

  renderHistoryList()
  updateAccountDashboard()
  return state.historyEntries
}

async function loadHistoryDetail(historyId) {
  const localEntry = state.historyEntries.find((item) => item.id === historyId)
  const token = getApiToken()

  if (!token || state.historyMode !== 'server') {
    renderHistoryFocus(localEntry || null)
    return localEntry || null
  }

  try {
    const payload = await apiRequest(endpoints.historyDetail(historyId), { token })
    const entry = normalizeHistoryEntry(
      pickFirstObject(payload, ['history', 'record', 'item', 'result'])
    )
    renderHistoryFocus(entry || localEntry || null)
    return entry || localEntry || null
  } catch {
    renderHistoryFocus(localEntry || null)
    return localEntry || null
  }
}

async function deleteHistoryEntry(historyId) {
  if (!historyId) return

  const token = getApiToken()

  if (token && state.historyMode === 'server') {
    await apiRequest(endpoints.historyDetail(historyId), {
      method: 'DELETE',
      token,
    })
    await loadRemoteHistoryEntries({ force: true })
    await loadDashboardAggregate({ force: true })
    return
  }

  state.historyEntries = state.historyEntries.filter((item) => item.id !== historyId)
  saveHistoryEntries(state.historyEntries)
  renderHistoryList()
  updateAccountDashboard()
}

async function persistCurrentRecommendation() {
  if (!state.lastRecommendation) return

  const entry = normalizeHistoryEntry({
    ...state.lastRecommendation,
    id: `history-${state.lastRecommendation.generatedAt || Date.now()}`,
    previewImage: getPreviewImageSource(),
  })

  if (!entry) return

  const token = getApiToken()
  if (token) {
    try {
      await apiRequest(API_ENDPOINTS.histories, {
        method: 'POST',
        token,
        body: {
          type: 'recommendation',
          style_id: state.lastRecommendation.styleId || null,
          tryon_id: null,
          context: state.lastRecommendation.context || {},
          summary: state.lastRecommendation.summary || '',
        },
      })
      await loadRemoteHistoryEntries({ force: true })
      await loadDashboardAggregate({ force: true })
      return
    } catch {
      // Keep local fallback below when the history endpoint is unavailable.
    }
  }

  state.historyEntries = [entry, ...(state.historyEntries || []).filter((item) => item.id !== entry.id)].slice(
    0,
    30
  )
  saveHistoryEntries(state.historyEntries)
  renderHistoryList()
  updateAccountDashboard()
}

function clearRecommendationHistory() {
  state.historyEntries = []
  saveHistoryEntries([])
  renderHistoryList()
  updateAccountDashboard()
}

function bindRecommendationHistory() {
  const list = document.getElementById('am-history-list')
  const clearButton = document.getElementById('am-clear-history')
  const refreshButton = document.getElementById('am-refresh-history')
  const filterSelect = document.getElementById('am-history-filter')

  state.historyEntries = readHistoryEntries()
  renderHistoryList()
  updateAccountDashboard()
  void loadRemoteHistoryEntries({ force: true })

  filterSelect?.addEventListener('change', (event) => {
    state.historyFilter = String(event.currentTarget.value || 'all')
    void loadRemoteHistoryEntries({ force: true })
  })

  refreshButton?.addEventListener('click', () => {
    void loadRemoteHistoryEntries({ force: true })
  })

  const handleHistoryPreview = (event) => {
    if (!(event.target instanceof Element)) return
    if (event.target.closest('[data-history-action]')) return
    const card = event.target.closest('[data-history-id]')
    if (!card) return
    const entry = state.historyEntries.find(
      (item) => item.id === card.getAttribute('data-history-id')
    )
    renderHistoryFocus(entry || null)
  }

  list?.addEventListener('mouseover', handleHistoryPreview)
  list?.addEventListener('focusin', handleHistoryPreview)

  list?.addEventListener('click', async (event) => {
    if (!(event.target instanceof Element)) return
    const action = event.target.closest('[data-history-action]')
    const card = event.target.closest('[data-history-id]')
    const historyId =
      action?.getAttribute('data-history-id') ||
      card?.getAttribute('data-history-id') ||
      ''

    if (!historyId) return

    if (action?.getAttribute('data-history-action') === 'delete') {
      event.stopPropagation()
      await deleteHistoryEntry(historyId)
      return
    }

    if (action?.getAttribute('data-history-action') === 'detail') {
      event.stopPropagation()
    }

    await loadHistoryDetail(historyId)
  })

  list?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (!(event.target instanceof Element)) return
    if (event.target.closest('[data-history-action]')) return
    const card = event.target.closest('[data-history-id]')
    const historyId = card?.getAttribute('data-history-id') || ''
    if (!historyId) return

    event.preventDefault()
    void loadHistoryDetail(historyId)
  })

  clearButton?.addEventListener('click', () => {
    clearRecommendationHistory()
    updatePreviewStageStatus(
      'History cleared',
      'Recommendation history has been reset'
    )
  })

  window.addEventListener('resize', () => {
    state.historyDistortions.forEach((instance) => {
      instance.resize?.()
    })
    setupHistoryScrollFx()
    ScrollTrigger.refresh()
  })
}

function bindAuthOverlay() {
  const overlay = document.getElementById('am-auth-overlay')
  const closeButton = document.getElementById('am-auth-close')
  const loginTab = document.getElementById('am-auth-tab-login')
  const registerTab = document.getElementById('am-auth-tab-register')
  const loginForm = document.getElementById('am-login-form')
  const registerForm = document.getElementById('am-register-form')
  const authButton = document.querySelector('[data-auth-action="auth"] .am-auth-nav-button')

  if (!(overlay instanceof HTMLElement)) {
    return
  }

  const openOverlay = (mode = state.authMode || 'login') => {
    switchAuthTab(mode)
    document.dispatchEvent(new CustomEvent('auth-panel-open'))
    syncOverlayLock()
    updateAuthStatus(
      mode === 'register'
        ? 'Create an account to connect remote wardrobe services.'
        : 'Sign in to connect the live wardrobe, remote try-on, and recommendation APIs.'
    )
  }

  const closeOverlay = (focusTarget = null) => {
    document.dispatchEvent(new CustomEvent('auth-panel-close'))
    syncOverlayLock()

    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus()
    }
  }

  authButton?.addEventListener('click', () => {
    openOverlay()
  })

  loginTab?.addEventListener('click', () => {
    switchAuthTab('login')
  })

  registerTab?.addEventListener('click', () => {
    switchAuthTab('register')
  })

  closeButton?.addEventListener('click', () => {
    closeOverlay()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.dataset.open === 'true') {
      closeOverlay()
    }
  })

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault()

    const formData = new FormData(loginForm)
    const payload = {
      email: String(formData.get('email') || ''),
      password: String(formData.get('password') || ''),
    }

    updateAuthStatus('Logging in...')

    try {
      const session = await requestLogin(payload)
      if (!session.token) {
        throw new Error('Login response did not include a token.')
      }

      applyAuthenticatedSession(session)
      updateAuthStatus(
        `Logged in as ${session.user?.name || session.user?.email || payload.email}.`
      )
      loginForm.reset()
      closeOverlay(authButton)
      await Promise.allSettled([
        loadWardrobeCatalog({ force: true }),
        loadRemoteHistoryEntries({ force: true }),
        loadDashboardAggregate({ force: true }),
      ])
    } catch (error) {
      updateAuthStatus(
        `Login failed: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
  })

  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault()

    const formData = new FormData(registerForm)
    const payload = {
      name: String(formData.get('name') || ''),
      email: String(formData.get('email') || ''),
      password: String(formData.get('password') || ''),
    }

    updateAuthStatus('Creating account...')

    try {
      const session = await requestRegister(payload)

      if (session.token) {
        applyAuthenticatedSession(session)
        updateAuthStatus(
          `Account created for ${session.user?.name || session.user?.email || payload.email}.`
        )
        registerForm.reset()
        closeOverlay(authButton)
        await Promise.allSettled([
          loadWardrobeCatalog({ force: true }),
          loadRemoteHistoryEntries({ force: true }),
          loadDashboardAggregate({ force: true }),
        ])
      } else {
        updateAuthStatus(
          'Registration completed. No token returned, so the session remains signed out.'
        )
        switchAuthTab('login')
      }
    } catch (error) {
      updateAuthStatus(
        `Registration failed: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
  })
}

async function handleAiRecommendationRequest() {
  const modeSelect = document.getElementById('am-ai-mode')
  const mode = String(modeSelect?.value || 'local')

  updateAiStatus('Generating recommendation...')
  updatePreviewStageStatus(
    'Stylist processing',
    'Synthesizing outfit guidance from wardrobe and weather context'
  )
  updateAiResultsSummary('AI recommendation is running...')

  let recommendation

  try {
    if (mode === 'api') {
      recommendation = await requestRemoteRecommendation()
    } else {
      recommendation = createLocalRecommendation()
    }
  } catch (error) {
    recommendation = createLocalRecommendation()
    updateAiStatus(
      `Remote recommendation failed. Falling back to local strategy: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    )
  }

  state.lastRecommendation = recommendation
  renderRecommendationResult(recommendation)
  renderPreviewRecommendationCard(recommendation)
  let visualRenderError = ''
  try {
    await renderAiVisualFromCurrentPreview(recommendation)
  } catch (error) {
    visualRenderError =
      error instanceof Error ? error.message : 'unknown error'
  }

  updateAiStatus(
    visualRenderError
      ? `${
          recommendation.mode === 'api' ? 'Remote' : 'Local'
        } recommendation ready, but the visual panel could not be rendered: ${visualRenderError}`
      : `${recommendation.mode === 'api' ? 'Remote' : 'Local'} recommendation ready.`
  )
  updatePreviewStageStatus(
    'Recommendation ready',
    `${recommendation.mode === 'api' ? 'Remote' : 'Local'} stylist guidance synced to the preview summary`
  )
  await persistCurrentRecommendation()
}

function describeWeatherCode(code) {
  if (code == null) return 'controlled'
  if (code === 0) return 'clear'
  if (code <= 3) return 'partly cloudy'
  if (code <= 48) return 'misty'
  if (code <= 67) return 'rainy'
  if (code <= 77) return 'snow'
  if (code <= 82) return 'showers'
  if (code <= 99) return 'storm'
  return 'variable'
}

function applyFallbackWeatherContext(reason = '') {
  state.weatherContext = {
    ...DEFAULT_WEATHER_CONTEXT,
    status: 'fallback',
    error: reason,
    lastUpdatedAt: Date.now(),
  }
  state.selections.weather = DEFAULT_WEATHER_CONTEXT.weatherLabel
  updateAiWeatherContext()
  updateAiResultsSummary(
    reason
      ? `Weather fallback active: ${reason}`
      : 'Weather fallback active until live context becomes available.'
  )
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported in this browser.'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 15 * 60 * 1000,
    })
  })
}

async function fetchWeatherContext(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,weather_code',
    timezone: 'auto',
  })

  const response = await fetch(`${WEATHER_API_BASE_URL}?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Weather request failed (${response.status})`)
  }

  const payload = await response.json().catch(() => null)
  const current = payload?.current

  if (!current) {
    throw new Error('Weather response was empty.')
  }

  return {
    temperatureC:
      current.temperature_2m == null ? null : Math.round(Number(current.temperature_2m)),
    humidity:
      current.relative_humidity_2m == null
        ? null
        : Math.round(Number(current.relative_humidity_2m)),
    weatherCode:
      current.weather_code == null ? null : Number(current.weather_code),
  }
}

async function fetchCityName(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    language: 'en',
  })

  const response = await fetch(`${GEOCODE_API_BASE_URL}?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Reverse geocode failed (${response.status})`)
  }

  const payload = await response.json().catch(() => null)
  const place = Array.isArray(payload?.results) ? payload.results[0] : null
  const city =
    place?.city ||
    place?.town ||
    place?.village ||
    place?.municipality ||
    place?.name ||
    ''

  return city || 'Current location'
}

async function loadWeatherContext({ force = false } = {}) {
  if (
    !force &&
    (state.weatherContext.status === 'loading' ||
      state.weatherContext.status === 'ready' ||
      state.weatherContext.status === 'fallback')
  ) {
    updateAiWeatherContext()
    updateAiResultsSummary('Context is synced and ready for the stylist.')
    return state.weatherContext
  }

  state.weatherContext = {
    ...state.weatherContext,
    status: 'loading',
    error: '',
  }
  updateAiStatus('Loading weather context for the stylist...')
  updateAiWeatherContext()
  updateAiResultsSummary('Requesting location and weather data...')

  try {
    const position = await getCurrentPosition()
    const latitude = Number(position.coords.latitude)
    const longitude = Number(position.coords.longitude)

    const [weather, city] = await Promise.allSettled([
      fetchWeatherContext(latitude, longitude),
      fetchCityName(latitude, longitude),
    ])

    if (weather.status !== 'fulfilled') {
      throw weather.reason instanceof Error
        ? weather.reason
        : new Error('Weather request failed.')
    }

    const weatherLabel = describeWeatherCode(weather.value.weatherCode)
    state.weatherContext = {
      city: city.status === 'fulfilled' ? city.value : 'Current location',
      temperatureC: weather.value.temperatureC,
      humidity: weather.value.humidity,
      latitude,
      longitude,
      weatherCode: weather.value.weatherCode,
      weatherLabel,
      source: 'live',
      status: 'ready',
      error: '',
      lastUpdatedAt: Date.now(),
    }
    state.selections.weather = weatherLabel

    updateAiWeatherContext()
    updateAiStatus('Weather context synced for the current location.')
    updateAiResultsSummary('Live context is ready for recommendation generation.')
    return state.weatherContext
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Weather context could not be loaded.'
    applyFallbackWeatherContext(message)
    updateAiStatus('Live weather unavailable. Using fallback styling context.')
    return state.weatherContext
  }
}

function getSelectedCloths() {
  return state.selectedClothIds
    .map((id) => state.clothLookup[id])
    .filter(Boolean)
}

function syncFallbackSelectionsFromCatalog() {
  const categories = ['top', 'bottom', 'shoes']

  categories.forEach((category) => {
    const preferred = state.selections[category]
    const matching = state.clothCatalog.find(
      (item) =>
        item.category === category && item.attributes.color === preferred
    )
    const first = state.clothCatalog.find((item) => item.category === category)
    const next = matching || first

    if (!next) return

    state.selections[category] = next.attributes.color || state.selections[category]

    if (!state.selectedClothIds.includes(next._id)) {
      state.selectedClothIds.push(next._id)
    }
  })

  state.selectedClothIds = state.selectedClothIds.slice(0, MAX_STYLING_SELECTIONS)
}

function renderWardrobeGrid() {
  const grid = document.getElementById('am-wardrobe-grid')
  if (!grid) return

  if (!state.clothCatalog.length) {
    grid.innerHTML = '<div class="am-empty-state">Wardrobe garments will load here.</div>'
    updateSelectionStatus()
    return
  }

  grid.innerHTML = state.clothCatalog
    .map((item) => {
      const isSelected = state.selectedClothIds.includes(item._id)
      const seasons = item.attributes.season.join(' · ') || 'all seasons'
      const occasions = item.attributes.occasion.join(' · ') || 'multi use'
      const tags = item.attributes.tags?.join(' · ') || ''
      const imageUrl = resolveAssetUrl(item.imageUrl)
      const indexStatus = state.clothIndexStatus[item._id]
      const indexed =
        typeof indexStatus?.indexed === 'boolean'
          ? indexStatus.indexed
          : item.indexed
      const indexLabel =
        indexed === true ? 'Indexed' : indexed === false ? 'Not indexed' : 'Unknown'
      const imageMarkup = imageUrl
        ? `<span class="am-wardrobe-card__media"><img src="${escapeHtml(
            imageUrl
          )}" alt="${escapeHtml(item.name)}" loading="lazy" /></span>`
        : ''

      return `
        <article
          class="am-wardrobe-card${isSelected ? ' is-selected' : ''}"
          role="button"
          tabindex="0"
          data-cloth-id="${escapeHtml(item._id)}"
          aria-pressed="${isSelected ? 'true' : 'false'}"
        >
          ${imageMarkup}
          <span class="am-wardrobe-card__eyebrow">${escapeHtml(item.category)}</span>
          <strong class="am-wardrobe-card__title">${escapeHtml(item.name)}</strong>
          <span class="am-wardrobe-card__meta">Color: ${escapeHtml(
            item.attributes.color
          )}</span>
          <span class="am-wardrobe-card__meta">Material: ${escapeHtml(
            item.attributes.material
          )}</span>
          <span class="am-wardrobe-card__meta">Season: ${escapeHtml(seasons)}</span>
          <span class="am-wardrobe-card__meta">Occasion: ${escapeHtml(occasions)}</span>
          ${tags ? `<span class="am-wardrobe-card__meta">Tags: ${escapeHtml(tags)}</span>` : ''}
          <span class="am-wardrobe-card__meta">Index: ${escapeHtml(indexLabel)}</span>
          <span class="am-wardrobe-card__cta">${
            isSelected ? 'Selected' : 'Select garment'
          }</span>
          <span class="am-wardrobe-card__actions">
            <button class="am-mini-button" type="button" data-cloth-action="detail" data-cloth-id="${escapeHtml(item._id)}">Detail</button>
            <button class="am-mini-button" type="button" data-cloth-action="edit" data-cloth-id="${escapeHtml(item._id)}">Edit</button>
            <button class="am-mini-button" type="button" data-cloth-action="index" data-cloth-id="${escapeHtml(item._id)}">Index</button>
            <button class="am-mini-button" type="button" data-cloth-action="delete" data-cloth-id="${escapeHtml(item._id)}">Delete</button>
          </span>
        </article>
      `
    })
    .join('')

  updateSelectionStatus()
}

function clearAvatarState() {
  state.avatarDataUrl = ''
  state.figureStatus = 'idle'
  state.figureUploadStatus = 'idle'
  state.figureId = ''
  state.figureSourceUrl = ''
  state.uploadedPhoto = ''
  state.uploadedPhotoFile = null
  state.uploadedPhotoFingerprint = ''
  state.syncedPhotoFingerprint = ''

  updatePhotoStatus('No file selected')
  updateFigureStatus('Upload a portrait to begin the Avatar Studio pipeline.')
  updateAvatarPreviewState({ hasAvatar: false })
  updateTryOnPreviewState({ hasPreview: false })
  updatePreviewStageStatus(
    'Virtual fitting terminal',
    'Awaiting wardrobe selection'
  )

  document.dispatchEvent(new CustomEvent('am:avatar-cleared'))
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function drawCoverImage(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  const drawX = (width - drawWidth) / 2
  const drawY = (height - drawHeight) / 2

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
}

function resolveColorSwatch(name) {
  const map = {
    graphite: '#4b5358',
    berry: '#8e204c',
    stone: '#b4a79d',
    charcoal: '#50505a',
    onyx: '#17181d',
    cream: '#ece3cf',
    unknown: '#8f8177',
  }

  return map[name] || map.unknown
}

function syncSelectionsFromSelectedCloths(cloths) {
  cloths.forEach((item) => {
    if (item?.category && item?.attributes?.color) {
      state.selections[item.category] = item.attributes.color
    }
  })
}

async function renderPreviewFromAvatar() {
  const canvas = document.getElementById('am-tryon-canvas')
  if (!canvas || !state.avatarDataUrl) return

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Preview canvas unavailable')
  }

  const image = await loadImage(state.avatarDataUrl)

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#120001')
  gradient.addColorStop(0.5, '#2a080d')
  gradient.addColorStop(1, '#f40c3f')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.save()
  ctx.globalAlpha = 0.9
  drawCoverImage(ctx, image, canvas.width, canvas.height)
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = 'rgba(243, 236, 229, 0.7)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44)
  ctx.restore()

  ctx.save()
  ctx.fillStyle = '#f3ece5'
  ctx.font = '700 17px "PPFraktionMono", monospace'
  ctx.fillText('TRY-ON PREVIEW READY', 30, 44)
  ctx.font = '400 12px "PPFraktionMono", monospace'
  ctx.fillText('Avatar linked. Wardrobe selections will render here next.', 30, 66)
  ctx.restore()

  updateTryOnPreviewState({ hasPreview: true })
  updatePreviewStageStatus(
    'Preview ready',
    'Avatar linked to the fitting viewport'
  )
}

async function renderLocalTryOn() {
  const canvas = document.getElementById('am-tryon-canvas')
  if (!canvas || !state.avatarDataUrl) return false

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Preview canvas unavailable')
  }

  const avatar = await loadImage(state.avatarDataUrl)
  const selectedCloths = getSelectedCloths()
  syncSelectionsFromSelectedCloths(selectedCloths)

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#120001')
  gradient.addColorStop(0.42, '#351016')
  gradient.addColorStop(1, '#f40c3f')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.save()
  ctx.globalAlpha = 0.94
  drawCoverImage(ctx, avatar, canvas.width, canvas.height)
  ctx.restore()

  const overlays = [
    { category: 'top', x: 90, y: 145, w: 340, h: 160 },
    { category: 'bottom', x: 120, y: 328, w: 280, h: 180 },
    { category: 'shoes', x: 140, y: 560, w: 240, h: 62 },
  ]

  overlays.forEach((shape) => {
    const cloth = selectedCloths.find((item) => item.category === shape.category)
    if (!cloth) return

    ctx.save()
    ctx.fillStyle = `${resolveColorSwatch(cloth.attributes.color)}cc`
    ctx.strokeStyle = 'rgba(243, 236, 229, 0.62)'
    ctx.lineWidth = 1.5

    if (shape.category === 'shoes') {
      ctx.beginPath()
      ctx.roundRect(shape.x, shape.y, shape.w / 2 - 12, shape.h, 16)
      ctx.roundRect(shape.x + shape.w / 2 + 12, shape.y, shape.w / 2 - 12, shape.h, 16)
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.roundRect(shape.x, shape.y, shape.w, shape.h, shape.category === 'top' ? 42 : 28)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  })

  ctx.save()
  ctx.fillStyle = '#f3ece5'
  ctx.font = '700 17px "PPFraktionMono", monospace'
  ctx.fillText('LOCAL TRY-ON', 30, 44)
  ctx.font = '400 12px "PPFraktionMono", monospace'
  ctx.fillText(
    `${selectedCloths.length} selected garment${selectedCloths.length > 1 ? 's' : ''} mapped onto the current avatar.`,
    30,
    66
  )
  ctx.restore()

  ctx.save()
  ctx.fillStyle = 'rgba(243, 236, 229, 0.9)'
  ctx.font = '400 12px "PPFraktionMono", monospace'
  selectedCloths.forEach((cloth, index) => {
    const y = 100 + index * 22
    ctx.fillText(
      `${cloth.category.toUpperCase()}: ${cloth.name.toUpperCase()}`,
      30,
      y
    )
  })
  ctx.restore()

  updateTryOnPreviewState({ hasPreview: true })
  updatePreviewStageStatus(
    state.wardrobeMode === 'remote' ? 'Preview ready' : 'Demo preview ready',
    state.wardrobeMode === 'remote'
      ? 'Rendered locally from the current avatar'
      : 'Rendered from the demo wardrobe set'
  )

  return true
}

async function fetchTryOnImageUrl(tryOnId) {
  const token = getApiToken()
  if (!token || !tryOnId) return ''

  const response = await fetch(
      `${API_ENDPOINTS.tryons}/${encodeURIComponent(tryOnId)}/image`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Try-on image request failed (${response.status})`)
  }

  const payload = await response.json().catch(() => null)
  return String(payload?.data?.image_url || payload?.image_url || '')
}

async function requestRemoteTryOn() {
  const token = getApiToken()
  if (!token || !state.selectedClothIds.length) return null

  if (!state.figureId) {
    throw new Error('Please generate an AI avatar first before trying on clothes.')
  }

  updatePreviewStageStatus('Submitting try-on', 'Sending request to AI backend...')

  const payload = await apiRequest(API_ENDPOINTS.tryons, {
    method: 'POST',
    token,
    body: {
      figure_id: state.figureId,
      cloth_ids: state.selectedClothIds,
      prompt: 'generate a try-on style preview',
    },
  })

  const data = unwrapData(payload)
  const taskId = String(data.task_id || '')
  const tryonId = data.tryon_id || data.tryon?._id || ''

  if (!taskId) {
    return { tryon_id: tryonId, image_url: data.image_url || '' }
  }

  // Poll for async result
  updatePreviewStageStatus('Generating try-on', 'AI is rendering the virtual fitting...')
  const taskResult = await pollTaskStatus(taskId, (taskData) => {
    const elapsed = Math.round(taskData.elapsed_seconds || 0)
    updatePreviewStageStatus('Generating try-on', `AI rendering... ${taskData.progress || 'processing'} (${elapsed}s)`)
  })

  const imageUrl =
    taskResult.result?.image_url ||
    taskResult.result?.result_image_url ||
    taskResult.result?.tryon_image_url ||
    taskResult.result_url ||
    ''
  return { tryon_id: tryonId, image_url: imageUrl }
}

async function pollTaskStatus(taskId, onProgress) {
  const token = getApiToken()
  const maxAttempts = 120
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    try {
      const payload = await apiRequest(endpoints.taskDetail(taskId), { token })
      const data = unwrapData(payload)
      if (onProgress) onProgress(data)
      if (data.status === 'completed') return data
      if (data.status === 'failed') throw new Error(data.error || 'Task failed')
    } catch (err) {
      if (err.message === 'Task failed' || err.message.includes('failed')) throw err
    }
  }
  throw new Error('Task timed out')
}

function extractTaskId(payload) {
  const data = unwrapData(payload)
  return String(data.task_id || data.taskId || payload?.task_id || '')
}

function extractFigureId(payload) {
  const data = unwrapData(payload)
  const figure = pickFirstObject(payload, ['figure'])
  return String(
    data.figure_id ||
      data.figureId ||
      data.id ||
      figure._id ||
      figure.id ||
      figure.figure_id ||
      payload?.figure_id ||
      ''
  )
}

function extractAvatarUrl(payload) {
  const data = unwrapData(payload)
  const figure = pickFirstObject(payload, ['figure', 'avatar', 'result'])
  return String(
    data.avatar_url ||
      data.avatar_image_url ||
      data.image_url ||
      data.result_url ||
      figure.avatar_url ||
      figure.avatar_image_url ||
      figure.image_url ||
      figure.result_url ||
      ''
  )
}

async function uploadFigureSource() {
  if (!state.uploadedPhotoFile) {
    updateFigureStatus('Choose a portrait photo before uploading.')
    return null
  }

  const token = getApiToken()
  if (!token) {
    updateFigureStatus('Please log in first to upload the portrait source.')
    return null
  }

  const formData = new FormData()
  formData.append('file', state.uploadedPhotoFile)
  formData.append('name', state.uploadedPhotoFile.name || 'portrait')
  formData.append('description', 'AuraMirror avatar source portrait')

  state.figureUploadStatus = 'uploading'
  state.figureStatus = 'source-uploading'
  updateFigureStatus('Uploading portrait source to the figure library...')

  const payload = await apiRequest(endpoints.figureUpload, {
    method: 'POST',
    token,
    body: formData,
  })
  const data = unwrapData(payload)
  const figure = pickFirstObject(payload, ['figure'])
  const figureId = extractFigureId(payload)

  if (!figureId) {
    throw new Error('Figure upload response did not include a figure_id.')
  }

  state.figureId = figureId
  state.figureSourceUrl = String(
    data.image_url ||
      data.public_url ||
      figure.image_url ||
      figure.source_image_url ||
      figure.public_url ||
      ''
  )
  state.figures = [
    {
      id: figureId,
      imageUrl: state.figureSourceUrl,
      avatarUrl: '',
      status: 'uploaded',
      createdAt: Date.now(),
    },
    ...state.figures.filter((item) => item.id !== figureId),
  ]
  state.figureUploadStatus = 'uploaded'
  state.figureStatus = 'uploaded'
  state.syncedPhotoFingerprint = state.uploadedPhotoFingerprint

  updateFigureStatus(
    `Portrait uploaded as ${figureId}. Confirm the source, then generate the virtual avatar.`
  )
  updateAvatarPreviewState({ hasAvatar: false })
  updateAccountDashboard()

  return { figureId, data }
}

async function renderAvatar() {
  const canvas = document.getElementById('am-avatar-canvas')
  if (!canvas) return

  if (!state.figureId) {
    updateFigureStatus('Upload the portrait source first, then generate the avatar.')
    return
  }

  const token = getApiToken()
  if (!token) {
    updateFigureStatus('Please log in first to generate AI avatar.')
    return
  }

  // Show loading state with uploaded photo as placeholder
  const ctx = canvas.getContext('2d')
  if (ctx && state.uploadedPhoto) {
    const previewImg = await loadImage(state.uploadedPhoto)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#160000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.globalAlpha = 0.4
    drawCoverImage(ctx, previewImg, canvas.width, canvas.height)
    ctx.restore()
    ctx.fillStyle = '#f3ece5'
    ctx.font = '700 18px "PPFraktionMono", monospace'
    ctx.fillText('GENERATING AI AVATAR...', 34, 48)
    ctx.font = '400 13px "PPFraktionMono", monospace'
    ctx.fillText('This may take up to 2 minutes', 34, 72)
  }

  state.figureStatus = 'generating'
  updateFigureStatus('Submitting avatar generation task...')

  let taskId
  let directAvatarUrl = ''
  try {
    const payload = await apiRequest(endpoints.figureGenerateAvatar(state.figureId), {
      method: 'POST',
      token,
      body: {
        prompt: 'generate a clean fashion avatar',
        style: 'realistic',
      },
    })

    taskId = extractTaskId(payload)
    directAvatarUrl = extractAvatarUrl(payload)
    if (!taskId && !directAvatarUrl) {
      throw new Error('Avatar generation response did not include a task_id.')
    }
  } catch (err) {
    state.figureStatus = 'uploaded'
    updateFigureStatus(
      `Avatar generation request failed: ${
        err instanceof Error ? err.message : 'unknown error'
      }`
    )
    throw err
  }

  updateFigureStatus(
    taskId ? `AI avatar generating... Task: ${taskId}` : 'Avatar image returned. Rendering preview...'
  )

  try {
    const result = taskId
      ? await pollTaskStatus(taskId, (data) => {
          const elapsed = Math.round(data.elapsed_seconds || 0)
          updateFigureStatus(
            `AI avatar generating... ${data.progress || 'processing'} (${elapsed}s)`
          )
        })
      : null

    const avatarUrl =
      directAvatarUrl ||
      result?.result?.avatar_url ||
      result?.result?.image_url ||
      result?.result?.result_url ||
      result?.result_url ||
      result?.resultUrl ||
      ''
    if (!avatarUrl) {
      throw new Error('No avatar image returned from AI')
    }

    const avatarImage = await loadImage(avatarUrl)

    // Draw AI avatar on canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, '#f40c3f')
    gradient.addColorStop(0.5, '#160000')
    gradient.addColorStop(1, '#f3ece5')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.globalAlpha = 0.96
    drawCoverImage(ctx, avatarImage, canvas.width, canvas.height)
    ctx.restore()
    ctx.save()
    ctx.strokeStyle = 'rgba(243, 236, 229, 0.95)'
    ctx.lineWidth = 2
    ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36)
    ctx.restore()
    ctx.save()
    ctx.fillStyle = '#f3ece5'
    ctx.font = '700 18px "PPFraktionMono", monospace'
    ctx.fillText('AURAMIRROR AI AVATAR', 34, 48)
    ctx.font = '400 13px "PPFraktionMono", monospace'
    ctx.fillText('Generated by AI backend', 34, 72)
    ctx.restore()

    state.avatarDataUrl = canvas.toDataURL('image/png')
    state.figureStatus = 'ready'
    state.figures = state.figures.map((figure) =>
      figure.id === state.figureId
        ? { ...figure, avatarUrl, status: 'ready' }
        : figure
    )

    updateAvatarPreviewState({ hasAvatar: true })
    updateFigureStatus('AI avatar generated successfully!')
    await renderPreviewFromAvatar()

    document.dispatchEvent(
      new CustomEvent('am:avatar-ready', {
        detail: { avatarDataUrl: state.avatarDataUrl },
      })
    )
  } catch (err) {
    state.figureStatus = 'uploaded'
    updateFigureStatus(
      `AI avatar generation failed: ${
        err instanceof Error ? err.message : 'unknown error'
      }`
    )
    throw err
  }
}

async function handleTryOnRequest(closeOverlay) {
  const selectedCloths = getSelectedCloths()

  if (!selectedCloths.length) {
    updatePreviewStageStatus(
      'No garments selected',
      'Choose wardrobe pieces to continue'
    )
    updateWardrobeStatus('Select at least one garment before applying to preview.')
    return
  }

  if (!state.avatarDataUrl) {
    updatePreviewStageStatus(
      'Avatar required',
      'Generate avatar before rendering'
    )
    updateWardrobeStatus('Generate the avatar first, then apply the wardrobe preview.')
    return
  }

  updatePreviewStageStatus('Rendering preview', 'Preparing local fitting scene')

  let rendered = false

  try {
    const remoteData = await requestRemoteTryOn()

    if (remoteData) {
      let imageUrl = String(remoteData.image_url || '')

      if (!imageUrl && remoteData.tryon_id) {
        imageUrl = await fetchTryOnImageUrl(remoteData.tryon_id)
      }

      if (imageUrl) {
        await renderRemoteTryOnToCanvas(imageUrl)
        updateTryOnPreviewState({ hasPreview: true, imageUrl })
        updatePreviewStageStatus(
          'Remote preview ready',
          'Live try-on image returned from the wardrobe API'
        )
        updateWardrobeStatus(
          `${selectedCloths.length} garments applied from the live wardrobe.`
        )
        rendered = true
      }
    }
  } catch (error) {
    updateWardrobeStatus(
      `Remote try-on unavailable. Falling back to local preview: ${error.message}`
    )
  }

  if (!rendered) {
    await renderLocalTryOn()
    updateWardrobeStatus(
      state.wardrobeMode === 'remote'
        ? 'Remote try-on failed. Local preview generated from the current avatar.'
        : 'Demo wardrobe preview generated locally.'
    )
  }

  if (typeof closeOverlay === 'function') {
    closeOverlay()
  }
}

function getClothItemsFromPayload(payload) {
  return pickFirstArray(payload, ['cloths', 'garments', 'items', 'results'])
}

function validateClothImageFile(file) {
  if (!file) {
    throw new Error('Choose an image file first.')
  }

  const extension = String(file.name || '').split('.').pop()?.toLowerCase()
  const validExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension)

  if (!VALID_CLOTH_IMAGE_TYPES.has(file.type) && !validExtension) {
    throw new Error('Only JPG, PNG, and WebP garment images are supported.')
  }

  if (file.size > MAX_CLOTH_IMAGE_SIZE) {
    throw new Error('Garment image must be 10MB or smaller.')
  }
}

async function uploadClothImage(file) {
  const token = getApiToken()

  if (!token) {
    throw new Error(`JWT missing. Set localStorage["${STORAGE_KEYS.apiToken}"] before uploading.`)
  }

  validateClothImageFile(file)

  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(API_ENDPOINTS.clothImageUpload, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.success === false) {
    throw new Error(
      String(payload?.message || payload?.error || `Upload failed (${response.status})`)
    )
  }

  return payload?.data || payload || {}
}

async function smartUploadCloth(file) {
  const token = getApiToken()

  if (!token) {
    throw new Error(`JWT missing. Set localStorage["${STORAGE_KEYS.apiToken}"] before uploading.`)
  }

  validateClothImageFile(file)

  const formData = new FormData()
  formData.append('file', file)

  try {
    const payload = await apiRequest(API_ENDPOINTS.clothSmartUpload, {
      method: 'POST',
      token,
      body: formData,
    })

    return payload?.data || payload || {}
  } catch (error) {
    if (error instanceof AuraMirrorApiError && error.status !== 404) {
      throw error
    }
  }

  return uploadClothImage(file)
}

async function syncClothIndexStatuses(items) {
  const token = getApiToken()
  if (!token || !items.length) return

  const results = await Promise.allSettled(
    items.map((item) =>
      apiRequest(endpoints.clothIndexStatus(item._id), { token })
    )
  )

  results.forEach((result, index) => {
    const clothId = items[index]._id
    if (!clothId || result.status !== 'fulfilled') return

    const data = unwrapData(result.value)
    const indexed =
      typeof data.indexed === 'boolean'
        ? data.indexed
        : typeof data.status === 'string'
          ? data.status === 'indexed' || data.status === 'completed'
          : null

    state.clothIndexStatus[clothId] = {
      indexed,
      indexedAt: data.indexed_at || data.indexedAt || '',
      status: String(data.status || (indexed ? 'indexed' : 'not indexed')),
    }

    if (state.clothLookup[clothId]) {
      state.clothLookup[clothId].indexed = indexed
    }
  })
}

async function loadWardrobeCatalog({ force = false } = {}) {
  const token = getApiToken()

  if (
    !force &&
    state.clothCatalog.length &&
    (state.wardrobeMode === 'remote' || !token)
  ) {
    renderWardrobeGrid()
    dispatchWardrobeUpdated()
    return
  }

  if (!token) {
    const fallbackItems = FALLBACK_CLOTHS.map(normalizeCloth)
    state.clothCatalog = fallbackItems
    rebuildClothLookup(fallbackItems)
    state.wardrobeMode = 'fallback'
    state.selectedClothIds = []
    syncFallbackSelectionsFromCatalog()
    updateWardrobeStatus(
      `JWT missing. Demo wardrobe loaded. Set localStorage["${STORAGE_KEYS.apiToken}"] for live garments.`
    )
    renderWardrobeGrid()
    dispatchWardrobeUpdated()
    return
  }

  updateWardrobeStatus('Loading wardrobe garments...')

  try {
    const payload = await apiRequest(API_ENDPOINTS.cloths, { token })
    const cloths = getClothItemsFromPayload(payload)
      .map(normalizeCloth)
      .filter((item) => item._id)

    if (!cloths.length) {
      const fallbackItems = FALLBACK_CLOTHS.map(normalizeCloth)
      state.clothCatalog = fallbackItems
      rebuildClothLookup(fallbackItems)
      state.wardrobeMode = 'fallback'
      state.selectedClothIds = []
      syncFallbackSelectionsFromCatalog()
      updateWardrobeStatus(
        'Wardrobe is empty. Demo garments loaded for local preview.'
      )
      renderWardrobeGrid()
      dispatchWardrobeUpdated()
      return
    }

    state.clothCatalog = cloths
    rebuildClothLookup(cloths)
    state.wardrobeMode = 'remote'
    state.selectedClothIds = state.selectedClothIds.filter((id) => state.clothLookup[id])
    await syncClothIndexStatuses(cloths)
    updateWardrobeStatus(`${cloths.length} live garments loaded from the wardrobe API.`)
    renderWardrobeGrid()
    dispatchWardrobeUpdated()
  } catch (error) {
    const fallbackItems = FALLBACK_CLOTHS.map(normalizeCloth)
    state.clothCatalog = fallbackItems
    rebuildClothLookup(fallbackItems)
    state.wardrobeMode = 'fallback'
    state.selectedClothIds = []
    syncFallbackSelectionsFromCatalog()
    updateWardrobeStatus(
      `Wardrobe API unavailable. Demo garments loaded: ${error.message}`
    )
    renderWardrobeGrid()
    dispatchWardrobeUpdated()
  }
}

function toggleClothSelection(clothId) {
  if (!clothId || !state.clothLookup[clothId]) return

  const currentIndex = state.selectedClothIds.indexOf(clothId)
  if (currentIndex >= 0) {
    state.selectedClothIds.splice(currentIndex, 1)
    renderWardrobeGrid()
    return
  }

  if (state.selectedClothIds.length >= MAX_STYLING_SELECTIONS) {
    updateWardrobeStatus(
      `Selection limit reached. Choose up to ${MAX_STYLING_SELECTIONS} garments.`
    )
    return
  }

  state.selectedClothIds.push(clothId)
  updateWardrobeStatus(
    `${state.selectedClothIds.length} garments selected from the ${
      state.wardrobeMode === 'remote' ? 'live' : 'demo'
    } wardrobe.`
  )
  renderWardrobeGrid()
}

function bindAvatarStudio() {
  const photoInput = document.getElementById('am-photo-input')
  const photoTrigger = document.getElementById('am-photo-trigger')
  const uploadButton = document.getElementById('am-upload-figure')
  const avatarButton = document.getElementById('am-generate-avatar')

  if (!photoInput || !photoTrigger || !uploadButton || !avatarButton) {
    return
  }

  photoTrigger.addEventListener('click', () => {
    photoInput.click()
  })

  photoInput.addEventListener('change', (event) => {
    const input = event.currentTarget
    const [file] = input.files || []

    if (!file) {
      clearAvatarState()
      return
    }

    state.uploadedPhotoFile = file
    state.uploadedPhotoFingerprint = `${file.name}:${file.size}:${file.lastModified}`
    state.syncedPhotoFingerprint = ''
    state.figureId = ''
    state.figureSourceUrl = ''
    state.figureUploadStatus = 'source-loaded'
    state.figureStatus = 'source-loaded'

    updatePhotoStatus(file.name)
    updateFigureStatus(
      'Portrait loaded. Upload it first, then generate the virtual avatar.'
    )
    updateAvatarPreviewState({ hasAvatar: false })

    const reader = new FileReader()
    reader.onload = () => {
      state.uploadedPhoto = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  })

  uploadButton.addEventListener('click', async () => {
    try {
      uploadButton.disabled = true
      await uploadFigureSource()
    } catch (error) {
      updateFigureStatus(
        `Portrait upload failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      )
      window.alert('Portrait upload failed. Check the API session and try again.')
    } finally {
      uploadButton.disabled = false
    }
  })

  avatarButton.addEventListener('click', async () => {
    try {
      avatarButton.disabled = true
      await renderAvatar()
    } catch (error) {
      updateFigureStatus(
        `Avatar generation failed: ${
          error instanceof Error ? error.message : 'Try another portrait photo.'
        }`
      )
      window.alert('Avatar generation failed. Try another photo.')
    } finally {
      avatarButton.disabled = false
    }
  })
}

function parseCsvInput(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function getClothFormPayload(form) {
  const formData = new FormData(form)
  const season = parseCsvInput(formData.get('season'))
  const tags = parseCsvInput(formData.get('tags'))

  return {
    name: String(formData.get('name') || '').trim(),
    category: String(formData.get('category') || 'misc'),
    color: String(formData.get('color') || '').trim(),
    material: String(formData.get('material') || '').trim(),
    season,
    tags,
    attributes: {
      color: String(formData.get('color') || '').trim(),
      material: String(formData.get('material') || '').trim(),
      season,
      tags,
    },
  }
}

function resetClothForm() {
  const form = document.getElementById('am-cloth-form')
  const clothId = document.getElementById('am-cloth-id')
  const detail = document.getElementById('am-cloth-detail')

  form?.reset()
  if (clothId) clothId.value = ''
  if (detail) {
    detail.innerHTML = 'Select a garment to view server details and index status.'
  }
}

function populateClothForm(item) {
  if (!item) return

  const setValue = (id, value) => {
    const node = document.getElementById(id)
    if (node) node.value = value
  }

  setValue('am-cloth-id', item._id)
  setValue('am-cloth-name', item.name)
  setValue('am-cloth-category', item.category)
  setValue('am-cloth-color', item.attributes?.color || '')
  setValue('am-cloth-material', item.attributes?.material || '')
  setValue('am-cloth-season', item.attributes?.season?.join(', ') || '')
  setValue('am-cloth-tags', item.attributes?.tags?.join(', ') || '')
}

function renderClothDetail(item, detail = null) {
  const panel = document.getElementById('am-cloth-detail')
  if (!panel || !item) return

  const source = detail || item
  const merged = {
    ...item,
    ...source,
    attributes: {
      ...(item.attributes || {}),
      ...(source.attributes || {}),
    },
  }
  const indexStatus = state.clothIndexStatus[merged._id]
  const indexed =
    typeof indexStatus?.indexed === 'boolean'
      ? indexStatus.indexed
      : merged.indexed
  const indexLabel =
    indexed === true ? 'Indexed for recall' : indexed === false ? 'Not indexed' : 'Index unknown'

  panel.innerHTML = `
    <strong>${escapeHtml(merged.name)}</strong><br />
    ID: ${escapeHtml(merged._id)}<br />
    Category: ${escapeHtml(merged.category)}<br />
    Color: ${escapeHtml(merged.attributes?.color || 'unknown')}<br />
    Material: ${escapeHtml(merged.attributes?.material || 'unspecified')}<br />
    Season: ${escapeHtml(merged.attributes?.season?.join(', ') || 'not set')}<br />
    Tags: ${escapeHtml(merged.attributes?.tags?.join(', ') || 'not set')}<br />
    Index: ${escapeHtml(indexLabel)}<br />
    ${source.imageUrl ? `Image: ${escapeHtml(source.imageUrl)}<br />` : ''}
    <br />
    ${indexed === true
      ? 'This garment can be recalled by the recommendation index.'
      : 'Submit indexing so this garment can be recalled by recommendations.'}
  `
}

async function fetchClothDetail(clothId) {
  const token = getApiToken()
  const fallback = state.clothLookup[clothId]
  if (!clothId || !fallback) return null

  if (!token || state.wardrobeMode !== 'remote') {
    renderClothDetail(fallback)
    return fallback
  }

  try {
    const payload = await apiRequest(endpoints.clothDetail(clothId), { token })
    const detail = normalizeCloth(
      pickFirstObject(payload, ['cloth', 'garment', 'item', 'record', 'result'])
    )
    state.clothDetail = detail
    if (detail?._id) {
      state.clothLookup[detail._id] = {
        ...fallback,
        ...detail,
        attributes: {
          ...(fallback.attributes || {}),
          ...(detail.attributes || {}),
        },
      }
    }
    renderClothDetail(fallback, detail)
    return detail
  } catch {
    renderClothDetail(fallback)
    return fallback
  }
}

async function saveClothRecord(form) {
  const token = getApiToken()
  if (!token) {
    throw new Error('Sign in before creating or editing garments.')
  }

  const clothId = String(new FormData(form).get('clothId') || '')
  const body = getClothFormPayload(form)

  if (!body.name) {
    throw new Error('Garment name is required.')
  }

  if (clothId) {
    await apiRequest(endpoints.clothDetail(clothId), {
      method: 'PUT',
      token,
      body,
    })
    updateWardrobeStatus(`Updated ${body.name}.`)
  } else {
    await apiRequest(API_ENDPOINTS.cloths, {
      method: 'POST',
      token,
      body,
    })
    updateWardrobeStatus(`Created ${body.name}.`)
  }

  resetClothForm()
  await loadWardrobeCatalog({ force: true })
}

async function deleteClothRecord(clothId) {
  const token = getApiToken()
  if (!token) {
    throw new Error('Sign in before deleting garments.')
  }

  await apiRequest(endpoints.clothDetail(clothId), {
    method: 'DELETE',
    token,
  })

  state.selectedClothIds = state.selectedClothIds.filter((id) => id !== clothId)
  updateWardrobeStatus('Garment deleted from the wardrobe.')
  await loadWardrobeCatalog({ force: true })
}

async function submitClothIndex(clothId) {
  const token = getApiToken()
  if (!token) {
    throw new Error('Sign in before submitting garment indexing.')
  }

  await apiRequest(endpoints.clothIndex(clothId), {
    method: 'POST',
    token,
  })
  updateWardrobeStatus('Garment indexing task submitted.')
  await syncClothIndexStatuses([state.clothLookup[clothId]].filter(Boolean))
  renderWardrobeGrid()
}

function bindModuleEntryPlaceholder() {
  const trigger = document.getElementById('am-styling-trigger')
  const overlay = document.getElementById('am-styling-overlay')
  const dialog = overlay?.querySelector('.am-styling-overlay__dialog')
  const closeButton = document.getElementById('am-styling-close')
  const refreshButton = document.getElementById('am-refresh-wardrobe')
  const applyButton = document.getElementById('am-generate-tryon')
  const uploadButton = document.getElementById('am-upload-cloth-trigger')
  const uploadInput = document.getElementById('am-upload-cloth-input')
  const aiButton = document.getElementById('am-open-ai-stylist')
  const grid = document.getElementById('am-wardrobe-grid')
  const clothForm = document.getElementById('am-cloth-form')
  const newClothButton = document.getElementById('am-new-cloth-record')

  if (!trigger) return

  bindOverlayWheelLock(overlay, dialog)

  const updateOverlayState = () => {
    updateFigureStatus(
      state.avatarDataUrl
        ? 'Avatar ready. Wardrobe selection is now available.'
        : 'Wardrobe is available. Generate the avatar first for preview-ready fitting.'
    )

    if (!state.wardrobeStatus) {
      updateWardrobeStatus('Wardrobe shell ready for data binding.')
    } else {
      updateWardrobeStatus(state.wardrobeStatus)
    }

    updateSelectionStatus()
  }

  const openOverlay = async () => {
    if (!overlay) return
    openOverlayElement(overlay)
    trigger.setAttribute('aria-expanded', 'true')
    overlay.scrollTop = 0
    if (dialog instanceof HTMLElement) {
      dialog.scrollTop = 0
    }
    syncOverlayLock()
    updateOverlayState()
    await loadWardrobeCatalog()
    closeButton?.focus()
  }

  const closeOverlay = () => {
    if (!overlay) return
    closeOverlayElement(overlay, {
      onHidden: () => {
        syncOverlayLock()
      },
    })
    trigger.setAttribute('aria-expanded', 'false')
    trigger.focus()
  }

  trigger.addEventListener('click', () => {
    void openOverlay()
  })
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void openOverlay()
    }
  })

  closeButton?.addEventListener('click', closeOverlay)

  overlay?.addEventListener('click', (event) => {
    if (
      event.target instanceof Element &&
      event.target.hasAttribute('data-am-close-styling')
    ) {
      closeOverlay()
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay && !overlay.hidden) {
      closeOverlay()
    }
  })

  refreshButton?.addEventListener('click', async () => {
    await loadWardrobeCatalog({ force: true })
  })
  applyButton?.addEventListener('click', async () => {
    await handleTryOnRequest(closeOverlay)
  })
  uploadButton?.addEventListener('click', () => {
    uploadInput?.click()
  })
  uploadInput?.addEventListener('change', async (event) => {
    const input = event.currentTarget
    const [file] = input.files || []

    if (!file) return

    uploadButton.disabled = true
    updateWardrobeStatus(`Uploading ${file.name}...`)

    try {
      const uploaded = await smartUploadCloth(file)
      const clothData = uploaded.cloth || uploaded
      updateWardrobeStatus(
        `Uploaded ${file.name}. AI is recognizing garment attributes...`
      )
      // Wait a moment then refresh to show the new item (even if AI is still processing)
      await new Promise(resolve => setTimeout(resolve, 1000))
      await loadWardrobeCatalog({ force: true })
      updateWardrobeStatus(
        `✓ ${clothData.name || file.name} added! AI recognition in progress - refresh in a few seconds to see full details.`
      )
    } catch (error) {
      updateWardrobeStatus(
        `Cloth upload failed: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    } finally {
      input.value = ''
      uploadButton.disabled = false
    }
  })

  clothForm?.addEventListener('submit', async (event) => {
    event.preventDefault()

    try {
      await saveClothRecord(clothForm)
    } catch (error) {
      updateWardrobeStatus(
        `Garment save failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      )
    }
  })

  newClothButton?.addEventListener('click', resetClothForm)

  grid?.addEventListener('click', async (event) => {
    if (!(event.target instanceof Element)) return
    const action = event.target.closest('[data-cloth-action]')
    const card = event.target.closest('[data-cloth-id]')
    const clothId =
      action?.getAttribute('data-cloth-id') ||
      card?.getAttribute('data-cloth-id') ||
      ''
    if (!clothId) return

    const actionType = action?.getAttribute('data-cloth-action') || ''

    try {
      if (actionType === 'detail') {
        event.stopPropagation()
        await fetchClothDetail(clothId)
        return
      }

      if (actionType === 'edit') {
        event.stopPropagation()
        populateClothForm(state.clothLookup[clothId])
        await fetchClothDetail(clothId)
        return
      }

      if (actionType === 'index') {
        event.stopPropagation()
        await submitClothIndex(clothId)
        return
      }

      if (actionType === 'delete') {
        event.stopPropagation()
        if (window.confirm('Delete this garment from the wardrobe?')) {
          await deleteClothRecord(clothId)
        }
        return
      }

      toggleClothSelection(clothId)
    } catch (error) {
      updateWardrobeStatus(
        `Wardrobe action failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      )
    }
  })

  grid?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (!(event.target instanceof Element)) return
    if (event.target.closest('[data-cloth-action]')) return
    const card = event.target.closest('[data-cloth-id]')
    const clothId = card?.getAttribute('data-cloth-id') || ''
    if (!clothId) return

    event.preventDefault()
    toggleClothSelection(clothId)
  })

  return {
    aiButton,
    closeOverlay,
    openOverlay,
    updateOverlayState,
  }
}

function bindAiStylistOverlay(stylingControls = {}) {
  const trigger = document.getElementById('am-ai-trigger')
  const overlay = document.getElementById('am-ai-overlay')
  const dialog = overlay?.querySelector('.am-ai-overlay__dialog')
  const closeButton = document.getElementById('am-ai-close')
  const aiButton = stylingControls.aiButton || document.getElementById('am-open-ai-stylist')
  const occasionSelect = document.getElementById('am-ai-occasion')
  const modeSelect = document.getElementById('am-ai-mode')
  const recommendButton = document.getElementById('am-ai-recommend')

  if (!trigger || !overlay) {
    return
  }

  bindOverlayWheelLock(overlay, dialog)

  let hasOpened = false

  const refreshAiContext = async ({ force = false } = {}) => {
    await loadWeatherContext({ force })
    updateAiResultsSummary('Stylist context refreshed for the selected occasion.')
  }

  const openOverlay = async ({ fromWardrobe = false } = {}) => {
    if (fromWardrobe && typeof stylingControls.closeOverlay === 'function') {
      stylingControls.closeOverlay()
    }

    openOverlayElement(overlay)
    trigger.setAttribute('aria-expanded', 'true')
    overlay.scrollTop = 0
    if (dialog instanceof HTMLElement) {
      dialog.scrollTop = 0
    }
    syncOverlayLock()
    updateAiWeatherContext()
    updateAiStatus(
      'Stylist panel ready. Recommendation generation will be connected in the next phase.'
    )
    updateAiResultsSummary('Stylist panel opened. Context is being prepared.')
    if (!hasOpened) {
      hasOpened = true
      await refreshAiContext({ force: true })
    }
    closeButton?.focus()
  }

  const closeOverlay = ({ restoreFocus = true } = {}) => {
    closeOverlayElement(overlay, {
      onHidden: () => {
        syncOverlayLock()
      },
    })
    trigger.setAttribute('aria-expanded', 'false')

    if (restoreFocus) {
      if (document.getElementById('am-styling-overlay')?.hidden === false) {
        aiButton?.focus()
      } else {
        trigger.focus()
      }
    }
  }

  trigger.addEventListener('click', () => {
    void openOverlay()
  })
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void openOverlay()
    }
  })

  aiButton?.addEventListener('click', () => {
    void openOverlay({ fromWardrobe: true })
  })

  closeButton?.addEventListener('click', () => {
    closeOverlay()
  })

  overlay.addEventListener('click', (event) => {
    if (
      event.target instanceof Element &&
      event.target.hasAttribute('data-am-close-ai')
    ) {
      closeOverlay()
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.hidden) {
      closeOverlay()
    }
  })

  occasionSelect?.addEventListener('change', (event) => {
    state.selections.occasion = String(event.currentTarget.value || 'office')
    updateAiStatus(`Occasion set to ${state.selections.occasion}.`)
    void refreshAiContext({ force: state.weatherContext.source !== 'fallback' })
  })

  modeSelect?.addEventListener('change', (event) => {
    const mode = String(event.currentTarget.value || 'local')
    updateAiStatus(`Recommendation mode switched to ${mode}.`)
  })

  if (occasionSelect) {
    occasionSelect.value = state.selections.occasion || 'office'
  }

  recommendButton?.addEventListener('click', async () => {
    await handleAiRecommendationRequest()
  })
}

function initializePreviewStage() {
  updateTryOnPreviewState({ hasPreview: false })
  updatePreviewStageStatus(
    'Virtual fitting terminal',
    'Awaiting wardrobe selection'
  )

  document.addEventListener('am:avatar-ready', async () => {
    try {
      await renderPreviewFromAvatar()
    } catch {
      updatePreviewStageStatus(
        'Preview unavailable',
        'Avatar render could not be mirrored'
      )
    }
  })

  document.addEventListener('am:avatar-cleared', () => {
    updateTryOnPreviewState({ hasPreview: false })
    updatePreviewStageStatus(
      'Virtual fitting terminal',
      'Awaiting wardrobe selection'
    )
  })
}

export function initAuraMirror() {
  if (document.documentElement.dataset.auramirrorBootstrapped === '1') {
    return
  }

  document.documentElement.dataset.auramirrorBootstrapped = '1'

  state.authToken = getApiToken()
  state.authUser = normalizeAuthUser(getStoredAuthUser())

  primeRuntimeState()
  primeOverlayLayers()
  applyBaseMetadata()
  markReady()
  updateAuthNavigation()
  bindAccountDashboard()
  bindAvatarStudio()
  const stylingControls = bindModuleEntryPlaceholder()
  bindAiStylistOverlay(stylingControls)
  bindRecommendationHistory()
  bindAuthOverlay()
  initializePreviewStage()
  updateAiWeatherContext()
  updateAiResultsSummary('Stylist context will appear here after the first panel open.')
  updateSelectionStatus()
  updateAccountDashboard()
  void restoreAuthenticatedSession()
  void loadWardrobeCatalog()
}
