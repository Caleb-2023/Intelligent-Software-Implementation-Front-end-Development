# CLAUDE.md

AuraMirror（Astro + 原生 JS/GSAP）。新页面一律新建自包含 `.astro` 组件（自带 `<script>` 自初始化），**禁改** `auramirror/index.js`、`config.js`、`state.js`（他人维护）。共享请求逻辑放 `src/auramirror/shared/api.js`，端点用 `API_BASE_URL` 本地拼接。DOM/CSS 加页面专属前缀（`am-xxx-`），`innerHTML` 必经 `escapeHtml`。仅在 `index.astro` 末尾追加 `import` 与挂载，跨页通信用 `CustomEvent`，一页一 PR。`npm run dev` 启动。
