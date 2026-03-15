import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"]
]);

function resolvePath(urlPath) {
  const pathname = decodeURIComponent(new URL(urlPath, "http://localhost").pathname);
  const basePath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(basePath).replace(/^(\.\.[/\\])+/, "");
  return path.join(ROOT, safePath);
}

const server = createServer(async (req, res) => {
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

server.listen(PORT, HOST, () => {
  console.log(`Static mirror available at http://${HOST}:${PORT}`);
});
