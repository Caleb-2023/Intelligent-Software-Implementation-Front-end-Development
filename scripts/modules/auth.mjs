import { API_BASE_URL, API_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from "../config.mjs";
import { $, $$ } from "../utils/dom.mjs";

function readStoredUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
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

export function isLoggedIn() {
  return Boolean(readStoredUser() && localStorage.getItem(API_TOKEN_STORAGE_KEY));
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
      (Array.isArray(payload?.errors) && payload.errors.map((e) => e?.message || e).filter(Boolean).join("; ")) ||
      `Request failed (${response.status})`;
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }
  return payload;
}

function setAuthStatus(text, isError) {
  const el = $("#am-auth-status");
  if (!el) return;
  el.textContent = text || "";
  el.hidden = !text;
  el.dataset.error = isError ? "1" : "";
}

// ── Auth Gate (full-screen overlay, only shown when user clicks Login/Register) ──

function openAuthGate(mode) {
  const gate = $("#am-auth-gate");
  if (!gate) return;
  gate.hidden = false;
  gate.classList.remove("am-auth-gate--leaving");
  document.documentElement.classList.add("am-auth-locked");
  setAuthStatus("", false);
  switchAuthTab(mode === "register" ? "register" : "login");
  requestAnimationFrame(() => {
    const target = mode === "register" ? $("#am-auth-reg-name") : $("#am-auth-login-mail");
    target?.focus();
  });
}

export function closeAuthOverlay() {
  const gate = $("#am-auth-gate");
  if (!gate || gate.hidden) return;
  gate.classList.add("am-auth-gate--leaving");
  gate.addEventListener("animationend", () => {
    gate.hidden = true;
    gate.classList.remove("am-auth-gate--leaving");
  }, { once: true });
  document.documentElement.classList.remove("am-auth-locked");
}

function buildAuthGate() {
  if ($("#am-auth-gate")) return;

  const gate = document.createElement("div");
  gate.id = "am-auth-gate";
  gate.className = "am-auth-gate";
  gate.hidden = true;
  gate.setAttribute("role", "dialog");
  gate.setAttribute("aria-modal", "true");
  gate.setAttribute("aria-label", "Sign in to AuraMirror");
  gate.innerHTML = `
    <div class="am-auth-gate__backdrop" data-am-close-gate></div>
    <div class="am-auth-gate__inner">
      <header class="am-auth-gate__header">
        <div>
          <p class="am-auth-gate__eyebrow">Module 00</p>
          <h2 class="am-auth-gate__title">Aura<br>Mirror</h2>
          <p class="am-auth-gate__sub">AI Smart Wardrobe</p>
        </div>
        <button type="button" id="am-auth-close" class="am-styling-close" aria-label="Close">Close</button>
      </header>

      <div class="am-auth-tabs" role="tablist" aria-label="Login or Register">
        <button type="button" id="am-auth-tab-login" class="am-auth-tab am-auth-tab--active" role="tab" aria-selected="true">Sign In</button>
        <button type="button" id="am-auth-tab-register" class="am-auth-tab" role="tab" aria-selected="false">Register</button>
      </div>

      <div class="am-auth-gate__body">
        <p id="am-auth-status" class="am-auth-status" hidden role="status"></p>

        <form id="am-auth-panel-login" class="am-fields am-auth-form">
          <label class="am-label">Email
            <input id="am-auth-login-mail" class="am-input" type="email" name="mail" autocomplete="email" placeholder="you@example.com" required />
          </label>
          <label class="am-label">Password
            <input id="am-auth-login-password" class="am-input" type="password" name="password" autocomplete="current-password" placeholder="••••••••" required />
          </label>
          <button type="submit" class="am-button am-auth-gate__submit">Sign In</button>
        </form>

        <form id="am-auth-panel-register" class="am-fields am-auth-form" hidden>
          <label class="am-label">Username
            <input id="am-auth-reg-name" class="am-input" type="text" name="name" maxlength="50" autocomplete="username" placeholder="Your name" required />
          </label>
          <label class="am-label">Email
            <input id="am-auth-reg-mail" class="am-input" type="email" name="mail" autocomplete="email" placeholder="you@example.com" required />
          </label>
          <label class="am-label">Password (min. 6 characters)
            <input id="am-auth-reg-password" class="am-input" type="password" name="password" autocomplete="new-password" placeholder="••••••••" minlength="6" required />
          </label>
          <label class="am-label">Gender
            <select id="am-auth-reg-gender" class="am-select" name="gender">
              <option value="other">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <button type="submit" class="am-button am-auth-gate__submit">Create Account</button>
        </form>
      </div>

      <footer class="am-auth-gate__footer">
        <span class="am-auth-gate__footer-text">Your wardrobe · your data · your style.</span>
      </footer>
    </div>
  `;

  document.body.appendChild(gate);
}

// ── Nav items ────────────────────────────────────────────────────────────────

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

export function updateAuthUi() {
  const user = readStoredUser();
  const loggedIn = Boolean(user && localStorage.getItem(API_TOKEN_STORAGE_KEY));

  const navLogin = $("#am-nav-login");
  const navRegister = $("#am-nav-register");
  const navSignout = $("#am-nav-signout");

  // logged out: show LOGIN + REGISTER, hide SIGN OUT
  // logged in:  hide LOGIN + REGISTER, show SIGN OUT
  if (navLogin) navLogin.closest(".sb__item").hidden = loggedIn;
  if (navRegister) navRegister.closest(".sb__item").hidden = loggedIn;
  if (navSignout) navSignout.closest(".sb__item").hidden = !loggedIn;
}

export function openAuthOverlay(mode = "login") {
  openAuthGate(mode);
}

export function setupAuthUi() {
  buildAuthGate();

  const menuList = $(".sb-menu .sb__list");
  if (menuList && !document.getElementById("am-nav-login")) {
    // Copy the astro scoped class from existing nav items for identical styling
    const existingItem = $(".sb-menu .sb__item");
    const astroClass = existingItem
      ? [...existingItem.classList].find((c) => c.startsWith("astro-")) || ""
      : "";

    // LOGIN nav item — identical structure to Avatar / Try-On / History
    const loginItem = document.createElement("li");
    loginItem.className = `sb__item js-menu-item ${astroClass}`;
    loginItem.innerHTML = `<a href="#" id="am-nav-login" class="js-menu-link ${astroClass}"><span class="sb__text ${astroClass}">Login</span></a>`;
    menuList.appendChild(loginItem);

    // REGISTER nav item
    const registerItem = document.createElement("li");
    registerItem.className = `sb__item js-menu-item ${astroClass}`;
    registerItem.innerHTML = `<a href="#" id="am-nav-register" class="js-menu-link ${astroClass}"><span class="sb__text ${astroClass}">Register</span></a>`;
    menuList.appendChild(registerItem);

    // SIGN OUT nav item (hidden by default)
    const signoutItem = document.createElement("li");
    signoutItem.className = `sb__item js-menu-item ${astroClass}`;
    signoutItem.hidden = true;
    signoutItem.innerHTML = `<a href="#" id="am-nav-signout" class="js-menu-link ${astroClass}"><span class="sb__text ${astroClass}">Sign Out</span></a>`;
    menuList.appendChild(signoutItem);
  }

  updateAuthUi();
}

export function bindAuthEvents() {
  if (document.documentElement.dataset.amAuthEventsBound === "1") return;
  document.documentElement.dataset.amAuthEventsBound = "1";

  // Nav: LOGIN → open gate on login tab
  document.addEventListener("click", (e) => {
    const link = e.target.closest("#am-nav-login");
    if (link) { e.preventDefault(); openAuthGate("login"); }
  });

  // Nav: REGISTER → open gate on register tab
  document.addEventListener("click", (e) => {
    const link = e.target.closest("#am-nav-register");
    if (link) { e.preventDefault(); openAuthGate("register"); }
  });

  // Nav: SIGN OUT
  document.addEventListener("click", (e) => {
    const link = e.target.closest("#am-nav-signout");
    if (link) {
      e.preventDefault();
      clearAuthSession();
      updateAuthUi();
      import("./tryon.mjs").then(({ loadWardrobeCatalog }) => {
        loadWardrobeCatalog({ force: true }).catch(() => {});
      });
    }
  });

  // Close button
  $("#am-auth-close")?.addEventListener("click", () => closeAuthOverlay());

  // Backdrop click to close
  document.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.hasAttribute("data-am-close-gate")) {
      closeAuthOverlay();
    }
  });

  // Tab switching
  $("#am-auth-tab-login")?.addEventListener("click", () => {
    switchAuthTab("login");
    $("#am-auth-login-mail")?.focus();
  });
  $("#am-auth-tab-register")?.addEventListener("click", () => {
    switchAuthTab("register");
    $("#am-auth-reg-name")?.focus();
  });

  // Login form submit
  $("#am-auth-panel-login")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mail = $("#am-auth-login-mail")?.value?.trim() || "";
    const password = $("#am-auth-login-password")?.value || "";
    if (!mail || !password) { setAuthStatus("Please enter your email and password.", true); return; }
    setAuthStatus("Signing in…", false);
    try {
      const payload = await postAuthJson("/auth/login", { mail, password });
      const data = payload?.data || {};
      if (!data.token || !data.user) throw new Error("Invalid server response.");
      persistSession(data.token, data.user);
      updateAuthUi();
      setAuthStatus("", false);
      closeAuthOverlay();
      const { loadWardrobeCatalog } = await import("./tryon.mjs");
      await loadWardrobeCatalog({ force: true });
    } catch (err) {
      setAuthStatus(err.message || "Sign in failed.", true);
    }
  });

  // Register form submit
  $("#am-auth-panel-register")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#am-auth-reg-name")?.value?.trim() || "";
    const mail = $("#am-auth-reg-mail")?.value?.trim() || "";
    const password = $("#am-auth-reg-password")?.value || "";
    const gender = $("#am-auth-reg-gender")?.value || "other";
    if (!name || !mail || !password) { setAuthStatus("Please fill in all required fields.", true); return; }
    if (password.length < 6) { setAuthStatus("Password must be at least 6 characters.", true); return; }
    setAuthStatus("Creating account…", false);
    try {
      const payload = await postAuthJson("/auth/register", { name, mail, password, gender });
      const data = payload?.data || {};
      if (!data.token || !data.user) throw new Error("Invalid server response.");
      persistSession(data.token, data.user);
      updateAuthUi();
      setAuthStatus("", false);
      closeAuthOverlay();
      const { loadWardrobeCatalog } = await import("./tryon.mjs");
      await loadWardrobeCatalog({ force: true });
    } catch (err) {
      setAuthStatus(err.message || "Registration failed.", true);
    }
  });
}
