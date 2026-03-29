import { GITHUB_PROJECT_URL, QR_DEFAULT_SRC, QR_LIGHT_SRC } from "../config.mjs";
import { $, $$, ensureMeta } from "../utils/dom.mjs";

export function stripLegacyHeroSections() {
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

export function syncQrWithTheme() {
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

export function watchContrastThemeForQr() {
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

export function scrollToTryOnPreview() {
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

export function setupHeaderNavigation() {
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

export function updateBranding() {
  document.title = "AuraMirror | AI Smart Wardrobe";
  ensureMeta(
    "description",
    "AuraMirror is an AI wardrobe mirror for avatar generation, virtual try-on, smart styling recommendations, and recommendation history."
  );

  const menuTexts = ["Avatar", "Try-On", "History"];
  $$(".js-menu-link .sb__text").forEach((el, idx) => {
    // skip injected auth nav items (they manage their own text)
    if (el.closest(".am-nav-auth-item")) return;
    if (menuTexts[idx] !== undefined) {
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

export function setupAboutSection() {
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

export function setupTryOnSection() {
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
      video.pause();
      video.removeAttribute("src");
      video.removeAttribute("data-src");
      video.load();

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

export function setupHistorySection() {
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
