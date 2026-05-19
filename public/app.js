const state = {
  media: [],
  filter: "all",
  activeMedia: null,
  chromeTimer: null
};

const grid = document.querySelector("#mediaGrid");
const statusLine = document.querySelector("#statusLine");
const template = document.querySelector("#mediaCardTemplate");
const player = document.querySelector("#player");
const stage = document.querySelector("#stage");
const mediaKind = document.querySelector("#mediaKind");
const mediaTitle = document.querySelector("#mediaTitle");
const fullscreenButton = document.querySelector("#fullscreenButton");
const closeButton = document.querySelector("#closeButton");
const refreshButton = document.querySelector("#refreshButton");
const filterButtons = document.querySelectorAll("[data-filter]");

const icons = {
  video: `
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m15 10 5-3v10l-5-3v-4Z"/>
      <rect x="3" y="6" width="12" height="12" rx="2"/>
    </svg>
  `,
  image: `
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <path d="m8 13 2.5-2.5L16 16"/>
      <path d="m14 12 1.5-1.5L21 16"/>
      <circle cx="8" cy="9" r="1.2"/>
    </svg>
  `
};

function formatBytes(bytes) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getFilteredMedia() {
  if (state.filter === "all") return state.media;
  return state.media.filter((item) => item.type === state.filter);
}

function setStatus(text) {
  statusLine.textContent = text;
}

function renderMedia() {
  const media = getFilteredMedia();
  grid.replaceChildren();

  if (!media.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <strong>Nenhuma midia encontrada</strong>
      <span>Atualize o manifest.json ou coloque arquivos na pasta media local.</span>
    `;
    grid.append(empty);
    setStatus("0 arquivos disponiveis");
    return;
  }

  for (const item of media) {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.id = item.id;
    card.querySelector(".thumb-icon").innerHTML = icons[item.type];
    card.querySelector(".card-title").textContent = item.name;
    card.querySelector(".card-meta").textContent = [
      item.type === "video" ? "Video" : "Imagem",
      item.extension ? item.extension.toUpperCase() : "",
      formatBytes(item.size),
      item.folder
    ].filter(Boolean).join(" / ");
    card.addEventListener("click", () => openPlayer(item));
    grid.append(card);
  }

  setStatus(`${media.length} arquivo${media.length === 1 ? "" : "s"} disponive${media.length === 1 ? "l" : "is"}`);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function normalizeManifest(payload) {
  const media = Array.isArray(payload) ? payload : payload.media;
  if (!Array.isArray(media)) return [];

  return media
    .filter((item) => item && item.url && (item.type === "video" || item.type === "image"))
    .map((item, index) => {
      const urlPath = item.url.split("?")[0].split("#")[0];
      const extension = item.extension || urlPath.split(".").pop() || "";
      const fileName = item.fileName || decodeURIComponent(urlPath.split("/").pop() || `midia-${index + 1}`);
      const name = item.name || fileName.replace(/\.[^.]+$/, "");

      return {
        id: item.id || item.url,
        name,
        fileName,
        folder: item.folder || "",
        type: item.type,
        extension,
        size: item.size || 0,
        updatedAt: item.updatedAt || "",
        url: item.url
      };
    });
}

async function loadMedia() {
  setStatus("Carregando midias...");
  refreshButton.disabled = true;

  try {
    let payload;

    try {
      payload = await fetchJson("manifest.json");
      state.media = normalizeManifest(payload);
    } catch {
      payload = await fetchJson("/api/media");
      state.media = normalizeManifest(payload);
    }

    renderMedia();
    openFromQuery();
  } catch (error) {
    console.error(error);
    setStatus("Nao foi possivel carregar a lista.");
    grid.replaceChildren();
  } finally {
    refreshButton.disabled = false;
  }
}

function showChromeBriefly() {
  player.classList.add("show-chrome");
  window.clearTimeout(state.chromeTimer);
  state.chromeTimer = window.setTimeout(() => {
    player.classList.remove("show-chrome");
  }, 2400);
}

function requestFullscreen() {
  const target = player;
  if (document.fullscreenElement) return Promise.resolve();
  if (target.requestFullscreen) return target.requestFullscreen().catch(() => {});
  return Promise.resolve();
}

function openPlayer(item) {
  state.activeMedia = item;
  stage.replaceChildren();
  mediaKind.textContent = item.type === "video" ? "Video em loop" : "Imagem em tela cheia";
  mediaTitle.textContent = item.name;

  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = item.url;
    video.loop = true;
    video.autoplay = true;
    video.controls = false;
    video.playsInline = true;
    video.preload = "auto";
    video.muted = false;
    video.addEventListener("canplay", () => {
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }, { once: true });
    stage.append(video);
  } else {
    const image = document.createElement("img");
    image.src = item.url;
    image.alt = item.name;
    stage.append(image);
  }

  player.classList.add("is-open");
  player.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  showChromeBriefly();
  requestFullscreen();

  const params = new URLSearchParams(window.location.search);
  params.set("play", item.id);
  history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

function closePlayer() {
  stage.replaceChildren();
  state.activeMedia = null;
  player.classList.remove("is-open", "show-chrome");
  player.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  history.replaceState(null, "", window.location.pathname);
}

function openFromQuery() {
  if (state.activeMedia) return;

  const params = new URLSearchParams(window.location.search);
  const targetId = params.get("play");
  if (!targetId) return;

  const item = state.media.find((media) => media.id === targetId);
  if (item) openPlayer(item);
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    renderMedia();
  });
});

refreshButton.addEventListener("click", loadMedia);
fullscreenButton.addEventListener("click", requestFullscreen);
closeButton.addEventListener("click", closePlayer);

player.addEventListener("mousemove", showChromeBriefly);
player.addEventListener("click", (event) => {
  if (event.target === player || event.target === stage) showChromeBriefly();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.activeMedia) {
    closePlayer();
    return;
  }

  if (event.key.toLowerCase() === "f" && state.activeMedia) {
    requestFullscreen();
  }
});

loadMedia();
