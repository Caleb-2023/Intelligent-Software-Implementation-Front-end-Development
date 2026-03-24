const STORAGE_KEY = "auramirror.recommendation.history.v1";
const GITHUB_PROJECT_URL = "https://github.com/Felixzijunliang/wardrobe";
const QR_ASSET_VERSION = "v4";
const QR_DEFAULT_SRC = `/images/qr-wardrobe-github-default.png?${QR_ASSET_VERSION}`;
const QR_LIGHT_SRC = `/images/qr-wardrobe-github-light.png?${QR_ASSET_VERSION}`;
const API_BASE_URL = "http://localhost:3000/api";
const API_TOKEN_STORAGE_KEY = "auramirror.api.token";
const MAX_STYLING_SELECTIONS = 4;
const FALLBACK_CLOTHS = [
  {
    _id: "demo-top-graphite",
    category: "top",
    name: "Graphite Jacket",
    attributes: {
      color: "graphite",
      material: "wool blend",
      season: ["autumn", "winter"],
      occasion: ["work", "formal"]
    }
  },
  {
    _id: "demo-top-berry",
    category: "top",
    name: "Berry Hoodie",
    attributes: {
      color: "berry",
      material: "cotton fleece",
      season: ["autumn", "winter"],
      occasion: ["casual", "sport"]
    }
  },
  {
    _id: "demo-bottom-stone",
    category: "bottom",
    name: "Stone Trousers",
    attributes: {
      color: "stone",
      material: "twill",
      season: ["spring", "autumn"],
      occasion: ["work", "casual"]
    }
  },
  {
    _id: "demo-bottom-charcoal",
    category: "bottom",
    name: "Charcoal Chinos",
    attributes: {
      color: "charcoal",
      material: "cotton",
      season: ["spring", "autumn"],
      occasion: ["work", "travel"]
    }
  },
  {
    _id: "demo-shoes-onyx",
    category: "shoes",
    name: "Onyx Sneakers",
    attributes: {
      color: "onyx",
      material: "mesh",
      season: ["spring", "summer"],
      occasion: ["casual", "travel"]
    }
  },
  {
    _id: "demo-shoes-cream",
    category: "shoes",
    name: "Cream Trainers",
    attributes: {
      color: "cream",
      material: "leather",
      season: ["spring", "summer"],
      occasion: ["casual", "work"]
    }
  }
];

const state = {
  uploadedPhoto: "",
  uploadedPhotoFile: null,
  uploadedPhotoFingerprint: "",
  syncedPhotoFingerprint: "",
  avatarDataUrl: "",
  figureId: "",
  figureStatus: "idle",
  clothCatalog: [],
  clothLookup: {},
  selectedClothIds: [],
  wardrobeMode: "fallback",
  wardrobeStatus: "",
  lastRecommendation: null,
  historyScrollTween: null,
  historyScrollTrigger: null,
  historyDistortions: [],
  aiFxRaf: 0,
  aiFxCleanup: null,
  aiFxController: null,
  aiParallaxCleanup: null,
  weatherContext: {
    city: "Unknown",
    temperatureC: null,
    humidity: null,
    latitude: null,
    longitude: null
  },
  selections: {
    top: "graphite",
    bottom: "stone",
    shoes: "onyx",
    weather: "cloudy",
    occasion: "office"
  }
};

function $(selector, scope = document) {
  return scope.querySelector(selector);
}

function $$(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureMeta(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }

  meta.setAttribute("content", content);
}

function getApiToken() {
  try {
    return localStorage.getItem(API_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function getApiOrigin() {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return window.location.origin;
  }
}

function resolveApiAssetUrl(value) {
  if (!value) {
    return "";
  }

  try {
    return new URL(String(value), `${getApiOrigin()}/`).toString();
  } catch {
    return String(value);
  }
}

async function apiRequest(path, options = {}) {
  const { json = true, headers = {}, ...rest } = options;
  const requestHeaders = { ...headers };
  const token = getApiToken();

  if (json) {
    requestHeaders["Content-Type"] = requestHeaders["Content-Type"] || "application/json";
  }

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...rest,
    headers: requestHeaders
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function pollTask(taskId, { timeoutMs = 120000, intervalMs = 2500 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const payload = await apiRequest(`/tasks/${encodeURIComponent(taskId)}`);
    const data = payload?.data || {};

    if (data.status === "completed") {
      return data.result || data;
    }

    if (data.status === "failed") {
      throw new Error(data.error || payload?.message || "Task failed.");
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, intervalMs);
    });
  }

  throw new Error("Task timed out.");
}

function getClothId(cloth) {
  return String(cloth?._id || cloth?.id || "");
}

function normalizeCloth(cloth) {
  const attributes = cloth?.attributes || {};
  return {
    id: getClothId(cloth),
    name: String(cloth?.name || "Unnamed garment"),
    category: String(cloth?.category || "other"),
    color: String(attributes.color || cloth?.color || ""),
    material: String(attributes.material || cloth?.material || ""),
    season: Array.isArray(attributes.season) ? attributes.season : [],
    occasion: Array.isArray(attributes.occasion) ? attributes.occasion : []
  };
}

function getSelectedCloths() {
  return state.selectedClothIds
    .map((id) => state.clothLookup[id])
    .filter(Boolean);
}

function formatCategoryLabel(category) {
  return String(category || "other")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatClothMeta(cloth) {
  const parts = [cloth.color, cloth.material]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (cloth.season?.[0]) {
    parts.push(cloth.season[0]);
  }

  if (cloth.occasion?.[0]) {
    parts.push(cloth.occasion[0]);
  }

  return parts.join(" / ") || "Selectable garment";
}

function mapColorToPalette(color) {
  const token = String(color || "").toLowerCase();

  if (token.includes("berry") || token.includes("burgundy") || token.includes("wine") || token.includes("red")) {
    return "berry";
  }

  if (token.includes("ivory") || token.includes("white")) {
    return "ivory";
  }

  if (token.includes("stone") || token.includes("beige")) {
    return "stone";
  }

  if (token.includes("charcoal") || token.includes("black")) {
    return "charcoal";
  }

  if (token.includes("sand") || token.includes("tan")) {
    return "sand";
  }

  if (token.includes("onyx") || token.includes("navy")) {
    return "onyx";
  }

  if (token.includes("cream")) {
    return "cream";
  }

  if (token.includes("plum") || token.includes("purple")) {
    return "plum";
  }

  return "graphite";
}

function syncFallbackSelectionsFromCatalog() {
  const selected = getSelectedCloths();
  const byCategory = Object.create(null);

  selected.forEach((cloth) => {
    if (!byCategory[cloth.category]) {
      byCategory[cloth.category] = cloth;
    }
  });

  const topCloth = byCategory.top || byCategory.outerwear || byCategory.dress;
  const bottomCloth = byCategory.bottom || byCategory.dress;
  const shoesCloth = byCategory.shoes;

  state.selections.top = topCloth ? mapColorToPalette(topCloth.color) : "graphite";
  state.selections.bottom = bottomCloth
    ? mapColorToPalette(bottomCloth.color)
    : topCloth
      ? mapColorToPalette(topCloth.color)
      : "stone";
  state.selections.shoes = shoesCloth ? mapColorToPalette(shoesCloth.color) : "onyx";
}

function updateFigureStatus(text) {
  state.figureStatus = text;

  const target = $("#am-figure-status");
  if (target) {
    target.textContent = text;
  }
}

function updateWardrobeStatus(text) {
  state.wardrobeStatus = text;

  const target = $("#am-wardrobe-status");
  if (target) {
    target.textContent = text;
  }
}

function updateSelectionStatus() {
  const count = state.selectedClothIds.length;
  const target = $("#am-selection-status");

  if (target) {
    target.textContent = `${count} garment${count === 1 ? "" : "s"} selected`;
  }
}

function updatePreviewStageStatus(headline, detail) {
  const headlineTarget = $("#am-preview-stage-status");
  const detailTarget = $("#am-preview-stage-screen-state");

  if (headlineTarget && headline) {
    headlineTarget.textContent = headline;
  }

  if (detailTarget && detail) {
    detailTarget.textContent = detail;
  }
}

function inferWeatherBucket(tempC, humidity) {
  if (typeof tempC !== "number") {
    return "cloudy";
  }

  if (tempC <= 1) {
    return "snowy";
  }

  if (typeof humidity === "number" && humidity >= 82) {
    return "rainy";
  }

  if (tempC >= 27 && (typeof humidity !== "number" || humidity < 72)) {
    return "sunny";
  }

  return "cloudy";
}

function mapWeatherForStyling(weather) {
  if (weather === "rainy") {
    return "rain";
  }

  if (weather === "sunny") {
    return "hot";
  }

  if (weather === "snowy") {
    return "cold";
  }

  if (weather === "cloudy") {
    return "mild";
  }

  return weather || "mild";
}

function updateWeatherContextUi() {
  const { city, temperatureC, humidity } = state.weatherContext;
  const cityEl = $("#am-context-city");
  const tempEl = $("#am-context-temp");
  const humidityEl = $("#am-context-humidity");
  const aiCityEl = $("#am-ai-city");
  const aiTempEl = $("#am-ai-temp");
  const aiHumidityEl = $("#am-ai-humidity");
  const cityWordEl = $("#am-ai-word-city");
  const weatherWordEl = $("#am-ai-word-weather");
  const occasionWordEl = $("#am-ai-word-occasion");

  const tempText = typeof temperatureC === "number" ? `${Math.round(temperatureC)}C` : "--";
  const humidityText = typeof humidity === "number" ? `${Math.round(humidity)}%` : "--";

  if (cityEl) {
    cityEl.textContent = `City: ${city || "Unknown"}`;
  }

  if (tempEl) {
    tempEl.textContent = `Temp: ${tempText}`;
  }

  if (humidityEl) {
    humidityEl.textContent = `Humidity: ${humidityText}`;
  }

  if (aiCityEl) {
    aiCityEl.textContent = `City: ${city || "Unknown"}`;
  }

  if (aiTempEl) {
    aiTempEl.textContent = `Temp: ${tempText}`;
  }

  if (aiHumidityEl) {
    aiHumidityEl.textContent = `Humidity: ${humidityText}`;
  }

  if (cityWordEl) {
    cityWordEl.textContent = String(city || "Unknown").toUpperCase().slice(0, 16);
  }

  if (weatherWordEl) {
    weatherWordEl.textContent = String(state.selections.weather || "mild").toUpperCase();
  }

  if (occasionWordEl) {
    occasionWordEl.textContent = String(state.selections.occasion || "office").toUpperCase();
  }

  if (state.aiFxController && typeof state.aiFxController.setWeather === "function") {
    state.aiFxController.setWeather(state.selections.weather || "cloudy");
  }

  const weatherSelect = $("#am-weather");
  if (weatherSelect) {
    weatherSelect.value = state.selections.weather;
  }
}

async function fetchWeatherContext() {
  const supportsGeo = typeof navigator !== "undefined" && navigator.geolocation;

  const setFallback = () => {
    state.weatherContext = {
      city: "Unknown",
      temperatureC: null,
      humidity: null,
      latitude: null,
      longitude: null
    };
    state.selections.weather = "cloudy";
    updateWeatherContextUi();
  };

  if (!supportsGeo) {
    setFallback();
    return;
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 6000,
        maximumAge: 5 * 60 * 1000
      });
    });

    const latitude = Number(position.coords.latitude);
    const longitude = Number(position.coords.longitude);

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m,relative_humidity_2m`;
    const cityUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`;

    const [weatherRes, cityRes] = await Promise.all([
      fetch(weatherUrl).then((res) => (res.ok ? res.json() : null)).catch(() => null),
      fetch(cityUrl).then((res) => (res.ok ? res.json() : null)).catch(() => null)
    ]);

    const temperatureC = Number(weatherRes?.current?.temperature_2m);
    const humidity = Number(weatherRes?.current?.relative_humidity_2m);
    const city = String(cityRes?.city || cityRes?.locality || cityRes?.principalSubdivision || cityRes?.countryName || "Unknown");

    state.weatherContext = {
      city,
      temperatureC: Number.isFinite(temperatureC) ? temperatureC : null,
      humidity: Number.isFinite(humidity) ? humidity : null,
      latitude,
      longitude
    };

    state.selections.weather = inferWeatherBucket(state.weatherContext.temperatureC, state.weatherContext.humidity);
    updateWeatherContextUi();
  } catch {
    setFallback();
  }
}

function pickBestCloth(candidates, { weather, occasion, category }) {
  if (!candidates.length) {
    return null;
  }

  const styleWeather = mapWeatherForStyling(weather);

  const seasonByWeather = {
    cold: ["winter", "autumn"],
    hot: ["summer", "spring"],
    mild: ["spring", "autumn"],
    rain: ["autumn", "spring"]
  };

  const preferredSeasons = seasonByWeather[styleWeather] || seasonByWeather.mild;

  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  candidates.forEach((cloth) => {
    let score = 0;
    const material = String(cloth.material || "").toLowerCase();
    const color = String(cloth.color || "").toLowerCase();

    if (cloth.occasion.includes(occasion)) {
      score += 5;
    }

    cloth.season.forEach((season) => {
      if (preferredSeasons.includes(String(season).toLowerCase())) {
        score += 2;
      }
    });

    if (styleWeather === "cold") {
      if (/wool|fleece/.test(material)) {
        score += 2;
      }
      if (/charcoal|onyx|graphite/.test(color)) {
        score += 1;
      }
    }

    if (styleWeather === "hot") {
      if (/cotton|mesh|linen/.test(material)) {
        score += 2;
      }
      if (/cream|ivory|stone/.test(color)) {
        score += 1;
      }
    }

    if (styleWeather === "rain") {
      if (/leather|twill/.test(material)) {
        score += 2;
      }
    }

    if (category === "shoes" && /sneaker|trainer/.test(cloth.name.toLowerCase())) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = cloth;
    }
  });

  return best || candidates[0];
}

function getStylistCategoryPool() {
  return {
    top: state.clothCatalog.filter((cloth) => ["top", "outerwear", "dress"].includes(cloth.category)),
    bottom: state.clothCatalog.filter((cloth) => ["bottom", "dress"].includes(cloth.category)),
    shoes: state.clothCatalog.filter((cloth) => cloth.category === "shoes")
  };
}

function computeLocalStylistSelection({ weather, occasion }) {
  const byCategory = getStylistCategoryPool();
  const selected = [];
  const top = pickBestCloth(byCategory.top, { weather, occasion, category: "top" });
  const bottom = pickBestCloth(byCategory.bottom, { weather, occasion, category: "bottom" });
  const shoes = pickBestCloth(byCategory.shoes, { weather, occasion, category: "shoes" });

  [top, bottom, shoes].forEach((cloth) => {
    if (cloth?.id && !selected.includes(cloth.id)) {
      selected.push(cloth.id);
    }
  });

  return selected.slice(0, MAX_STYLING_SELECTIONS);
}

async function requestApiStylistSelection({ weather, occasion }) {
  const payload = await apiRequest("/recommendations/smart", {
    method: "POST",
    body: JSON.stringify({
      weather,
      occasion,
      city: state.weatherContext.city,
      latitude: state.weatherContext.latitude,
      longitude: state.weatherContext.longitude
    })
  });

  const data = payload?.data || payload || {};
  const rawIds = [];

  if (Array.isArray(data?.clothIds)) {
    rawIds.push(...data.clothIds);
  }

  if (Array.isArray(data?.selectedClothIds)) {
    rawIds.push(...data.selectedClothIds);
  }

  if (Array.isArray(data?.items)) {
    data.items.forEach((item) => {
      if (typeof item === "string") {
        rawIds.push(item);
        return;
      }

      const candidate = getClothId(item?.cloth || item);
      if (candidate) {
        rawIds.push(candidate);
      }
    });
  }

  return rawIds
    .map((id) => String(id || ""))
    .filter((id) => id && state.clothLookup[id])
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .slice(0, MAX_STYLING_SELECTIONS);
}

function updateAiStylistStatus(message) {
  const status = $("#am-ai-status");
  if (status) {
    status.textContent = message;
  }
}

function updateAiVisualLookOverlay(imageSrc) {
  const visual = $("#am-ai-visual");
  const overlay = $("#am-ai-look-overlay");

  if (!visual || !overlay) {
    return;
  }

  if (!imageSrc) {
    if (window.gsap) {
      window.gsap.killTweensOf(overlay);
    }

    overlay.classList.remove("is-hit", "is-pulsing");
    overlay.hidden = true;
    overlay.removeAttribute("src");
    overlay.style.removeProperty("opacity");
    overlay.style.removeProperty("transform");
    overlay.style.removeProperty("filter");
    visual.classList.remove("has-look");
    return;
  }

  overlay.setAttribute("src", imageSrc);
  overlay.hidden = false;
  visual.classList.add("has-look");

  overlay.classList.remove("is-hit", "is-pulsing");

  if (window.gsap) {
    window.gsap.killTweensOf(overlay);
    window.gsap.set(overlay, {
      xPercent: -50,
      yPercent: -50,
      scale: 0.62,
      rotation: -7,
      autoAlpha: 0,
      filter: "blur(4px)"
    });

    window.gsap.to(overlay, {
      xPercent: -50,
      yPercent: -50,
      scale: 1,
      rotation: 0,
      autoAlpha: 1,
      filter: "blur(0px)",
      duration: 0.9,
      ease: "elastic.out(1, 0.58)",
      onComplete: () => {
        overlay.classList.add("is-pulsing");
      }
    });
    return;
  }

  // Fallback without GSAP: replay CSS hit animation then keep breathing glow.
  void overlay.offsetWidth;
  overlay.classList.add("is-hit", "is-pulsing");
}

function mapWeatherToAtmosphereMode(weather) {
  if (weather === "rainy") return 0;
  if (weather === "sunny") return 1;
  if (weather === "snowy") return 3;
  return 2;
}

function createAiAtmosphereRenderer(canvas, visual) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: "high-performance"
  });

  if (!gl) {
    return null;
  }

  const vertexShaderSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;

    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    varying vec2 vUv;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uMode;
    uniform vec2 uMouse;
    uniform vec2 uMouseVel;
    uniform sampler2D uTrail;

    float hash11(float p) {
      p = fract(p * 0.1031);
      p *= p + 33.33;
      p *= p + p;
      return fract(p);
    }

    float hash21(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 hash22(vec2 p) {
      float n = hash21(p);
      return vec2(n, hash21(p + n + 17.1));
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amp = 0.5;
      for (int i = 0; i < 6; i++) {
        value += amp * noise(p);
        p *= 2.02;
        amp *= 0.5;
      }
      return value;
    }

    float voronoi(vec2 x) {
      vec2 n = floor(x);
      vec2 f = fract(x);
      float md = 8.0;

      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = hash22(n + g);
          o = 0.5 + 0.5 * sin(uTime * 0.18 + 6.2831 * o);
          vec2 r = g + o - f;
          float d = dot(r, r);
          md = min(md, d);
        }
      }

      return sqrt(md);
    }

    vec3 cityBase(vec2 uv) {
      vec2 q = uv;
      q.y += sin(uv.x * 3.2 + uTime * 0.18) * 0.01;
      vec3 c1 = vec3(0.07, 0.09, 0.14);
      vec3 c2 = vec3(0.22, 0.15, 0.20);
      vec3 c3 = vec3(0.09, 0.16, 0.24);
      vec3 gradient = mix(c1, c2, smoothstep(0.0, 0.55, q.y));
      gradient = mix(gradient, c3, smoothstep(0.35, 1.0, q.x));

      float neon = fbm(q * vec2(6.0, 10.0) + vec2(0.0, uTime * 0.08));
      float glow = smoothstep(0.55, 1.0, neon);
      gradient += vec3(0.16, 0.06, 0.14) * glow * 0.75;
      gradient += vec3(0.04, 0.12, 0.18) * smoothstep(0.35, 1.0, noise(q * 8.0 + uTime * 0.02));
      return gradient;
    }

    vec2 rainNormal(vec2 uv, float t) {
      vec2 n = vec2(0.0);
      vec2 p1 = uv * vec2(2.8, 4.2);
      p1.y += t * 0.42;
      vec2 id1 = floor(p1);
      vec2 gv1 = fract(p1) - 0.5;
      float r1 = hash21(id1);
      gv1.x += (r1 - 0.5) * 0.36;
      gv1.y += sin(t * 2.2 + r1 * 6.2831) * 0.12;
      float d1 = length(gv1 * vec2(1.0, 1.8));
      float m1 = smoothstep(0.25, 0.0, d1);
      n += normalize(gv1 + 0.0001) * m1 * 0.08;

      vec2 p2 = uv * vec2(4.8, 6.3);
      p2.y += t * 0.66;
      vec2 id2 = floor(p2);
      vec2 gv2 = fract(p2) - 0.5;
      float r2 = hash21(id2 + 13.7);
      gv2.x += (r2 - 0.5) * 0.44;
      float d2 = length(gv2 * vec2(1.0, 2.2));
      float m2 = smoothstep(0.18, 0.0, d2);
      n += normalize(gv2 + 0.0001) * m2 * 0.05;

      return n;
    }

    vec3 renderRainy(vec2 uv) {
      float t = uTime;
      vec2 px = 1.0 / max(uResolution, vec2(1.0));
      float trail = texture2D(uTrail, uv).r;
      float trailX1 = texture2D(uTrail, uv + vec2(px.x * 2.0, 0.0)).r;
      float trailX2 = texture2D(uTrail, uv - vec2(px.x * 2.0, 0.0)).r;
      float trailY1 = texture2D(uTrail, uv + vec2(0.0, px.y * 2.0)).r;
      float trailY2 = texture2D(uTrail, uv - vec2(0.0, px.y * 2.0)).r;
      vec2 trailGrad = vec2(trailX1 - trailX2, trailY1 - trailY2);

      vec2 rn = rainNormal(uv, t) + trailGrad * 0.28;
      float clear = smoothstep(0.08, 0.75, trail);
      vec2 dUv = clamp(uv + rn * (1.0 - clear * 0.82), 0.0, 1.0);

      vec3 base = cityBase(dUv);
      vec3 sharp = cityBase(uv);
      vec3 col = mix(base, sharp, clear * 0.75);

      float mist = fbm(uv * 5.0 + vec2(0.0, t * 0.07));
      col += vec3(0.08, 0.1, 0.12) * (1.0 - clear) * mist * 0.55;
      col += vec3(0.02, 0.04, 0.08) * smoothstep(0.0, 1.0, uv.y) * 0.3;
      return col;
    }

    vec3 renderSunny(vec2 uv) {
      vec2 hazeUv = uv;
      float heatMask = smoothstep(0.48, 1.0, uv.y);
      float hazeNoise = fbm(uv * vec2(9.0, 14.0) + vec2(0.0, uTime * 0.35));
      hazeUv.x += (hazeNoise - 0.5) * 0.02 * heatMask;

      vec3 base = mix(vec3(0.92, 0.85, 0.72), vec3(0.96, 0.9, 0.78), smoothstep(0.0, 1.0, uv.y));
      base = mix(base, vec3(0.88, 0.79, 0.58), smoothstep(0.5, 1.0, hazeUv.y));

      vec2 lightPos = vec2(0.1, 0.04);
      vec2 toLight = uv - lightPos;
      float dist = length(toLight);
      float rays = 0.0;
      for (int i = 0; i < 24; i++) {
        float fi = float(i) / 24.0;
        vec2 sampleUv = lightPos + toLight * fi;
        float n = fbm(sampleUv * vec2(3.2, 5.0) + vec2(0.0, uTime * 0.04));
        rays += smoothstep(0.52, 0.95, n) * (1.0 - fi);
      }
      rays /= 24.0;
      float beam = exp(-dist * 2.8) * rays;
      base += vec3(1.0, 0.93, 0.74) * beam * 0.75;

      float dust = 0.0;
      for (int i = 0; i < 28; i++) {
        float fi = float(i);
        vec2 seed = hash22(vec2(fi, fi * 2.37));
        vec2 p = fract(vec2(seed.x + uTime * (0.002 + seed.y * 0.008), seed.y + uTime * (0.001 + seed.x * 0.006)));
        float d = length(uv - p);
        dust += smoothstep(0.015, 0.0, d) * (0.2 + 0.8 * seed.x);
      }
      base += vec3(1.0, 0.96, 0.86) * dust * 0.08;
      base += vec3(0.85, 0.62, 0.22) * heatMask * (hazeNoise - 0.5) * 0.12;
      return base;
    }

    vec3 renderCloudy(vec2 uv) {
      vec2 flow = uv * vec2(2.4, 1.6);
      flow += vec2(uTime * 0.03, -uTime * 0.015);
      float fogA = fbm(flow * 1.2);
      float fogB = fbm(flow * 2.8 + vec2(3.0, -2.0));
      float fog = mix(fogA, fogB, 0.45);

      vec3 fogColA = vec3(0.75, 0.79, 0.84);
      vec3 fogColB = vec3(0.58, 0.63, 0.71);
      vec3 col = mix(fogColA, fogColB, smoothstep(0.2, 0.9, fog));

      vec3 city = cityBase(uv);
      float l = dot(city, vec3(0.2126, 0.7152, 0.0722));
      vec3 diffuseCity = mix(city, vec3(l), 0.74);
      col = mix(col, diffuseCity + vec3(0.08), 0.34);

      float softBox = smoothstep(0.0, 0.6, 1.0 - abs(uv.y - 0.5));
      col += vec3(0.1, 0.11, 0.12) * softBox * 0.1;
      return col;
    }

    vec3 renderSnowy(vec2 uv) {
      vec3 col = mix(vec3(0.1, 0.14, 0.2), vec3(0.22, 0.26, 0.31), uv.y);
      col += vec3(0.05, 0.08, 0.11) * fbm(uv * 4.0 + uTime * 0.04);

      float snow = 0.0;
      float bokeh = 0.0;
      vec2 m = uMouse;
      float windPower = clamp(length(uMouseVel) * 45.0, 0.0, 2.0);

      for (int i = 0; i < 40; i++) {
        float fi = float(i);
        vec2 seed = hash22(vec2(fi * 1.17, fi * 3.71));
        float layer = fract(fi * 0.193);
        float speed = mix(0.08, 0.42, layer);
        vec2 p = fract(seed + vec2(sin(uTime * (0.07 + seed.x * 0.16)) * 0.08, -uTime * speed));
        vec2 delta = p - m;
        float repel = exp(-dot(delta, delta) * 45.0) * windPower;
        p += normalize(delta + 0.0001) * repel * 0.025;

        float size = mix(0.0025, 0.024, layer);
        float d = length(uv - p);
        float flake = smoothstep(size, 0.0, d);
        snow += flake * (0.35 + 0.65 * (1.0 - layer));

        float dofSize = mix(0.008, 0.05, layer * layer);
        float dof = smoothstep(dofSize, 0.0, d);
        bokeh += dof * layer;
      }

      col += vec3(0.82, 0.9, 1.0) * snow * 0.5;
      col += vec3(0.92, 0.95, 1.0) * bokeh * 0.32;

      float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
      float edge = 1.0 - smoothstep(0.04, 0.22, edgeDist);
      float frostNoise = voronoi(uv * 16.0 + vec2(uTime * 0.04, -uTime * 0.03));
      float frost = edge * smoothstep(0.15, 0.85, frostNoise);
      col = mix(col, col + vec3(0.55, 0.62, 0.72) * 0.42, frost * 0.85);
      return col;
    }

    void main() {
      vec2 uv = vUv;
      vec3 color;

      if (uMode < 0.5) {
        color = renderRainy(uv);
      } else if (uMode < 1.5) {
        color = renderSunny(uv);
      } else if (uMode < 2.5) {
        color = renderCloudy(uv);
      } else {
        color = renderSnowy(uv);
      }

      float v = smoothstep(1.0, 0.18, distance(uv, vec2(0.5)));
      color *= mix(0.86, 1.0, v);
      gl_FragColor = vec4(color, 0.98);
    }
  `;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader) || "Shader compile error";
      gl.deleteShader(shader);
      throw new Error(info);
    }

    return shader;
  };

  let program;
  try {
    const vs = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Program link error");
    }
  } catch {
    return null;
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, "uResolution");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uMode = gl.getUniformLocation(program, "uMode");
  const uMouse = gl.getUniformLocation(program, "uMouse");
  const uMouseVel = gl.getUniformLocation(program, "uMouseVel");
  const uTrail = gl.getUniformLocation(program, "uTrail");

  const trailCanvas = document.createElement("canvas");
  trailCanvas.width = 320;
  trailCanvas.height = 320;
  const trailCtx = trailCanvas.getContext("2d");
  if (!trailCtx) {
    return null;
  }

  const trailTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, trailTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, trailCanvas);

  const pointer = {
    x: 0.5,
    y: 0.5,
    px: 0.5,
    py: 0.5,
    vx: 0,
    vy: 0,
    lastMove: 0,
    down: false
  };

  const beginTime = performance.now();
  let mode = mapWeatherToAtmosphereMode(state.selections.weather);
  let rafId = 0;
  let running = false;
  let lastRender = 0;

  const updatePointer = (clientX, clientY) => {
    const rect = visual.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    const cx = Math.max(0, Math.min(1, nx));
    const cy = Math.max(0, Math.min(1, ny));
    pointer.vx = cx - pointer.x;
    pointer.vy = cy - pointer.y;
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = cx;
    pointer.y = cy;
    pointer.lastMove = performance.now();
  };

  const paintTrail = () => {
    trailCtx.globalCompositeOperation = "source-over";
    trailCtx.fillStyle = "rgba(0,0,0,0.08)";
    trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);

    const active = performance.now() - pointer.lastMove < 320;
    if (active) {
      const x = pointer.x * trailCanvas.width;
      const y = (1 - pointer.y) * trailCanvas.height;
      const px = pointer.px * trailCanvas.width;
      const py = (1 - pointer.py) * trailCanvas.height;

      trailCtx.strokeStyle = "rgba(255,255,255,0.55)";
      trailCtx.lineCap = "round";
      trailCtx.lineJoin = "round";
      trailCtx.lineWidth = 14 + Math.min(22, Math.hypot(pointer.vx, pointer.vy) * 520);
      trailCtx.beginPath();
      trailCtx.moveTo(px, py);
      trailCtx.lineTo(x, y);
      trailCtx.stroke();

      trailCtx.fillStyle = "rgba(255,255,255,0.28)";
      trailCtx.beginPath();
      trailCtx.arc(x, y, 18, 0, Math.PI * 2);
      trailCtx.fill();
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trailTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, trailCanvas);
  };

  const resize = () => {
    const rect = visual.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(rect.width * dpr));
    canvas.height = Math.max(2, Math.round(rect.height * dpr));
    canvas.style.width = `${Math.max(1, rect.width)}px`;
    canvas.style.height = `${Math.max(1, rect.height)}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);
    pointer.lastMove = performance.now();
  };

  const loop = (ts) => {
    if (!running) {
      return;
    }

    const idle = ts - pointer.lastMove > 2200;
    const targetFps = idle ? 12 : 48;
    const minFrameGap = 1000 / targetFps;

    if (ts - lastRender >= minFrameGap) {
      lastRender = ts;
      paintTrail();

      gl.useProgram(program);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, (ts - beginTime) * 0.001);
      gl.uniform1f(uMode, mode);
      gl.uniform2f(uMouse, pointer.x, 1 - pointer.y);
      gl.uniform2f(uMouseVel, pointer.vx, -pointer.vy);
      gl.uniform1i(uTrail, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      pointer.vx *= 0.9;
      pointer.vy *= 0.9;
    }

    rafId = window.requestAnimationFrame(loop);
  };

  const onPointerMove = (event) => {
    updatePointer(event.clientX, event.clientY);
  };
  const onPointerDown = (event) => {
    pointer.down = true;
    updatePointer(event.clientX, event.clientY);
  };
  const onPointerUp = () => {
    pointer.down = false;
  };
  const onPointerLeave = () => {
    pointer.down = false;
  };

  visual.addEventListener("pointermove", onPointerMove);
  visual.addEventListener("pointerdown", onPointerDown);
  visual.addEventListener("pointerup", onPointerUp);
  visual.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("resize", resize);

  resize();

  return {
    start: () => {
      if (running) {
        return;
      }
      running = true;
      pointer.lastMove = performance.now();
      rafId = window.requestAnimationFrame(loop);
    },
    stop: () => {
      running = false;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    setWeather: (weather) => {
      mode = mapWeatherToAtmosphereMode(weather);
      pointer.lastMove = performance.now();
    },
    poke: () => {
      pointer.lastMove = performance.now();
    },
    destroy: () => {
      window.removeEventListener("resize", resize);
      visual.removeEventListener("pointermove", onPointerMove);
      visual.removeEventListener("pointerdown", onPointerDown);
      visual.removeEventListener("pointerup", onPointerUp);
      visual.removeEventListener("pointerleave", onPointerLeave);

      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      gl.deleteTexture(trailTexture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}

function stopAiStylistEnvironmentFx() {
  state.aiFxRaf = 0;

  if (state.aiFxController && typeof state.aiFxController.stop === "function") {
    state.aiFxController.stop();
  }

  state.aiFxController = null;

  if (typeof state.aiFxCleanup === "function") {
    state.aiFxCleanup();
    state.aiFxCleanup = null;
  }

  if (typeof state.aiParallaxCleanup === "function") {
    state.aiParallaxCleanup();
    state.aiParallaxCleanup = null;
  }
}

function startAiStylistEnvironmentFx() {
  const canvas = $("#am-ai-fx-canvas");
  const visual = $("#am-ai-visual");

  if (!canvas || !visual) {
    return;
  }

  stopAiStylistEnvironmentFx();
  const renderer = createAiAtmosphereRenderer(canvas, visual);

  if (renderer) {
    renderer.setWeather(state.selections.weather);
    renderer.start();
    state.aiFxController = renderer;
    state.aiFxCleanup = () => {
      renderer.destroy();
    };
  } else {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const resizeFallback = () => {
      const rect = visual.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(2, Math.round(rect.width * dpr));
      canvas.height = Math.max(2, Math.round(rect.height * dpr));
      canvas.style.width = `${Math.max(1, rect.width)}px`;
      canvas.style.height = `${Math.max(1, rect.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const renderFallback = () => {
      const rect = visual.getBoundingClientRect();
      const g = ctx.createLinearGradient(0, 0, 0, rect.height);
      g.addColorStop(0, "rgba(20, 30, 46, 0.65)");
      g.addColorStop(1, "rgba(131, 154, 184, 0.48)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, rect.width, rect.height);
      state.aiFxRaf = window.requestAnimationFrame(renderFallback);
    };

    resizeFallback();
    renderFallback();
    window.addEventListener("resize", resizeFallback);
    state.aiFxCleanup = () => {
      window.removeEventListener("resize", resizeFallback);
      if (state.aiFxRaf) {
        window.cancelAnimationFrame(state.aiFxRaf);
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }

  const words = $("#am-ai-words");
  const onMove = (event) => {
    if (!words) {
      return;
    }

    const rect = visual.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;

    words.style.transform = `translate3d(${(nx * 10).toFixed(2)}px, ${(ny * 8).toFixed(2)}px, 0)`;
  };

  const onLeave = () => {
    if (words) {
      words.style.transform = "translate3d(0, 0, 0)";
    }
  };

  visual.addEventListener("pointermove", onMove);
  visual.addEventListener("pointerleave", onLeave);

  state.aiParallaxCleanup = () => {
    visual.removeEventListener("pointermove", onMove);
    visual.removeEventListener("pointerleave", onLeave);
    onLeave();
  };
}

function renderAiStylistResults(items, { mode, source }) {
  const results = $("#am-ai-results");

  if (!results) {
    return;
  }

  if (!items.length) {
    results.innerHTML = '<div class="am-empty-state">No matching outfit found. Try another occasion or refresh wardrobe.</div>';
    return;
  }

  results.innerHTML = items
    .map((cloth, index) => {
      return `
        <article class="am-ai-result-card" data-ai-card-index="${index}">
          <div class="am-ai-result-card__kicker">${escapeHtml(formatCategoryLabel(cloth.category))}</div>
          <div class="am-ai-result-card__name">${escapeHtml(cloth.name)}</div>
          <div class="am-ai-result-card__meta">${escapeHtml(formatClothMeta(cloth))}</div>
        </article>
      `;
    })
    .join("");

  const cards = $$(".am-ai-result-card", results);
  if (!cards.length || !window.gsap) {
    return;
  }

  window.gsap.fromTo(
    cards,
    {
      autoAlpha: 0,
      y: 55,
      rotateX: -24,
      z: -120
    },
    {
      autoAlpha: 1,
      y: 0,
      rotateX: 0,
      z: 0,
      duration: 0.95,
      ease: "elastic.out(1, 0.55)",
      stagger: 0.08,
      clearProps: "transform"
    }
  );

  updateAiStylistStatus(`Generated ${cards.length} recommendations via ${source}${mode === "api" ? " mode" : " mode"}.`);
}

function openAiStylistOverlay() {
  const overlay = $("#am-ai-stylist-overlay");
  const occasionSelect = $("#am-ai-occasion");

  if (!overlay) {
    return;
  }

  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("am-styling-lock");

  if (occasionSelect) {
    occasionSelect.value = state.selections.occasion;
  }

  updateWeatherContextUi();
  updateAiVisualLookOverlay("");
  updateAiStylistStatus("Gathering location and weather context...");
  startAiStylistEnvironmentFx();
  void fetchWeatherContext().finally(() => {
    updateAiStylistStatus("Context ready. Pick occasion and run AI recommendation.");
  });
}

function closeAiStylistOverlay() {
  const overlay = $("#am-ai-stylist-overlay");

  if (!overlay) {
    return;
  }

  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  if ($("#am-styling-overlay")?.hidden) {
    document.documentElement.classList.remove("am-styling-lock");
  }
  stopAiStylistEnvironmentFx();
}

async function applyAiStylistRecommendation() {
  if (!state.clothCatalog.length) {
    await loadWardrobeCatalog();
  }

  if (!state.clothCatalog.length) {
    updateAiStylistStatus("Wardrobe is empty. Load garments before requesting AI styling.");
    renderAiStylistResults([], { mode: "local", source: "local" });
    return;
  }

  const occasionSelect = $("#am-ai-occasion");
  const modeSelect = $("#am-ai-mode");
  const occasion = String(occasionSelect?.value || state.selections.occasion || "office");
  const mode = String(modeSelect?.value || "local");

  state.selections.occasion = occasion;
  updateWeatherContextUi();

  const weather = state.selections.weather || "mild";
  let selectedIds = [];
  let source = "local";

  updateAiStylistStatus(`Running ${mode === "api" ? "API" : "local"} stylist engine...`);

  if (mode === "api") {
    try {
      selectedIds = await requestApiStylistSelection({ weather, occasion });
      source = "api";
    } catch {
      selectedIds = [];
      source = "local-fallback";
    }
  }

  if (!selectedIds.length) {
    selectedIds = computeLocalStylistSelection({ weather, occasion });
    if (source === "api") {
      source = "api+local-fallback";
    }
  }

  state.selectedClothIds = selectedIds;
  syncFallbackSelectionsFromCatalog();
  renderWardrobeGrid();

  const city = state.weatherContext.city || "Unknown";
  renderStylingSummary(`AI Stylist (${source}) selected a ${occasion} look for ${city} (${weather}).`);

  await handleTryOnRequest();

  updateAiVisualLookOverlay(getCurrentPreviewImage());

  const selected = getSelectedCloths();
  renderAiStylistResults(selected, { mode, source });

  if (selected.length) {
    const entry = {
      title: `${occasion.toUpperCase()} / ${weather.toUpperCase()}`,
      reason: `AI Stylist (${source}) curated this set for ${city}.`,
      items: selected.map((cloth) => `${formatCategoryLabel(cloth.category)}: ${cloth.name}`),
      image: getCurrentPreviewImage(),
      time: new Date().toLocaleString()
    };

    const history = getHistory();
    history.push(entry);
    saveHistory(history.slice(-30));
    renderHistory();
  }
}

function renderStylingSummary(message = "") {
  const card = $("#am-recommendation-card");

  if (!card) {
    return;
  }

  const selected = getSelectedCloths();

  if (!selected.length) {
    updatePreviewStageStatus("Virtual fitting terminal", "Awaiting wardrobe selection");
    card.innerHTML = "";
    return;
  }

  const tags = selected
    .map((cloth) => `<span class="am-tag">${escapeHtml(cloth.name)}</span>`)
    .join("");

  const detailText = selected
    .map((cloth) => `${formatCategoryLabel(cloth.category)}: ${cloth.name}`)
    .join(" / ");

  card.innerHTML = `
    <strong>${selected.length} garments queued</strong>
    <p>${escapeHtml(detailText)}</p>
    <div>${tags}</div>
    ${message ? `<p>${escapeHtml(message)}</p>` : ""}
  `;
}

function renderWardrobeGrid() {
  const grid = $("#am-wardrobe-grid");

  if (!grid) {
    return;
  }

  if (!state.clothCatalog.length) {
    grid.innerHTML = '<div class="am-empty-state">No garments available yet. Open the wardrobe after the backend is ready, or use the local demo set.</div>';
    updateSelectionStatus();
    renderStylingSummary();
    return;
  }

  const groups = state.clothCatalog.reduce((map, cloth) => {
    const key = cloth.category || "other";
    if (!map[key]) {
      map[key] = [];
    }
    map[key].push(cloth);
    return map;
  }, {});

  const categoryOrder = ["top", "bottom", "outerwear", "dress", "shoes", "accessory", "bag", "hat", "other"];
  const visibleCategories = [
    ...categoryOrder.filter((category) => groups[category]?.length),
    ...Object.keys(groups).filter((category) => !categoryOrder.includes(category))
  ];

  grid.innerHTML = visibleCategories
    .map((category) => {
      const items = groups[category];
      const cards = items
        .map((cloth) => {
          const selected = state.selectedClothIds.includes(cloth.id);
          return `
            <button
              class="am-cloth-card${selected ? " is-selected" : ""}"
              type="button"
              data-cloth-id="${escapeHtml(cloth.id)}"
              aria-pressed="${selected ? "true" : "false"}"
            >
              <span class="am-cloth-card__kicker">${escapeHtml(formatCategoryLabel(cloth.category))}</span>
              <strong class="am-cloth-card__name">${escapeHtml(cloth.name)}</strong>
              <span class="am-cloth-card__meta">${escapeHtml(formatClothMeta(cloth))}</span>
            </button>
          `;
        })
        .join("");

      return `
        <section class="am-wardrobe-group">
          <div class="am-wardrobe-group__head">
            <h4 class="am-wardrobe-group__title">${escapeHtml(formatCategoryLabel(category))}</h4>
            <span class="am-wardrobe-group__count">${items.length}</span>
          </div>
          <div class="am-wardrobe-group__items">${cards}</div>
        </section>
      `;
    })
    .join("");

  updateSelectionStatus();
  renderStylingSummary();
}

function setWardrobeCatalog(items, mode, statusText) {
  state.clothCatalog = items.map(normalizeCloth).filter((cloth) => cloth.id);
  state.clothLookup = Object.fromEntries(state.clothCatalog.map((cloth) => [cloth.id, cloth]));
  state.selectedClothIds = state.selectedClothIds.filter((id) => state.clothLookup[id]);
  state.wardrobeMode = mode;
  syncFallbackSelectionsFromCatalog();
  updateWardrobeStatus(statusText);
  renderWardrobeGrid();
}

function openStylingOverlay() {
  const overlay = $("#am-styling-overlay");
  const trigger = $("#am-styling-trigger");

  if (!overlay) {
    return;
  }

  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("am-styling-lock");

  if (trigger) {
    trigger.setAttribute("aria-expanded", "true");
  }

  void refreshFigureState();
  void fetchWeatherContext();
  void loadWardrobeCatalog();
}

function closeStylingOverlay() {
  const overlay = $("#am-styling-overlay");
  const trigger = $("#am-styling-trigger");

  if (!overlay) {
    return;
  }

  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  if ($("#am-ai-stylist-overlay")?.hidden) {
    document.documentElement.classList.remove("am-styling-lock");
  }

  if (trigger) {
    trigger.setAttribute("aria-expanded", "false");
  }
}

async function refreshFigureState() {
  const token = getApiToken();

  if (!token) {
    state.figureId = "";
    updateFigureStatus(
      state.avatarDataUrl
        ? `Local avatar ready. Add localStorage["${API_TOKEN_STORAGE_KEY}"] to enable backend try-on.`
        : `Generate the avatar first, then add localStorage["${API_TOKEN_STORAGE_KEY}"] for backend try-on.`
    );
    return;
  }

  updateFigureStatus("Checking active backend avatar...");

  try {
    const payload = await apiRequest("/figures/active");
    const data = payload?.data;
    const figure = data?.figure || data?.active_figure || data;

    if (!figure?._id) {
      state.figureId = "";
      updateFigureStatus("No active backend avatar yet. Generate the avatar module once to sync it.");
      return;
    }

    state.figureId = String(figure._id);
    updateFigureStatus(
      figure.status === "completed"
        ? `Active figure ready: ${state.figureId}`
        : `Active figure ${state.figureId} is ${figure.status || "processing"}.`
    );
  } catch (error) {
    state.figureId = "";
    updateFigureStatus(`Backend avatar unavailable: ${error.message}`);
  }
}

async function syncAvatarToBackend() {
  const token = getApiToken();

  if (!token) {
    await refreshFigureState();
    return;
  }

  if (!state.uploadedPhotoFile) {
    updateFigureStatus("Upload a portrait first to sync the backend avatar.");
    return;
  }

  if (state.syncedPhotoFingerprint === state.uploadedPhotoFingerprint && state.figureId) {
    await refreshFigureState();
    return;
  }

  updateFigureStatus("Uploading portrait to backend avatar pipeline...");

  try {
    const formData = new FormData();
    formData.append("photo", state.uploadedPhotoFile);

    const payload = await apiRequest("/figures", {
      method: "POST",
      body: formData,
      json: false
    });

    const figure = payload?.data?.figure;
    const taskId = payload?.data?.task_id;

    if (figure?._id) {
      state.figureId = String(figure._id);
    }

    if (taskId) {
      updateFigureStatus("Generating backend avatar...");
      await pollTask(taskId);
    }

    state.syncedPhotoFingerprint = state.uploadedPhotoFingerprint;
    await refreshFigureState();
  } catch (error) {
    updateFigureStatus(`Local avatar ready. Backend sync failed: ${error.message}`);
  }
}

async function loadWardrobeCatalog({ force = false } = {}) {
  const token = getApiToken();

  if (!force && state.clothCatalog.length && (state.wardrobeMode === "remote" || !token)) {
    renderWardrobeGrid();
    return;
  }

  if (!token) {
    setWardrobeCatalog(
      FALLBACK_CLOTHS,
      "fallback",
      `JWT missing. Demo wardrobe loaded. Set localStorage["${API_TOKEN_STORAGE_KEY}"] for live garments.`
    );
    return;
  }

  updateWardrobeStatus("Loading wardrobe garments...");

  try {
    const payload = await apiRequest("/cloths?limit=100");
    const cloths = payload?.data?.cloths;

    if (!Array.isArray(cloths) || !cloths.length) {
      setWardrobeCatalog(FALLBACK_CLOTHS, "fallback", "Wardrobe is empty. Demo garments loaded for local preview.");
      return;
    }

    setWardrobeCatalog(cloths, "remote", `${cloths.length} live garments loaded from the wardrobe API.`);
  } catch (error) {
    setWardrobeCatalog(FALLBACK_CLOTHS, "fallback", `Wardrobe API unavailable. Demo garments loaded: ${error.message}`);
  }
}

function toggleClothSelection(clothId) {
  const id = String(clothId || "");

  if (!id || !state.clothLookup[id]) {
    return;
  }

  if (state.selectedClothIds.includes(id)) {
    state.selectedClothIds = state.selectedClothIds.filter((item) => item !== id);
  } else {
    if (state.selectedClothIds.length >= MAX_STYLING_SELECTIONS) {
      renderStylingSummary(`You can queue up to ${MAX_STYLING_SELECTIONS} garments per try-on.`);
      return;
    }

    state.selectedClothIds = [...state.selectedClothIds, id];
  }

  syncFallbackSelectionsFromCatalog();
  renderWardrobeGrid();
}

async function fetchTryOnImageUrl(tryOnId) {
  const token = getApiToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${API_BASE_URL}/tryons/${encodeURIComponent(tryOnId)}/image`, {
    credentials: "include",
    headers,
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Try-on image request failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    return payload?.data?.image_url || "";
  }

  return response.url || "";
}

function showRemoteTryOnImage(imageUrl) {
  const image = $("#am-tryon-image");
  const canvas = $("#am-tryon-canvas");
  const placeholder = $("#am-tryon-placeholder");

  if (!image) {
    return;
  }

  image.src = resolveApiAssetUrl(imageUrl);
  image.hidden = false;

  if (canvas) {
    canvas.hidden = true;
  }

  if (placeholder) {
    placeholder.hidden = true;
  }

  updatePreviewStageStatus("Preview ready", "Live try-on image received");
}

async function handleTryOnRequest() {
  if (!state.selectedClothIds.length) {
    updatePreviewStageStatus("No garments selected", "Choose wardrobe pieces to continue");
    renderStylingSummary("Select at least one garment first.");
    return;
  }

  syncFallbackSelectionsFromCatalog();

  if (!state.figureId && getApiToken()) {
    await refreshFigureState();
  }

  const canUseRemote =
    state.wardrobeMode === "remote" &&
    Boolean(getApiToken()) &&
    Boolean(state.figureId) &&
    state.selectedClothIds.every((id) => !id.startsWith("demo-"));

  if (canUseRemote) {
    try {
      updatePreviewStageStatus("Rendering live try-on", "Sending garments to backend");
      renderStylingSummary("Submitting live try-on task...");

      const payload = await apiRequest("/tryons", {
        method: "POST",
        body: JSON.stringify({
          figure_id: state.figureId,
          cloth_ids: state.selectedClothIds
        })
      });

      const data = payload?.data || {};

      if (data.image_url) {
        showRemoteTryOnImage(data.image_url);
        renderStylingSummary(data.cached ? "Live try-on returned from cache." : "Live try-on completed.");
        return;
      }

      if (data.task_id) {
        updatePreviewStageStatus("Rendering live try-on", "Backend image synthesis in progress");
        renderStylingSummary("Live try-on is rendering...");
        const result = await pollTask(data.task_id);
        let imageUrl = result?.image_url || "";

        if (!imageUrl && data.tryon_id) {
          imageUrl = await fetchTryOnImageUrl(data.tryon_id);
        }

        if (imageUrl) {
          showRemoteTryOnImage(imageUrl);
          renderStylingSummary("Live try-on completed.");
          return;
        }
      }

      throw new Error("No image returned from the try-on service.");
    } catch (error) {
      updatePreviewStageStatus("Fallback preview", "Live service unavailable");
      renderStylingSummary(`Live try-on failed. Switched to local preview: ${error.message}`);
    }
  }

  await renderTryOn();
  updatePreviewStageStatus(
    state.wardrobeMode === "remote" ? "Preview ready" : "Demo preview ready",
    state.wardrobeMode === "remote" ? "Rendered locally from current avatar" : "Rendered from local wardrobe set"
  );
  renderStylingSummary(
    state.wardrobeMode === "remote"
      ? "Local preview shown because the live try-on service is unavailable."
      : "Demo wardrobe preview generated locally."
  );
}

function injectStyles() {
  if (document.getElementById("am-inline-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "am-inline-style";
  style.textContent = `
    :root {
      --color-primary: #fff2ed;
      --color-secondary: #160000;
      --color-shadow: #4d4040;
      --color-white: #fff0eb;
    }

    .theme-contrasted {
      --color-primary: #f40c3f;
      --color-secondary: #160000;
      --color-shadow: #540000;
      --color-white: #fff0eb;
    }

    .site-head .sb-availability .sb__line:first-child {
      display: flex;
      justify-content: center;
      text-align: center;
    }

    .site-head .sb-availability .sb__line:first-child .sb__text {
      text-align: center;
      width: 100%;
      display: block;
    }

    .site-head .sb-availability .sb__line:last-child .sb__text {
      margin-right: 0.35rem;
    }

    .am-panel {
      border: 1px solid currentColor;
      padding: 1.2rem;
      margin-top: 1rem;
      background: rgba(255, 255, 255, 0.78);
      backdrop-filter: blur(2px);
    }

    .s-cta {
      padding-top: 0 !important;
    }

    /* Keep striped board color aligned with active theme in both modes. */
    .s-about .s__awards {
      background: repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 1px,
        var(--color-secondary) 1.5px,
        var(--color-secondary) 2.5px,
        transparent 3px,
        var(--color-primary) 11px
      ) !important;
    }

    .theme-contrasted .s-about .s__awards {
      background: repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 1px,
        var(--color-secondary) 1.5px,
        var(--color-secondary) 2.5px,
        transparent 3px,
        var(--color-primary) 11px
      ) !important;
    }

    #contact .am-panel {
      margin-top: 0;
      width: min(30rem, calc(100% - 2rem));
    }

    .am-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      align-items: start;
    }

    .am-fields {
      display: grid;
      gap: 0.6rem;
    }

    .am-label {
      display: grid;
      gap: 0.25rem;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .am-file-input {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .am-file-row {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      flex-wrap: wrap;
    }

    .am-file-status {
      font-size: 0.82rem;
      opacity: 0.85;
    }

    .am-input,
    .am-select,
    .am-button {
      border: 1px solid currentColor;
      background: transparent;
      color: inherit;
      font: inherit;
      padding: 0.55rem 0.7rem;
    }

    .am-button {
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .am-preview-box {
      border: 1px dashed currentColor;
      min-height: 260px;
      display: grid;
      place-items: center;
      overflow: hidden;
      position: relative;
    }

    .am-preview-box img,
    .am-preview-box canvas {
      width: 100%;
      height: auto;
      display: block;
    }

    .am-note {
      font-size: 0.78rem;
      opacity: 0.75;
      margin-top: 0.6rem;
    }

    .am-history {
      position: relative;
      display: block;
      margin-top: 1rem;
      width: 100%;
    }

    .am-history-item {
      border: 1px solid currentColor;
      padding: 0.65rem;
      background: rgba(255, 255, 255, 0.65);
      line-height: 1.45;
      font-size: 0.85rem;
    }

    .am-history-gallery {
      position: relative;
      width: 100%;
      overflow: hidden;
      border: 1px solid currentColor;
      background:
        radial-gradient(circle at 12% 18%, rgba(255, 255, 255, 0.45), transparent 28%),
        radial-gradient(circle at 82% 76%, rgba(255, 255, 255, 0.3), transparent 32%),
        rgba(255, 255, 255, 0.52);
    }

    .am-history-track {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      width: max-content;
      min-width: 100%;
      will-change: transform;
    }

    .am-history-card {
      flex: 0 0 clamp(15rem, 26vw, 20rem);
      display: grid;
      grid-template-rows: auto auto;
      gap: 0.6rem;
      padding: 0.6rem;
      border: 1px solid currentColor;
      background: rgba(255, 255, 255, 0.78);
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .am-history-card:hover,
    .am-history-card:focus-visible,
    .am-history-card.is-active {
      transform: translate3d(0, -4px, 0);
      box-shadow: 0 0.65rem 0 rgba(84, 0, 0, 0.18);
    }

    .am-history-card:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -2px;
    }

    .am-history-thumb {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 5;
      border: 1px solid currentColor;
      overflow: hidden;
      background:
        linear-gradient(180deg, rgba(22, 0, 0, 0.08), rgba(22, 0, 0, 0.02)),
        repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 2px,
          rgba(22, 0, 0, 0.14) 2px,
          rgba(22, 0, 0, 0.14) 4px
        );
    }

    .am-history-thumb__img,
    .am-history-thumb__fx {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }

    .am-history-thumb__fx {
      pointer-events: none;
    }

    .am-history-meta {
      display: grid;
      gap: 0.35rem;
    }

    .am-history-meta strong {
      font: 700 12px/1.2 var(--font-family-fraktion);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .am-history-meta small {
      opacity: 0.75;
      font: 700 10px/1 var(--font-family-fraktion);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .am-history-focus {
      margin-top: 0.75rem;
      padding: 0.85rem;
      border: 1px solid currentColor;
      background: rgba(255, 255, 255, 0.72);
      min-height: 6.25rem;
      display: grid;
      gap: 0.35rem;
    }

    .am-history-focus__title {
      margin: 0;
      font: 700 12px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .am-history-focus__time {
      font: 700 10px/1 var(--font-family-fraktion);
      letter-spacing: 0.08em;
      opacity: 0.75;
      text-transform: uppercase;
    }

    .am-history-focus__reason {
      margin: 0;
      font: 200 1rem/1.28 var(--font-family-editorial);
    }

    .am-history-empty {
      width: min(26rem, calc(100% - 2rem));
      margin: 0 auto;
      text-align: center;
    }

    .am-tag {
      display: inline-block;
      border: 1px solid currentColor;
      padding: 0.1rem 0.45rem;
      font-size: 0.72rem;
      margin-right: 0.25rem;
      margin-bottom: 0.25rem;
    }

    .am-panel--styling {
      margin-top: 0;
      min-height: 0;
    }

    .am-module-entry {
      grid-column: 1 / 5 !important;
      grid-row: 2 / 4 !important;
      justify-self: center;
      align-self: center;
      width: min(13.5rem, calc(var(--width) * 0.34));
      max-width: calc(100% - 1.5rem);
      margin-top: 0;
      cursor: pointer;
      user-select: none;
      z-index: 3 !important;
    }

    .am-module-entry .s__award__inner {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 0.8rem;
      translate: 0 0 !important;
      min-height: 100%;
      padding: 0.2rem 0.15rem 0.1rem;
      text-align: left;
    }

    .am-module-entry__eyebrow {
      font: 700 11px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      opacity: 0.72;
      text-transform: uppercase;
    }

    .am-module-entry__title {
      display: grid;
      gap: 0.02em;
      margin: 0;
      font: 700 clamp(3rem, 4.4vw, 4.3rem)/0.76 var(--font-family-bigger);
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .am-module-entry__title span {
      display: block;
    }

    .am-module-entry__copy {
      margin: 0;
      font: 200 1.05rem/0.98 var(--font-family-editorial);
      max-width: 9ch;
    }

    .am-module-entry__cta {
      opacity: 0.72;
      font: 700 11px/1.18 var(--font-family-fraktion);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .am-module-entry__quick-ai {
      margin-top: 0.25rem;
      align-self: flex-start;
      border: 1px solid currentColor;
      background: rgba(22, 0, 0, 0.92);
      color: var(--color-primary);
      font: 700 10px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 0.48rem 0.58rem;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    }

    .am-module-entry__quick-ai:hover,
    .am-module-entry__quick-ai:focus-visible {
      transform: translate3d(0.18rem, 0, 0);
      box-shadow: 0 0.35rem 0 rgba(22, 0, 0, 0.2);
      background: rgba(22, 0, 0, 1);
      outline: none;
    }

    .am-module-entry:hover .am-module-entry__cta,
    .am-module-entry:focus-visible .am-module-entry__cta,
    .am-module-entry[aria-expanded="true"] .am-module-entry__cta {
      opacity: 1;
      transform: translate3d(0.18rem, 0, 0);
    }

    .am-module-entry:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -2px;
    }

    .am-styling-overlay {
      position: fixed;
      inset: 0;
      z-index: 40;
      display: grid;
      place-items: center;
      padding: 1rem;
    }

    .am-styling-overlay[hidden] {
      display: none;
    }

    .am-styling-overlay__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(22, 0, 0, 0.55);
      backdrop-filter: blur(3px);
    }

    .am-styling-overlay__dialog {
      position: relative;
      z-index: 1;
      width: min(66rem, calc(100vw - 2rem));
      max-height: calc(100vh - 2rem);
      overflow: auto;
      border: 1px solid currentColor;
      background: var(--color-primary);
      color: var(--color-secondary);
      box-shadow: 0 1.2rem 0 rgba(84, 0, 0, 0.45);
    }

    .am-styling-overlay__context {
      margin-top: 0.55rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .am-context-pill {
      border: 1px solid currentColor;
      padding: 0.3rem 0.5rem;
      font: 700 10px/1 var(--font-family-fraktion);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.85;
      background: rgba(255, 255, 255, 0.5);
    }

    .am-styling-overlay__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.4rem 1.4rem 0;
    }

    .am-styling-overlay__eyebrow {
      margin: 0 0 0.5rem;
      font: 700 12px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .am-styling-overlay__title {
      margin: 0;
      font: 200 clamp(2rem, 4vw, 3.35rem)/0.95 var(--font-family-editorial);
    }

    .am-styling-close {
      border: 1px solid currentColor;
      background: transparent;
      color: inherit;
      font: 700 12px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 0.8rem 1rem;
      cursor: pointer;
      flex-shrink: 0;
    }

    .am-styling-overlay__meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0;
      margin: 1.4rem 1.4rem 0;
      border: 1px solid currentColor;
      border-bottom: 0;
    }

    .am-styling-stat {
      display: grid;
      gap: 0.45rem;
      padding: 1rem;
      border-right: 1px solid currentColor;
      min-height: 5.25rem;
    }

    .am-styling-stat:last-child {
      border-right: 0;
    }

    .am-styling-stat__label {
      font: 700 11px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      opacity: 0.72;
    }

    .am-styling-stat__value {
      font: 200 1.1rem/1.3 var(--font-family-editorial);
    }

    .am-styling-overlay__body {
      padding: 0 1.4rem 1.4rem;
    }

    .am-styling-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.65rem;
      margin-bottom: 0.85rem;
    }

    .am-styling-toolbar__left {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      margin-right: auto;
    }

    .am-styling-toolbar__right {
      margin-left: auto;
    }

    .am-button--stylist {
      min-width: 12.5rem;
      border-width: 2px;
      background: var(--color-secondary);
      color: var(--color-primary);
      box-shadow: 0 0.45rem 0 rgba(22, 0, 0, 0.2);
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .am-button--stylist:hover,
    .am-button--stylist:focus-visible {
      transform: translate3d(0, -2px, 0);
      box-shadow: 0 0.62rem 0 rgba(22, 0, 0, 0.3);
    }

    .am-ai-panel {
      margin-bottom: 0.85rem;
      padding: 0.8rem;
      border: 1px solid currentColor;
      background: rgba(255, 255, 255, 0.4);
      display: grid;
      gap: 0.6rem;
    }

    .am-ai-panel__head {
      margin: 0;
      font: 700 11px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .am-ai-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      align-items: end;
    }

    .am-ai-controls .am-label {
      min-width: 10rem;
      margin: 0;
    }

    .am-ai-stylist-overlay {
      position: fixed;
      inset: 0;
      z-index: 42;
      display: grid;
      place-items: center;
      padding: 1rem;
    }

    .am-ai-stylist-overlay[hidden] {
      display: none;
    }

    .am-ai-stylist-overlay__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(22, 0, 0, 0.65);
      backdrop-filter: blur(4px);
    }

    .am-ai-stylist-overlay__dialog {
      position: relative;
      z-index: 1;
      width: min(72rem, calc(100vw - 2rem));
      max-height: calc(100vh - 2rem);
      overflow: auto;
      border: 1px solid currentColor;
      background: var(--color-primary);
      color: var(--color-secondary);
      box-shadow: 0 1.4rem 0 rgba(84, 0, 0, 0.45);
      padding: 1.2rem;
      display: grid;
      gap: 0.9rem;
    }

    .am-ai-stylist-overlay__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }

    .am-ai-stylist-overlay__eyebrow {
      margin: 0 0 0.45rem;
      font: 700 11px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      opacity: 0.78;
    }

    .am-ai-stylist-overlay__title {
      margin: 0;
      font: 700 clamp(2.6rem, 6vw, 4.8rem)/0.9 var(--font-family-bigger);
      letter-spacing: 0.03em;
      text-transform: uppercase;
      text-wrap: balance;
    }

    .am-ai-stylist-overlay__controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(12rem, 1fr)) auto;
      gap: 0.65rem;
      align-items: end;
    }

    .am-ai-stylist-overlay__context {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }

    .am-ai-stylist-overlay__context .am-context-pill {
      font: 700 0.8rem/1 var(--font-family-fraktion);
      letter-spacing: 0.06em;
    }

    .am-ai-visual {
      position: relative;
      min-height: clamp(14rem, 35vh, 20rem);
      border: 1px solid currentColor;
      overflow: hidden;
      background:
        linear-gradient(180deg, rgba(22, 0, 0, 0.14), rgba(22, 0, 0, 0.04)),
        radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.26), transparent 45%),
        rgba(255, 255, 255, 0.48);
    }

    .am-ai-fx-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      z-index: 1;
    }

    .am-ai-words {
      position: absolute;
      inset: 0;
      display: grid;
      align-content: center;
      justify-items: center;
      pointer-events: none;
      font: 700 clamp(2.2rem, 10vw, 7rem)/0.88 var(--font-family-bigger);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: rgba(22, 0, 0, 0.78);
      text-shadow: 0 0.05em 0 rgba(255, 240, 235, 0.6);
      will-change: transform;
      z-index: 2;
      transition: opacity 0.25s ease;
    }

    .am-ai-look-overlay {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      transform-origin: 50% 50%;
      width: min(36%, 18rem);
      aspect-ratio: 4 / 5;
      object-fit: cover;
      border: 2px solid currentColor;
      background: rgba(255, 255, 255, 0.95);
      box-shadow: 0 0.85rem 0 rgba(22, 0, 0, 0.24);
      z-index: 3;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }

    .am-ai-look-overlay.is-hit {
      animation: am-ai-look-hit-in 0.86s cubic-bezier(0.16, 1.25, 0.34, 1) both;
    }

    .am-ai-look-overlay.is-pulsing {
      animation: am-ai-look-breath 1.35s ease-in-out infinite;
    }

    @keyframes am-ai-look-hit-in {
      0% {
        transform: translate(-50%, -50%) scale(0.62) rotate(-7deg);
        opacity: 0;
        filter: blur(4px);
      }

      62% {
        transform: translate(-50%, -50%) scale(1.08) rotate(1.6deg);
        opacity: 1;
        filter: blur(0);
      }

      100% {
        transform: translate(-50%, -50%) scale(1) rotate(0deg);
        opacity: 1;
        filter: blur(0);
      }
    }

    @keyframes am-ai-look-breath {
      0% {
        border-color: rgba(22, 0, 0, 0.85);
        box-shadow:
          0 0.7rem 0 rgba(22, 0, 0, 0.22),
          0 0 0 0 rgba(22, 0, 0, 0.2),
          0 0 0.2rem rgba(255, 255, 255, 0.2) inset;
      }

      100% {
        border-color: rgba(255, 240, 235, 0.95);
        box-shadow:
          0 0.95rem 0 rgba(22, 0, 0, 0.34),
          0 0 0 0.4rem rgba(255, 240, 235, 0),
          0 0 1.05rem rgba(255, 240, 235, 0.85),
          0 0 0.4rem rgba(255, 255, 255, 0.5) inset;
      }
    }

    .am-ai-visual.has-look .am-ai-look-overlay {
      opacity: 1;
    }

    .am-ai-visual.has-look .am-ai-words {
      opacity: 0.18;
    }

    .am-ai-results {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: 0.7rem;
      perspective: 1000px;
      min-height: 6rem;
    }

    .am-ai-result-card {
      border: 1px solid currentColor;
      background: rgba(255, 255, 255, 0.78);
      padding: 0.7rem;
      transform-style: preserve-3d;
      box-shadow: 0 0.65rem 0 rgba(84, 0, 0, 0.16);
    }

    .am-ai-result-card__kicker {
      font: 700 10px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      opacity: 0.72;
    }

    .am-ai-result-card__name {
      margin-top: 0.35rem;
      font: 200 1.45rem/0.95 var(--font-family-editorial);
    }

    .am-ai-result-card__meta {
      margin-top: 0.45rem;
      font: 700 10px/1.2 var(--font-family-fraktion);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.72;
    }

    .am-wardrobe-grid {
      display: grid;
      gap: 0.9rem;
      max-height: min(58vh, 42rem);
      overflow: auto;
      padding-right: 0.35rem;
    }

    .am-wardrobe-group {
      display: grid;
      gap: 0.65rem;
    }

    .am-wardrobe-group__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding-bottom: 0.45rem;
      border-bottom: 1px solid currentColor;
    }

    .am-wardrobe-group__title {
      margin: 0;
      font: 700 12px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .am-wardrobe-group__count {
      font: 700 11px/1 var(--font-family-fraktion);
      opacity: 0.72;
    }

    .am-wardrobe-group__items {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.65rem;
    }

    .am-cloth-card {
      display: grid;
      gap: 0.35rem;
      width: 100%;
      padding: 0.8rem 0.9rem;
      border: 1px solid currentColor;
      background: rgba(255, 255, 255, 0.28);
      color: inherit;
      text-align: left;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    }

    .am-cloth-card:hover,
    .am-cloth-card:focus-visible {
      transform: translate3d(0, -2px, 0);
      box-shadow: 0 0.45rem 0 rgba(84, 0, 0, 0.22);
    }

    .am-cloth-card.is-selected {
      background: rgba(22, 0, 0, 0.08);
      box-shadow: inset 0 0 0 1px currentColor;
    }

    .am-cloth-card__kicker,
    .am-cloth-card__meta {
      font: 700 11px/1.4 var(--font-family-fraktion);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .am-cloth-card__meta {
      opacity: 0.72;
    }

    .am-cloth-card__name {
      font: 200 1.15rem/1.1 var(--font-family-editorial);
    }

    .am-preview-box--styling {
      min-height: min(62vh, 42rem);
      background:
        linear-gradient(0deg, rgba(22, 0, 0, 0.06), rgba(22, 0, 0, 0.06)),
        repeating-linear-gradient(
          135deg,
          transparent,
          transparent 11px,
          rgba(22, 0, 0, 0.14) 11px,
          rgba(22, 0, 0, 0.14) 13px
        );
    }

    .am-preview-box--styling img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .am-preview-stage {
      grid-column: 1 / 5;
      grid-row: 4 / 7;
      z-index: 1 !important;
      padding: 1rem;
      background: transparent !important;
    }

    .am-preview-stage::before {
      inset: -1px !important;
      border: 1px solid currentColor;
      background:
        linear-gradient(180deg, rgba(255, 240, 235, 0.08), rgba(255, 240, 235, 0.03)),
        rgba(255, 240, 235, 0.04);
      backdrop-filter: blur(1.5px);
    }

    .am-preview-stage__frame {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 0.95rem;
      height: 100%;
    }

    .am-preview-stage__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.1rem 0.15rem 0;
    }

    .am-preview-stage__label {
      font: 700 12px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .am-preview-stage__status {
      font: 700 11px/1 var(--font-family-fraktion);
      letter-spacing: 0.08em;
      opacity: 0.72;
      text-transform: uppercase;
    }

    .am-preview-stage__screen {
      display: grid;
      grid-template-rows: auto 1fr;
      min-height: 0;
      height: 100%;
      padding: 0.75rem;
      background: rgba(22, 0, 0, 0.96);
      border: 1px solid currentColor;
      box-shadow:
        inset 0 0 0 1px rgba(255, 240, 235, 0.12),
        0 0.9rem 0 rgba(22, 0, 0, 0.18);
    }

    .am-preview-stage__screenbar {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 0.8rem;
      padding: 0 0 0.75rem;
      color: var(--color-primary);
      border-bottom: 1px solid rgba(255, 240, 235, 0.18);
      font: 700 11px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .am-preview-stage__screen-id {
      white-space: nowrap;
    }

    .am-preview-stage__screen-dots {
      display: flex;
      justify-content: center;
      gap: 0.4rem;
    }

    .am-preview-stage__screen-dots span {
      width: 0.38rem;
      height: 0.38rem;
      border-radius: 999rem;
      background: rgba(255, 240, 235, 0.72);
    }

    .am-preview-stage__screen-state {
      justify-self: end;
      text-align: right;
      opacity: 0.82;
    }

    .am-preview-stage__viewport {
      min-height: 0;
      height: 100%;
      margin-top: 0.75rem;
      background:
        radial-gradient(circle at 50% 18%, rgba(255, 240, 235, 0.08), transparent 38%),
        linear-gradient(180deg, rgba(255, 240, 235, 0.06), rgba(255, 240, 235, 0.01)),
        repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 1px,
          rgba(255, 240, 235, 0.18) 1.5px,
          rgba(255, 240, 235, 0.18) 2.5px,
          transparent 3px,
          rgba(255, 240, 235, 0.06) 11px
        );
      border: 1px solid rgba(255, 240, 235, 0.24);
      box-shadow:
        inset 0 0 0 1px rgba(255, 240, 235, 0.06),
        inset 0 2.5rem 4rem rgba(255, 240, 235, 0.04);
    }

    .am-preview-stage .am-preview-box {
      min-height: 0;
      height: 100%;
      padding: 1.1rem;
      place-items: center;
    }

    .am-preview-stage .am-preview-box img,
    .am-preview-stage .am-preview-box canvas {
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
    }

    .am-preview-stage #am-tryon-placeholder {
      max-width: 26rem;
      color: var(--color-primary);
      font: 200 1.25rem/1.15 var(--font-family-editorial);
      text-align: center;
      text-wrap: balance;
    }

    .am-preview-stage__summary {
      margin-top: 0;
      padding: 0.9rem 1rem;
      background: rgba(22, 0, 0, 0.94);
      color: var(--color-primary);
      border: 1px solid rgba(255, 240, 235, 0.18);
      box-shadow: inset 0 0 0 1px rgba(255, 240, 235, 0.06);
    }

    .am-preview-stage__summary strong {
      display: block;
      margin-bottom: 0.35rem;
      font: 700 12px/1 var(--font-family-fraktion);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .am-preview-stage__summary p {
      margin: 0.3rem 0 0;
      font: 200 1rem/1.2 var(--font-family-editorial);
    }

    .am-preview-stage__summary .am-tag {
      border-color: rgba(255, 240, 235, 0.28);
      background: rgba(255, 240, 235, 0.06);
    }

    .am-empty-state {
      border: 1px dashed currentColor;
      padding: 1rem;
      font: 200 1rem/1.35 var(--font-family-editorial);
      background: rgba(255, 255, 255, 0.18);
    }

    .am-styling-lock {
      overflow: hidden;
    }

    @media only screen and (max-width: 1080px) {
      .am-preview-box--styling {
        min-height: 26rem;
      }

      .am-preview-stage {
        grid-row: 4 / 7;
      }

      .am-module-entry {
        width: min(12.5rem, calc(var(--width) * 0.38));
      }
    }

    @media only screen and (max-width: 767px) and (orientation: landscape),
      only screen and (max-width: 576px) {
      .am-ai-stylist-overlay__dialog {
        padding: 0.8rem;
      }

      .am-ai-stylist-overlay__controls {
        grid-template-columns: 1fr;
      }

      .am-styling-toolbar__right {
        margin-left: 0;
      }

      .am-button--stylist {
        min-width: 0;
        width: 100%;
      }

      .am-ai-look-overlay {
        width: min(56%, 14rem);
      }

      .am-ai-words {
        font-size: clamp(2rem, 13vw, 4.5rem);
      }

      .am-history-track {
        gap: 0.7rem;
        padding: 0.7rem;
      }

      .am-history-card {
        flex-basis: min(74vw, 16rem);
      }

      .am-styling-overlay {
        padding: 0.5rem;
      }

      .am-styling-overlay__header {
        padding: 1rem 1rem 0;
      }

      .am-styling-overlay__meta {
        grid-template-columns: 1fr;
        margin: 1rem 1rem 0;
        border-bottom: 1px solid currentColor;
      }

      .am-styling-stat {
        border-right: 0;
        border-bottom: 1px solid currentColor;
        min-height: 0;
      }

      .am-styling-stat:last-child {
        border-bottom: 0;
      }

      .am-wardrobe-group__items {
        grid-template-columns: 1fr;
      }

      .am-module-entry {
        grid-column: 1 / 5 !important;
        grid-row: 2 / 4 !important;
        width: min(12rem, calc(100% - 1rem));
      }

      .am-module-entry__title {
        font-size: clamp(2.5rem, 11vw, 3.4rem);
      }

      .am-preview-stage__screen {
        padding: 0.5rem;
      }

      .am-preview-stage__screenbar {
        grid-template-columns: 1fr;
        gap: 0.45rem;
        text-align: center;
      }

      .am-preview-stage__screen-id,
      .am-preview-stage__screen-state {
        justify-self: center;
        text-align: center;
      }

      .am-preview-stage {
        grid-column: 1 / 5;
        grid-row: 6 / 11;
        padding: 0.65rem;
      }

      .am-preview-stage__frame {
        gap: 0.65rem;
      }

      .am-preview-stage .am-preview-box {
        padding: 0.65rem;
      }
    }

    /* Constrain the placeholder/DB images to uniform scale and ratio */
    .s-work .s__scene__work img {
      width: 100%;
      height: auto;
      aspect-ratio: 1082 / 636;
      object-fit: cover;
    }

    /* ── VIBE section: shrink the overall card size ── */
    .s-work .s__scene .s__scene__work {
      transform:
        rotateY(calc(var(--progress) * -20deg))
        translate3d(
          calc(var(--progress) * (50vw + 100%) - 50%),
          calc(var(--am-row, var(--y)) * 50% - 50%),
          calc(var(--progress) * var(--progress) * -5rem)
        )
        scale(calc(var(--size) * 0.6)) !important;
    }

    @media only screen and (max-width: 767px) and (orientation: landscape),
      only screen and (max-width: 576px) {
      .s-work .s__scene .s__scene__work {
        transform:
          rotateY(calc(var(--progress) * -20deg))
          translate3d(
            calc(var(--progress) * (50vw + 100%) - 50%),
            calc(var(--am-row, var(--y)) * 100% - 50%),
            calc(var(--progress) * var(--progress) * -5rem)
          )
          scale(calc(var(--size) * 0.6)) !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function stripLegacyHeroSections() {
  const myWaySection = document.querySelector(".s-my-way");
  if (myWaySection) {
    myWaySection.remove();
  }

  const contact = document.getElementById("contact");
  if (!contact) {
    return;
  }

  const goArea = contact.querySelector(".s__hover");
  if (goArea) {
    goArea.remove();
  }
}

function syncQrWithTheme() {
  const qrLink = $(".site-head .js-qr-code");
  const qrImage = $(".site-head .js-qr-code img");

  if (!qrImage) {
    return;
  }

  const contrasted =
    document.documentElement.classList.contains("theme-contrasted") ||
    (document.body && document.body.classList.contains("theme-contrasted")) ||
    document.documentElement.getAttribute("data-theme") === "contrasted" ||
    (document.body && document.body.getAttribute("data-theme") === "contrasted");

  const nextSrc = contrasted ? QR_DEFAULT_SRC : QR_LIGHT_SRC;
  const nextBg = contrasted ? "#f40c3f" : "#fff";

  qrImage.setAttribute("src", nextSrc);
  qrImage.style.background = nextBg;

  if (qrLink) {
    qrLink.style.background = nextBg;
  }
}

function watchContrastThemeForQr() {
  const observer = new MutationObserver(() => {
    syncQrWithTheme();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });

  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme"]
    });
  }

  const contrastButton = $(".site-head .js-contrast");
  if (contrastButton) {
    contrastButton.addEventListener("click", () => {
      syncQrWithTheme();
      requestAnimationFrame(syncQrWithTheme);
      window.setTimeout(syncQrWithTheme, 1100);
    });
  }
}

function scrollToTryOnPreview() {
  const preview = $("#am-preview-stage");
  const aboutSection = $("#about");

  if (preview) {
    preview.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (aboutSection) {
    aboutSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setupHeaderNavigation() {
  const logoLink = $(".site-head .sb-logo a");

  if (logoLink) {
    logoLink.setAttribute("href", "/");
    logoLink.addEventListener("click", () => {
      window.location.assign("/");
    });
  }

  const socials = $(".site-head .sb-socials");
  if (socials) {
    socials.remove();
  }

  const availability = $(".site-head .sb-availability");
  if (availability) {
    const lines = $$(".sb__line", availability);

    if (lines[0]) {
      lines[0].innerHTML = `<span class="sb__text">AuroMirror</span>`;
    }

    if (lines[1]) {
      const text = $(".sb__text", lines[1]);
      if (text) {
        text.textContent = "Explore AuraMirror on GitHub ->";
      }
    }

    const hireLink = $(".sb__link", availability);
    if (hireLink) {
      hireLink.setAttribute("href", GITHUB_PROJECT_URL);
      hireLink.setAttribute("target", "_blank");
      hireLink.setAttribute("rel", "noopener");
      hireLink.textContent = "View Project";
    }
  }

  const qrLink = $(".site-head .js-qr-code");
  if (qrLink) {
    qrLink.setAttribute("href", GITHUB_PROJECT_URL);
    qrLink.setAttribute("target", "_blank");
    qrLink.setAttribute("rel", "noopener");
    qrLink.setAttribute("title", "Open AuraMirror GitHub project");
  }

  const qrImage = $(".site-head .js-qr-code img");
  if (qrImage) {
    qrImage.setAttribute("src", QR_DEFAULT_SRC);
    qrImage.setAttribute("alt", "AuraMirror GitHub QR Code");
    qrImage.style.background = "#f40c3f";
  }

  if (qrLink) {
    qrLink.style.background = "#f40c3f";
  }

  const menuLinks = $$(".js-menu-link");
  const tryOnLink = menuLinks[1] || null;
  if (tryOnLink) {
    tryOnLink.setAttribute("href", "#am-preview-stage");
    tryOnLink.addEventListener("click", (event) => {
      event.preventDefault();
      scrollToTryOnPreview();
    });
  }

  syncQrWithTheme();
}

function updateBranding() {
  document.title = "AuraMirror | AI Smart Wardrobe";
  ensureMeta(
    "description",
    "AuraMirror is an AI wardrobe mirror for avatar generation, virtual try-on, smart styling recommendations, and recommendation history."
  );

  const menuTexts = ["Avatar", "Try-On", "History"];
  $$(".js-menu-link .sb__text").forEach((el, idx) => {
    if (menuTexts[idx]) {
      el.textContent = menuTexts[idx];
    }
  });

  const heroWords = $$(".s-hero .js-word");

  if (heroWords[0]) {
    heroWords[0].textContent = "Aura";
  }

  if (heroWords[1]) {
    heroWords[1].textContent = "Mirror";
  }

  const srLabels = $$(".u-sr-only");
  srLabels.forEach((el) => {
    if (/Antoine Wodniack/i.test(el.textContent || "")) {
      el.textContent = "AuraMirror";
    }
  });
}

function setupAboutSection() {
  const about = $("#about");

  if (!about) {
    return;
  }

  const title = $(".s__block--about .s__title", about);
  const content = $(".s__block--about .s__content", about);
  const awardsTitle = $(".s__block--awards .s__title", about);
  const awardsList = $(".s__awards", about);
  const aboutFxCanvas = $(".s__canvas.js-canvas", about);

  if (aboutFxCanvas) {
    aboutFxCanvas.remove();
  }

  if (title) {
    title.textContent = "Avatar Studio";
  }

  if (awardsTitle) {
    awardsTitle.textContent = "System Modules";
  }

  if (content) {
    content.innerHTML = `
      <p>AuraMirror starts by importing real photos and generating a stylized virtual identity for outfit simulation.</p>
      <p>The generated avatar is reused across Try-On and AI recommendation modules so every decision is preview-first.</p>
      <div class="am-panel" id="am-avatar-panel">
        <div class="am-grid">
          <div class="am-fields">
            <label class="am-label">Upload Portrait Photo
              <input id="am-photo-input" class="am-file-input" type="file" accept="image/*" />
            </label>
            <div class="am-file-row">
              <button id="am-photo-trigger" class="am-button" type="button">Choose File</button>
              <span id="am-photo-status" class="am-file-status">No file selected</span>
            </div>
            <button id="am-generate-avatar" class="am-button" type="button">Generate Virtual Avatar</button>
            <p class="am-note">Tip: use frontal portrait photos for better silhouette alignment.</p>
          </div>
          <div class="am-preview-box" id="am-avatar-preview-box">
            <span id="am-avatar-placeholder">No avatar generated yet</span>
            <canvas id="am-avatar-canvas" width="520" height="680" hidden></canvas>
          </div>
        </div>
      </div>
    `;
  }

  const featureLabels = [
    "Photo import + avatar creation",
    "Garment selection",
    "AI smart recommendation",
    "Try-On Preview"
  ];

  const featureTags = ["Module 01", "Wardrobe", "Module 03", "Module 04"];

  const awards = $$(".s__award", about);
  awards.forEach((award, index) => {
    if (index > 3) {
      award.remove();
      return;
    }

    if (index === 0 || index === 2) {
      award.remove();
      return;
    }

    const name = $(".s__award__name", award);
    const text = $(".s__award__text", award);

    if (name) {
      name.textContent = featureTags[index];
    }

    if (text) {
      text.innerHTML = featureLabels[index];
    }

    if (!text && name) {
      const counter = award.querySelectorAll(".s__award__counter");
      counter.forEach((node, i) => {
        node.textContent = i === 0 ? featureLabels[index] : "";
      });

      if (index === 1) {
        award.id = "am-styling-trigger";
        award.classList.add("am-module-entry");
        award.setAttribute("role", "button");
        award.setAttribute("tabindex", "0");
        award.setAttribute("aria-expanded", "false");
        award.setAttribute("aria-controls", "am-styling-overlay");
        award.innerHTML = `
          <span class="s__award__inner am-module-entry__inner">
            <span class="am-module-entry__eyebrow">Style Library</span>
            <strong class="am-module-entry__title">
              <span>Ward</span>
              <span>robe</span>
            </strong>
            <p class="am-module-entry__copy">Open clothing library</p>
            <span class="am-module-entry__cta">Choose pieces</span>
            <button id="am-module-entry-ai" class="am-module-entry__quick-ai" type="button">AI Stylist</button>
          </span>
          <span class="s__award__mask"></span>
        `;
      }
    }

    if (text && index === 3) {
      text.innerHTML = "Try-On Preview";
    }
  });

  if (awardsList && !$("#am-preview-stage", awardsList)) {
    const previewStage = document.createElement("li");
    previewStage.id = "am-preview-stage";
    previewStage.className = "s__award am-preview-stage";
    previewStage.innerHTML = `
      <div class="am-preview-stage__frame">
        <div class="am-preview-stage__head">
          <span class="am-preview-stage__label">Try-On Preview</span>
          <span id="am-preview-stage-status" class="am-preview-stage__status">Virtual fitting terminal</span>
        </div>
        <div class="am-preview-stage__screen">
          <div class="am-preview-stage__screenbar">
            <span class="am-preview-stage__screen-id">Fit Mirror Display</span>
            <span class="am-preview-stage__screen-dots"><span></span><span></span><span></span></span>
            <span id="am-preview-stage-screen-state" class="am-preview-stage__screen-state">Awaiting wardrobe selection</span>
          </div>
          <div class="am-preview-box am-preview-box--styling am-preview-stage__viewport">
            <span id="am-tryon-placeholder">Open Wardrobe, choose garments, then apply them to render the try-on preview here.</span>
            <img id="am-tryon-image" alt="Virtual styling preview" hidden />
            <canvas id="am-tryon-canvas" width="520" height="680" hidden></canvas>
          </div>
        </div>
        <div id="am-recommendation-card" class="am-history-item am-preview-stage__summary">
          
        </div>
      </div>
    `;

    awardsList.appendChild(previewStage);
  }

  if (!$("#am-styling-overlay", about)) {
    const overlay = document.createElement("section");
    overlay.id = "am-styling-overlay";
    overlay.className = "am-styling-overlay";
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="am-styling-overlay__backdrop" data-am-close-styling></div>
      <div class="am-styling-overlay__dialog" role="dialog" aria-modal="true" aria-labelledby="am-styling-title">
        <header class="am-styling-overlay__header">
          <div>
            <p class="am-styling-overlay__eyebrow">Module 02</p>
            <h3 id="am-styling-title" class="am-styling-overlay__title">Outfit selection</h3>
          </div>
          <button id="am-styling-close" class="am-styling-close" type="button">Close</button>
        </header>
        <div class="am-styling-overlay__meta">
          <div class="am-styling-stat">
            <span class="am-styling-stat__label">Figure</span>
            <span id="am-figure-status" class="am-styling-stat__value">Waiting for avatar status.</span>
          </div>
          <div class="am-styling-stat">
            <span class="am-styling-stat__label">Wardrobe</span>
            <span id="am-wardrobe-status" class="am-styling-stat__value">Ready to load garments.</span>
          </div>
          <div class="am-styling-stat">
            <span class="am-styling-stat__label">Selected</span>
            <span id="am-selection-status" class="am-styling-stat__value">0 garments selected</span>
          </div>
        </div>
        <div class="am-styling-overlay__body">
          <section class="am-panel am-panel--styling">
            <div class="am-styling-toolbar">
              <div class="am-styling-toolbar__left">
                <button id="am-refresh-wardrobe" class="am-button" type="button">Refresh Wardrobe</button>
                <button id="am-generate-tryon" class="am-button" type="button">Apply To Preview</button>
              </div>
              <button id="am-open-ai-stylist" class="am-button am-button--stylist am-styling-toolbar__right" type="button">AI Stylist</button>
            </div>
            <p class="am-note">Select up to 4 garments. Module 02 now only opens this wardrobe selector, and the page-level striped area will show the try-on result.</p>
            <div id="am-wardrobe-grid" class="am-wardrobe-grid">
              <div class="am-empty-state">Wardrobe garments will load here.</div>
            </div>
          </section>
        </div>
      </div>
    `;

    about.appendChild(overlay);
  }

  if (!$("#am-ai-stylist-overlay", about)) {
    const stylistOverlay = document.createElement("section");
    stylistOverlay.id = "am-ai-stylist-overlay";
    stylistOverlay.className = "am-ai-stylist-overlay";
    stylistOverlay.hidden = true;
    stylistOverlay.setAttribute("aria-hidden", "true");
    stylistOverlay.innerHTML = `
      <div class="am-ai-stylist-overlay__backdrop" data-am-close-stylist></div>
      <div class="am-ai-stylist-overlay__dialog" role="dialog" aria-modal="true" aria-labelledby="am-ai-stylist-title">
        <header class="am-ai-stylist-overlay__header">
          <div>
            <h3 id="am-ai-stylist-title" class="am-ai-stylist-overlay__title">AI Stylist</h3>
          </div>
          <button id="am-ai-stylist-close" class="am-styling-close" type="button">Close</button>
        </header>

        <div class="am-ai-stylist-overlay__controls">
          <label class="am-label">Occasion
            <select id="am-ai-occasion" class="am-select">
              <option value="office">Office</option>
              <option value="weekend">Weekend</option>
              <option value="meeting">Meeting</option>
              <option value="travel">Travel</option>
            </select>
          </label>
          <label class="am-label">Recommendation Mode
            <select id="am-ai-mode" class="am-select">
              <option value="local">Local AI</option>
              <option value="api">API Assisted</option>
            </select>
          </label>
          <div class="am-ai-stylist-overlay__context" aria-live="polite">
            <span id="am-ai-city" class="am-context-pill">City: locating...</span>
            <span id="am-ai-temp" class="am-context-pill">Temp: --</span>
            <span id="am-ai-humidity" class="am-context-pill">Humidity: --</span>
          </div>
          <button id="am-ai-run" class="am-button" type="button">AI Recommend</button>
        </div>

        <div id="am-ai-visual" class="am-ai-visual">
          <canvas id="am-ai-fx-canvas" class="am-ai-fx-canvas"></canvas>
          <div id="am-ai-words" class="am-ai-words">
            <span id="am-ai-word-city">CITY</span>
            <span id="am-ai-word-weather">WEATHER</span>
            <span id="am-ai-word-occasion">OCCASION</span>
          </div>
          <img id="am-ai-look-overlay" class="am-ai-look-overlay" alt="AI recommended look" hidden />
        </div>

        <p id="am-ai-status" class="am-note">Pick an occasion and run AI recommendation.</p>
        <div id="am-ai-results" class="am-ai-results"></div>
      </div>
    `;

    about.appendChild(stylistOverlay);
  }
}

function setupTryOnSection() {
  const work = $("#work");

  if (!work) {
    return;
  }

  const letters = $$(".js-letter", work);
  const word = ["V", "I", "B", "E"];
  letters.forEach((letter, idx) => {
    if (word[idx]) {
      letter.textContent = word[idx];
    }
  });

  const scene = $(".js-scene", work);
  const container = $(".js-container", work);

  // White placeholder SVG used until real database images are wired up.
  const WHITE_PLACEHOLDER =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1082' height='636'%3E%3Crect width='1082' height='636' fill='%23ffffff'/%3E%3C/svg%3E";

  // Replace every floating video card with a white placeholder image.
  const workCards = $$(".js-work", work);

  const applyThreeRowFloat = () => {
    const rowAnchors = [-1.2, 0, 1.2];

    workCards.forEach((card, idx) => {
      const rowBase = rowAnchors[idx % rowAnchors.length];
      const depthOffset = ((Math.floor(idx / rowAnchors.length) % 3) - 1) * 0.08;
      card.style.setProperty("--am-row", String(rowBase + depthOffset));
    });
  };

  workCards.forEach((card, idx) => {
    const link = $("a", card);
    const video = $("video", card);
    const captionText = $(".a__caption__text", card);
    const captionKey = $(".a__caption__key", card);

    // Remove external link — images will link to their own product page later.
    if (link) {
      link.removeAttribute("href");
      link.removeAttribute("target");
      link.style.cursor = "default";
    }

    // Swap video → img placeholder.
    if (video) {
      const img = document.createElement("img");
      img.src = WHITE_PLACEHOLDER;
      img.width = 1082;
      img.height = 636;
      img.alt = `Wardrobe item ${idx + 1}`;
      img.className = video.className.replace("js-video", "").trim();
      img.style.width = "100%";
      img.style.height = "auto";
      img.style.display = "block";
      video.replaceWith(img);
    }

    // Update caption to generic wardrobe slot text.
    if (captionText) {
      captionText.textContent = `Wardrobe Item ${idx + 1}`;
    }
    if (captionKey) {
      captionKey.textContent = `#wrd-${String(idx + 1).padStart(4, "0")}`;
    }
  });

  applyThreeRowFloat();
}

function setupHistorySection() {
  const contact = $("#contact");

  if (!contact || $("#am-history-panel", contact)) {
    return;
  }

  const panel = document.createElement("section");
  panel.id = "am-history-panel";
  panel.className = "am-panel";
  panel.innerHTML = `
    <h3>Recommendation History</h3>
    <p class="am-note">Every AI recommendation is automatically stored for quick recall and comparison.</p>
    <div id="am-history-gallery" class="am-history am-history-gallery">
      <div id="am-history-list" class="am-history-track"></div>
    </div>
    <div id="am-history-focus" class="am-history-focus">
      <p class="am-history-focus__reason">Hover a look card to inspect its outfit breakdown.</p>
    </div>
    <button id="am-clear-history" class="am-button" type="button">Clear History</button>
  `;

  contact.appendChild(panel);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawCoverImage(ctx, image, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (sourceRatio > targetRatio) {
    drawWidth = height * sourceRatio;
    offsetX = (width - drawWidth) / 2;
  } else {
    drawHeight = width / sourceRatio;
    offsetY = (height - drawHeight) / 2;
  }

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

async function renderAvatar() {
  if (!state.uploadedPhoto) {
    window.alert("Upload a portrait photo first.");
    return;
  }

  const canvas = $("#am-avatar-canvas");

  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const image = await loadImage(state.uploadedPhoto);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCoverImage(ctx, image, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(22, 0, 0, 0.18)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = "700 22px PPFraktionMono-Regular, monospace";
  ctx.fillText("AURAMIRROR AVATAR", 26, canvas.height - 32);

  state.avatarDataUrl = canvas.toDataURL("image/png");

  const placeholder = $("#am-avatar-placeholder");
  if (placeholder) {
    placeholder.hidden = true;
  }

  canvas.hidden = false;
}

function getColorMap() {
  return {
    graphite: "#38393b",
    berry: "#7f244f",
    ivory: "#e9e5d8",
    stone: "#8b8f94",
    charcoal: "#36383b",
    sand: "#b9a888",
    onyx: "#17181b",
    cream: "#efe8d6",
    plum: "#4a2346"
  };
}

async function renderTryOn() {
  const canvas = $("#am-tryon-canvas");
  const image = $("#am-tryon-image");
  const placeholder = $("#am-tryon-placeholder");

  if (!canvas) {
    return;
  }

  if (image) {
    image.hidden = true;
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.hidden = false;

  if (placeholder) {
    placeholder.hidden = true;
  }

  if (!state.avatarDataUrl) {
    canvas.hidden = true;
    if (placeholder) {
      placeholder.textContent = "Generate the avatar first, then preview the styling.";
      placeholder.hidden = false;
    }
    updatePreviewStageStatus("Avatar required", "Generate avatar before rendering");
    return;
  }

  const avatar = await loadImage(state.avatarDataUrl);
  drawCoverImage(ctx, avatar, canvas.width, canvas.height);

  const colors = getColorMap();
  const top = state.selections.top;
  const bottom = state.selections.bottom;
  const shoes = state.selections.shoes;

  ctx.fillStyle = `${colors[top]}cc`;
  ctx.fillRect(120, 180, 280, 175);

  ctx.fillStyle = `${colors[bottom]}cc`;
  ctx.fillRect(145, 350, 230, 180);

  ctx.fillStyle = `${colors[shoes]}dd`;
  ctx.fillRect(130, 545, 100, 56);
  ctx.fillRect(290, 545, 100, 56);

  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.font = "700 16px PPFraktionMono-Regular, monospace";
  ctx.fillText(`TOP: ${top.toUpperCase()}`, 30, 36);
  ctx.fillText(`BOTTOM: ${bottom.toUpperCase()}`, 30, 60);
  ctx.fillText(`SHOES: ${shoes.toUpperCase()}`, 30, 84);

  updatePreviewStageStatus("Preview ready", "Virtual fitting screen updated");
}

function buildRecommendationText() {
  const { weather, occasion, top, bottom, shoes } = state.selections;

  const weatherHint = {
    cold: "Layering focused",
    hot: "Breathability focused",
    rain: "Water-safe palette",
    mild: "Balanced comfort"
  }[weather];

  const occasionHint = {
    office: "professional silhouette",
    weekend: "relaxed silhouette",
    meeting: "high-trust visual tone",
    travel: "mobility first"
  }[occasion];

  const title = `${occasion.toUpperCase()} / ${weather.toUpperCase()}`;
  const reason = `AI suggests this outfit for a ${occasionHint} with ${weatherHint}.`;
  const items = [`Top: ${top}`, `Bottom: ${bottom}`, `Shoes: ${shoes}`];

  return { title, reason, items };
}

function getCurrentPreviewImage() {
  const tryOnImage = $("#am-tryon-image");

  if (tryOnImage && tryOnImage.getAttribute("src")) {
    return tryOnImage.getAttribute("src");
  }

  const tryOnCanvas = $("#am-tryon-canvas");

  if (tryOnCanvas && !tryOnCanvas.hidden) {
    try {
      return tryOnCanvas.toDataURL("image/png");
    } catch {
      return state.avatarDataUrl || "";
    }
  }

  return state.avatarDataUrl || "";
}

function normalizeHistoryEntry(entry, index) {
  const fallbackTitle = `LOOK ${String(index + 1).padStart(2, "0")}`;
  const items = Array.isArray(entry?.items) ? entry.items.filter(Boolean) : [];

  return {
    title: String(entry?.title || fallbackTitle),
    reason: String(entry?.reason || "Recommendation details unavailable."),
    time: String(entry?.time || "Unknown time"),
    items,
    image: String(entry?.image || "")
  };
}

function destroyHistoryEffects() {
  if (state.historyScrollTween) {
    state.historyScrollTween.kill();
    state.historyScrollTween = null;
  }

  if (state.historyScrollTrigger) {
    state.historyScrollTrigger.kill();
    state.historyScrollTrigger = null;
  }

  state.historyDistortions.forEach((instance) => {
    if (instance && typeof instance.destroy === "function") {
      instance.destroy();
    }
  });

  state.historyDistortions = [];
}

function createDisplacementCanvas(size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return canvas;
  }

  const gradient = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.1, size * 0.5, size * 0.5, size * 0.6);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.45, "rgba(180, 180, 255, 0.85)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 24; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 8 + Math.random() * 20;
    const ripple = ctx.createRadialGradient(x, y, 0, x, y, radius);
    ripple.addColorStop(0, "rgba(255, 255, 255, 0.42)");
    ripple.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = ripple;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  return canvas;
}

function createHistoryDistortion(card, onWavePeak) {
  const canvas = $(".am-history-thumb__fx", card);
  const image = $(".am-history-thumb__img", card);

  if (!canvas || !image) {
    return null;
  }

  const gl = canvas.getContext("webgl", { alpha: true, antialias: true });

  if (!gl) {
    return {
      play: () => {
        if (typeof onWavePeak === "function") {
          onWavePeak();
        }
      },
      reset: () => { },
      destroy: () => { }
    };
  }

  const vertexShaderSource = `
    attribute vec2 aPosition;
    attribute vec2 aUv;
    varying vec2 vUv;

    void main() {
      vUv = aUv;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uImage;
    uniform sampler2D uDisplacement;
    uniform float uIntensity;

    void main() {
      vec2 disp = texture2D(uDisplacement, vUv).rg;
      vec2 offset = (disp * 2.0 - 1.0) * 0.08 * uIntensity;
      vec2 uv = clamp(vUv + offset, 0.0, 1.0);
      vec4 color = texture2D(uImage, uv);
      gl_FragColor = color;
    }
  `;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(info || "Shader compile failed");
    }
    return shader;
  };

  const createTexture = (source) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return texture;
  };

  let program;
  let imageTexture;
  let displacementTexture;
  let intensityLocation;
  let intensity = 0;
  let pulseTween = null;
  let didCallPeak = false;

  try {
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
    }

    gl.useProgram(program);

    const vertices = new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      1, 1, 1, 1
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, "aPosition");
    const aUv = gl.getAttribLocation(program, "aUv");
    gl.enableVertexAttribArray(aPosition);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

    imageTexture = createTexture(image);
    displacementTexture = createTexture(createDisplacementCanvas(192));

    const imageLocation = gl.getUniformLocation(program, "uImage");
    const displacementLocation = gl.getUniformLocation(program, "uDisplacement");
    intensityLocation = gl.getUniformLocation(program, "uIntensity");

    gl.uniform1i(imageLocation, 0);
    gl.uniform1i(displacementLocation, 1);
  } catch {
    return {
      play: () => {
        if (typeof onWavePeak === "function") {
          onWavePeak();
        }
      },
      reset: () => { },
      destroy: () => { }
    };
  }

  const setSize = () => {
    const rect = card.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(rect.width * dpr));
    canvas.height = Math.max(2, Math.round(rect.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const render = () => {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, displacementTexture);

    gl.uniform1f(intensityLocation, intensity);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  setSize();
  render();

  const play = () => {
    if (!window.gsap) {
      if (typeof onWavePeak === "function") {
        onWavePeak();
      }
      return;
    }

    if (pulseTween) {
      pulseTween.kill();
      pulseTween = null;
    }

    didCallPeak = false;
    canvas.hidden = false;
    image.style.opacity = "0";

    const proxy = { value: 0 };
    pulseTween = window.gsap.to(proxy, {
      value: 1,
      duration: 0.24,
      ease: "power2.out",
      onUpdate: () => {
        intensity = proxy.value;
        render();
      },
      onComplete: () => {
        if (!didCallPeak && typeof onWavePeak === "function") {
          didCallPeak = true;
          onWavePeak();
        }

        pulseTween = window.gsap.to(proxy, {
          value: 0,
          duration: 0.35,
          ease: "power3.out",
          onUpdate: () => {
            intensity = proxy.value;
            render();
          },
          onComplete: () => {
            image.style.opacity = "1";
            canvas.hidden = true;
          }
        });
      }
    });
  };

  const reset = () => {
    if (pulseTween) {
      pulseTween.kill();
      pulseTween = null;
    }

    intensity = 0;
    render();
    image.style.opacity = "1";
    canvas.hidden = true;
  };

  const onResize = () => {
    setSize();
    render();
  };

  window.addEventListener("resize", onResize);

  return {
    play,
    reset,
    destroy: () => {
      window.removeEventListener("resize", onResize);
      if (pulseTween) {
        pulseTween.kill();
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}

function renderHistoryFocus(entry) {
  const focus = $("#am-history-focus");

  if (!focus) {
    return;
  }

  const normalized = normalizeHistoryEntry(entry, 0);
  const tags = normalized.items.map((item) => `<span class="am-tag">${escapeHtml(item)}</span>`).join("");

  focus.innerHTML = `
    <h4 class="am-history-focus__title">${escapeHtml(normalized.title)}</h4>
    <span class="am-history-focus__time">${escapeHtml(normalized.time)}</span>
    <p class="am-history-focus__reason">${escapeHtml(normalized.reason)}</p>
    <div>${tags}</div>
  `;
}

function setupHistoryGalleryEffects() {
  destroyHistoryEffects();

  const panel = $("#am-history-panel");
  const viewport = $("#am-history-gallery", panel);
  const track = $("#am-history-list", panel);

  if (!panel || !viewport || !track) {
    return;
  }

  const cards = $$(".am-history-card", track);
  const entries = getHistory().map((entry, idx) => normalizeHistoryEntry(entry, idx)).reverse();

  cards.forEach((card, index) => {
    const entry = entries[index];

    if (!entry) {
      return;
    }

    const setActive = () => {
      cards.forEach((node) => node.classList.remove("is-active"));
      card.classList.add("is-active");
      renderHistoryFocus(entry);
    };

    const distortion = createHistoryDistortion(card, setActive);
    if (distortion) {
      state.historyDistortions.push(distortion);
    }

    card.addEventListener("pointerenter", () => {
      distortion?.play();
    });

    card.addEventListener("focus", () => {
      distortion?.play();
    });

    card.addEventListener("pointerleave", () => {
      distortion?.reset();
    });

    card.addEventListener("blur", () => {
      distortion?.reset();
    });
  });

  if (entries[0]) {
    renderHistoryFocus(entries[0]);
  }

  if (!window.gsap || !window.ScrollTrigger || track.scrollWidth <= viewport.clientWidth + 2) {
    return;
  }

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);

  state.historyScrollTween = gsap.to(track, {
    x: () => -(track.scrollWidth - viewport.clientWidth),
    ease: "none",
    overwrite: true,
    scrollTrigger: {
      trigger: panel,
      start: "center center",
      end: () => `+=${Math.max(track.scrollWidth - viewport.clientWidth, 600)}`,
      scrub: 1,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true
    }
  });

  state.historyScrollTrigger = state.historyScrollTween.scrollTrigger || null;
}

function getHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function renderHistory() {
  const list = $("#am-history-list");

  if (!list) {
    return;
  }

  const history = getHistory();

  if (!history.length) {
    list.innerHTML = '<div class="am-history-item am-history-empty">No recommendation history yet.</div>';
    const focus = $("#am-history-focus");
    if (focus) {
      focus.innerHTML = '<p class="am-history-focus__reason">Hover a look card to inspect its outfit breakdown.</p>';
    }
    destroyHistoryEffects();
    return;
  }

  list.innerHTML = history
    .slice()
    .reverse()
    .map((entry, index) => {
      const normalized = normalizeHistoryEntry(entry, index);
      const previewImage = normalized.image || state.avatarDataUrl;
      return `
        <article class="am-history-card" tabindex="0" data-history-index="${index}">
          <figure class="am-history-thumb">
            ${previewImage ? `<img class="am-history-thumb__img" src="${escapeHtml(previewImage)}" alt="${escapeHtml(normalized.title)}" loading="lazy" decoding="async" />` : '<span class="am-history-thumb__img"></span>'}
            <canvas class="am-history-thumb__fx" hidden></canvas>
          </figure>
          <div class="am-history-meta">
            <strong>${escapeHtml(normalized.title)}</strong>
            <small>${escapeHtml(normalized.time)}</small>
          </div>
        </article>
      `;
    })
    .join("");

  setupHistoryGalleryEffects();
}

function renderRecommendationCard(reco) {
  const card = $("#am-recommendation-card");

  if (!card) {
    return;
  }

  const tags = reco.items.map((item) => `<span class="am-tag">${item}</span>`).join("");
  card.innerHTML = `<strong>${reco.title}</strong><p>${reco.reason}</p><div>${tags}</div>`;
}

function bindEvents() {
  const photoInput = $("#am-photo-input");
  const photoTrigger = $("#am-photo-trigger");
  const photoStatus = $("#am-photo-status");
  const avatarButton = $("#am-generate-avatar");
  const stylingTrigger = $("#am-styling-trigger");
  const moduleEntryAiQuickButton = $("#am-module-entry-ai");
  const stylingOverlay = $("#am-styling-overlay");
  const stylingClose = $("#am-styling-close");
  const openAiStylistButton = $("#am-open-ai-stylist");
  const aiStylistOverlay = $("#am-ai-stylist-overlay");
  const aiStylistClose = $("#am-ai-stylist-close");
  const aiStylistRun = $("#am-ai-run");
  const aiOccasion = $("#am-ai-occasion");
  const refreshWardrobe = $("#am-refresh-wardrobe");
  const wardrobeGrid = $("#am-wardrobe-grid");
  const tryOnButton = $("#am-generate-tryon");
  const recoButton = $("#am-generate-reco");
  const clearButton = $("#am-clear-history");

  if (photoTrigger && photoInput) {
    photoTrigger.addEventListener("click", () => {
      photoInput.click();
    });
  }

  if (photoInput) {
    photoInput.addEventListener("change", (event) => {
      const [file] = event.target.files || [];

      if (!file) {
        state.uploadedPhoto = "";
        state.uploadedPhotoFile = null;
        state.uploadedPhotoFingerprint = "";
        state.syncedPhotoFingerprint = "";
        state.figureId = "";
        if (photoStatus) {
          photoStatus.textContent = "No file selected";
        }
        updateFigureStatus(`Generate the avatar first, then add localStorage["${API_TOKEN_STORAGE_KEY}"] for backend try-on.`);
        return;
      }

      state.uploadedPhotoFile = file;
      state.uploadedPhotoFingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      state.syncedPhotoFingerprint = "";
      state.figureId = "";

      if (photoStatus) {
        photoStatus.textContent = file.name;
      }

      const reader = new FileReader();
      reader.onload = () => {
        state.uploadedPhoto = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  if (avatarButton) {
    avatarButton.addEventListener("click", async () => {
      try {
        await renderAvatar();
        await renderTryOn();
        await syncAvatarToBackend();
      } catch {
        window.alert("Avatar generation failed. Try another photo.");
      }
    });
  }

  if (stylingTrigger) {
    const openHandler = () => {
      openStylingOverlay();
    };

    stylingTrigger.addEventListener("click", openHandler);
    stylingTrigger.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openHandler();
      }
    });
  }

  if (moduleEntryAiQuickButton) {
    const openAiQuick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openAiStylistOverlay();
    };

    moduleEntryAiQuickButton.addEventListener("click", openAiQuick);
    moduleEntryAiQuickButton.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        openAiQuick(event);
      }
    });
  }

  if (stylingClose) {
    stylingClose.addEventListener("click", () => {
      closeStylingOverlay();
    });
  }

  if (stylingOverlay) {
    stylingOverlay.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.hasAttribute("data-am-close-styling")) {
        closeStylingOverlay();
      }
    });
  }

  if (openAiStylistButton) {
    openAiStylistButton.addEventListener("click", () => {
      openAiStylistOverlay();
    });
  }

  if (aiStylistClose) {
    aiStylistClose.addEventListener("click", () => {
      closeAiStylistOverlay();
    });
  }

  if (aiStylistOverlay) {
    aiStylistOverlay.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.hasAttribute("data-am-close-stylist")) {
        closeAiStylistOverlay();
      }
    });
  }

  if (aiOccasion) {
    aiOccasion.addEventListener("change", () => {
      state.selections.occasion = aiOccasion.value;
      updateWeatherContextUi();
    });
  }

  if (aiStylistRun) {
    aiStylistRun.addEventListener("click", async () => {
      await applyAiStylistRecommendation();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (aiStylistOverlay && !aiStylistOverlay.hidden) {
      closeAiStylistOverlay();
      return;
    }

    if (stylingOverlay && !stylingOverlay.hidden) {
      closeStylingOverlay();
    }
  });

  if (refreshWardrobe) {
    refreshWardrobe.addEventListener("click", async () => {
      await loadWardrobeCatalog({ force: true });
    });
  }

  if (wardrobeGrid) {
    wardrobeGrid.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const button = event.target.closest("[data-cloth-id]");

      if (!button) {
        return;
      }

      toggleClothSelection(button.getAttribute("data-cloth-id"));
    });
  }

  const fields = ["top", "bottom", "shoes", "weather", "occasion"];
  fields.forEach((field) => {
    const select = document.getElementById(`am-${field}`);

    if (!select) {
      return;
    }

    select.value = state.selections[field];
    select.addEventListener("change", () => {
      state.selections[field] = select.value;
    });
  });

  if (tryOnButton) {
    tryOnButton.addEventListener("click", async () => {
      await handleTryOnRequest();
      if (state.selectedClothIds.length) {
        closeStylingOverlay();
      }
    });
  }

  if (recoButton) {
    recoButton.addEventListener("click", async () => {
      if (!state.avatarDataUrl) {
        window.alert("Generate an avatar before asking AI for recommendation.");
        return;
      }

      await renderTryOn();
      const baseReco = buildRecommendationText();
      const entry = {
        ...baseReco,
        image: getCurrentPreviewImage(),
        time: new Date().toLocaleString()
      };

      state.lastRecommendation = entry;
      renderRecommendationCard(entry);

      const history = getHistory();
      history.push(entry);
      saveHistory(history.slice(-30));
      renderHistory();
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      renderHistory();
    });
  }
}

function initAuraMirror() {
  injectStyles();
  setupHeaderNavigation();
  watchContrastThemeForQr();
  updateBranding();
  stripLegacyHeroSections();
  setupAboutSection();
  setupTryOnSection();
  setupHistorySection();
  bindEvents();
  renderHistory();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuraMirror, { once: true });
} else {
  initAuraMirror();
}
