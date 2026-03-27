import { MAX_STYLING_SELECTIONS } from "../config.mjs";
import { state } from "../state.mjs";
import { $, $$, escapeHtml } from "../utils/dom.mjs";
import { apiRequest, getApiToken, pollTask } from "../api/client.mjs";
import { getClothId, getSelectedCloths, formatCategoryLabel, formatClothMeta, syncFallbackSelectionsFromCatalog } from "./cloth-utils.mjs";
import { mapWeatherForStyling, fetchWeatherContext, updateWeatherContextUi } from "./weather.mjs";
import { mapWeatherToAtmosphereMode, createAiAtmosphereRenderer } from "./ai-atmosphere.mjs";
import { renderWardrobeGrid, renderStylingSummary } from "./wardrobe.mjs";
import { getCurrentPreviewImage, getHistory, saveHistory, renderHistory } from "./history.mjs";

export function pickBestCloth(candidates, { weather, occasion, category }) {
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

export function getStylistCategoryPool() {
  return {
    top: state.clothCatalog.filter((cloth) => ["top", "outerwear", "dress"].includes(cloth.category)),
    bottom: state.clothCatalog.filter((cloth) => ["bottom", "dress"].includes(cloth.category)),
    shoes: state.clothCatalog.filter((cloth) => cloth.category === "shoes")
  };
}

export function computeLocalStylistSelection({ weather, occasion }) {
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

function buildWeatherDescription() {
  const { temperatureC, humidity } = state.weatherContext;
  const bucket = state.selections.weather || "cloudy";
  const parts = [];

  if (typeof temperatureC === "number") {
    parts.push(`${Math.round(temperatureC)}度`);
  }

  const bucketLabel = { sunny: "晴天", rainy: "雨天", cloudy: "多云", snowy: "雪天" }[bucket] || bucket;
  parts.push(bucketLabel);

  if (typeof humidity === "number") {
    parts.push(`湿度${Math.round(humidity)}%`);
  }

  return parts.join(" ") || bucket;
}

function extractClothIdsFromOutfits(outfits) {
  const rawIds = [];

  if (!Array.isArray(outfits)) {
    return rawIds;
  }

  outfits.forEach((outfit) => {
    if (!Array.isArray(outfit?.items)) {
      return;
    }

    outfit.items.forEach((item) => {
      const id = String(item?.item_id || "");
      if (id && state.clothLookup[id]) {
        rawIds.push(id);
      }
    });
  });

  return rawIds
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .slice(0, MAX_STYLING_SELECTIONS);
}

export async function requestApiStylistSelection({ weather, occasion }) {
  const body = {
    occasion,
    weather: buildWeatherDescription(),
    season: mapWeatherForStyling(weather)
  };

  if (state.figureId) {
    body.figure_id = state.figureId;
  }

  const payload = await apiRequest("/styles/ai-recommend", {
    method: "POST",
    body: JSON.stringify(body)
  });

  const data = payload?.data || {};

  if (Array.isArray(data.outfits) && data.outfits.length) {
    return extractClothIdsFromOutfits(data.outfits);
  }

  if (data.task_id) {
    const result = await pollTask(data.task_id);
    if (Array.isArray(result?.outfits)) {
      return extractClothIdsFromOutfits(result.outfits);
    }
  }

  return [];
}

export function updateAiStylistStatus(message) {
  const status = $("#am-ai-status");
  if (status) {
    status.textContent = message;
  }
}

export function updateAiVisualLookOverlay(imageSrc) {
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

export function stopAiStylistEnvironmentFx() {
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

export function startAiStylistEnvironmentFx() {
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

export function renderAiStylistResults(items, { mode, source }) {
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

export function openAiStylistOverlay() {
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

export function closeAiStylistOverlay() {
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

export async function applyAiStylistRecommendation() {
  if (!state.clothCatalog.length) {
    const { loadWardrobeCatalog } = await import("./tryon.mjs");
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

  const { handleTryOnRequest } = await import("./tryon.mjs");
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
