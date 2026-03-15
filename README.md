# wodniack.dev 本地镜像与拆解

这个目录现在保存的是 `https://wodniack.dev` 当前公开发布版本的本地镜像，不是作者原始 Astro 源码仓库。

可确认的信息：

- 站点是 `Astro v4.15.9` 构建产物。
- 页面是单页作品集，核心区块为 `Hero / About / Work / My Way / CTA / Footer`。
- 运行层以 `GSAP 3.12.5 + ScrollTrigger` 为核心，叠加若干手写的自定义元素和 `requestAnimationFrame` 动画循环。
- 公开构建产物里没有 sourcemap，因此无法直接还原作者原始 `.astro` 组件源码结构。

## 目录说明

- `index.html`
  发布后的完整页面结构。
- `_astro/index.MJ9FiCyD.css`
  所有样式合并后的产物，包含布局、字体变量、响应式规则、动效状态样式。
- `_astro/hoisted.BvNyQ0G_.js`
  主要运行时代码。这里能看到第三方库、初始化逻辑、自定义元素和各区块动画。
- `_astro/*.mp4`
  `Work` 区域的视频作品素材。
- `_astro/*.webp`
  `My Way` 区域的图片素材。
- `fonts/`
  自定义字体：`PPEditorialNew`、`PPFraktionMono`、`Bigger-Display`。
- `images/`、`icons/`
  站点图标、装饰资源、二维码与分享图。
- `scripts/mirror-site.mjs`
  我为这次学习场景补的镜像脚本，可重新抓取线上公开资源。
- `scripts/serve-static.mjs`
  本地静态预览服务。

## 如何本地查看

执行：

```bash
npm run serve
```

默认地址：

```text
http://127.0.0.1:4173
```

如果你想重新同步线上公开构建产物：

```bash
npm run mirror
```

## 你应该先读哪里

### 1. 先看页面骨架

从 `index.html` 开始。重点观察：

- 顶部结构：`.site-head`
- 首屏：`.s-hero`
- 关于：`#about`
- 作品区：`#work`
- 个人实验区：`.s-my-way`
- 联系区：`.s-cta`
- 入场遮罩：`.site-intro`
- 自定义滚动条：`.site-scrollbar`

这个页面大量使用了“语义结构 + JS class hook”双命名方式，例如：

- 结构类：`.s-hero`, `.s-work`, `.site-head`
- 行为类：`.js-word`, `.js-video`, `.js-grid`, `.js-thumb`

这是非常典型的“视觉结构和脚本挂载分离”的前端写法。

### 2. 再看样式系统

从 `_astro/index.MJ9FiCyD.css` 里按这些关键词检索：

- `.site-head`
- `.s-hero`
- `.s-about`
- `.s-work`
- `.s-my-way`
- `.s-cta`
- `.site-scrollbar`
- `--color-`
- `--font-family-`

你会看到几个明显特征：

- 版式靠大量 `border`、网格线、路径和几何块构成。
- 字体对比非常强：展示字体、衬线、等宽体分工明确。
- 动画不是只靠 `transform`，还大量结合 `clip-path`、SVG path、CSS 自定义属性。
- 同一个组件通常同时有 `desktop` 和 `mobile` 两套节奏。

### 3. 最后看运行时代码

`_astro/hoisted.BvNyQ0G_.js` 是理解效果实现的关键。

最值得读的部分：

- `a-separator`
  分隔条里的二进制字符闪烁效果。
- `a-waves`
  Hero 顶部波纹线条，基于 SVG path + 噪声场 + 鼠标扰动。
- `a-work`
  Work 区作品单元，靠自定义属性控制视频进出视口时的播放/暂停。
- `Work` 区大场景逻辑
  使用 `GSAP ScrollTrigger` 驱动蒙版、标题幽灵字、点阵 canvas、视频序列出现。
- `My Way` 区逻辑
  用抛物运动和拖拽交互管理 3D 透视对象。
- `CTA` 区逻辑
  用网格点阵波动做按钮 hover 冲击波。

## 这站的实现思路

不是“堆很多库”，而是三层配合：

- 静态层：Astro 输出稳定 HTML。
- 样式层：CSS 负责大部分视觉秩序、排版、遮罩和状态变量。
- 动画层：JS 只接管真正需要动态计算的部分，比如路径、点阵、速度、滚动进度、拖拽和视频状态。

更具体一点：

- 规则性强的效果交给 CSS
  例如边框、网格、排版、悬停状态、响应式切换。
- 时间驱动和滚动驱动交给 GSAP / ScrollTrigger
  例如首屏进场、作品区滚动编排、CTA 波动节奏。
- 需要逐帧计算的效果自己写
  例如波纹线条、点阵移动、拖拽物体、路径重绘。

## 建议的学习顺序

1. 先把 `index.html` 整体扫一遍，弄清楚每个 section 的 DOM 结构。
2. 再回到 `_astro/index.MJ9FiCyD.css`，按 section 名称逐段看样式。
3. 然后读 `_astro/hoisted.BvNyQ0G_.js` 的后半段。
4. 优先理解 `a-waves`、`Work`、`My Way`、`CTA` 四块。
5. 最后再回头看全局事件流，例如 resize、scroll、tick、intersect。

## 这份镜像的边界

我已经把公开可获取的发布资源完整镜像到了当前目录，并验证了首页、主脚本和作品视频可以通过本地静态服务返回 `200 OK`。

但要明确：

- 这里是“线上发布版代码”，不是作者原始项目源码。
- 你能完整研究效果怎么运行，但不能直接看到作者当时如何拆 Astro 组件、如何命名源码文件、如何组织构建配置。
- 如果作者未来更新线上站点，运行 `npm run mirror` 会得到新的公开发布版。
