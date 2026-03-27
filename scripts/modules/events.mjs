import { STORAGE_KEY, API_TOKEN_STORAGE_KEY } from "../config.mjs";
import { state } from "../state.mjs";
import { $ } from "../utils/dom.mjs";
import { updateFigureStatus } from "./cloth-utils.mjs";
import { renderAvatar, syncAvatarToBackend } from "./avatar.mjs";
import { renderTryOn, handleTryOnRequest, loadWardrobeCatalog, toggleClothSelection } from "./tryon.mjs";
import { openStylingOverlay, closeStylingOverlay } from "./wardrobe.mjs";
import { openAiStylistOverlay, closeAiStylistOverlay, applyAiStylistRecommendation } from "./ai-stylist.mjs";
import { updateWeatherContextUi } from "./weather.mjs";
import { buildRecommendationText, getCurrentPreviewImage, getHistory, saveHistory, renderHistory, renderRecommendationCard } from "./history.mjs";
import { bindAuthEvents, closeAuthOverlay } from "./auth.mjs";

export function bindEvents() {
  const photoInput = $("#am-photo-input");
  const photoTrigger = $("#am-photo-trigger");
  const photoStatus = $("#am-photo-status");
  const avatarButton = $("#am-generate-avatar");
  const stylingTrigger = $("#am-styling-trigger");
  const moduleEntryAiQuickButton = $("#am-module-entry-ai");
  const stylingOverlay = $("#am-styling-overlay");
  const authOverlay = $("#am-auth-overlay");
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

    if (authOverlay && !authOverlay.hidden) {
      closeAuthOverlay();
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

  bindAuthEvents();

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
