const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const sourceMediaDir = path.join(rootDir, "media");
const publicDir = path.join(rootDir, "public");
const publicMediaDir = path.join(rootDir, "public", "media");
const docsDir = path.join(rootDir, "docs");

async function copyMedia() {
  await fsp.rm(publicMediaDir, { recursive: true, force: true });
  await fsp.mkdir(publicMediaDir, { recursive: true });

  try {
    await fsp.cp(sourceMediaDir, publicMediaDir, {
      recursive: true,
      filter: (source) => !path.basename(source).startsWith(".")
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function copyPublicToDocs() {
  await fsp.rm(docsDir, { recursive: true, force: true });
  await fsp.cp(publicDir, docsDir, { recursive: true });
  await fsp.writeFile(path.join(docsDir, ".nojekyll"), "");
}

function runManifestBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(rootDir, "scripts", "generate-manifest.js")], {
      cwd: rootDir,
      env: {
        ...process.env,
        MEDIA_BASE_URL: "media"
      },
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`generate-manifest saiu com codigo ${code}`));
    });

    child.on("error", reject);
  });
}

async function main() {
  await copyMedia();
  await runManifestBuild();
  await copyPublicToDocs();
  console.log(`Arquivos estaticos prontos em ${path.join(rootDir, "public")}`);
  console.log(`Pasta GitHub Pages pronta em ${docsDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
