# 新建页面任务清单（负责范围：完全没做出来的界面）

> 你负责 5 个**全新页面**；现有页面改造由另一位同学并行进行。
> 因此所有代码以"**新建文件**"为主，几乎不碰大文件，确保可独立合并（merge-friendly）。
> 接口契约偏差见 [api-divergence-todo.md](./api-divergence-todo.md)，页面缺口背景见 [ui-pages-gap.md](./ui-pages-gap.md)。

## 总览

| # | 页面 | 新建组件 | 前缀 | 主要端点 | 跨页事件 | 优先级 |
|---|---|---|---|---|---|---|
| 1 | 我的形象库 | `src/components/SFigureLibrary.astro` | `am-figs-` | GET/DELETE `/api/figures(/{id})`、GET `/api/tasks/{id}` | 发 `am:figure-selected` | 高 |
| 2 | 试穿记录 | `src/components/STryonHistory.astro` | `am-tryh-` | GET/DELETE `/api/tryons(/{id})` | 调 `am:open-feedback` | 高 |
| 3 | 推荐记录 | `src/components/SStyleRecords.astro` | `am-styles-` | GET/DELETE `/api/styles(/{id})` | 调 `am:open-feedback` | 中 |
| 4 | 反馈 | `src/components/SFeedback.astro` | `am-fb-` | POST `/api/histories/{id}/feedback`（默认）/ `/api/feedback` | 收 `am:open-feedback`，发 `am:feedback-submitted` | 中 |
| 5 | Admin/Debug | `src/components/SAdmin.astro` | `am-admin-` | GET/PUT `/api/config`、GET `/api/health` | 入口 `#admin` 门控 | 低（可选） |

**建议实现顺序**：先做 §0 公共基建 → ① 形象库 → ② 试穿记录 → ③ 推荐记录 → ④ 反馈 → ⑤ Admin。一页一 PR。

---

## 0. 公共基建与代码风格约定（必读，先做）

### 0.1 merge-friendly 铁律

- [ ] **新建文件优先**：每个页面 = 1 个新 `.astro` 组件，自带 `<script>` 用 `new XxxSection()` 自初始化（仿 `SHero`/`SWork`/`SCTA`/`SAccount`）。**不要**往 `src/auramirror/index.js` 或 `initAuraMirror()` 加任何代码——那是别人的改动区，碰了必冲突。
- [ ] **不改** `config.js` / `state.js`：端点在组件 `<script>` 内用 `import { API_BASE_URL }` 本地拼接，**不向** `API_ENDPOINTS` 增字段；组件状态存在 class 实例字段里，不动全局 `state`。
- [ ] **唯一共享触点 = `src/pages/index.astro`**：只追加 `import`（加在 frontmatter import 列表**末尾**）+ 挂载（带注释、连续行）。详见 §0.4。
- [ ] **命名空间隔离**：所有 `id`/`class` 用页面专属前缀（`am-figs-` 等）。视觉**复用** `am-button` / `am-panel` / `am-card` / `am-empty-state` / `am-status` 等 class 保持一致，但结构性 `id` 必须唯一。
- [ ] **样式 scoped**：每组件用 `<style lang="scss">`（Astro 默认 scoped），直接用现有 `mq()` / `color()` / `font-family()` mixin，**不改任何 global scss**。
- [ ] **安全**：一切 `innerHTML` 注入前用 `escapeHtml`（来自 `src/auramirror/dom.js`）；拼 URL 用 `encodeURIComponent`。
- [ ] **不重排、不格式化既有文件**，避免无谓 diff。

### 0.2 跨页通信（只用 CustomEvent，零文件耦合）

| 事件 | 发出方 | 监听方 | detail |
|---|---|---|---|
| `am:figure-selected` | 形象库 | 试穿/推荐（他人页面可选听） | `{ figureId }`（取消选中为 `null`） |
| `am:open-feedback` | 试穿记录 / 推荐记录 | 反馈组件 | `{ targetType, targetId, context }` |
| `am:feedback-submitted` | 反馈组件 | 任意 | `{ targetType, targetId, rating }` |

### 0.3 新建 `src/auramirror/shared/api.js`（5 个页面共用，谁先做谁建）

> 约定：函数名/签名固定如下，多人合并时取并集去重即可。逻辑照搬 `index.js` 现有实现（**复制**，不 import index.js，避免耦合）。

```js
// src/auramirror/shared/api.js
import { API_BASE_URL, STORAGE_KEYS } from '../config.js'

export function getApiToken() {
  try { return localStorage.getItem(STORAGE_KEYS.apiToken) || '' } catch { return '' }
}

export function authHeaders(extra = {}) {
  const token = getApiToken()
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }
}

function getApiOrigin() {
  try { return new URL(API_BASE_URL, window.location.origin).origin }
  catch { return window.location.origin }
}

export function resolveAssetUrl(url) {
  if (!url) return ''
  try { return new URL(url, getApiOrigin()).href } catch { return url }
}

// 统一解包 {success,data}；同时兼容裸 JSON（/api/config、/api/health）。
export async function apiFetch(url, options = {}) {
  const resp = await fetch(url, options)
  const payload = await resp.json().catch(() => null)
  if (!resp.ok) {
    const err = new Error(payload?.message || payload?.error || `Request failed (${resp.status})`)
    err.status = resp.status
    throw err
  }
  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (!payload.success) throw new Error(payload.message || 'Request failed')
    return payload.data ?? payload
  }
  return payload
}

export async function pollTaskStatus(taskId, onProgress, { interval = 3000, maxAttempts = 120 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval))
    try {
      const data = await apiFetch(`${API_BASE_URL}/tasks/${encodeURIComponent(taskId)}`, { headers: authHeaders() })
      if (onProgress) onProgress(data)
      if (data?.status === 'completed') return data
      if (data?.status === 'failed') throw new Error(data?.error || data?.error_code || 'Task failed')
    } catch (err) {
      if (String(err.message).includes('failed')) throw err
    }
  }
  throw new Error('Task timed out')
}
```

### 0.4 组件骨架模板（每个新页面照此写）

```astro
---
// src/components/SFigureLibrary.astro —— 自包含；不改 index.js
---
<section id="am-figs-section" class="s-figs" data-intersect aria-label="Figure Library">
  <!-- 全部用 am-figs- 前缀的 id/class -->
  <div class="am-empty-state">…</div>
</section>

<script>
  import Emitter from '../utils/Emitter'
  import Ticker from '../utils/Ticker'
  import { API_BASE_URL } from '../auramirror/config.js'
  import { escapeHtml } from '../auramirror/dom.js'
  import { getApiToken, authHeaders, apiFetch, resolveAssetUrl, pollTaskStatus } from '../auramirror/shared/api.js'

  const FIGURES_URL = `${API_BASE_URL}/figures`

  class FigureLibrary {
    constructor() {
      this.el = document.getElementById('am-figs-section')
      if (!this.el) return
      if (document.readyState === 'complete') Ticker.nextTick(this.init, this)
      else Emitter.once('siteLoaded', this.init, this)
    }
    init() { /* loadList() + bindEvents()（事件委托） */ }
  }
  new FigureLibrary()
</script>

<style lang="scss">
  .s-figs { /* scoped；复用 mq()/color()/font-family() */ }
</style>
```

### 0.5 `index.astro` 集成规则（5 个 PR 共同遵守，降低彼此冲突）

- [ ] `import` 一律追加到 frontmatter import 列表**最末尾**，每页一行。
- [ ] 挂载统一放在 `.site-wrapper` 内、`<SiteFoot />` 之前的一个注释区，每页独占一行：

```astro
    <!-- ==== 新建页面（new-pages-tasks）每行一个，追加到末尾 ==== -->
    <SFigureLibrary />
    <STryonHistory />
    <SStyleRecords />
    <SFeedback />   <!-- 事件驱动，可放任意处 -->
    <SAdmin />      <!-- 默认 hidden -->
```

---

## 1. 我的形象库 — `SFigureLibrary.astro`（前缀 `am-figs-`）

展示用户已生成的多个 avatar/figure，支持选中当前形象、查看详情、删除。

**端点**：`GET /api/figures`（列表）、`GET /api/figures/{id}`（详情 source/avatar 图）、`DELETE /api/figures/{id}`、`GET /api/tasks/{id}`（processing 时轮询）。

**UI 状态**：未登录 / 加载中 / 空 / 列表成功 / 卡片 processing（占位+脉冲，禁用按钮）/ 选中高亮 / 详情面板（双图）/ 删除内联二次确认 / 错误+重试 / 图片 onerror 占位。

**子任务**
- [ ] 建 `shared/api.js`（若尚未建）。
- [ ] 建组件，结构仿 `SCTA` 的「列表 `am-figs-list` + 详情 `am-figs-focus`」双栏；header 含 `am-figs-refresh`。
- [ ] `loadFigures()`：`apiFetch` 取 `data.figures`（兜底 `payload.figures||[]`）→ `renderList()`。
- [ ] `renderList()`：网格卡片，缩略图 `resolveAssetUrl(avatar_url||image_url)` + `onerror` 占位；卡片含 选中/详情/删除 按钮，`data-figure-id` 用 `escapeHtml`。
- [ ] `watchProcessing()`：`status==='processing'` 时按 `task_id` 走 `pollTaskStatus`，完成后刷新该卡。
- [ ] `selectFigure()`：高亮 + 角标 + `dispatchEvent('am:figure-selected', {figureId})`。
- [ ] `showDetail()`：`GET /{id}` → 渲染 source/avatar 双图 + status。
- [ ] `deleteFigure()`：内联二次确认 → `DELETE` → 移除并重渲染；删的是选中项则广播 `figureId:null`。
- [ ] 事件委托（在 list 上统一监听）、`encodeURIComponent` 拼 URL。

**边界**：401 提示重登；`s3://` 必经 `resolveAssetUrl`；processing 禁用删除；并发删除按钮禁用防重复；删除节点前校验仍存在。

---

## 2. 试穿记录 — `STryonHistory.astro`（前缀 `am-tryh-`）

历史试穿列表 + 大图详情 + 删除。试穿结果本应入历史（现有流程不存，这里独立从服务端拉）。

**端点**：`GET /api/tryons`（`{tryons:[{tryon_id,figure_id,cloth_ids,result_image_url,status}]}`）、`GET /api/tryons/{id}`（详情 `result_image_url`/`result_image_uri`）、`DELETE /api/tryons/{id}`。
> ⚠️ 详情大图字段是 `result_image_url`（不是别处 `/tryons/{id}/image` 的 `image_url`），取值顺序 `result_image_url → result_image_uri`。

**UI 状态**：未登录 / 加载 / 空 / 列表成功（缩略图+状态+cloth 数）/ 缩略图缺失占位 / 详情大图 overlay / 详情错误 / 删除二次确认+进行中 / 列表错误+重试。

**子任务**
- [ ] 列表卡片网格（仿 `SAccount` grid），缩略图 `resolveAssetUrl(result_image_url)` + `onerror`。
- [ ] 大图 overlay（仿 `SAbout` 的 `backdrop + is-open + role=dialog + Esc 关闭 + 焦点恢复`）。
- [ ] `loadList()` 兼容 `{tryons}` / `{data:{tryons}}` / `{data:[]}` / 顶层数组。
- [ ] `openDetail()` / `deleteTryon()`（删的是正在看的则关 overlay）。
- [ ] cloth 数 `Array.isArray(cloth_ids)?…:0`；过滤无 `tryon_id` 脏数据。
- [ ] 每条记录加「反馈」入口 → `dispatchEvent('am:open-feedback', {targetType:'tryon', targetId:tryon_id})`。

---

## 3. 推荐记录 — `SStyleRecords.astro`（前缀 `am-styles-`）

从服务端拉历史 AI 推荐（区别于现有 localStorage 历史）。

**端点**：`GET /api/styles`（`{styles:[{style_id,occasion,recommendations,created_at}]}`）、`GET /api/styles/{id}`（`{recommended_items:[{cloth_id,score,reason}],preview_image_url}`）、`DELETE /api/styles/{id}`。

**UI 状态**：未登录 / 列表加载/空/错误+重试 / 列表成功（occasion + 时间 + 数量）/ 详情未选/加载/成功（单品 cloth_id+score%+reason + 预览图）/ 详情无图 / 删除中/成功（重置详情）/删除失败。

**子任务**
- [ ] 双栏（列表 `am-styles-list` + 详情 `am-styles-focus`，仿 `SCTA`），mq(tablet) 折叠单列。
- [ ] `loadList()` → `renderList()`（`formatDate(created_at)` 用 `Intl.DateTimeFormat`，无效值兜底）。
- [ ] `loadDetail()`：`score` 转百分比 `(score*100).toFixed(0)+'%'`，缺失显示 `—`；`preview_image_url` 经 `resolveAssetUrl` + `onerror` 隐藏。
- [ ] `deleteRecord()`：删的是当前详情则重置为未选态。
- [ ] 每条加「反馈」入口 → `am:open-feedback` `{targetType:'style', targetId:style_id}`。

---

## 4. 反馈 — `SFeedback.astro`（前缀 `am-fb-`）

可复用的评分(1–5)+评论小弹窗，由试穿/推荐页通过事件打开。

**端点**：默认**方案1** `POST /api/histories/{history_id}/feedback`（body `{rating,comment,context}`）；保留**方案2** 开关 `POST /api/feedback`（body `{target_type,target_id,rating,comment}`）。
> ⚠️ 文档自承此模块为推断设计、路由未定 → 路由模板与字段名都用常量集中定义，便于后端定稿后微调；默认方案1。

**UI 状态**：未登录禁用 / 默认（星未选+空评论）/ 校验失败（rating 必填）/ 提交中（禁用只读）/ 成功（提示+派发事件+延时关闭）/ 失败（显示后端 message，可重试）/ 未收到事件时默认 hidden。

**子任务**
- [ ] 弹窗结构仿 `SAbout` 的 `am-ai-overlay`（backdrop + dialog + Esc/backdrop 关闭）。
- [ ] 顶部常量：`FEEDBACK_MODE='history'`、`HISTORY_FEEDBACK_PATH=(id)=>\`${API_BASE_URL}/histories/${id}/feedback\``、`STANDALONE_FEEDBACK_PATH=\`${API_BASE_URL}/feedback\``。
- [ ] 监听 `am:open-feedback`（取 `{targetType,targetId,context}`，校验 `targetId` 后 `open()`，重置星/评论/状态，回显目标用 `escapeHtml`）。
- [ ] 星级：点击 + 键盘（←→ / Enter/Space），`aria-checked` 同步。
- [ ] `submit()`：无 token 拦截 → `rating<1` 校验 → 按 `FEEDBACK_MODE` 组 body → `apiFetch(POST)` → 成功派发 `am:feedback-submitted` 并延时关闭；失败可重试。

**边界**：`targetType` 非 history 但默认方案1 → 自动降级方案2 或提示切换；`comment` 设 `maxlength`；提交中忽略关闭。

---

## 5. Admin / Debug 配置页 — `SAdmin.astro`（前缀 `am-admin-`，可选/低优先级）

运行时配置编辑 + 后端健康监控，隐藏入口。

**端点**：`GET /api/config`（`{recommendation:{default_top_k,score_threshold,relaxed_score_threshold}, ai:{tryon_model,multimodal_model}}`）、`PUT /api/config`（body **仅** `{recommendation:{...}}`，`ai` 只读不发）、`GET /api/health`（`{status,mongo,redis,minio,ai_backend}`）。
> ⚠️ `/api/config`、`/api/health` 多为**裸 JSON**（无 `{success,data}` 包裹）——`apiFetch` 已兼容（有 `success` 才解包）。

**入口门控**：`location.hash==='#admin'` 或 `localStorage['auramirror.admin.enabled']==='1'` 才显示；监听 `hashchange` 动态显隐。

**UI 状态**：入口隐藏 / 未登录禁用 / config 加载中·成功（回填，ai 只读）·失败 / 校验失败（`score∈[0,1]`、`top_k` 正整数）/ 保存中·成功·失败 / health 空闲（灰）·检查中（脉冲）·成功（绿/红灯+时间）·失败。

**子任务**
- [ ] 覆盖层结构仿 `SAccount`（fixed + 关闭按钮 + card 网格）。
- [ ] config 表单（3 个可编辑 number + 2 个只读 ai）、`loadConfig()` / `saveConfig()`（PUT 仅发 recommendation，提交前本地校验、判空）。
- [ ] health 卡片：固定顺序 `[status,mongo,redis,minio,ai_backend]`，每服务一盏灯 `data-state=ok/down/unknown`，值经 `escapeHtml`。
- [ ] 按钮请求中 `disabled`，`finally` 恢复。

**边界**：401/403 提示权限不足；缺失服务键当 down；`relaxed ≤ score_threshold` 软提示。

---

## 验收清单（每页 PR 自检）

- [ ] 未登录 / 空 / 加载 / 成功 / 错误 各态都有界面。
- [ ] 所有 `innerHTML` 经 `escapeHtml`；URL 经 `encodeURIComponent`。
- [ ] 仅新增文件 + `index.astro` 两处连续行；`git diff` 不含 `index.js`/`config.js`/`state.js`。
- [ ] DOM `id`/`class` 全部用本页前缀，无与现有 `am-*` 冲突。
- [ ] `npm run dev` 跑通，控制台无报错。
