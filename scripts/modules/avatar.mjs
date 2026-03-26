import { state } from "../state.mjs";
import { API_TOKEN_STORAGE_KEY } from "../config.mjs";
import { $ } from "../utils/dom.mjs";
import { apiRequest, getApiToken, pollTask } from "../api/client.mjs";
import { updateFigureStatus } from "./cloth-utils.mjs";
import { loadImage, drawCoverImage } from "./canvas-utils.mjs";

export async function refreshFigureState() {
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

export async function syncAvatarToBackend() {
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

export async function renderAvatar() {
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
