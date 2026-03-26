import { state } from "../state.mjs";
import { API_BASE_URL, FALLBACK_CLOTHS, MAX_STYLING_SELECTIONS, API_TOKEN_STORAGE_KEY } from "../config.mjs";
import { $ } from "../utils/dom.mjs";
import { apiRequest, getApiToken, pollTask, resolveApiAssetUrl } from "../api/client.mjs";
import { normalizeCloth, syncFallbackSelectionsFromCatalog, updateWardrobeStatus, updatePreviewStageStatus } from "./cloth-utils.mjs";
import { loadImage, drawCoverImage, getColorMap } from "./canvas-utils.mjs";
import { refreshFigureState } from "./avatar.mjs";
import { renderWardrobeGrid, renderStylingSummary } from "./wardrobe.mjs";

function setWardrobeCatalog(items, mode, statusText) {
  state.clothCatalog = items.map(normalizeCloth).filter((cloth) => cloth.id);
  state.clothLookup = Object.fromEntries(state.clothCatalog.map((cloth) => [cloth.id, cloth]));
  state.selectedClothIds = state.selectedClothIds.filter((id) => state.clothLookup[id]);
  state.wardrobeMode = mode;
  syncFallbackSelectionsFromCatalog();
  updateWardrobeStatus(statusText);
  renderWardrobeGrid();
}

export async function loadWardrobeCatalog({ force = false } = {}) {
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

export function toggleClothSelection(clothId) {
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

export async function fetchTryOnImageUrl(tryOnId) {
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

export function showRemoteTryOnImage(imageUrl) {
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

export async function handleTryOnRequest() {
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

export async function renderTryOn() {
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
