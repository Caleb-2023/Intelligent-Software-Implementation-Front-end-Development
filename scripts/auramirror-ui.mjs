import { setupHeaderNavigation, watchContrastThemeForQr, updateBranding, stripLegacyHeroSections, setupAboutSection, setupTryOnSection, setupHistorySection } from "./layout/setup.mjs";
import { bindEvents } from "./modules/events.mjs";
import { renderHistory } from "./modules/history.mjs";
import { setupAuthUi } from "./modules/auth.mjs";

function initAuraMirror() {
  setupHeaderNavigation();
  watchContrastThemeForQr();
  updateBranding();
  setupAuthUi();
  stripLegacyHeroSections();
  setupAboutSection();
  setupTryOnSection();
  setupHistorySection();
  bindEvents();
  renderHistory();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuraMirror, { once: true });
} else {
  initAuraMirror();
}
