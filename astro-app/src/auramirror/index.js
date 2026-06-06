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

gsap.registerPlugin(ScrollTrigger)

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

function normalizeCloth(item) {
  return {
    _id: String(item?._id || item?.id || ''),
    category: String(item?.category || 'misc'),
    name: String(item?.name || 'Unnamed garment'),
    attributes: {
      color: String(item?.attributes?.color || 'unknown'),
      material: String(item?.attributes?.material || 'unspecified'),
      season: Array.isArray(item?.attributes?.season)
        ? item.attributes.season.map(String)
        : [],
      occasion: Array.isArray(item?.attributes?.occasion)
        ? item.attributes.occasion.map(String)
        : [],
    },
  }
}

function rebuildClothLookup(items) {
  state.clothLookup = items.reduce((acc, item) => {
    acc[item._id] = item
    return acc
  }, {})
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
}

function updateWardrobeStatus(text) {
  state.wardrobeStatus = text

  const status = document.getElementById('am-wardrobe-status')
  if (status) {
    status.textContent = text
  }
}

function updateSelectionStatus() {
  const status = document.getElementById('am-selection-status')
  if (status) {
    status.textContent = `${state.selectedClothIds.length} garments selected`
  }
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

function syncOverlayLock() {
  const stylingOverlay = document.getElementById('am-styling-overlay')
  const aiOverlay = document.getElementById('am-ai-overlay')
  const authOverlay = document.getElementById('am-auth-overlay')
  const hasOpenOverlay =
    Boolean(stylingOverlay && !stylingOverlay.hidden) ||
    Boolean(aiOverlay && !aiOverlay.hidden) ||
    Boolean(authOverlay && !authOverlay.hidden)

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

  if (!placeholder || !canvas) return

  placeholder.hidden = hasAvatar
  canvas.hidden = !hasAvatar
}

function updateTryOnPreviewState({ hasPreview, imageUrl = '' }) {
  const placeholder = document.getElementById('am-tryon-placeholder')
  const canvas = document.getElementById('am-tryon-canvas')
  const image = document.getElementById('am-tryon-image')

  if (!placeholder || !canvas || !image) return

  placeholder.hidden = hasPreview
  canvas.hidden = !hasPreview || Boolean(imageUrl)
  image.hidden = !imageUrl

  if (imageUrl) {
    image.setAttribute('src', imageUrl)
  } else {
    image.removeAttribute('src')
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
  const signOutItem = document.querySelector('[data-auth-action="signout"]')
  const isAuthenticated = Boolean(state.authToken)

  if (authItem instanceof HTMLElement) {
    authItem.hidden = isAuthenticated
  }

  if (signOutItem instanceof HTMLElement) {
    signOutItem.hidden = !isAuthenticated
  }
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
  const image = document.getElementById('am-tryon-image')
  const canvas = document.getElementById('am-tryon-canvas')

  if (image && !image.hidden) {
    const src = image.getAttribute('src')
    if (src) {
      return src
    }
  }

  if (canvas && !canvas.hidden) {
    return canvas.toDataURL('image/png')
  }

  return state.avatarDataUrl || ''
}

async function renderAiVisualFromCurrentPreview(recommendation) {
  const canvas = document.getElementById('am-ai-canvas')
  const placeholder = document.getElementById('am-ai-visual-placeholder')
  if (!canvas) return

  const source = getPreviewImageSource()
  if (!source) {
    canvas.hidden = true
    if (placeholder) {
      placeholder.hidden = false
      placeholder.textContent =
        'Generate an avatar or try-on preview first to unlock recommendation visuals.'
    }
    return
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('AI canvas unavailable')
  }

  const image = await loadImage(source)
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#160000')
  gradient.addColorStop(0.5, '#3e0f18')
  gradient.addColorStop(1, '#f40c3f')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

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

  if (placeholder) {
    placeholder.hidden = true
  }
  canvas.hidden = false
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

  const response = await fetch(API_ENDPOINTS.recommendations, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      occasion: state.selections.occasion,
      weather: buildRecommendationContext(),
      figure_id: state.figureId || undefined,
      cloth_ids: state.selectedClothIds,
    }),
  })

  if (!response.ok) {
    throw new Error(`Recommendation request failed (${response.status})`)
  }

  const payload = await response.json().catch(() => null)
  const data = payload?.data || payload
  const cloths = getSelectedCloths()
  const context = buildRecommendationContext()

  return {
    mode: 'api',
    source: 'remote-api',
    cloths,
    context,
    generatedAt: Date.now(),
    headline: String(data?.headline || `${context.occasion} recommendation`),
    summary: String(
      data?.summary || data?.recommendation || `Remote stylist response received for ${context.occasion}.`
    ),
    rationale: String(
      data?.rationale ||
        'The remote stylist blended selected garments with weather context and occasion intent.'
    ),
    bulletPoints: Array.isArray(data?.bullet_points)
      ? data.bullet_points.map(String).slice(0, 4)
      : createLocalRecommendation().bulletPoints,
  }
}

async function requestLogin(credentials) {
  const response = await fetch(API_ENDPOINTS.authLogin, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  })

  if (!response.ok) {
    throw new Error(`Login failed (${response.status})`)
  }

  const payload = await response.json().catch(() => null)
  const data = payload?.data || payload || {}

  return {
    token: String(data.token || data.access_token || ''),
    user: data.user || {
      name: data.name || credentials.email,
      email: data.email || credentials.email,
    },
  }
}

async function requestRegister(payloadInput) {
  const response = await fetch(API_ENDPOINTS.authRegister, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payloadInput),
  })

  if (!response.ok) {
    throw new Error(`Register failed (${response.status})`)
  }

  const payload = await response.json().catch(() => null)
  const data = payload?.data || payload || {}

  return {
    token: String(data.token || data.access_token || ''),
    user: data.user || {
      name: data.name || payloadInput.name,
      email: data.email || payloadInput.email,
    },
  }
}

function applyAuthenticatedSession({ token, user }) {
  state.authToken = token
  state.authUser = user
  setStoredAuth(token, user)
  updateAuthNavigation()
}

async function signOutAndResetWardrobe() {
  state.authToken = ''
  state.authUser = null
  setStoredAuth('', null)
  updateAuthNavigation()
  updateWardrobeStatus('Signed out. Demo garments restored for local preview.')
  await loadWardrobeCatalog({ force: true })
}

function renderRecommendationResult(recommendation) {
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
  if (!entry || typeof entry !== 'object') return null

  const id = String(
    entry.id || `history-${entry.generatedAt || entry.timestamp || Date.now()}`
  )
  const headline = String(entry.headline || 'Styling recommendation')
  const summary = String(entry.summary || '')
  const rationale = String(entry.rationale || '')
  const mode = String(entry.mode || 'local')
  const source = String(entry.source || mode)
  const generatedAt = Number(entry.generatedAt || entry.timestamp || Date.now())
  const bulletPoints = Array.isArray(entry.bulletPoints)
    ? entry.bulletPoints.map(String).slice(0, 4)
    : []
  const context = {
    city: String(entry.context?.city || 'Unknown'),
    weatherLabel: String(entry.context?.weatherLabel || 'controlled'),
    temperatureC:
      entry.context?.temperatureC == null ? null : Number(entry.context.temperatureC),
    humidity: entry.context?.humidity == null ? null : Number(entry.context.humidity),
    occasion: String(entry.context?.occasion || 'office'),
    source: String(entry.context?.source || source),
  }
  const cloths = Array.isArray(entry.cloths)
    ? entry.cloths.map((cloth) => ({
        _id: String(cloth?._id || cloth?.id || ''),
        category: String(cloth?.category || 'misc'),
        name: String(cloth?.name || 'Unnamed garment'),
      }))
    : []
  const previewImage = String(entry.previewImage || '')

  return {
    id,
    headline,
    summary,
    rationale,
    mode,
    source,
    generatedAt,
    bulletPoints,
    context,
    cloths,
    previewImage,
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
        <button
          class="am-history-card"
          type="button"
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
        </button>
      `
    })
    .join('')

  renderHistoryFocus(state.historyEntries[0] || null)
  setupHistoryDistortions()
  setupHistoryScrollFx()
}

function persistCurrentRecommendation() {
  if (!state.lastRecommendation) return

  const entry = normalizeHistoryEntry({
    ...state.lastRecommendation,
    id: `history-${state.lastRecommendation.generatedAt || Date.now()}`,
    previewImage: getPreviewImageSource(),
  })

  if (!entry) return

  state.historyEntries = [entry, ...(state.historyEntries || []).filter((item) => item.id !== entry.id)].slice(
    0,
    30
  )
  saveHistoryEntries(state.historyEntries)
  renderHistoryList()
}

function clearRecommendationHistory() {
  state.historyEntries = []
  saveHistoryEntries([])
  renderHistoryList()
}

function bindRecommendationHistory() {
  const list = document.getElementById('am-history-list')
  const clearButton = document.getElementById('am-clear-history')

  state.historyEntries = readHistoryEntries()
  renderHistoryList()

  list?.addEventListener('mouseover', (event) => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest('[data-history-id]')
    if (!button) return
    const entry = state.historyEntries.find(
      (item) => item.id === button.getAttribute('data-history-id')
    )
    renderHistoryFocus(entry || null)
  })

  list?.addEventListener('focusin', (event) => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest('[data-history-id]')
    if (!button) return
    const entry = state.historyEntries.find(
      (item) => item.id === button.getAttribute('data-history-id')
    )
    renderHistoryFocus(entry || null)
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
  const signOutButton = document.querySelector(
    '[data-auth-action="signout"] .am-auth-nav-button'
  )

  if (!(overlay instanceof HTMLElement)) {
    return
  }

  const openOverlay = (mode = state.authMode || 'login') => {
    switchAuthTab(mode)
    overlay.hidden = false
    overlay.setAttribute('aria-hidden', 'false')
    authButton?.setAttribute('aria-expanded', 'true')
    syncOverlayLock()
    updateAuthStatus(
      mode === 'register'
        ? 'Create an account to connect remote wardrobe services.'
        : 'Sign in to connect the live wardrobe, remote try-on, and recommendation APIs.'
    )
    closeButton?.focus()
  }

  const closeOverlay = (focusTarget = null) => {
    overlay.hidden = true
    overlay.setAttribute('aria-hidden', 'true')
    authButton?.setAttribute('aria-expanded', 'false')
    syncOverlayLock()

    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus()
    }
  }

  authButton?.addEventListener('click', () => {
    openOverlay()
  })

  signOutButton?.addEventListener('click', async () => {
    await signOutAndResetWardrobe()
    updateAuthStatus('Signed out. Demo wardrobe reloaded.')
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

  overlay.addEventListener('click', (event) => {
    if (
      event.target instanceof Element &&
      event.target.hasAttribute('data-am-close-auth')
    ) {
      closeOverlay()
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.hidden) {
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
      closeOverlay(authButton)
      await loadWardrobeCatalog({ force: true })
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
        closeOverlay(authButton)
        await loadWardrobeCatalog({ force: true })
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
  persistCurrentRecommendation()
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

      return `
        <button
          class="am-wardrobe-card${isSelected ? ' is-selected' : ''}"
          type="button"
          data-cloth-id="${escapeHtml(item._id)}"
          aria-pressed="${isSelected ? 'true' : 'false'}"
        >
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
          <span class="am-wardrobe-card__cta">${
            isSelected ? 'Selected' : 'Select garment'
          }</span>
        </button>
      `
    })
    .join('')

  updateSelectionStatus()
}

function clearAvatarState() {
  state.avatarDataUrl = ''
  state.figureStatus = 'idle'
  state.figureId = ''
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

  const response = await fetch(API_ENDPOINTS.tryons, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      figure_id: state.figureId || undefined,
      cloth_ids: state.selectedClothIds,
      avatar_data_url: state.figureId ? undefined : state.avatarDataUrl,
    }),
  })

  if (!response.ok) {
    throw new Error(`Try-on request failed (${response.status})`)
  }

  const payload = await response.json().catch(() => null)
  return payload?.data || payload || null
}

async function renderAvatar() {
  const canvas = document.getElementById('am-avatar-canvas')
  if (!canvas) return

  if (!state.uploadedPhoto) {
    updateFigureStatus('Choose a portrait photo before generating the avatar.')
    return
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Avatar canvas unavailable')
  }

  const image = await loadImage(state.uploadedPhoto)

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#f40c3f')
  gradient.addColorStop(0.5, '#160000')
  gradient.addColorStop(1, '#f3ece5')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.save()
  ctx.globalAlpha = 0.96
  drawCoverImage(ctx, image, canvas.width, canvas.height)
  ctx.restore()

  ctx.save()
  ctx.fillStyle = 'rgba(22, 0, 0, 0.28)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = 'rgba(243, 236, 229, 0.95)'
  ctx.lineWidth = 2
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36)
  ctx.restore()

  ctx.save()
  ctx.fillStyle = '#f3ece5'
  ctx.font = '700 18px "PPFraktionMono", monospace'
  ctx.fillText('AURAMIRROR AVATAR', 34, 48)
  ctx.font = '400 13px "PPFraktionMono", monospace'
  ctx.fillText('Preview-first identity scaffold', 34, 72)
  ctx.restore()

  state.avatarDataUrl = canvas.toDataURL('image/png')
  state.figureStatus = 'ready'

  updateAvatarPreviewState({ hasAvatar: true })
  updateFigureStatus(
    'Virtual avatar generated locally and ready for downstream modules.'
  )
  await renderPreviewFromAvatar()

  document.dispatchEvent(
    new CustomEvent('am:avatar-ready', {
      detail: {
        avatarDataUrl: state.avatarDataUrl,
      },
    })
  )
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

async function loadWardrobeCatalog({ force = false } = {}) {
  const token = getApiToken()

  if (
    !force &&
    state.clothCatalog.length &&
    (state.wardrobeMode === 'remote' || !token)
  ) {
    renderWardrobeGrid()
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
    return
  }

  updateWardrobeStatus('Loading wardrobe garments...')

  try {
    const response = await fetch(API_ENDPOINTS.cloths, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Wardrobe request failed (${response.status})`)
    }

    const payload = await response.json().catch(() => null)
    const cloths = Array.isArray(payload?.data)
      ? payload.data.map(normalizeCloth).filter((item) => item._id)
      : []

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
      return
    }

    state.clothCatalog = cloths
    rebuildClothLookup(cloths)
    state.wardrobeMode = 'remote'
    state.selectedClothIds = state.selectedClothIds.filter((id) => state.clothLookup[id])
    updateWardrobeStatus(`${cloths.length} live garments loaded from the wardrobe API.`)
    renderWardrobeGrid()
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
  const avatarButton = document.getElementById('am-generate-avatar')

  if (!photoInput || !photoTrigger || !avatarButton) {
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
    state.figureStatus = 'source-loaded'

    updatePhotoStatus(file.name)
    updateFigureStatus(
      'Portrait loaded. Generate the virtual avatar when you are ready.'
    )
    updateAvatarPreviewState({ hasAvatar: false })

    const reader = new FileReader()
    reader.onload = () => {
      state.uploadedPhoto = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  })

  avatarButton.addEventListener('click', async () => {
    try {
      await renderAvatar()
    } catch {
      updateFigureStatus('Avatar generation failed. Try another portrait photo.')
      window.alert('Avatar generation failed. Try another photo.')
    }
  })
}

function bindModuleEntryPlaceholder() {
  const trigger = document.getElementById('am-styling-trigger')
  const overlay = document.getElementById('am-styling-overlay')
  const closeButton = document.getElementById('am-styling-close')
  const refreshButton = document.getElementById('am-refresh-wardrobe')
  const applyButton = document.getElementById('am-generate-tryon')
  const aiButton = document.getElementById('am-open-ai-stylist')
  const grid = document.getElementById('am-wardrobe-grid')

  if (!trigger) return

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
    overlay.hidden = false
    overlay.setAttribute('aria-hidden', 'false')
    trigger.setAttribute('aria-expanded', 'true')
    syncOverlayLock()
    updateOverlayState()
    await loadWardrobeCatalog()
    closeButton?.focus()
  }

  const closeOverlay = () => {
    if (!overlay) return
    overlay.hidden = true
    overlay.setAttribute('aria-hidden', 'true')
    trigger.setAttribute('aria-expanded', 'false')
    syncOverlayLock()
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

  grid?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest('[data-cloth-id]')
    if (!button) return
    toggleClothSelection(button.getAttribute('data-cloth-id'))
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
  const closeButton = document.getElementById('am-ai-close')
  const aiButton = stylingControls.aiButton || document.getElementById('am-open-ai-stylist')
  const occasionSelect = document.getElementById('am-ai-occasion')
  const modeSelect = document.getElementById('am-ai-mode')
  const recommendButton = document.getElementById('am-ai-recommend')

  if (!trigger || !overlay) {
    return
  }

  let hasOpened = false

  const refreshAiContext = async ({ force = false } = {}) => {
    await loadWeatherContext({ force })
    updateAiResultsSummary('Stylist context refreshed for the selected occasion.')
  }

  const openOverlay = async ({ fromWardrobe = false } = {}) => {
    if (fromWardrobe && typeof stylingControls.closeOverlay === 'function') {
      stylingControls.closeOverlay()
    }

    overlay.hidden = false
    overlay.setAttribute('aria-hidden', 'false')
    trigger.setAttribute('aria-expanded', 'true')
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
    overlay.hidden = true
    overlay.setAttribute('aria-hidden', 'true')
    trigger.setAttribute('aria-expanded', 'false')
    syncOverlayLock()

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
  state.authUser = getStoredAuthUser()

  primeRuntimeState()
  applyBaseMetadata()
  markReady()
  updateAuthNavigation()
  bindAvatarStudio()
  const stylingControls = bindModuleEntryPlaceholder()
  bindAiStylistOverlay(stylingControls)
  bindRecommendationHistory()
  bindAuthOverlay()
  initializePreviewStage()
  updateAiWeatherContext()
  updateAiResultsSummary('Stylist context will appear here after the first panel open.')
  updateSelectionStatus()
}
