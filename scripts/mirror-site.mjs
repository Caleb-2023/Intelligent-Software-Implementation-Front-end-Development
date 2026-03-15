import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ORIGIN = "https://wodniack.dev";
const OUTPUT_ROOT = process.cwd();

const queue = ["/"];
const seen = new Set();
const written = [];

const textLikeExtensions = new Set([
  ".css",
  ".html",
  ".ico",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
  ".xml"
]);

function isTextLike(contentType, pathname) {
  return (
    /^text\//i.test(contentType) ||
    /javascript|json|svg|xml/i.test(contentType) ||
    textLikeExtensions.has(path.extname(pathname).toLowerCase())
  );
}

function toFetchPath(candidate, currentUrl) {
  if (!candidate) {
    return null;
  }

  const trimmed = candidate.trim().replace(/^['"]|['"]$/g, "");

  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("javascript:")
  ) {
    return null;
  }

  if (!/^(?:https?:\/\/|\/|\.{1,2}\/)/i.test(trimmed)) {
    return null;
  }

  let url;

  try {
    url = new URL(trimmed, currentUrl);
  } catch {
    return null;
  }

  if (url.origin !== ORIGIN) {
    return null;
  }

  const pathname = url.pathname;
  const hasExtension = path.extname(pathname) !== "";

  if (pathname !== "/" && !pathname.endsWith("/") && !hasExtension) {
    return null;
  }

  return `${url.pathname}${url.search}`;
}

function extractRefs(content, currentPath) {
  const currentUrl = new URL(currentPath, ORIGIN);
  const refs = new Set();
  const push = (value) => {
    const nextPath = toFetchPath(value, currentUrl);

    if (nextPath) {
      refs.add(nextPath);
    }
  };

  for (const match of content.matchAll(
    /\b(?:href|src|poster|content)=["']([^"']+)["']/gi
  )) {
    push(match[1]);
  }

  for (const match of content.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
    for (const part of match[1].split(",")) {
      push(part.trim().split(/\s+/)[0]);
    }
  }

  for (const match of content.matchAll(/url\(([^)]+)\)/gi)) {
    push(match[1]);
  }

  for (const match of content.matchAll(
    /new URL\((['"])(.+?)\1\s*,\s*import\.meta\.url\)/g
  )) {
    push(match[2]);
  }

  for (const match of content.matchAll(/sourceMappingURL=([^\s]+)/g)) {
    push(match[1]);
  }

  for (const match of content.matchAll(
    /(?:import|export)\s+(?:[^"']+?\s+from\s+)?(['"])(.+?)\1/g
  )) {
    push(match[2]);
  }

  for (const match of content.matchAll(/import\((['"])(.+?)\1\)/g)) {
    push(match[2]);
  }

  for (const match of content.matchAll(
    /(['"])(\/[^"'?#]+\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|mjs|mp4|png|svg|webm|webp|woff|woff2|xml))(?:\?[^"'#]*)?\1/gi
  )) {
    push(match[2]);
  }

  for (const match of content.matchAll(
    /(['"])(?:\.{1,2}\/[^"'?#]+\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|mjs|mp4|png|svg|webm|webp|woff|woff2|xml))(?:\?[^"'#]*)?\1/gi
  )) {
    push(match[0].slice(1, -1));
  }

  return [...refs];
}

function toLocalFile(targetPath) {
  const url = new URL(targetPath, ORIGIN);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === "/") {
    pathname = "/index.html";
  } else if (pathname.endsWith("/")) {
    pathname = `${pathname}index.html`;
  }

  return path.join(OUTPUT_ROOT, pathname.slice(1));
}

async function fetchAndWrite(targetPath) {
  const url = new URL(targetPath, ORIGIN);
  const response = await fetch(url, {
    headers: {
      "user-agent": "codex-site-mirror/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const localFile = toLocalFile(targetPath);
  const contentType = response.headers.get("content-type") ?? "";

  await mkdir(path.dirname(localFile), { recursive: true });
  await writeFile(localFile, buffer);
  written.push(localFile);

  if (!isTextLike(contentType, url.pathname)) {
    return [];
  }

  return extractRefs(buffer.toString("utf8"), targetPath);
}

while (queue.length > 0) {
  const nextPath = queue.shift();

  if (!nextPath || seen.has(nextPath)) {
    continue;
  }

  seen.add(nextPath);
  const discovered = await fetchAndWrite(nextPath);

  for (const ref of discovered) {
    if (!seen.has(ref)) {
      queue.push(ref);
    }
  }
}

written.sort();

console.log(`Mirrored ${written.length} files from ${ORIGIN}`);
for (const file of written) {
  console.log(path.relative(OUTPUT_ROOT, file));
}
