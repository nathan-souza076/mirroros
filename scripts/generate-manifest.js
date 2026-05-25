const fsp = require("node:fs/promises");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const mediaDir = path.resolve(process.env.MEDIA_DIR || path.join(rootDir, "media"));
const outputPath = path.resolve(process.env.MANIFEST_PATH || path.join(rootDir, "public", "manifest.json"));
const scriptOutputPath = path.join(path.dirname(outputPath), "media-manifest.js");
const baseUrl = (process.env.MEDIA_BASE_URL || "/media").replace(/\/$/, "");

const videoExtensions = new Set([".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v", ".mkv"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp"]);

function getMediaType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (videoExtensions.has(extension)) return "video";
  if (imageExtensions.has(extension)) return "image";
  return null;
}

function toUrlPath(relativePath) {
  return relativePath
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function listMediaFiles(currentDir = mediaDir) {
  let entries;

  try {
    entries = await fsp.readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

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
    const folder = path.dirname(relativePath) === "." ? "" : path.dirname(relativePath).replaceAll(path.sep, "/");
    const urlPath = toUrlPath(relativePath);

    items.push({
      id: relativePath.replaceAll(path.sep, "/"),
      name: path.basename(fullPath, extension),
      fileName: path.basename(fullPath),
      folder,
      type,
      extension: extension.slice(1),
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      url: `${baseUrl}/${urlPath}`
    });
  }

  return items.sort((first, second) =>
    first.folder.localeCompare(second.folder, "pt-BR") ||
    first.name.localeCompare(second.name, "pt-BR")
  );
}

async function main() {
  const media = await listMediaFiles();
  const manifest = {
    generatedAt: new Date().toISOString(),
    media
  };

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fsp.writeFile(
    scriptOutputPath,
    `var MIRROROS_MANIFEST = ${JSON.stringify(manifest, null, 2)};\nwindow.MIRROROS_MANIFEST = MIRROROS_MANIFEST;\n`
  );

  console.log(`Manifest gerado em ${outputPath}`);
  console.log(`Manifest JS gerado em ${scriptOutputPath}`);
  console.log(`${media.length} midia(s) encontrada(s) em ${mediaDir}`);
  console.log(`Base URL: ${baseUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
