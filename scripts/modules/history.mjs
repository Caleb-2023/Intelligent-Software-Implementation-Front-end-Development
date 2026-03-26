import { STORAGE_KEY } from "../config.mjs";
import { state } from "../state.mjs";
import { $, $$, escapeHtml } from "../utils/dom.mjs";
import { formatCategoryLabel } from "./cloth-utils.mjs";

export function buildRecommendationText() {
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

export function getCurrentPreviewImage() {
  const tryOnImage = $("#am-tryon-image");

  if (tryOnImage && tryOnImage.getAttribute("src")) {
    return tryOnImage.getAttribute("src");
  }

  const tryOnCanvas = $("#am-tryon-canvas");

  if (tryOnCanvas && !tryOnCanvas.hidden) {
    try {
      return tryOnCanvas.toDataURL("image/png");
    } catch {
      return state.avatarDataUrl || "";
    }
  }

  return state.avatarDataUrl || "";
}

export function normalizeHistoryEntry(entry, index) {
  const fallbackTitle = `LOOK ${String(index + 1).padStart(2, "0")}`;
  const items = Array.isArray(entry?.items) ? entry.items.filter(Boolean) : [];

  return {
    title: String(entry?.title || fallbackTitle),
    reason: String(entry?.reason || "Recommendation details unavailable."),
    time: String(entry?.time || "Unknown time"),
    items,
    image: String(entry?.image || "")
  };
}

export function destroyHistoryEffects() {
  if (state.historyScrollTween) {
    state.historyScrollTween.kill();
    state.historyScrollTween = null;
  }

  if (state.historyScrollTrigger) {
    state.historyScrollTrigger.kill();
    state.historyScrollTrigger = null;
  }

  state.historyDistortions.forEach((instance) => {
    if (instance && typeof instance.destroy === "function") {
      instance.destroy();
    }
  });

  state.historyDistortions = [];
}

export function getHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

export function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function renderRecommendationCard(reco) {
  const card = $("#am-recommendation-card");

  if (!card) {
    return;
  }

  const tags = reco.items.map((item) => `<span class="am-tag">${item}</span>`).join("");
  card.innerHTML = `<strong>${reco.title}</strong><p>${reco.reason}</p><div>${tags}</div>`;
}

export function createDisplacementCanvas(size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return canvas;
  }

  const gradient = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.1, size * 0.5, size * 0.5, size * 0.6);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.45, "rgba(180, 180, 255, 0.85)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 24; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 8 + Math.random() * 20;
    const ripple = ctx.createRadialGradient(x, y, 0, x, y, radius);
    ripple.addColorStop(0, "rgba(255, 255, 255, 0.42)");
    ripple.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = ripple;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  return canvas;
}

export function createHistoryDistortion(card, onWavePeak) {
  const canvas = $(".am-history-thumb__fx", card);
  const image = $(".am-history-thumb__img", card);

  if (!canvas || !image) {
    return null;
  }

  const gl = canvas.getContext("webgl", { alpha: true, antialias: true });

  if (!gl) {
    return {
      play: () => {
        if (typeof onWavePeak === "function") {
          onWavePeak();
        }
      },
      reset: () => { },
      destroy: () => { }
    };
  }

  const vertexShaderSource = `
    attribute vec2 aPosition;
    attribute vec2 aUv;
    varying vec2 vUv;

    void main() {
      vUv = aUv;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uImage;
    uniform sampler2D uDisplacement;
    uniform float uIntensity;

    void main() {
      vec2 disp = texture2D(uDisplacement, vUv).rg;
      vec2 offset = (disp * 2.0 - 1.0) * 0.08 * uIntensity;
      vec2 uv = clamp(vUv + offset, 0.0, 1.0);
      vec4 color = texture2D(uImage, uv);
      gl_FragColor = color;
    }
  `;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(info || "Shader compile failed");
    }
    return shader;
  };

  const createTexture = (source) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return texture;
  };

  let program;
  let imageTexture;
  let displacementTexture;
  let intensityLocation;
  let intensity = 0;
  let pulseTween = null;
  let didCallPeak = false;

  try {
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
    }

    gl.useProgram(program);

    const vertices = new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      1, 1, 1, 1
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, "aPosition");
    const aUv = gl.getAttribLocation(program, "aUv");
    gl.enableVertexAttribArray(aPosition);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

    imageTexture = createTexture(image);
    displacementTexture = createTexture(createDisplacementCanvas(192));

    const imageLocation = gl.getUniformLocation(program, "uImage");
    const displacementLocation = gl.getUniformLocation(program, "uDisplacement");
    intensityLocation = gl.getUniformLocation(program, "uIntensity");

    gl.uniform1i(imageLocation, 0);
    gl.uniform1i(displacementLocation, 1);
  } catch {
    return {
      play: () => {
        if (typeof onWavePeak === "function") {
          onWavePeak();
        }
      },
      reset: () => { },
      destroy: () => { }
    };
  }

  const setSize = () => {
    const rect = card.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(rect.width * dpr));
    canvas.height = Math.max(2, Math.round(rect.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const render = () => {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, displacementTexture);

    gl.uniform1f(intensityLocation, intensity);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  setSize();
  render();

  const play = () => {
    if (!window.gsap) {
      if (typeof onWavePeak === "function") {
        onWavePeak();
      }
      return;
    }

    if (pulseTween) {
      pulseTween.kill();
      pulseTween = null;
    }

    didCallPeak = false;
    canvas.hidden = false;
    image.style.opacity = "0";

    const proxy = { value: 0 };
    pulseTween = window.gsap.to(proxy, {
      value: 1,
      duration: 0.24,
      ease: "power2.out",
      onUpdate: () => {
        intensity = proxy.value;
        render();
      },
      onComplete: () => {
        if (!didCallPeak && typeof onWavePeak === "function") {
          didCallPeak = true;
          onWavePeak();
        }

        pulseTween = window.gsap.to(proxy, {
          value: 0,
          duration: 0.35,
          ease: "power3.out",
          onUpdate: () => {
            intensity = proxy.value;
            render();
          },
          onComplete: () => {
            image.style.opacity = "1";
            canvas.hidden = true;
          }
        });
      }
    });
  };

  const reset = () => {
    if (pulseTween) {
      pulseTween.kill();
      pulseTween = null;
    }

    intensity = 0;
    render();
    image.style.opacity = "1";
    canvas.hidden = true;
  };

  const onResize = () => {
    setSize();
    render();
  };

  window.addEventListener("resize", onResize);

  return {
    play,
    reset,
    destroy: () => {
      window.removeEventListener("resize", onResize);
      if (pulseTween) {
        pulseTween.kill();
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}

export function renderHistoryFocus(entry) {
  const focus = $("#am-history-focus");

  if (!focus) {
    return;
  }

  const normalized = normalizeHistoryEntry(entry, 0);
  const tags = normalized.items.map((item) => `<span class="am-tag">${escapeHtml(item)}</span>`).join("");

  focus.innerHTML = `
    <h4 class="am-history-focus__title">${escapeHtml(normalized.title)}</h4>
    <span class="am-history-focus__time">${escapeHtml(normalized.time)}</span>
    <p class="am-history-focus__reason">${escapeHtml(normalized.reason)}</p>
    <div>${tags}</div>
  `;
}

export function setupHistoryGalleryEffects() {
  destroyHistoryEffects();

  const panel = $("#am-history-panel");
  const viewport = $("#am-history-gallery", panel);
  const track = $("#am-history-list", panel);

  if (!panel || !viewport || !track) {
    return;
  }

  const cards = $$(".am-history-card", track);
  const entries = getHistory().map((entry, idx) => normalizeHistoryEntry(entry, idx)).reverse();

  cards.forEach((card, index) => {
    const entry = entries[index];

    if (!entry) {
      return;
    }

    const setActive = () => {
      cards.forEach((node) => node.classList.remove("is-active"));
      card.classList.add("is-active");
      renderHistoryFocus(entry);
    };

    const distortion = createHistoryDistortion(card, setActive);
    if (distortion) {
      state.historyDistortions.push(distortion);
    }

    card.addEventListener("pointerenter", () => {
      distortion?.play();
    });

    card.addEventListener("focus", () => {
      distortion?.play();
    });

    card.addEventListener("pointerleave", () => {
      distortion?.reset();
    });

    card.addEventListener("blur", () => {
      distortion?.reset();
    });
  });

  if (entries[0]) {
    renderHistoryFocus(entries[0]);
  }

  if (!window.gsap || !window.ScrollTrigger || track.scrollWidth <= viewport.clientWidth + 2) {
    return;
  }

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);

  state.historyScrollTween = gsap.to(track, {
    x: () => -(track.scrollWidth - viewport.clientWidth),
    ease: "none",
    overwrite: true,
    scrollTrigger: {
      trigger: panel,
      start: "center center",
      end: () => `+=${Math.max(track.scrollWidth - viewport.clientWidth, 600)}`,
      scrub: 1,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true
    }
  });

  state.historyScrollTrigger = state.historyScrollTween.scrollTrigger || null;
}

export function renderHistory() {
  const list = $("#am-history-list");

  if (!list) {
    return;
  }

  const history = getHistory();

  if (!history.length) {
    list.innerHTML = '<div class="am-history-item am-history-empty">No recommendation history yet.</div>';
    const focus = $("#am-history-focus");
    if (focus) {
      focus.innerHTML = '<p class="am-history-focus__reason">Hover a look card to inspect its outfit breakdown.</p>';
    }
    destroyHistoryEffects();
    return;
  }

  list.innerHTML = history
    .slice()
    .reverse()
    .map((entry, index) => {
      const normalized = normalizeHistoryEntry(entry, index);
      const previewImage = normalized.image || state.avatarDataUrl;
      return `
        <article class="am-history-card" tabindex="0" data-history-index="${index}">
          <figure class="am-history-thumb">
            ${previewImage ? `<img class="am-history-thumb__img" src="${escapeHtml(previewImage)}" alt="${escapeHtml(normalized.title)}" loading="lazy" decoding="async" />` : '<span class="am-history-thumb__img"></span>'}
            <canvas class="am-history-thumb__fx" hidden></canvas>
          </figure>
          <div class="am-history-meta">
            <strong>${escapeHtml(normalized.title)}</strong>
            <small>${escapeHtml(normalized.time)}</small>
          </div>
        </article>
      `;
    })
    .join("");

  setupHistoryGalleryEffects();
}
