# NoriDroid.Homepage

NoriDroid 的项目官网，独立于 NoriDroid 代码仓库维护（原因见「为什么不放进 NoriDroid 仓库」）。纯静态页面（HTML + CSS + 原生 JS）：没有构建步骤、没有 npm 依赖，访客浏览时只会额外请求一次 GitHub API（读最新版本号），不加载任何第三方 CDN。

## 设计：「下潜」

- **整页是一根海水柱。** 从「海面」（浅色，取 Nori 的白裙、墨黑手套与发带、发梢的薄荷色）一路下潜到「无光层」（App 数据海的深蓝配色），最后到海底。每个区块标着深度（0 m → 10,994 m），宽屏左侧有一支深度计。
- **背景的「海」移植自 App** 的 `datasea-bg.ts` / `datasea-touch.ts`：温跃层以上画上浮的气泡，以下变成星尘与光斑；按住空白处，粒子按 App 的手感（350 ms 渐入、0.18/s 趋近、400 ms 渐出）慢慢聚拢。
- **台词都来自 App 源码**（NoriDroid 仓库 `app/android/web-src/src/` 下）：摸头台词取自 `services/live2d/petSpeech.ts`，示意手机里的主动搭话取自 `services/ambient.ts`，首屏那句「若记忆终将散落，请在呼唤中重新认识我一次。」取自 App 的设置页。
- **冷归档（世界观）** 参考了社区的《Nori.Web ARG 全面分析报告》。注意：[Nori.Web](https://github.com/MF-Dust/Nori.Web)（MF-Dust）是对《I_Nori》原作 ARG 的**社区还原项目**，不是原作本身。这一节默认折叠、带剧透警告，并注明是同人解读、不代表官方设定。

## 目录

```text
NoriDroid.Homepage/
├─ index.html
├─ 404.html                自包含（GitHub Pages 会在任意路径下返回它）
├─ favicon-32.png · favicon-64.png · apple-touch-icon.png
├─ .nojekyll
├─ assets/
│  ├─ css/style.css
│  ├─ js/main.js
│  ├─ fonts/               Outfit（拉丁字形）+ 霞鹜文楷子集（只含台词用字）+ 两份 OFL 许可
│  └─ img/                 立绘、模型预览、Logo、OG 分享图
└─ tools/subset-voice-font.py   重新生成霞鹜文楷子集（部署时可以不带）
```

## 本地预览

```bash
# 在本目录下
python -m http.server 8000
# 打开 http://localhost:8000/
```

直接双击 `index.html` 也能看，但部分浏览器在 `file://` 下不会加载字体。

## 部署

本目录就是网站根目录，任何静态托管都可以直接发布：

- **GitHub Pages · 独立仓库**：把本目录建成一个仓库并推送，然后在仓库 Settings → Pages 里选择 `main` 分支根目录。地址会是 `https://furret2333.github.io/<仓库名>/`。

  ```bash
  git init
  git add -A
  git commit -m "NoriDroid 官网"
  git branch -M main
  git remote add origin https://github.com/furret2333/<仓库名>.git
  git push -u origin main
  ```

  当前官网使用自定义域名 `https://inori.mom/`。仓库根目录的 `CNAME` 文件已经配置为 `inori.mom`；启用 Pages 后，还需要在域名 DNS 中添加 GitHub Pages 的记录。

- **GitHub Pages · 挂在 NoriDroid 仓库的 `gh-pages` 分支**：在上面那一步的基础上，把本目录推到 NoriDroid 仓库的 `gh-pages` 分支，再在 NoriDroid 仓库的 Settings → Pages 里选择它。地址是 `https://furret2333.github.io/NoriDroid/`（与 `index.html` 里现在写的一致）。`sync-public.mjs` 只推 `main`，不会碰这个分支。

  ```bash
  git push https://github.com/furret2333/NoriDroid.git main:gh-pages
  ```

- **Cloudflare Pages / Netlify / Vercel**：构建命令留空，输出目录为仓库根目录。

部署地址确定后，把 `index.html` 里的 `canonical`、`og:url`、`og:image` 改成实际地址（分享图必须是绝对地址）。`404.html` 会自己探测站点根路径（`/<仓库名>/` 或 `/`），不用改。

## 为什么不放进 NoriDroid 仓库

NoriDroid 公开仓库的内容由私有仓库通过 `scripts/sync-public.mjs` **全量导出覆盖**，而它的根级白名单只有 `.github` / `app` / `scripts`：放进公开仓库会在下次同步时被覆盖，放进私有仓库也会在导出时被丢弃。所以官网单独维护。

如果以后想把它并回 NoriDroid 仓库，需要在私有仓库里把它的目录名加进 `ROOT_KEEP_DIRS`。本目录里没有本机路径、密钥或日志，能通过 `sync-public.mjs` 的隐私扫描。

## 发新版本时

页面会请求 GitHub API（`releases/latest`），自动显示最新的版本号、大小、日期、APK 下载链接和 SHA-256（会话内缓存 1 小时）。请求失败时（例如 API 限流：未登录每个 IP 每小时 60 次）显示页面里写死的值，所以发版后建议同步更新这些静态值：搜索 `data-release`，涉及 `v2.0.0`、`5.4 MB`、`2026-10-03`、APK 链接与 SHA-256。

## 字体

| 字体 | 用途 | 大小 | 许可 |
|---|---|---:|---|
| Outfit | 字标、数字、拉丁标签 | 32 KB | SIL OFL 1.1 |
| 霞鹜文楷 LXGW WenKai（子集） | Nori 的台词：`class="voice"` 的元素，以及 `main.js` 里 `@voice-start … @voice-end` 之间的字符串 | 约 48 KB | SIL OFL 1.1（作者附加许可允许为网页分发而子集化 / 转 WOFF2） |

改了台词以后重新生成子集：

```bash
pip install fonttools brotli
python tools/subset-voice-font.py <LXGWWenKai-Regular.ttf 的路径>
```

源字体从 <https://github.com/lxgw/LxgwWenKai/releases> 下载。没来得及重新生成也没关系：缺的字会退回系统楷体，不会显示成方块。

## 素材来源

- `assets/img/nori-reach-*.webp`：NoriDroid 仓库里 `app/android/web-src/public/images/cg-touch-her.webp` 的裁切与缩放
- `assets/img/model-*.webp`：App 内置模型清单（ARGNori / Nori）的预览图（`app/android/web-src/src/assets/images/live2D/`）
- 图标：内联在 `index.html` 顶部的 SVG sprite 里。前六枚取自 App 底栏（NoriDroid 仓库的 `app/android/web-src/public/icons/dock-*.svg`），描边改成 `currentColor`，以便在浅色和深色水层都能用；记忆、语音、夜间、数据海、隐私几枚按同一风格补画
- Logo、favicon：App 启动图标；`assets/img/og.jpg` 由页面同款样式渲染

角色形象与美术素材版权归原作者所有，页脚已注明。正式公开前，请再确认一次素材授权没有问题。

## 交互

- 摸摸 Nori 的头（点击，或在头顶来回划过）：台词来自 App，LOAD 会像报告里那张表一样超过 1.00。
- 按住空白处：搅动数据海。
- 冷归档：点「使用 QFR-9000 恢复档案」展开（含剧透）。
- 系统开启「减弱动态效果」时，动画与粒子会停下；不开 JavaScript 时，全部内容照常可读。
