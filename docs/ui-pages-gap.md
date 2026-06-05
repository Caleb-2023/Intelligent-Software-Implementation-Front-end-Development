# AuraMirror 前端页面/界面缺口清单（对照技术文档第五章）

> 对比《技术文档提取的接口.docx》第五章"前端页面与接口对应关系"（8 个页面）与前端实际已实现的 UI 组件。
> 实际 UI 组件：`SHero`(认证) / `SAccount`(Dashboard) / `SAbout`(Avatar+衣橱+AI造型+试穿) / `SWork`(VIBE 3D) / `SCTA`(历史)。
> 本清单只盘点**页面/界面层面的缺口**；接口字段级偏差见 [api-divergence-todo.md](./api-divergence-todo.md)。

---

## 一、页面覆盖总表

| # | 文档要求页面 | 现状 | 对应组件 | 结论 |
|---|---|---|---|---|
| 1 | 登录 / 注册 | ✅ 已做 | `SHero` 认证弹窗 | 基本完成（缺刷新态校验 `auth/me`） |
| 2 | Avatar Studio | 🟡 部分 | `SAbout` Avatar 区 | 缺"我的形象库"列表/选择/删除 |
| 3 | Wardrobe 衣橱 | 🟡 部分 | `SAbout` 衣橱弹窗 | 缺新增表单/编辑/删除/详情/索引状态 |
| 4 | AI Stylist 推荐 | 🟡 部分 | `SAbout` AI 弹窗 | 功能在，缺反馈、服务端推荐详情 |
| 5 | Try-On Preview | 🟡 部分 | `SAbout` 预览台 | 缺试穿记录列表/详情，结果不入历史 |
| 6 | Dashboard | 🟡 部分 | `SAccount` 控制台 | UI 在，数据全是本地，无真实聚合 |
| 7 | History 历史 | 🟡 部分 | `SCTA` 历史区 | 纯 localStorage，无服务端历史 |
| 8 | Admin / Debug（可选） | ❌ 未做 | — | 完全没有界面 |
| 额外 | VIBE 3D 展示 | ⚠️ 示例占位 | `SWork` | 18 张渐变占位卡，未接真实数据 |

---

## 二、完全没做出来的界面（需新建）

- [ ] **Admin / Debug 配置页**（文档 J/K，可选）：`GET/PUT /api/config`、`GET /api/health` 无任何界面。普通用户端可不做，但若要"配置 top_k / 模型 / 健康监控"则缺整页。
- [ ] **反馈（Feedback）界面**：文档 H 模块要求对推荐/试穿打分+评论（`rating`/`comment`）。前端无任何评分/评论 UI 与提交入口。
- [ ] **"我的形象库"（Figure 列表）界面**：文档 Avatar Studio 需 `GET /api/figures` 展示用户已生成的多个 avatar/figure，并支持选择/删除（`DELETE /api/figures/{id}`）。现在只能"上传一张→生成一个"，没有历史形象的展示、切换、删除界面。
- [ ] **试穿记录（Try-on History）界面**：文档 Try-On Preview / Dashboard 需 `GET /api/tryons` 列表 + `GET /api/tryons/{id}` 详情 + 删除。现在试穿结果**从不被记录**，没有任何试穿历史列表/详情界面。
- [ ] **服务端推荐记录（Styles）列表/详情界面**：文档 `GET /api/styles` + `GET /api/styles/{id}`。现在"历史"只读 localStorage，没有从后端拉取的推荐记录列表与详情界面。

## 三、做了但不完整的界面（需补齐）

- [ ] **VIBE 3D 展示页（`SWork`）接真实数据**：当前是 18 张 `Wardrobe Item N` 渐变占位卡（纯视觉示例）。需明确定位——要么接入真实衣橱/形象做成 3D 展廊，要么保留为纯视觉并标注"非功能区"。
- [ ] **衣橱页补全管理能力（`SAbout` 衣橱弹窗）**：现仅支持"选择 + 智能上传"。文档要求衣橱页还需：
  - 新增服装表单（`POST /api/cloths` JSON）
  - 编辑服装（`PUT /api/cloths/{id}`）
  - 删除服装（`DELETE /api/cloths/{id}`，卡片现无删除按钮）
  - 单件详情（`GET /api/cloths/{id}`）
  - 索引状态展示（`indexed` / `GET /api/index/garments/{id}/status`，提示"是否可被推荐召回"）
- [ ] **Dashboard 接真实聚合（`SAccount`）**：UI 完整，但"Saved Looks / Weather / Selection / Latest Recommendation"等全部读本地 `state`/localStorage。文档要求 Dashboard 聚合 `GET /api/histories`、`/api/styles`、`/api/tryons`、`/api/tasks` 的服务端数据。
- [ ] **History 页接服务端（`SCTA`）**：现纯 localStorage（上限 30 条、不跨设备）。文档要求 `GET /api/histories`（含 `?type=recommendation/tryon` 过滤）、`GET /api/histories/{id}` 单条详情、`DELETE /api/histories/{id}` 单条删除（现仅有"全清"按钮）。
- [ ] **Avatar Studio 两步流程界面（`SAbout`）**：现"上传+生成"合并为一个按钮。文档为两步——先上传（`POST /api/figures/upload`）再生成（`POST /api/figures/{id}/generate-avatar`）；若按文档，需要"上传完成→选择/确认→再点生成"的中间态界面。
- [ ] **登录态恢复校验（`SHero`/全局）**：刷新后纯信任 localStorage，缺 `GET /api/auth/me` 的"恢复并校验用户"流程，过期 token 不会被界面感知。

---

## 四、按你当前设计的对照说明

- **Generate Virtual Avatar（生成虚拟形象）** → 已做（`SAbout` Avatar 区），但缺"历史形象库"与两步生成中间态。
- **Try On Preview（试穿展示）** → 已做（`SAbout` 预览台），但试穿结果不入历史、缺试穿记录列表/详情页。
- **Vibe 3D（示例照片）** → 目前是**示例占位**（`SWork` 的 18 张渐变卡），尚未接真实数据，需明确定位与是否接入衣橱/形象数据。

## 五、优先级建议

1. **先补"记录类"页面**（最影响完整体验）：试穿记录列表/详情、服务端历史、Dashboard 真实聚合。
2. **再补"管理类"能力**：形象库（figure 列表/删除）、衣橱编辑/删除/新增。
3. **再补"增强类"**：反馈打分、VIBE 3D 接真实数据、登录态校验。
4. **最后（可选）**：Admin/Debug 配置与健康监控页。
