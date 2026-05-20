const imageDurationMs = 8000;

const state = {
  media: [],
  filter: "all",
  activeMedia: null,
  activeIndex: -1,
  isPaused: false,
  chromeTimer: null,
  idleTimer: null,
  infoTimer: null,
  imageTimer: null,
  fitMode: localStorage.getItem("mirroros-fit-mode") || "contain"
};

const grid = document.querySelector("#mediaGrid");
const statusLine = document.querySelector("#statusLine");
const mediaCount = document.querySelector("#mediaCount");
const template = document.querySelector("#mediaCardTemplate");
const player = document.querySelector("#player");
const stage = document.querySelector("#stage");
const mediaKind = document.querySelector("#mediaKind");
const mediaTitle = document.querySelector("#mediaTitle");
const previousButton = document.querySelector("#previousButton");
const playPauseButton = document.querySelector("#playPauseButton");
const nextButton = document.querySelector("#nextButton");
const infoButton = document.querySelector("#infoButton");
const fitButton = document.querySelector("#fitButton");
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

function getPlaylist() {
  const filtered = getFilteredMedia();
  return filtered.length ? filtered : state.media;
}

function setStatus(text) {
  statusLine.textContent = text;
}

function updatePlayPauseUi() {
  player.classList.toggle("is-paused", state.isPaused);
  playPauseButton.setAttribute("aria-label", state.isPaused ? "Reproduzir" : "Pausar");
  playPauseButton.setAttribute("title", state.isPaused ? "Reproduzir" : "Pausar");
}

function clearImageTimer() {
  window.clearTimeout(state.imageTimer);
  state.imageTimer = null;
}

function scheduleImageAdvance() {
  clearImageTimer();
  if (state.isPaused || !state.activeMedia || state.activeMedia.type !== "image") return;
  if (getPlaylist().length <= 1) return;

  state.imageTimer = window.setTimeout(() => {
    goToNext();
  }, imageDurationMs);
}

function renderMedia() {
  const media = getFilteredMedia();
  grid.replaceChildren();
  mediaCount.textContent = state.media.length;

  if (!media.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <strong>Nenhuma midia encontrada</strong>
      <span>Atualize o manifest.json ou coloque arquivos na pasta media local.</span>
    `;
    grid.append(empty);
    setStatus("Sem midias");
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

  setStatus(`${media.length} arquivo${media.length === 1 ? "" : "s"}`);
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
  setStatus("Carregando");
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
    setStatus("Erro ao carregar");
    grid.replaceChildren();
    mediaCount.textContent = "0";
  } finally {
    refreshButton.disabled = false;
  }
}

function showChromeBriefly() {
  player.classList.remove("is-idle");
  player.classList.add("show-chrome");
  window.clearTimeout(state.chromeTimer);
  window.clearTimeout(state.idleTimer);
  state.chromeTimer = window.setTimeout(() => {
    player.classList.remove("show-chrome");
  }, 1600);
  state.idleTimer = window.setTimeout(() => {
    player.classList.remove("show-chrome");
    setInfoVisible(false);
    player.classList.add("is-idle");
  }, 3200);
}

function setInfoVisible(isVisible) {
  player.classList.toggle("show-info", isVisible);
  infoButton.classList.toggle("is-active", isVisible);
  infoButton.setAttribute("aria-label", isVisible ? "Minimizar informacoes" : "Mostrar informacoes");
  infoButton.setAttribute("title", isVisible ? "Minimizar informacoes" : "Informacoes");
}

function showInfoBriefly(duration = 2600) {
  setInfoVisible(true);
  window.clearTimeout(state.infoTimer);
  state.infoTimer = window.setTimeout(() => {
    setInfoVisible(false);
  }, duration);
}

function toggleInfo() {
  window.clearTimeout(state.infoTimer);
  setInfoVisible(!player.classList.contains("show-info"));
  showChromeBriefly();
}

function applyFitMode() {
  const isCover = state.fitMode === "cover";
  player.classList.toggle("is-cover", isCover);
  fitButton.classList.toggle("is-active", isCover);
  fitButton.setAttribute("aria-label", isCover ? "Encaixar na tela" : "Preencher tela");
  fitButton.setAttribute("title", isCover ? "Encaixar na tela" : "Preencher tela");
}

function toggleFitMode() {
  state.fitMode = state.fitMode === "cover" ? "contain" : "cover";
  localStorage.setItem("mirroros-fit-mode", state.fitMode);
  applyFitMode();
  showChromeBriefly();
}

function requestFullscreen() {
  const target = player;
  if (document.fullscreenElement) return Promise.resolve();
  if (target.requestFullscreen) return target.requestFullscreen().catch(() => {});
  return Promise.resolve();
}

function updateUrl(item) {
  const params = new URLSearchParams(window.location.search);
  params.set("play", item.id);
  history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

function renderActiveMedia(item) {
  clearImageTimer();
  stage.replaceChildren();
  mediaKind.textContent = item.type === "video" ? "Video" : "Imagem";
  mediaTitle.textContent = item.name;

  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = item.url;
    video.loop = getPlaylist().length <= 1;
    video.autoplay = !state.isPaused;
    video.controls = false;
    video.playsInline = true;
    video.preload = "metadata";
    video.muted = false;
    video.addEventListener("ended", () => {
      if (getPlaylist().length > 1) goToNext();
    });
    video.addEventListener("canplay", () => {
      if (!state.isPaused) {
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      }
    }, { once: true });
    stage.append(video);
    return;
  }

  const image = document.createElement("img");
  image.src = item.url;
  image.alt = item.name;
  image.decoding = "async";
  stage.append(image);
  scheduleImageAdvance();
}

function openPlayer(item) {
  const playlist = getPlaylist();
  const index = playlist.findIndex((media) => media.id === item.id);

  state.activeMedia = item;
  state.activeIndex = index >= 0 ? index : 0;
  state.isPaused = false;
  updatePlayPauseUi();
  renderActiveMedia(item);

  player.classList.add("is-open");
  player.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  applyFitMode();
  showChromeBriefly();
  showInfoBriefly();
  requestFullscreen();
  updateUrl(item);
}

function closePlayer() {
  clearImageTimer();
  stage.replaceChildren();
  state.activeMedia = null;
  state.activeIndex = -1;
  state.isPaused = false;
  window.clearTimeout(state.idleTimer);
  player.classList.remove("is-open", "show-chrome", "show-info", "is-paused", "is-idle");
  player.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  history.replaceState(null, "", window.location.pathname);
}

function goToIndex(index) {
  const playlist = getPlaylist();
  if (!playlist.length) return;

  const nextIndex = (index + playlist.length) % playlist.length;
  const item = playlist[nextIndex];
  state.activeMedia = item;
  state.activeIndex = nextIndex;
  renderActiveMedia(item);
  updatePlayPauseUi();
  showChromeBriefly();
  showInfoBriefly(1500);
  updateUrl(item);
}

function goToNext() {
  goToIndex(state.activeIndex + 1);
}

function goToPrevious() {
  goToIndex(state.activeIndex - 1);
}

function togglePlayback() {
  if (!state.activeMedia) return;

  state.isPaused = !state.isPaused;
  const video = stage.querySelector("video");

  if (video) {
    if (state.isPaused) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  } else if (state.isPaused) {
    clearImageTimer();
  } else {
    scheduleImageAdvance();
  }

  updatePlayPauseUi();
  showChromeBriefly();
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
previousButton.addEventListener("click", goToPrevious);
playPauseButton.addEventListener("click", togglePlayback);
nextButton.addEventListener("click", goToNext);
infoButton.addEventListener("click", toggleInfo);
fitButton.addEventListener("click", toggleFitMode);
fullscreenButton.addEventListener("click", requestFullscreen);
closeButton.addEventListener("click", closePlayer);

player.addEventListener("mousemove", showChromeBriefly);
player.addEventListener("touchstart", showChromeBriefly, { passive: true });
player.addEventListener("click", (event) => {
  if (event.target === player || event.target === stage) {
    showChromeBriefly();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.activeMedia) {
    closePlayer();
    return;
  }

  if ((event.key === " " || event.key.toLowerCase() === "k") && state.activeMedia) {
    event.preventDefault();
    togglePlayback();
  }

  if (event.key === "ArrowRight" && state.activeMedia) {
    goToNext();
  }

  if (event.key === "ArrowLeft" && state.activeMedia) {
    goToPrevious();
  }

  if (event.key.toLowerCase() === "f" && state.activeMedia) {
    requestFullscreen();
  }

  if (event.key.toLowerCase() === "i" && state.activeMedia) {
    toggleInfo();
  }

  if (event.key.toLowerCase() === "m" && state.activeMedia) {
    toggleFitMode();
  }
});

applyFitMode();
loadMedia();
