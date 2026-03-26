import { state } from "../state.mjs";
import { $, escapeHtml } from "../utils/dom.mjs";
import { getSelectedCloths, formatCategoryLabel, formatClothMeta, updateSelectionStatus, updatePreviewStageStatus } from "./cloth-utils.mjs";
import { refreshFigureState } from "./avatar.mjs";
import { fetchWeatherContext } from "./weather.mjs";

export function renderStylingSummary(message = "") {
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

export function renderWardrobeGrid() {
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

export async function openStylingOverlay() {
  const { loadWardrobeCatalog } = await import("./tryon.mjs");

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

export function closeStylingOverlay() {
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
