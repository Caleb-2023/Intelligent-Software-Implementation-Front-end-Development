const STORAGE_KEY = "auramirror.recommendation.history.v1";
const GITHUB_PROJECT_URL = "https://github.com/Felixzijunliang/wardrobe";
const QR_ASSET_VERSION = "v4";
const QR_DEFAULT_SRC = `/images/qr-wardrobe-github-default.png?${QR_ASSET_VERSION}`;
const QR_LIGHT_SRC = `/images/qr-wardrobe-github-light.png?${QR_ASSET_VERSION}`;

const state = {
  uploadedPhoto: "",
  avatarDataUrl: "",
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

function ensureMeta(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }

  meta.setAttribute("content", content);
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
    "Virtual styling and preview",
    "AI smart recommendation",
    "Demo showcase"
  ];

  const featureTags = ["Module 01", "Module 02", "Module 03", "Module 04"];

  const awards = $$(".s__award", about);
  awards.forEach((award, index) => {
    if (index > 3) {
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
    }
  });
}

function setupTryOnSection() {
  const work = $("#work");

  if (!work) {
    return;
  }

  const letters = $$(".js-letter", work);
  const word = ["S", "T", "Y", "L"];
  letters.forEach((letter, idx) => {
    if (word[idx]) {
      letter.textContent = word[idx];
    }
  });

  const scene = $(".js-scene", work);
  const container = $(".js-container", work);

  if (container && !$("#am-tryon-panel", container)) {
    const panel = document.createElement("section");
    panel.id = "am-tryon-panel";
    panel.className = "am-panel";
    panel.innerHTML = `
      <div class="am-grid">
        <div class="am-fields">
          <label class="am-label">Top
            <select id="am-top" class="am-select">
              <option value="graphite">Graphite Jacket</option>
              <option value="berry">Berry Hoodie</option>
              <option value="ivory">Ivory Shirt</option>
            </select>
          </label>
          <label class="am-label">Bottom
            <select id="am-bottom" class="am-select">
              <option value="stone">Stone Pants</option>
              <option value="charcoal">Charcoal Trousers</option>
              <option value="sand">Sand Chinos</option>
            </select>
          </label>
          <label class="am-label">Shoes
            <select id="am-shoes" class="am-select">
              <option value="onyx">Onyx Sneakers</option>
              <option value="cream">Cream Trainers</option>
              <option value="plum">Plum Runners</option>
            </select>
          </label>
          <label class="am-label">Weather
            <select id="am-weather" class="am-select">
              <option value="mild">Mild</option>
              <option value="cold">Cold</option>
              <option value="hot">Hot</option>
              <option value="rain">Rainy</option>
            </select>
          </label>
          <label class="am-label">Occasion
            <select id="am-occasion" class="am-select">
              <option value="office">Office</option>
              <option value="weekend">Weekend</option>
              <option value="meeting">Client Meeting</option>
              <option value="travel">Travel</option>
            </select>
          </label>
          <button id="am-generate-tryon" class="am-button" type="button">Generate Try-On Preview</button>
          <button id="am-generate-reco" class="am-button" type="button">Get AI Recommendation</button>
        </div>
        <div class="am-fields">
          <div class="am-preview-box">
            <canvas id="am-tryon-canvas" width="520" height="680"></canvas>
          </div>
          <div id="am-recommendation-card" class="am-history-item">No recommendation generated yet.</div>
        </div>
      </div>
    `;

    container.insertBefore(panel, scene || container.firstChild);
  }

  const captions = $$(".a__caption__text", work);
  const keys = $$(".a__caption__key", work);
  const labels = [
    "Avatar Capture",
    "Garment Selector",
    "Color Harmonizer",
    "Context Engine",
    "Recommendation Layer",
    "History Timeline"
  ];

  captions.forEach((caption, idx) => {
    if (labels[idx]) {
      caption.textContent = labels[idx];
    }
  });

  keys.forEach((key, idx) => {
    key.textContent = `#am-${String(idx + 1).padStart(4, "0")}`;
  });
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

  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!state.avatarDataUrl) {
    ctx.fillStyle = "rgba(22, 0, 0, 0.88)";
    ctx.font = "600 20px PPFraktionMono-Regular, monospace";
    ctx.fillText("Generate avatar first", 120, canvas.height / 2);
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
        if (photoStatus) {
          photoStatus.textContent = "No file selected";
        }
        return;
      }

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
      } catch {
        window.alert("Avatar generation failed. Try another photo.");
      }
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
      await renderTryOn();
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
