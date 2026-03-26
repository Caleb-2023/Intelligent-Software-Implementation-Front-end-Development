import { API_BASE_URL, API_TOKEN_STORAGE_KEY } from "../config.mjs";

export function getApiToken() {
  try {
    return localStorage.getItem(API_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function getApiOrigin() {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return window.location.origin;
  }
}

export function resolveApiAssetUrl(value) {
  if (!value) {
    return "";
  }

  try {
    return new URL(String(value), `${getApiOrigin()}/`).toString();
  } catch {
    return String(value);
  }
}

export async function apiRequest(path, options = {}) {
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

export async function pollTask(taskId, { timeoutMs = 120000, intervalMs = 2500 } = {}) {
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
