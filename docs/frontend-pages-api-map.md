# AuraMirror 前端页面与后端接口功能对照

> 基于《技术文档提取的接口.pdf》和当前前端代码整理。
> 当前代码入口为 `src/pages/index.astro`，主要交互逻辑在 `src/auramirror/index.js`，新增记录页分别在 `src/components/SFigureLibrary.astro`、`STryonHistory.astro`、`SStyleRecords.astro`、`SFeedback.astro`。

## 1. 后端功能总览

技术文档给出的业务后端统一暴露在 `/api` 下，前端主要需要对接这些模块：

| 模块 | 文档中的能力 | 当前前端是否已有界面 |
|---|---|---|
| Auth | 注册、登录、恢复当前用户 | 已有登录/注册弹窗，已做 `GET /api/auth/me` 恢复校验 |
| Figures | 上传用户原图、生成 Avatar、列表、详情、删除 | Avatar Studio + Figure Library 已覆盖 |
| Cloths | 衣橱列表、上传服装、新增、详情、编辑、删除 | Wardrobe 弹窗已覆盖，并支持智能上传扩展 |
| Styles | AI 穿搭推荐、推荐记录列表、详情、删除 | AI Stylist + Recommendation Records 已覆盖 |
| Tryons | 创建试穿任务、试穿记录列表、详情、删除 | Try-On Preview + Try-On History 已覆盖 |
| Tasks | 异步任务状态轮询、任务列表 | Avatar/推荐/试穿会轮询单任务，Dashboard 会聚合任务列表 |
| Histories | 推荐/试穿交互历史列表、详情、创建、删除、反馈 | Saved Styling Runs 已接服务端，推荐结果会创建历史 |
| Feedback | 评分、评论、上下文反馈 | Feedback 弹窗已做，当前从 Style/Tryon 入口触发 |
| Index | 服装向量索引、批量索引、删除索引、索引状态 | Wardrobe 已做单件索引和状态展示，批量/删除索引未暴露 |
| Config / Health | 运行时配置、健康检查 | 当前普通用户前端未做 Admin/Debug 页面 |

所有 AI 长任务都按文档的异步模式处理：

1. 前端提交请求。
2. 后端返回 `task_id`。
3. 前端轮询 `GET /api/tasks/{task_id}`。
4. 任务完成后读取 `result_url` / `result` 字段并更新界面。

## 2. 当前页面结构总览

当前项目是单页应用体验，`src/pages/index.astro` 依次挂载这些页面/区块：

| 页面/区块 | 组件 | 用户入口 | 主要作用 |
|---|---|---|---|
| 首屏 + 登录注册 | `SHero` | 点击 `Let's Go` | 登录、注册、进入 Dashboard |
| Dashboard | `SAccount` | 登录后点击 `Dashboard` | 查看个人状态、服务端聚合、快速跳转 |
| Avatar Studio | `SAbout` 上半部分 | 页面向下滚动或 Dashboard 快捷入口 | 上传 portrait、生成 Avatar |
| Wardrobe 衣橱弹窗 | `SAbout` 的 `Module 02 Wardrobe` | 点击 Wardrobe 卡片 | 管理衣橱、选择衣物、上传/编辑/删除/索引 |
| AI Stylist 弹窗 | `SAbout` 的 `Module 03 AI Stylist` | 点击 AI Stylist 卡片或衣橱内按钮 | 根据场景/天气/衣橱生成穿搭推荐 |
| Try-On Preview | `SAbout` 预览台 | Avatar + Wardrobe 选择后生成 | 展示 Avatar/试穿图/推荐摘要 |
| VIBE 3D 展示页 | `SWork` | 页面滚动进入 | 3D 视觉展示衣橱数据或 demo 数据 |
| Figure Library | `SFigureLibrary` | 页面滚动进入 | 查看/选择/删除已有 figure/avatar |
| Try-On History | `STryonHistory` | 页面滚动进入 | 查看、详情、删除、反馈试穿记录 |
| Recommendation Records | `SStyleRecords` | 页面滚动进入 | 查看、详情、删除、反馈推荐记录 |
| Saved Styling Runs | `SCTA` | 页面底部 History 区 | 查看历史推荐/试穿记录、筛选、详情、删除 |
| Feedback 弹窗 | `SFeedback` | 从记录页点击 Feedback | 给 style/tryon/history 提交评分和评论 |

## 3. 首屏与登录注册

**对应组件**：`src/components/SHero.astro`  
**对应逻辑**：`bindAuthOverlay()`、`requestLogin()`、`requestRegister()`、`restoreAuthenticatedSession()`

### 用户可以点击/操作什么

| 操作 | 界面行为 | 对应接口 |
|---|---|---|
| 点击 `Let's Go` | 打开认证弹窗 | 无接口 |
| 切换 `Sign In` / `Register` | 切换登录与注册表单 | 无接口 |
| 提交登录表单 | 保存 token 和用户信息，关闭弹窗，加载衣橱/历史/Dashboard 数据 | `POST /api/auth/login` |
| 提交注册表单 | 创建账号；若返回 token，直接进入登录态 | `POST /api/auth/register` |
| 刷新页面后恢复登录态 | 读取已有 token，向后端校验当前用户 | `GET /api/auth/me` |
| 点击 `Sign Out` | 清空本地 token/user，恢复 demo 衣橱 | 前端本地处理，文档中登出为可选接口 |

### 当前状态

- 已实现登录、注册、token 保存、用户信息展示。
- 已实现刷新后用 `GET /api/auth/me` 校验 token，过期后会清空会话。
- token 当前仍存储在 `localStorage`，文档提醒不建议把 JWT 放入 localStorage，这属于安全策略层面的后续优化。

## 4. Dashboard 控制台

**对应组件**：`src/components/SAccount.astro`  
**对应逻辑**：`loadDashboardAggregate()`、`updateAccountDashboard()`、`bindAccountDashboard()`

### 用户可以点击/操作什么

| 操作 | 界面行为 | 对应接口 |
|---|---|---|
| 登录后点击 `Dashboard` | 打开全屏控制台，显示 Profile、System Pulse、Quick Launch、Session Snapshot、Latest Recommendation | `GET /api/histories`、`GET /api/styles`、`GET /api/tryons`、`GET /api/tasks` |
| 点击 `Avatar Studio` | 关闭 Dashboard 并滚动到 Avatar Studio | 无接口 |
| 点击 `Open Wardrobe` | 跳转到 Avatar/System Modules 区，并打开 Wardrobe 弹窗 | 间接触发 `GET /api/cloths` |
| 点击 `AI Stylist` | 跳转并打开 AI Stylist 弹窗 | 间接触发天气上下文加载 |
| 点击 `View History` | 跳转到 Saved Styling Runs 历史区 | 可间接触发 `GET /api/histories` |
| 点击 `Sign Out` | 退出登录并恢复本地 demo 状态 | 前端本地处理 |
| 点击 `Close` | 关闭 Dashboard | 无接口 |

### Dashboard 显示的信息

- Profile：用户名、邮箱、会员时间、当前会话模式。
- System Pulse：Avatar、Wardrobe、Preview、Saved Looks 状态。
- Session Snapshot：天气、当前选中衣物数量、服务端同步状态、远程记录数量。
- Next Move：根据当前 Avatar/衣橱状态给下一步提示。
- Latest Recommendation：优先显示服务端最新 style，其次显示本地最近推荐。

## 5. Avatar Studio

**对应组件**：`src/components/SAbout.astro`  
**对应逻辑**：`bindAvatarStudio()`、`uploadFigureSource()`、`renderAvatar()`、`pollTaskStatus()`

### 用户可以点击/操作什么

| 操作 | 界面行为 | 对应接口 |
|---|---|---|
| 点击 `Choose File` | 选择本地 portrait 图片，只在前端预览/记录文件状态 | 无接口 |
| 点击 `Upload Portrait` | 上传用户原图，拿到 `figure_id`，进入“已上传待生成”状态 | `POST /api/figures/upload` |
| 点击 `Generate Virtual Avatar` | 基于 `figure_id` 创建生成任务，轮询直到完成，并把 Avatar 渲染到 canvas | `POST /api/figures/{figure_id}/generate-avatar` + `GET /api/tasks/{task_id}` |

### 当前状态

- 已按文档拆成两步：先上传，再生成。
- 生成成功后会派发 `am:avatar-ready`，Try-On Preview 会使用生成后的 Avatar。
- 没登录时会提示先登录，不会调用上传/生成接口。

## 6. Wardrobe 衣橱弹窗

**对应组件**：`src/components/SAbout.astro` 的 `am-styling-overlay`  
**对应逻辑**：`bindModuleEntryPlaceholder()`、`loadWardrobeCatalog()`、`renderWardrobeGrid()`、`saveClothRecord()`、`deleteClothRecord()`、`submitClothIndex()`

### 用户可以点击/操作什么

| 操作 | 界面行为 | 对应接口 |
|---|---|---|
| 点击 `Module 02 Wardrobe` | 打开衣橱弹窗，加载衣橱列表 | `GET /api/cloths` |
| 点击 `Refresh Wardrobe` | 强制重新拉取衣橱，并刷新索引状态 | `GET /api/cloths` + 多次 `GET /api/index/garments/{cloth_id}/status` |
| 点击衣物卡片空白处 | 选中/取消选中衣物，最多 4 件 | 无接口 |
| 点击 `Upload Cloth` | 选择服装图片并上传，上传后刷新衣橱 | 优先 `POST /api/cloths/smart-upload`，失败后回退 `POST /api/cloths/upload` |
| 填写表单后点击 `Save Garment` | 没有 hidden clothId 时创建新服装，有 clothId 时编辑服装 | `POST /api/cloths` 或 `PUT /api/cloths/{cloth_id}` |
| 点击 `New Record` | 清空表单，进入新增状态 | 无接口 |
| 点击卡片 `Detail` | 拉取并展示单件服装详情，包括索引状态说明 | `GET /api/cloths/{cloth_id}` |
| 点击卡片 `Edit` | 把该服装数据填入表单，便于修改后保存 | `GET /api/cloths/{cloth_id}` |
| 点击卡片 `Index` | 提交单件服装向量索引任务，并刷新索引状态 | `POST /api/index/garments/{cloth_id}` + `GET /api/index/garments/{cloth_id}/status` |
| 点击卡片 `Delete` | 二次确认后删除服装并刷新列表 | `DELETE /api/cloths/{cloth_id}` |
| 点击 `Apply To Preview` | 将当前选中服装应用到试穿预览 | 登录且有 Avatar 时走 `POST /api/tryons` + `GET /api/tasks/{task_id}`；失败或无远程结果时本地 canvas 兜底 |
| 点击 `AI Stylist` | 关闭/切换到 AI Stylist 弹窗 | 间接触发 AI Stylist 逻辑 |

### 当前状态

- 已覆盖文档要求的衣橱 CRUD、上传、详情、删除、索引状态。
- `POST /api/cloths/smart-upload` 是当前前端的增强路径，技术文档没有明确列出；如果后端不支持，会回退到文档中的 `POST /api/cloths/upload`。
- 文档中的 `POST /api/index/garments/batch` 和 `DELETE /api/index/garments/{cloth_id}` 当前未在界面暴露。

## 7. Try-On Preview 预览台

**对应组件**：`src/components/SAbout.astro` 的 `am-preview-stage`  
**对应逻辑**：`handleTryOnRequest()`、`requestRemoteTryOn()`、`renderRemoteTryOnToCanvas()`、`renderLocalTryOn()`

### 用户可以点击/操作什么

Try-On Preview 本身不是弹窗按钮区，而是一个持续显示的结果区域：

| 触发来源 | 界面行为 | 对应接口 |
|---|---|---|
| Avatar 生成成功 | Avatar canvas 被复制到 Try-On Preview 初始画面 | 无接口 |
| Wardrobe 中点击 `Apply To Preview` | 远程生成试穿图，成功后显示后端返回图片 | `POST /api/tryons` + `GET /api/tasks/{task_id}` |
| 远程 try-on 返回 `tryon_id` 但没有图片 URL | 尝试额外取图 | 当前代码扩展为 `GET /api/tryons/{tryon_id}/image` |
| 远程失败或无 token | 使用本地 canvas 叠加衣物色块生成 demo 预览 | 无接口 |
| AI Stylist 生成推荐 | 在预览台下方展示推荐摘要卡片 | 取决于 AI Stylist 模式 |

### 当前状态

- 已能跑通“Avatar + 选中衣物 + 试穿预览”的交互。
- 文档中的标准详情接口是 `GET /api/tryons/{tryon_id}`；当前额外的 `/image` 子路径是前端兼容扩展，后端如果没有该接口也不影响主流程。

## 8. AI Stylist 推荐弹窗

**对应组件**：`src/components/SAbout.astro` 的 `am-ai-overlay`  
**对应逻辑**：`bindAiStylistOverlay()`、`handleAiRecommendationRequest()`、`requestRemoteRecommendation()`、`persistCurrentRecommendation()`

### 用户可以点击/操作什么

| 操作 | 界面行为 | 对应接口 |
|---|---|---|
| 点击 `Module 03 AI Stylist` | 打开 AI Stylist 弹窗，加载天气/位置上下文 | 浏览器 Geolocation + Open-Meteo 外部接口 |
| 修改 `Occasion` | 更新推荐场景，如 office/casual/travel/formal/sport | 无接口 |
| 修改 `Recommendation Mode` | 在 `Local` 和 `API` 推荐模式间切换 | 无接口 |
| 点击 `AI Recommend`，模式为 `Local` | 用本地规则生成推荐文案和视觉摘要 | 无接口 |
| 点击 `AI Recommend`，模式为 `API` | 提交 AI 推荐任务并轮询结果 | `POST /api/styles/ai-recommend` + `GET /api/tasks/{task_id}` |
| 推荐完成后 | 渲染推荐结果、更新 Try-On Preview 摘要，并保存历史 | 登录时 `POST /api/histories`；无 token 时写入 localStorage |

### 当前提交给 `/api/styles/ai-recommend` 的核心字段

- `figure_id`
- `occasion`
- `weather.temperature`
- `weather.condition`
- `weather.city`
- `weather.humidity`
- `style_preference`
- `selected_cloth_ids`
- `top_k`
- `need_visual_preview`

### 当前状态

- 已支持本地推荐和远程 API 推荐双模式。
- 远程推荐失败时会回退到本地推荐，并在状态文案中说明。
- 推荐完成会尽量写入服务端历史，服务端不可用时回退 localStorage。

## 9. VIBE 3D 展示页

**对应组件**：`src/components/SWork.astro`  
**对应逻辑**：监听 `am:wardrobe-updated`，执行 `applyWardrobeData()`

### 用户可以点击/操作什么

VIBE 区不是管理页，没有表单或按钮。用户主要通过滚动进入 3D 视觉展示：

| 触发来源 | 界面行为 | 对应接口 |
|---|---|---|
| Wardrobe 加载完成 | VIBE 卡片标题和渐变色根据当前衣橱数据更新 | 间接来自 `GET /api/cloths` |
| 无远程衣橱或未登录 | 显示 demo wardrobe gallery | 无接口 |
| 没有任何衣橱数据 | 显示 `Non-functional visual gallery / awaiting wardrobe data` | 无接口 |

### 当前状态

- 已不再只是固定 18 张 `Wardrobe Item N` 静态占位；会接收衣橱数据更新卡片。
- 它仍是视觉展示区，不提供衣物详情、编辑、删除等操作；这些操作在 Wardrobe 弹窗内完成。

## 10. Figure Library 形象库

**对应组件**：`src/components/SFigureLibrary.astro`

### 用户可以点击/操作什么

| 操作 | 界面行为 | 对应接口 |
|---|---|---|
| 页面加载或点击 `Refresh` | 拉取当前用户所有 figures/avatar | `GET /api/figures` |
| 点击 `Use` | 将某个 figure 标记为当前选中，并派发 `am:figure-selected` | 无接口 |
| 点击 `Details` | 在右侧详情面板展示 source photo 和 generated avatar | `GET /api/figures/{figure_id}` |
| 点击 `Delete` | 进入二次确认状态 | 无接口 |
| 点击 `Confirm` | 删除该 figure；如果删除的是当前选中项，会取消选中 | `DELETE /api/figures/{figure_id}` |
| 记录状态是 pending/processing | 自动或延迟刷新，必要时轮询任务 | `GET /api/tasks/{task_id}` 或 `GET /api/figures/{figure_id}` |

### 当前状态

- 未登录时显示登录提示，不调用接口。
- 支持图片加载失败占位。
- 当前只广播 `am:figure-selected`，主 Avatar Studio 是否同步切换为该 figure 还需要后续按产品需求继续串联。

## 11. Try-On History 试穿记录

**对应组件**：`src/components/STryonHistory.astro`

### 用户可以点击/操作什么

| 操作 | 界面行为 | 对应接口 |
|---|---|---|
| 页面加载或点击 `Refresh` | 拉取当前用户 try-on 记录 | `GET /api/tryons` |
| 点击卡片图片或 `View` | 打开详情 overlay，显示试穿大图、figure id、衣物数量、tryon id | `GET /api/tryons/{tryon_id}` |
| 点击 `Feedback` / `Leave Feedback` | 打开反馈弹窗 | 由 `SFeedback` 后续提交 |
| 点击 `Delete` | 进入二次确认 | 无接口 |
| 点击 `Confirm` | 删除该 try-on 记录，刷新列表 | `DELETE /api/tryons/{tryon_id}` |
| 点击 overlay `Close` 或按 `Esc` | 关闭详情弹窗 | 无接口 |

### 当前状态

- 已覆盖文档要求的 try-on 列表、详情、删除。
- 反馈入口已接入，但实际提交路由见本文第 14 节。

## 12. Recommendation Records 推荐记录

**对应组件**：`src/components/SStyleRecords.astro`

### 用户可以点击/操作什么

| 操作 | 界面行为 | 对应接口 |
|---|---|---|
| 页面加载或点击 `Refresh` | 拉取服务端推荐记录列表 | `GET /api/styles` |
| 点击 `View` | 右侧展示推荐详情，包括推荐单品、score、reason、预览图 | `GET /api/styles/{style_id}` |
| 点击 `Feedback` / `Leave Feedback` | 打开反馈弹窗 | 由 `SFeedback` 后续提交 |
| 点击 `Delete` | 进入二次确认 | 无接口 |
| 点击 `Confirm` | 删除服务端推荐记录 | `DELETE /api/styles/{style_id}` |

### 当前状态

- 已覆盖文档要求的 styles 列表、详情、删除。
- 详情里按 `recommended_items` 和 `preview_image_url` 渲染，贴合 PDF 中的推荐详情结构。

## 13. Saved Styling Runs 历史页

**对应组件**：`src/components/SCTA.astro`  
**对应逻辑**：`bindRecommendationHistory()`、`loadRemoteHistoryEntries()`、`loadHistoryDetail()`、`deleteHistoryEntry()`

### 用户可以点击/操作什么

| 操作 | 界面行为 | 对应接口 |
|---|---|---|
| 页面加载 | 优先尝试加载服务端历史；失败或无 token 时使用 localStorage | `GET /api/histories` |
| 修改 `Type` 筛选 | 按 all/recommendation/tryon 过滤历史 | `GET /api/histories?type=recommendation` 或 `?type=tryon` |
| 点击 `Refresh` | 强制重新拉取服务端历史 | `GET /api/histories` |
| hover/focus 历史卡片 | 右侧 Focus Detail 显示摘要 | 无接口 |
| 点击卡片或 `Detail` | 若当前是服务端模式，拉取单条详情 | `GET /api/histories/{history_id}` |
| 点击 `Delete` | 删除单条历史；服务端模式调用接口，本地模式删 localStorage | `DELETE /api/histories/{history_id}` |
| 点击 `Clear Local` | 只清空本地 localStorage 历史 | 无服务端接口 |

### 当前状态

- 已从“纯 localStorage”升级为优先服务端历史。
- 仍保留 localStorage fallback，便于无后端或无 token 时演示。
- 当前 History 区没有直接放 `Feedback` 按钮；反馈组件支持 history 目标，但入口主要来自 Try-On History 和 Recommendation Records。

## 14. Feedback 反馈弹窗

**对应组件**：`src/components/SFeedback.astro`

### 用户可以点击/操作什么

| 操作 | 界面行为 | 对应接口 |
|---|---|---|
| 从 Try-On History 点击 `Feedback` | 打开评分/评论弹窗，目标类型为 `tryon` | 提交时见下方说明 |
| 从 Recommendation Records 点击 `Feedback` | 打开评分/评论弹窗，目标类型为 `style` | 提交时见下方说明 |
| 点击 1-5 星 | 设置 rating，支持键盘方向键/Home/End | 无接口 |
| 输入 Comment | 填写最多 500 字评论 | 无接口 |
| 点击 `Submit Feedback` | 校验登录态和 rating 后提交 | 当前按目标类型决定提交路由 |
| 点击 `Close` 或按 `Esc` | 关闭弹窗 | 无接口 |

### 当前提交路由

- 当 `targetType === 'history'` 时：`POST /api/histories/{history_id}/feedback`。
- 当 `targetType` 是 `style` 或 `tryon` 时：`POST /api/feedback`。

### 需要注意

技术文档更推荐把反馈挂在历史链路下，即 `POST /api/histories/{history_id}/feedback`。当前前端为了支持 style/tryon 直接反馈，保留了独立 `/api/feedback` 路由。如果后端只实现文档推荐方案，需要把 style/tryon 的反馈入口改为先找到对应 history id，或统一改为历史反馈路由。

## 15. 当前未暴露的文档能力

这些接口在 PDF 中出现，但当前前端没有明确页面入口：

| 接口/能力 | 当前状态 | 建议 |
|---|---|---|
| `POST /api/index/garments/batch` | 未暴露 | 可在 Wardrobe 增加“Batch Index”按钮 |
| `DELETE /api/index/garments/{cloth_id}` | 未暴露 | 可在衣物详情里增加“Remove Index” |
| `POST /api/tasks/{task_id}/cancel` | 文档标为可选，未暴露 | 可不做，除非后端确认支持 |
| `GET /api/config` | 未暴露 | 属 Admin/Debug 页面 |
| `PUT /api/config` | 未暴露 | 属 Admin/Debug 页面 |
| `GET /api/health` | 未暴露 | 属 Admin/Debug 页面 |
| `GET /healthz`、`GET /metrics` | 文档说明通常不给普通前端 | 不建议放普通用户端 |
| `POST /api/cloths/{cloth_id}/recognize-tags` | 文档说是 AI backend 能力推断，REST 未明确 | 当前用 `/api/cloths/smart-upload` 承担类似能力 |

## 16. 按页面验收的快速清单

| 页面 | 可验收点 |
|---|---|
| 登录注册 | 登录/注册提交、错误提示、刷新后 `auth/me` 校验、退出登录 |
| Dashboard | 登录后打开、四类聚合数据数量、快捷跳转、退出 |
| Avatar Studio | 选图、上传、生成任务、轮询、canvas 显示、状态提示 |
| Wardrobe | 拉列表、选中、上传、创建、编辑、详情、索引、删除、刷新 |
| AI Stylist | 场景选择、本地推荐、API 推荐、任务轮询、推荐写历史 |
| Try-On Preview | Avatar 后可预览，选衣后远程/本地试穿，状态正确 |
| VIBE 3D | 衣橱更新后卡片名称/状态跟随变化，视觉滚动正常 |
| Figure Library | 列表、刷新、使用、详情、删除、processing 状态 |
| Try-On History | 列表、详情 overlay、反馈入口、删除 |
| Recommendation Records | 列表、详情、反馈入口、删除 |
| Saved Styling Runs | 服务端历史、类型筛选、单条详情、单条删除、本地清空 |
| Feedback | 星级评分、评论、提交、未登录禁用、成功/失败状态 |

