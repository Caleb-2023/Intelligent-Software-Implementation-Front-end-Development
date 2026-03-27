import { API_BASE_URL, API_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from "../config.mjs";
import { $, $$ } from "../utils/dom.mjs";

function readStoredUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistSession(token, user) {
  localStorage.setItem(API_TOKEN_STORAGE_KEY, token);
  localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
}

async function postAuthJson(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const msg =
      payload?.message ||
      (Array.isArray(payload?.errors) && payload.errors.map((e) => e?.message || e).filter(Boolean).join("；")) ||
      `请求失败（${response.status}）`;
    const err = new Error(msg);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

function setAuthStatus(text, isError) {
  const el = $("#am-auth-status");
  if (!el) {
    return;
  }
  el.textContent = text || "";
  el.hidden = !text;
  el.dataset.error = isError ? "1" : "";
}

export function updateAuthUi() {
  const user = readStoredUser();
  const loggedIn = Boolean(user && localStorage.getItem(API_TOKEN_STORAGE_KEY));

  const headOpen = $("#am-auth-head-open");
  const headLogout = $("#am-auth-head-logout");
  const headLabel = $("#am-auth-head-label");

  if (headOpen && headLogout && headLabel) {
    if (loggedIn) {
      headOpen.hidden = true;
      headLogout.hidden = false;
      headLabel.hidden = false;
      headLabel.textContent = user.name || user.mail || "已登录";
    } else {
      headOpen.hidden = false;
      headLogout.hidden = true;
      headLabel.hidden = true;
      headLabel.textContent = "";
    }
  }

  const heroGuest = $("#am-auth-hero");
  const heroWelcome = $("#am-auth-hero-welcome");
  const welcomeText = $("#am-auth-hero-welcome-text");

  if (heroGuest && heroWelcome) {
    if (loggedIn) {
      heroGuest.hidden = true;
      heroWelcome.hidden = false;
      if (welcomeText) {
        welcomeText.textContent = `你好，${user.name || user.mail || "用户"}。衣橱与试穿将与此账号同步。`;
      }
    } else {
      heroGuest.hidden = false;
      heroWelcome.hidden = true;
    }
  }
}

export function openAuthOverlay(mode = "login") {
  const overlay = $("#am-auth-overlay");
  if (!overlay) {
    return;
  }
  overlay.hidden = false;
  setAuthStatus("", false);
  switchAuthTab(mode === "register" ? "register" : "login");
  requestAnimationFrame(() => {
    const focusTarget = mode === "register" ? $("#am-auth-reg-name") : $("#am-auth-login-mail");
    focusTarget?.focus();
  });
}

export function closeAuthOverlay() {
  const overlay = $("#am-auth-overlay");
  if (overlay) {
    overlay.hidden = true;
  }
  setAuthStatus("", false);
}

function switchAuthTab(tab) {
  const isRegister = tab === "register";
  const tabLogin = $("#am-auth-tab-login");
  const tabRegister = $("#am-auth-tab-register");
  const panelLogin = $("#am-auth-panel-login");
  const panelRegister = $("#am-auth-panel-register");

  if (tabLogin && tabRegister) {
    tabLogin.setAttribute("aria-selected", (!isRegister).toString());
    tabRegister.setAttribute("aria-selected", isRegister.toString());
    tabLogin.classList.toggle("am-auth-tab--active", !isRegister);
    tabRegister.classList.toggle("am-auth-tab--active", isRegister);
  }

  if (panelLogin && panelRegister) {
    panelLogin.hidden = isRegister;
    panelRegister.hidden = !isRegister;
  }
}

export function setupAuthUi() {
  if ($("#am-auth-overlay")) {
    return;
  }

  if (!document.getElementById("am-auth-head-open")) {
    const contrast = $(".site-head .js-contrast");
    const headContainer = $(".site-head__container");
    const wrap = document.createElement("div");
    wrap.className = "am-auth-head";
    wrap.innerHTML = `
      <span id="am-auth-head-label" class="am-auth-head__label" hidden></span>
      <button type="button" id="am-auth-head-open" class="am-button am-auth-head__btn">登录 / 注册</button>
      <button type="button" id="am-auth-head-logout" class="am-button am-auth-head__btn" hidden>退出</button>
    `;
    if (contrast?.parentElement) {
      contrast.parentElement.insertBefore(wrap, contrast);
    } else if (headContainer) {
      headContainer.appendChild(wrap);
    }
  }

  const heroContent = $(".s-hero .s__content");
  if (heroContent && !$("#am-auth-hero")) {
    const block = document.createElement("div");
    block.className = "am-auth-hero-wrap";
    block.innerHTML = `
      <div class="am-panel am-auth-hero" id="am-auth-hero">
        <p class="am-auth-hero__eyebrow">账户</p>
        <p class="am-auth-hero__lede">登录后可同步个人衣橱、虚拟形象与试穿预览。</p>
        <div class="am-auth-hero__row">
          <button type="button" id="am-auth-hero-login" class="am-button">登录</button>
          <button type="button" id="am-auth-hero-register" class="am-button">注册</button>
        </div>
      </div>
      <div class="am-panel am-auth-hero am-auth-hero--welcome" id="am-auth-hero-welcome" hidden>
        <p class="am-auth-hero__eyebrow">已登录</p>
        <p class="am-auth-hero__lede" id="am-auth-hero-welcome-text"></p>
      </div>
    `;
    heroContent.appendChild(block);
  }

  const overlay = document.createElement("div");
  overlay.id = "am-auth-overlay";
  overlay.className = "am-auth-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="am-auth-overlay__backdrop" data-am-close-auth></div>
    <div class="am-auth-overlay__dialog" role="dialog" aria-modal="true" aria-labelledby="am-auth-title">
      <header class="am-auth-overlay__header">
        <div>
          <p class="am-auth-overlay__eyebrow">AuraMirror</p>
          <h2 id="am-auth-title" class="am-auth-overlay__title">账户</h2>
        </div>
        <button type="button" id="am-auth-close" class="am-styling-close" aria-label="关闭">关闭</button>
      </header>
      <div class="am-auth-tabs" role="tablist" aria-label="登录或注册">
        <button type="button" id="am-auth-tab-login" class="am-auth-tab am-auth-tab--active" role="tab" aria-selected="true">登录</button>
        <button type="button" id="am-auth-tab-register" class="am-auth-tab" role="tab" aria-selected="false">注册</button>
      </div>
      <div class="am-auth-overlay__body">
        <p id="am-auth-status" class="am-auth-status" hidden role="status"></p>
        <form id="am-auth-panel-login" class="am-fields am-auth-form">
          <label class="am-label">邮箱
            <input id="am-auth-login-mail" class="am-input" type="email" name="mail" autocomplete="email" required />
          </label>
          <label class="am-label">密码
            <input id="am-auth-login-password" class="am-input" type="password" name="password" autocomplete="current-password" required />
          </label>
          <button type="submit" id="am-auth-submit-login" class="am-button">登录</button>
        </form>
        <form id="am-auth-panel-register" class="am-fields am-auth-form" hidden>
          <label class="am-label">用户名
            <input id="am-auth-reg-name" class="am-input" type="text" name="name" maxlength="50" autocomplete="username" required />
          </label>
          <label class="am-label">邮箱
            <input id="am-auth-reg-mail" class="am-input" type="email" name="mail" autocomplete="email" required />
          </label>
          <label class="am-label">密码（至少 6 位）
            <input id="am-auth-reg-password" class="am-input" type="password" name="password" autocomplete="new-password" minlength="6" required />
          </label>
          <label class="am-label">性别
            <select id="am-auth-reg-gender" class="am-select" name="gender">
              <option value="other">其他</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </label>
          <button type="submit" id="am-auth-submit-register" class="am-button">注册</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  updateAuthUi();
}

export function bindAuthEvents() {
  if (document.documentElement.dataset.amAuthEventsBound === "1") {
    return;
  }
  document.documentElement.dataset.amAuthEventsBound = "1";

  const openIds = ["am-auth-head-open", "am-auth-hero-login", "am-auth-hero-register"];
  openIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.addEventListener("click", () => {
      const mode = id === "am-auth-hero-register" ? "register" : "login";
      openAuthOverlay(mode);
    });
  });

  $("#am-auth-head-logout")?.addEventListener("click", async () => {
    clearAuthSession();
    updateAuthUi();
    try {
      const { loadWardrobeCatalog } = await import("./tryon.mjs");
      await loadWardrobeCatalog({ force: true });
    } catch {
      /* ignore */
    }
  });

  $("#am-auth-close")?.addEventListener("click", () => closeAuthOverlay());
  $$("[data-am-close-auth]").forEach((node) => {
    node.addEventListener("click", () => closeAuthOverlay());
  });

  $("#am-auth-tab-login")?.addEventListener("click", () => {
    switchAuthTab("login");
    $("#am-auth-login-mail")?.focus();
  });
  $("#am-auth-tab-register")?.addEventListener("click", () => {
    switchAuthTab("register");
    $("#am-auth-reg-name")?.focus();
  });

  $("#am-auth-panel-login")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mail = $("#am-auth-login-mail")?.value?.trim() || "";
    const password = $("#am-auth-login-password")?.value || "";
    if (!mail || !password) {
      setAuthStatus("请填写邮箱与密码。", true);
      return;
    }
    setAuthStatus("登录中…", false);
    try {
      const payload = await postAuthJson("/auth/login", { mail, password });
      const data = payload?.data || {};
      if (!data.token || !data.user) {
        throw new Error("响应缺少 token 或用户信息");
      }
      persistSession(data.token, data.user);
      updateAuthUi();
      setAuthStatus("", false);
      closeAuthOverlay();
      const { loadWardrobeCatalog } = await import("./tryon.mjs");
      await loadWardrobeCatalog({ force: true });
    } catch (err) {
      setAuthStatus(err.message || "登录失败", true);
    }
  });

  $("#am-auth-panel-register")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#am-auth-reg-name")?.value?.trim() || "";
    const mail = $("#am-auth-reg-mail")?.value?.trim() || "";
    const password = $("#am-auth-reg-password")?.value || "";
    const gender = $("#am-auth-reg-gender")?.value || "other";
    if (!name || !mail || !password) {
      setAuthStatus("请填写所有必填项。", true);
      return;
    }
    if (password.length < 6) {
      setAuthStatus("密码至少需要 6 位。", true);
      return;
    }
    setAuthStatus("注册中…", false);
    try {
      const payload = await postAuthJson("/auth/register", { name, mail, password, gender });
      const data = payload?.data || {};
      if (!data.token || !data.user) {
        throw new Error("响应缺少 token 或用户信息");
      }
      persistSession(data.token, data.user);
      updateAuthUi();
      setAuthStatus("", false);
      closeAuthOverlay();
      const { loadWardrobeCatalog } = await import("./tryon.mjs");
      await loadWardrobeCatalog({ force: true });
    } catch (err) {
      setAuthStatus(err.message || "注册失败", true);
    }
  });
}
