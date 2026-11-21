/**
 * Static files for the owner portal, served by the API so the app and `/api/v1` share one
 * origin and `SameSite=Strict` works without CORS.
 *
 * Any request under `/api/` is left to the API. Anything else is a file inside the built
 * portal; unknown extension-less paths fall back to `index.html` so a deep link loads the
 * app. Paths are resolved and then checked to stay inside the root.
 */
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

/** The portal's own policy; the API's `default-src 'none'` would block its bundle. */
const PORTAL_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

export interface StaticOptions {
  root: string;
  /** Answer unknown extension-less paths with index.html. */
  spa?: boolean;
}

export type StaticHandler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;

async function regularFile(path: string): Promise<string | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? path : null;
  } catch {
    return null;
  }
}

export function createStaticHandler(options: StaticOptions): StaticHandler {
  const root = resolve(options.root);
  const spa = options.spa ?? true;

  return async function serve(request, response): Promise<boolean> {
    const method = (request.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return false;

    const url = new URL(request.url ?? "/", "http://placeholder.invalid");
    if (url.pathname.startsWith("/api/")) return false;

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      pathname = "";
    }
    if (!pathname || pathname.includes("\0")) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("bad request");
      return true;
    }

    const candidate = resolve(root, `.${pathname}`);
    if (candidate !== root && !candidate.startsWith(root + sep)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return true;
    }

    let file = await regularFile(candidate);
    if (!file && existsSync(candidate)) {
      // A directory request such as `/` resolves to its index.html.
      file = await regularFile(join(candidate, "index.html"));
    }
    if (!file && spa && extname(pathname) === "") {
      file = await regularFile(join(root, "index.html"));
    }

    if (!file) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return true;
    }

    const extension = extname(file).toLowerCase();
    const isHtml = extension === ".html";
    const hashedAsset = pathname.startsWith("/assets/");
    const headers: Record<string, string> = {
      "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "cache-control": isHtml ? "no-store" : hashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    };
    if (isHtml) headers["content-security-policy"] = PORTAL_CSP;

    if (method === "HEAD") {
      const info = await stat(file);
      response.writeHead(200, { ...headers, "content-length": String(info.size) });
      response.end();
      return true;
    }

    const info = await stat(file);
    response.writeHead(200, { ...headers, "content-length": String(info.size) });
    await new Promise<void>((done) => {
      const stream = createReadStream(file);
      stream.on("error", () => {
        response.destroy();
        done();
      });
      response.on("close", done);
      stream.pipe(response);
    });
    return true;
  };
}
