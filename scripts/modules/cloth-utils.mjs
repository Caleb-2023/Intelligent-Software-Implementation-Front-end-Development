import { state } from "../state.mjs";
import { $ } from "../utils/dom.mjs";

export function getClothId(cloth) {
  return String(cloth?._id || cloth?.id || "");
}

export function normalizeCloth(cloth) {
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

export function getSelectedCloths() {
  return state.selectedClothIds
    .map((id) => state.clothLookup[id])
    .filter(Boolean);
}

export function formatCategoryLabel(category) {
  return String(category || "other")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatClothMeta(cloth) {
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

export function mapColorToPalette(color) {
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

export function syncFallbackSelectionsFromCatalog() {
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

export function updateFigureStatus(text) {
  state.figureStatus = text;

  const target = $("#am-figure-status");
  if (target) {
    target.textContent = text;
  }
}

export function updateWardrobeStatus(text) {
  state.wardrobeStatus = text;

  const target = $("#am-wardrobe-status");
  if (target) {
    target.textContent = text;
  }
}

export function updateSelectionStatus() {
  const count = state.selectedClothIds.length;
  const target = $("#am-selection-status");

  if (target) {
    target.textContent = `${count} garment${count === 1 ? "" : "s"} selected`;
  }
}

export function updatePreviewStageStatus(headline, detail) {
  const headlineTarget = $("#am-preview-stage-status");
  const detailTarget = $("#am-preview-stage-screen-state");

  if (headlineTarget && headline) {
    headlineTarget.textContent = headline;
  }

  if (detailTarget && detail) {
    detailTarget.textContent = detail;
  }
}
