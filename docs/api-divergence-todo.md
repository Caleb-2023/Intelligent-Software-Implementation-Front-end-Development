# AuraMirror 前端 ⟷ 技术文档 接口偏差任务清单

> 来源：对比《技术文档提取的接口.docx》与前端 `src/auramirror`（`config.js` + `index.js`）的实际实现。
> 方法：按 API 模块并行比对 + 逐条对抗式核验，确认 **77 条偏差**，剔除 3 条误报（登出、authUser 存储、本地账户库——均不构成真实偏差）。

> **关键前提（先做这一步）**：前端明显是对着一个"真实在跑、返回 `{success, data}` 外壳 + Mongo `_id`/`mail` 风格"的后端写的；而技术文档描述的是"扁平对象 + `user_id`/`cloth_id` 风格"的契约，且文档**自己声明部分子路径是"按功能模块推断设计"的**。因此每条契约类偏差，要先与后端确认**以哪份为准**，再决定改前端还是改文档/后端。下面按"若后端按文档实现会发生什么"来定优先级。

---

## P0 · 阻断性契约不一致（按文档实现则核心流程直接报错）

- [ ] **统一响应外壳**：前端在 登录/注册/figure上传/tryon创建/ai-recommend 五处都用 `if(!json.success)` + 读 `json.data`；文档全是无 `success/data` 的扁平对象 → 任一核心流程都会误判失败。先定外壳，再统一适配。`index.js:845 / 786 / 2385 / 2478`
- [ ] **Auth 字段名对齐**：前端请求发 `mail`/`name`，文档要 `email`/`username`；前端读 `data.user._id/name/mail/date_create`，文档返回扁平 `user_id/username/token`。`requestLogin index.js:842` / `requestRegister index.js:875`
- [ ] **任务轮询结果结构对齐**（影响头像/试穿/推荐全部异步流程）：
  - 前端读嵌套 `data.result.{outfits|image_url|avatar_url|tryon_image_url}`，文档为扁平 `result_type/result_uri/result_url`（无 `result` 子对象、无这些键）。`index.js:802, 2404, 2501`
  - 状态枚举：前端只认 `completed`/`failed`，文档是 `pending/processing/completed`（无 `failed`）→ 失败永远等到 6 分钟超时。`index.js:2421`
  - 错误字段：前端读 `data.error`，文档是 `error_code`；前端还读了文档没有的 `elapsed_seconds`，并把数字 `progress` 当字符串拼接。
- [ ] **ai-recommend 请求体对齐**：`weather` 前端发字符串 `"city 25°C sunny"`，文档要对象 `{temperature,condition}`；缺 `selected_cloth_ids`（用户选的衣物根本没上送）、`top_k`、`need_visual_preview`、`style_preference`；多发空串 `style`/`gender`。`index.js:760-778`
- [ ] **cloths 列表结构对齐**：前端只认 `_id`+嵌套 `attributes{color,material,season,occasion}`，文档是 `cloth_id`+扁平 `tags/color/season`+`indexed`。**后果**：若后端按文档返回，`filter(item=>item._id)` 会丢光全部服装并回退 demo 数据。`normalizeCloth index.js:192`，`过滤 2758`
- [ ] **推荐结果结构对齐**：前端读 `outfits[].{name,description,items[{source,item_id,score}],image_url}`，文档是 `recommended_items[{cloth_id,score,reason}]`+`preview_image_url`。`index.js:802-827`
- [ ] **tryon 图片字段对齐**：前端读 `image_url`，文档全程是 `result_image_url`/`result_image_uri`。`index.js:2355`

## P1 · 路径与流程不一致

- [ ] **figure 上传路径**：前端 `POST /api/figures`，文档 `POST /api/figures/upload`。`config.js:24`
- [ ] **头像生成流程**：前端把"上传+生成"合并成一次 `POST /api/figures` 并直接取 `task_id`；文档是两步——`upload`（返回 figure_id，无 task）→ `POST /api/figures/{id}/generate-avatar`（返回 task_id，请求体 `{prompt,style}`）。前端**从不调用 generate-avatar**。`renderAvatar index.js:2466-2498`
- [ ] **服装上传路径**：前端用 `POST /api/cloths/smart-upload`（文档完全没有此端点），文档是 `POST /api/cloths/upload`。需对齐路径与"AI 自动识别"是单步还是 upload→recognize-tags 两步。`smartUploadCloth index.js:2685`
- [ ] **tryon 取图路径**：前端 `GET /api/tryons/{id}/image`（文档无 `/image` 子路径），文档是 `GET /api/tryons/{tryon_id}`。`fetchTryOnImageUrl index.js:2341`
- [ ] 上传缺字段：figure/cloth 上传 FormData 只带 `file`，文档要求 `name/description`、`name/category/tags`。

## P2 · 安全与存储（违反文档第 23 行明确约束）

- [ ] **JWT 存进 localStorage**（文档明确禁止）→ XSS 可直接窃取。改用更安全的存储/会话策略。`config.js:12` / `setStoredAuth index.js:62`
- [ ] **生成图 data URL/URI 写入 localStorage 历史**（文档明确禁止"生成图 URI 入 localStorage"）。`getPreviewImageSource index.js:545` / `saveHistoryEntries 1169`
- [ ] **刷新不校验 token**：纯信任 localStorage 恢复会话，过期/失效 token 不会被发现（与缺失的 `GET /api/auth/me` 是同一问题）。`index.js:3161`

## P3 · 文档要求但前端完全缺失的能力（功能缺口）

- [ ] **Histories 整模块缺失**（最大缺口）：历史完全走 localStorage，从不调用 `/api/histories`（列表/详情/创建/删除）；**试穿历史从不被记录**（只记 recommendation）；本地上限 30 条、不跨设备、清缓存即丢。`readHistoryEntries index.js:1159`
- [ ] **Feedback 完全缺失**：无评分/评论 UI、无 `POST /api/histories/{id}/feedback` 提交（文档此项为推断设计，需先与后端定路由/字段）。
- [ ] **Figures 只读能力缺失**：`GET /api/figures`（列表）、`GET /api/figures/{id}`、`DELETE` 全无 → 已有 avatar 不会被加载展示。
- [ ] **Cloths CRUD 缺失**：`POST /api/cloths`(JSON 新增)、`GET /api/cloths/{id}`、`PUT`、`DELETE` 全无 → 衣橱无编辑/删除。
- [ ] **Styles 记录缺失**：`GET /api/styles`(列表)、`GET /api/styles/{id}`、`DELETE` 全无。
- [ ] **Tryons 记录缺失**：`GET /api/tryons`(列表)、`GET /api/tryons/{id}`(正确详情)、`DELETE` 全无。
- [ ] **Tasks 列表缺失**：只用了单任务轮询，缺 `GET /api/tasks`（Dashboard 需要）。
- [ ] **`GET /api/auth/me` 缺失**（见 P2）。
- [ ] **Index 向量索引模块缺失**：`/api/index/garments` 4 个接口全无；忽略 cloth 的 `indexed`/`indexed_at` 状态，无法提示"某衣物未建索引/不可被推荐"。
- [ ] *(可选/文档自标 admin)* `GET/PUT /api/config`、`GET /api/health` 未实现——属预期，可暂不做。

## P4 · 前端文档外行为与健壮性（需收敛或说明）

- [ ] **本地推荐兜底**（`createLocalRecommendation`）：远程失败时**静默回退**本地结果，UI 不区分真假 AI → 需明确提示或移除。`index.js:1850-1862`
- [ ] **本地 canvas 试穿兜底**（`renderLocalTryOn`）：远程失败回退本地绘制，非真实 AI 结果 → 已有 demo 文案，确认是否保留。`index.js:2244`
- [ ] **天气/定位绕过后端**：浏览器直连 open-meteo + geolocation，后端无法校验天气来源；与"weather 应结构化随 ai-recommend 上送"冲突。`config.js:8-9`
- [ ] **轮询健壮性**：硬编码 3s×120≈6 分钟，与头像 UI"2 分钟"文案矛盾；`if(!resp.ok) continue` 把 401/404 静默吞掉，直到 6 分钟超时才报错（不快速失败）。`pollTaskStatus index.js:2408-2428`
- [ ] **死代码清理**：`uploadClothImage` + `/api/uploads/cloth-image` 已无调用方，且既不符文档也不符现网，建议删除。`index.js:2654`

## ✅ 已确认一致（无需改）

- `API_BASE_URL = '/api'` 与文档基路径及 nginx/vite 代理方案一致。`config.js:6`

---

## 最值得先拍板的三件事

1. 后端真实响应是 `{success,data}` 外壳还是文档的扁平对象；
2. 任务结果是嵌套 `result.*` 还是扁平 `result_url`；
3. 头像生成是"一步"还是文档的"upload→generate-avatar 两步"。

这三点定了，P0/P1 绝大多数任务的改法就确定了。
