import { createReadStream, accessSync, constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
/** Astro UI 已置于本仓库 astro-app/，构建产物为 astro-app/dist */
const SOC_DIST = path.join(PACKAGE_ROOT, "astro-app", "dist");

function resolveStaticRoot() {
  if (process.env.STATIC_ROOT && String(process.env.STATIC_ROOT).trim() !== "") {
    const raw = process.env.STATIC_ROOT.trim();
    return path.isAbsolute(raw) ? raw : path.resolve(PACKAGE_ROOT, raw);
  }
  if (process.env.SERVE_MIRROR_ONLY === "1" || process.env.SERVE_MIRROR_ONLY === "true") {
    return PACKAGE_ROOT;
  }
  const socIndex = path.join(SOC_DIST, "index.html");
  try {
    accessSync(socIndex, fsConstants.R_OK);
    return SOC_DIST;
  } catch {
    console.error(
      `[serve-static] 未找到 Astro 构建：${socIndex}\n` +
        `[serve-static] 请先执行：npm run build:soc\n` +
        `[serve-static] 若仍要提供本仓库镜像静态页，请使用：SERVE_MIRROR_ONLY=1 npm run serve`
    );
    process.exit(1);
  }
}

const ROOT = resolveStaticRoot();
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const API_PROXY_TARGET = process.env.API_PROXY || "http://127.0.0.1:3000";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"]
]);

function resolvePath(urlPath) {
  const pathname = decodeURIComponent(new URL(urlPath, "http://localhost").pathname);
  const aliasedPath = pathname
    .replace(/^\/am-scripts\//, "/scripts/")
    .replace(/^\/am-styles\//, "/styles/");
  const basePath = aliasedPath === "/" ? "/index.html" : aliasedPath;
  const safePath = path.normalize(basePath).replace(/^(\.\.[/\\])+/, "");
  return path.join(ROOT, safePath);
}

function proxyToBackend(req, res) {
  const target = new URL(API_PROXY_TARGET);
  const options = {
    hostname: target.hostname,
    port: target.port || 80,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${target.hostname}:${target.port}` }
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", () => {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: false, message: `Backend unreachable at ${API_PROXY_TARGET}` }));
  });

  req.pipe(proxyReq);
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;

  if (pathname.startsWith("/api/")) {
    proxyToBackend(req, res);
    return;
  }

  try {
    let filePath = resolvePath(req.url || "/");

    try {
      const info = await stat(filePath);

      if (info.isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
    } catch {
      // Ignore and fall through to existence check below.
    }

    await access(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": contentTypes.get(ext) || "application/octet-stream"
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[serve-static] 端口 ${PORT} 已被占用（${HOST}）。\n` +
        `结束旧服务：lsof -iTCP:${PORT} -sTCP:LISTEN  记下 PID 后执行 kill <PID>\n` +
        `或换端口：PORT=4174 npm run serve`
    );
  } else {
    console.error("[serve-static]", err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Static server: http://${HOST}:${PORT}`);
  console.log(`Document root: ${ROOT}`);
  console.log(`API proxy: /api/* → ${API_PROXY_TARGET}`);
});
