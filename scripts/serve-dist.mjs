/**
 * Minimal static server for browser QA.
 * Author: gurvinny
 *
 * `vite preview` cannot be used here: the Cloudflare plugin turns the build
 * into a Worker (dist/wrangler.json) and preview then tries to boot workerd,
 * which never becomes ready on a CI runner. Serving the built assets directly
 * is what a visitor effectively gets from Workers static assets.
 *
 * Navigation requests fall back to index.html; asset requests deliberately do
 * NOT. Rewriting a missing hashed chunk into a 200 text/html is precisely how
 * the orb failure once hid itself -- the browser refuses to execute HTML as a
 * module and the dynamic import throws. A missing asset must stay a 404.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.argv[2] ?? "dist");
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

async function readIfFile(path) {
  // One syscall, not stat-then-read. The two-step version was a TOCTOU race
  // (CodeQL js/file-system-race) and was redundant anyway: readFile throws
  // EISDIR on a directory and ENOENT on a missing path, which is exactly the
  // distinction the stat call was making.
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  // normalize + a root prefix check keeps ../ traversal out.
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let path = join(ROOT, rel);
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (rel.endsWith("/")) path = join(path, "index.html");

  let body = await readIfFile(path);

  if (!body) {
    const wantsHtml = (req.headers.accept ?? "").includes("text/html");
    if (wantsHtml && !extname(rel)) {
      body = await readIfFile(join(ROOT, "index.html"));
    }
    if (!body) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    path = join(ROOT, "index.html");
  }

  res.writeHead(200, {
    "content-type": TYPES[extname(path)] ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`);
});
