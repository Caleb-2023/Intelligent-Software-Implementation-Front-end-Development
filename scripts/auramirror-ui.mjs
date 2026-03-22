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
  selections: {
    top: "graphite",
    bottom: "stone",
    shoes: "onyx",
    weather: "mild",
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

function renderStylingSummary(message = "") {
  const card = $("#am-recommendation-card");

  if (!card) {
    return;
  }

  const selected = getSelectedCloths();

  if (!selected.length) {
    updatePreviewStageStatus("Virtual fitting terminal", "Awaiting wardrobe selection");
    card.innerHTML = "Wardrobe is centered above. Choose garments there, then apply them to render the try-on preview on this fitting screen.";
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
  document.documentElement.classList.remove("am-styling-lock");

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
      display: grid;
      gap: 0.55rem;
      margin-top: 1rem;
      max-height: 260px;
      overflow: auto;
      padding-right: 0.35rem;
    }

    .am-history-item {
      border: 1px solid currentColor;
      padding: 0.65rem;
      background: rgba(255, 255, 255, 0.65);
      line-height: 1.45;
      font-size: 0.85rem;
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
      width: min(54rem, calc(100vw - 2rem));
      max-height: calc(100vh - 2rem);
      overflow: auto;
      border: 1px solid currentColor;
      background: var(--color-primary);
      color: var(--color-secondary);
      box-shadow: 0 1.2rem 0 rgba(84, 0, 0, 0.45);
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
      gap: 0.65rem;
      margin-bottom: 0.85rem;
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

  const nextSrc = contrasted ? QR_LIGHT_SRC : QR_DEFAULT_SRC;
  const nextBg = contrasted ? "#fff" : "#f40c3f";

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
          Wardrobe is centered above, and this framed screen is now the dedicated try-on display.
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
            <h3 id="am-styling-title" class="am-styling-overlay__title">Wardrobe selection</h3>
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
              <button id="am-refresh-wardrobe" class="am-button" type="button">Refresh Wardrobe</button>
              <button id="am-generate-tryon" class="am-button" type="button">Apply To Preview</button>
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
    <div id="am-history-list" class="am-history"></div>
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
    list.innerHTML = '<div class="am-history-item">No recommendation history yet.</div>';
    return;
  }

  list.innerHTML = history
    .slice()
    .reverse()
    .map((entry) => {
      const tags = entry.items.map((item) => `<span class="am-tag">${item}</span>`).join("");
      return `
        <article class="am-history-item">
          <strong>${entry.title}</strong><br />
          <small>${entry.time}</small>
          <p>${entry.reason}</p>
          <div>${tags}</div>
        </article>
      `;
    })
    .join("");
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
  const stylingOverlay = $("#am-styling-overlay");
  const stylingClose = $("#am-styling-close");
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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && stylingOverlay && !stylingOverlay.hidden) {
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
