const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const mediaDir = path.resolve(process.env.MEDIA_DIR || path.join(rootDir, "media"));
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8080);

const videoExtensions = new Set([".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v", ".mkv"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp"]);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".mp4", "video/mp4"],
  [".m4v", "video/mp4"],
  [".webm", "video/webm"],
  [".ogg", "video/ogg"],
  [".ogv", "video/ogg"],
  [".mov", "video/quicktime"],
  [".mkv", "video/x-matroska"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".bmp", "image/bmp"]
]);

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text)
  });
  response.end(text);
}

function isInside(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function getMediaType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (videoExtensions.has(extension)) return "video";
  if (imageExtensions.has(extension)) return "image";
  return null;
}

function encodeMediaPath(relativePath) {
  return relativePath
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function listMediaFiles(currentDir = mediaDir) {
  const entries = await fsp.readdir(currentDir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      items.push(...await listMediaFiles(fullPath));
      continue;
    }

    if (!entry.isFile()) continue;

    const type = getMediaType(fullPath);
    if (!type) continue;

    const stats = await fsp.stat(fullPath);
    const relativePath = path.relative(mediaDir, fullPath);
    const extension = path.extname(fullPath).toLowerCase();

    items.push({
      id: relativePath.replaceAll(path.sep, "/"),
      name: path.basename(fullPath, extension),
      fileName: path.basename(fullPath),
      folder: path.dirname(relativePath) === "." ? "" : path.dirname(relativePath).replaceAll(path.sep, "/"),
      type,
      extension: extension.slice(1),
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      url: `/media/${encodeMediaPath(relativePath)}`
    });
  }

  return items.sort((first, second) =>
    first.folder.localeCompare(second.folder, "pt-BR") ||
    first.name.localeCompare(second.name, "pt-BR")
  );
}

function resolvePublicPath(pathname) {
  const cleanPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const targetPath = path.resolve(publicDir, `.${cleanPath}`);

  if (!isInside(publicDir, targetPath)) return null;
  return targetPath;
}

function resolveMediaPath(pathname) {
  const rawRelative = pathname.replace(/^\/media\//, "");
  const decodedParts = rawRelative.split("/").map((part) => decodeURIComponent(part));
  const targetPath = path.resolve(mediaDir, ...decodedParts);

  if (!isInside(mediaDir, targetPath)) return null;
  return targetPath;
}

async function streamFile(request, response, filePath) {
  let stats;
  try {
    stats = await fsp.stat(filePath);
  } catch {
    sendText(response, 404, "Arquivo nao encontrado.");
    return;
  }

  if (!stats.isFile()) {
    sendText(response, 404, "Arquivo nao encontrado.");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(extension) || "application/octet-stream";
  const range = request.headers.range;

  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
      response.writeHead(416, { "Content-Range": `bytes */${stats.size}` });
      response.end();
      return;
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stats.size - 1;

    if (start >= stats.size || end >= stats.size || start > end) {
      response.writeHead(416, { "Content-Range": `bytes */${stats.size}` });
      response.end();
      return;
    }

    response.writeHead(206, {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      "Content-Length": end - start + 1,
      "Cache-Control": "public, max-age=3600"
    });

    fs.createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Length": stats.size,
    "Cache-Control": "public, max-age=3600"
  });

  fs.createReadStream(filePath).pipe(response);
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (url.pathname === "/api/media") {
      await fsp.mkdir(mediaDir, { recursive: true });
      const media = await listMediaFiles();
      sendJson(response, 200, {
        media,
        count: media.length,
        mediaDir
      });
      return;
    }

    if (url.pathname.startsWith("/media/")) {
      const mediaPath = resolveMediaPath(url.pathname);
      if (!mediaPath) {
        sendText(response, 403, "Caminho invalido.");
        return;
      }

      await streamFile(request, response, mediaPath);
      return;
    }

    const publicPath = resolvePublicPath(url.pathname);
    if (!publicPath) {
      sendText(response, 403, "Caminho invalido.");
      return;
    }

    await streamFile(request, response, publicPath);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: "Erro interno no servidor.",
      detail: error.message
    });
  }
}

const server = http.createServer(handleRequest);

server.listen(port, host, () => {
  console.log(`MirrorOS Loop Player rodando em http://${host}:${port}`);
  console.log(`Pasta de midias: ${mediaDir}`);
});
