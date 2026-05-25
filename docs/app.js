var imageDurationMs = 8000;
var activityThrottleMs = 180;
var heavyVideoBytes = 25 * 1024 * 1024;

if (!Date.now) {
  Date.now = function () {
    return new Date().getTime();
  };
}

if (!Array.isArray) {
  Array.isArray = function (value) {
    return Object.prototype.toString.call(value) === "[object Array]";
  };
}

var state = {
  media: [],
  filter: "all",
  activeMedia: null,
  activeIndex: -1,
  activeVideo: null,
  isPaused: false,
  chromeTimer: null,
  idleTimer: null,
  infoTimer: null,
  imageTimer: null,
  videoLoadTimer: null,
  videoLoopTimer: null,
  controlsMinimized: false,
  lastActivityAt: 0,
  lastLoopRestartAt: 0,
  preloadLinks: {},
  openedFromQuery: false,
  isLiteMode: shouldUseLiteMode(),
  fitMode: getStoredValue("mirroros-fit-mode", "contain")
};

var grid = document.querySelector("#mediaGrid");
var statusLine = document.querySelector("#statusLine");
var mediaCount = document.querySelector("#mediaCount");
var player = document.querySelector("#player");
var stage = document.querySelector("#stage");
var mediaKind = document.querySelector("#mediaKind");
var mediaTitle = document.querySelector("#mediaTitle");
var previousButton = document.querySelector("#previousButton");
var playPauseButton = document.querySelector("#playPauseButton");
var nextButton = document.querySelector("#nextButton");
var infoButton = document.querySelector("#infoButton");
var fitButton = document.querySelector("#fitButton");
var fullscreenButton = document.querySelector("#fullscreenButton");
var minimizeControlsButton = document.querySelector("#minimizeControlsButton");
var restoreControlsButton = document.querySelector("#restoreControlsButton");
var closeButton = document.querySelector("#closeButton");
var refreshButton = document.querySelector("#refreshButton");
var filterButtons = document.querySelectorAll("[data-filter]");

var icons = {
  video: [
    '<svg aria-hidden="true" viewBox="0 0 24 24">',
    '<path d="m15 10 5-3v10l-5-3v-4Z"/>',
    '<rect x="3" y="6" width="12" height="12" rx="2"/>',
    "</svg>"
  ].join(""),
  image: [
    '<svg aria-hidden="true" viewBox="0 0 24 24">',
    '<rect x="3" y="5" width="18" height="14" rx="2"/>',
    '<path d="m8 13 2.5-2.5L16 16"/>',
    '<path d="m14 12 1.5-1.5L21 16"/>',
    '<circle cx="8" cy="9" r="1.2"/>',
    "</svg>"
  ].join("")
};

function noop() {}

function hasClass(element, className) {
  if (!element) return false;
  if (element.classList) return element.classList.contains(className);
  return (" " + element.className + " ").indexOf(" " + className + " ") !== -1;
}

function addClass(element, className) {
  if (!element || hasClass(element, className)) return;
  if (element.classList) {
    element.classList.add(className);
  } else {
    element.className = element.className ? element.className + " " + className : className;
  }
}

function removeClass(element, className) {
  if (!element) return;
  if (element.classList) {
    element.classList.remove(className);
    return;
  }

  element.className = (" " + element.className + " ")
    .replace(" " + className + " ", " ")
    .replace(/^\s+|\s+$/g, "");
}

function toggleClass(element, className, isActive) {
  if (isActive) addClass(element, className);
  else removeClass(element, className);
}

function clearElement(element) {
  while (element && element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, " "));
  } catch (error) {
    return value;
  }
}

function getQueryParam(name) {
  var search = window.location.search || "";

  if (window.URLSearchParams) {
    try {
      return new URLSearchParams(search).get(name);
    } catch (error) {
      return null;
    }
  }

  if (search.charAt(0) === "?") search = search.slice(1);
  if (!search) return null;

  var parts = search.split("&");
  var encodedName = encodeURIComponent(name);

  for (var index = 0; index < parts.length; index += 1) {
    var pair = parts[index].split("=");
    if (pair[0] === encodedName || safeDecode(pair[0]) === name) {
      return pair.length > 1 ? safeDecode(pair.slice(1).join("=")) : "";
    }
  }

  return null;
}

function getStoredValue(key, fallback) {
  try {
    var value = window.localStorage && window.localStorage.getItem(key);
    return value || fallback;
  } catch (error) {
    return fallback;
  }
}

function setStoredValue(key, value) {
  try {
    if (window.localStorage) window.localStorage.setItem(key, value);
  } catch (error) {
    noop();
  }
}

function shouldUseLiteMode() {
  var liteParam = getQueryParam("lite");
  var safeParam = getQueryParam("safe");
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var effectiveType = connection && connection.effectiveType ? connection.effectiveType : "";

  if (liteParam === "1" || liteParam === "true" || safeParam === "1" || safeParam === "true") {
    return true;
  }

  if (connection && (connection.saveData || /(^|-)2g$/.test(effectiveType))) {
    return true;
  }

  if (navigator.deviceMemory && navigator.deviceMemory <= 2) {
    return true;
  }

  return false;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";

  var units = ["B", "KB", "MB", "GB", "TB"];
  var size = bytes;
  var unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1) + " " + units[unitIndex];
}

function getFilteredMedia() {
  if (state.filter === "all") return state.media;

  var filtered = [];
  for (var index = 0; index < state.media.length; index += 1) {
    if (state.media[index].type === state.filter) filtered.push(state.media[index]);
  }

  return filtered;
}

function getPlaylist() {
  var filtered = getFilteredMedia();
  return filtered.length ? filtered : state.media;
}

function getNextPlaylistItem() {
  var playlist = getPlaylist();
  if (playlist.length <= 1 || state.activeIndex < 0) return null;
  return playlist[(state.activeIndex + 1) % playlist.length];
}

function setStatus(text) {
  statusLine.textContent = text;
}

function isLargeVideo(item) {
  return item && item.type === "video" && item.size >= heavyVideoBytes;
}

function updatePerformanceMode() {
  var hasHeavyVideo = false;

  for (var index = 0; index < state.media.length; index += 1) {
    if (isLargeVideo(state.media[index])) {
      hasHeavyVideo = true;
      break;
    }
  }

  state.isLiteMode = state.isLiteMode || hasHeavyVideo;
  toggleClass(document.body, "is-lite-mode", state.isLiteMode);
  toggleClass(player, "is-lite-mode", state.isLiteMode);
}

function updatePlayPauseUi() {
  toggleClass(player, "is-paused", state.isPaused);
  playPauseButton.setAttribute("aria-label", state.isPaused ? "Reproduzir" : "Pausar");
  playPauseButton.setAttribute("title", state.isPaused ? "Reproduzir" : "Pausar");
}

function clearImageTimer() {
  window.clearTimeout(state.imageTimer);
  state.imageTimer = null;
}

function clearVideoLoadTimer() {
  window.clearTimeout(state.videoLoadTimer);
  state.videoLoadTimer = null;
}

function clearVideoLoopTimer() {
  window.clearInterval(state.videoLoopTimer);
  state.videoLoopTimer = null;
}

function scheduleImageAdvance() {
  clearImageTimer();
  if (state.isPaused || !state.activeMedia || state.activeMedia.type !== "image") return;
  if (getPlaylist().length <= 1) return;

  state.imageTimer = window.setTimeout(function () {
    goToNext();
  }, imageDurationMs);
}

function createMediaCard(item) {
  var card = document.createElement("button");
  var thumb = document.createElement("span");
  var thumbIcon = document.createElement("span");
  var body = document.createElement("span");
  var title = document.createElement("span");
  var meta = document.createElement("span");

  card.className = "media-card";
  card.type = "button";
  card.setAttribute("data-id", item.id);

  thumb.className = "thumb";
  thumbIcon.className = "thumb-icon";
  thumbIcon.innerHTML = icons[item.type] || "";
  thumb.appendChild(thumbIcon);

  title.className = "card-title";
  title.textContent = item.name;

  var metaParts = [
    item.type === "video" ? "Video" : "Imagem",
    item.extension ? item.extension.toUpperCase() : "",
    formatBytes(item.size),
    item.folder
  ];
  var metaText = [];

  for (var metaIndex = 0; metaIndex < metaParts.length; metaIndex += 1) {
    if (metaParts[metaIndex]) metaText.push(metaParts[metaIndex]);
  }

  meta.className = "card-meta";
  meta.textContent = metaText.join(" / ");

  body.className = "card-body";
  body.appendChild(title);
  body.appendChild(meta);

  card.appendChild(thumb);
  card.appendChild(body);

  card.addEventListener("click", function () {
    openPlayer(item);
  });
  card.addEventListener("mouseenter", function () {
    prewarmMedia(item);
  });

  return card;
}

function renderMedia() {
  var media = getFilteredMedia();
  clearElement(grid);
  mediaCount.textContent = state.media.length;

  if (!media.length) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = [
      "<strong>Nenhuma midia encontrada</strong>",
      "<span>Atualize o manifest.json ou coloque arquivos na pasta media local.</span>"
    ].join("");
    grid.appendChild(empty);
    setStatus("Sem midias");
    return;
  }

  for (var index = 0; index < media.length; index += 1) {
    grid.appendChild(createMediaCard(media[index]));
  }

  setStatus(media.length + " arquivo" + (media.length === 1 ? "" : "s"));
}

function prewarmMedia(item) {
  if (!item || state.isLiteMode || item.type !== "image" || state.preloadLinks[item.url]) return;

  var link = document.createElement("link");
  link.rel = "prefetch";
  link.href = item.url;
  link.as = "image";

  document.head.appendChild(link);
  state.preloadLinks[item.url] = link;
}

function prewarmNextMedia() {
  var nextItem = getNextPlaylistItem();
  if (nextItem) prewarmMedia(nextItem);
}

function appendCacheBust(url) {
  var separator = url.indexOf("?") === -1 ? "?" : "&";
  return url + separator + "_=" + Date.now();
}

function fetchJson(url, onSuccess, onError) {
  var xhr = new XMLHttpRequest();

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;

    if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
      try {
        onSuccess(JSON.parse(xhr.responseText));
      } catch (error) {
        onError(error);
      }
      return;
    }

    onError(new Error("HTTP " + xhr.status));
  };

  xhr.onerror = function () {
    onError(new Error("Falha de rede"));
  };

  try {
    xhr.open("GET", appendCacheBust(url), true);
    xhr.send(null);
  } catch (error) {
    onError(error);
  }
}

function normalizeManifest(payload) {
  var media = Array.isArray(payload) ? payload : payload && payload.media;
  var normalized = [];

  if (!Array.isArray(media)) return normalized;

  for (var index = 0; index < media.length; index += 1) {
    var item = media[index];
    if (!item || !item.url || (item.type !== "video" && item.type !== "image")) continue;

    var urlPath = String(item.url).split("?")[0].split("#")[0];
    var extension = item.extension || urlPath.split(".").pop() || "";
    var fileName = item.fileName || safeDecode(urlPath.split("/").pop() || "midia-" + (index + 1));
    var name = item.name || fileName.replace(/\.[^.]+$/, "");

    normalized.push({
      id: item.id || item.url,
      name: name,
      fileName: fileName,
      folder: item.folder || "",
      type: item.type,
      extension: extension,
      size: Number(item.size) || 0,
      updatedAt: item.updatedAt || "",
      url: item.url
    });
  }

  return normalized;
}

function getLiteVariantKey(item) {
  var name = String(item.name || item.fileName || item.id || "").toLowerCase();
  name = name.replace(/\s*[-_. ](?:2160p|1440p|1080p|720p|540p|480p|360p|lite|compat|mobile)$/i, "");
  return (item.folder || "") + "/" + name;
}

function isBetterLiteVariant(candidate, current) {
  var candidateSize = candidate.size || Number.MAX_VALUE;
  var currentSize = current.size || Number.MAX_VALUE;

  if (candidateSize !== currentSize) return candidateSize < currentSize;
  return /(?:720p|540p|480p|360p|lite|compat|mobile)$/i.test(candidate.name || "");
}

function chooseLiteMedia(media) {
  var slots = [];
  var videoGroups = {};

  for (var index = 0; index < media.length; index += 1) {
    var item = media[index];

    if (item.type !== "video") {
      slots.push({ item: item });
      continue;
    }

    var key = getLiteVariantKey(item);
    var slot = videoGroups[key];

    if (!slot) {
      slot = {
        item: item,
        aliases: [item.id]
      };
      videoGroups[key] = slot;
      slots.push(slot);
    } else {
      slot.aliases.push(item.id);
      if (isBetterLiteVariant(item, slot.item)) {
        slot.item = item;
      }
    }
  }

  var selected = [];
  for (var slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    if (slots[slotIndex].aliases) {
      slots[slotIndex].item.aliases = slots[slotIndex].aliases;
    }
    selected.push(slots[slotIndex].item);
  }

  return selected;
}

function completeMediaLoad(payload) {
  var loadedMedia = normalizeManifest(payload);

  if (!loadedMedia.length) {
    failMediaLoad(new Error("Manifest sem midias"));
    return;
  }

  state.media = loadedMedia;
  updatePerformanceMode();

  if (state.isLiteMode) {
    state.media = chooseLiteMedia(loadedMedia);
  }

  renderMedia();
  openFromQuery();
  refreshButton.disabled = false;
}

function loadEmbeddedManifest() {
  var manifest = window.MIRROROS_MANIFEST;

  if (!manifest && typeof MIRROROS_MANIFEST !== "undefined") {
    manifest = MIRROROS_MANIFEST;
  }

  if (!manifest) return false;
  if (!normalizeManifest(manifest).length) return false;

  completeMediaLoad(manifest);
  return true;
}

function failMediaLoad(error) {
  if (window.console && console.error) console.error(error);
  if (loadEmbeddedManifest()) return;

  setStatus("Erro ao carregar midias");
  clearElement(grid);
  mediaCount.textContent = "0";
  refreshButton.disabled = false;

  var empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = [
    "<strong>Nao foi possivel carregar as midias</strong>",
    "<span>Em aparelhos antigos, prefira abrir por HTTP local. HTTPS com certificado antigo ou invalido pode bloquear o manifest.json.</span>"
  ].join("");
  grid.appendChild(empty);
}

function loadMedia() {
  setStatus("Carregando");
  refreshButton.disabled = true;

  if (loadEmbeddedManifest()) return;

  fetchJson("manifest.json", completeMediaLoad, function () {
    fetchJson("/api/media", completeMediaLoad, failMediaLoad);
  });
}

function showChromeBriefly() {
  removeClass(player, "is-idle");
  addClass(player, "show-chrome");
  setRestoreButtonVisible(state.controlsMinimized);
  window.clearTimeout(state.chromeTimer);
  window.clearTimeout(state.idleTimer);
  state.chromeTimer = window.setTimeout(function () {
    removeClass(player, "show-chrome");
  }, 1600);
  state.idleTimer = window.setTimeout(function () {
    removeClass(player, "show-chrome");
    setInfoVisible(false);
    setRestoreButtonVisible(false);
    addClass(player, "is-idle");
  }, 3000);
}

function handlePlayerActivity() {
  var now = Date.now();
  if (now - state.lastActivityAt < activityThrottleMs) return;
  state.lastActivityAt = now;
  showChromeBriefly();
}

function setRestoreButtonVisible(isVisible) {
  restoreControlsButton.style.pointerEvents = isVisible ? "auto" : "none";
  restoreControlsButton.style.transform = isVisible ? "translateY(0)" : "translateY(-8px)";
  restoreControlsButton.style.visibility = isVisible ? "visible" : "hidden";
}

function setControlsMinimized(isMinimized) {
  state.controlsMinimized = isMinimized;
  toggleClass(player, "controls-minimized", isMinimized);
  setRestoreButtonVisible(isMinimized);
  showChromeBriefly();
}

function setInfoVisible(isVisible) {
  toggleClass(player, "show-info", isVisible);
  toggleClass(infoButton, "is-active", isVisible);
  infoButton.setAttribute("aria-label", isVisible ? "Minimizar informacoes" : "Mostrar informacoes");
  infoButton.setAttribute("title", isVisible ? "Minimizar informacoes" : "Informacoes");
}

function showInfoBriefly(duration) {
  setInfoVisible(true);
  window.clearTimeout(state.infoTimer);
  state.infoTimer = window.setTimeout(function () {
    setInfoVisible(false);
  }, duration || 2600);
}

function toggleInfo() {
  window.clearTimeout(state.infoTimer);
  setInfoVisible(!hasClass(player, "show-info"));
  showChromeBriefly();
}

function applyFitMode() {
  var isCover = state.fitMode === "cover";
  toggleClass(player, "is-cover", isCover);
  toggleClass(fitButton, "is-active", isCover);
  fitButton.setAttribute("aria-label", isCover ? "Encaixar na tela" : "Preencher tela");
  fitButton.setAttribute("title", isCover ? "Encaixar na tela" : "Preencher tela");
}

function toggleFitMode() {
  state.fitMode = state.fitMode === "cover" ? "contain" : "cover";
  setStoredValue("mirroros-fit-mode", state.fitMode);
  applyFitMode();
  showChromeBriefly();
}

function getFullscreenElement() {
  return document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement;
}

function requestFullscreen() {
  var method = player.requestFullscreen ||
    player.webkitRequestFullscreen ||
    player.mozRequestFullScreen ||
    player.msRequestFullscreen;
  var result;

  if (getFullscreenElement() || !method) return;

  try {
    result = method.call(player);
    if (result && typeof result.catch === "function") result.catch(noop);
  } catch (error) {
    noop();
  }
}

function exitFullscreen() {
  var method = document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.mozCancelFullScreen ||
    document.msExitFullscreen;
  var result;

  if (!getFullscreenElement() || !method) return;

  try {
    result = method.call(document);
    if (result && typeof result.catch === "function") result.catch(noop);
  } catch (error) {
    noop();
  }
}

function updateUrl(item) {
  var nextUrl;

  if (!window.history || !window.history.replaceState) return;

  if (window.URLSearchParams) {
    try {
      var params = new URLSearchParams(window.location.search);
      params.set("play", item.id);
      nextUrl = window.location.pathname + "?" + params.toString();
    } catch (error) {
      nextUrl = null;
    }
  }

  if (!nextUrl) {
    nextUrl = window.location.pathname + "?play=" + encodeURIComponent(item.id);
  }

  try {
    window.history.replaceState(null, "", nextUrl);
  } catch (error) {
    noop();
  }
}

function clearStageMessage() {
  var message = stage.querySelector(".stage-message");
  if (message && message.parentNode) {
    message.parentNode.removeChild(message);
  }
}

function showStageMessage(title, detail) {
  var message = document.createElement("div");
  var heading = document.createElement("strong");
  var text = document.createElement("span");

  clearStageMessage();

  message.className = "stage-message";
  heading.textContent = title;
  text.textContent = detail;

  message.appendChild(heading);
  message.appendChild(text);
  stage.appendChild(message);
}

function releaseActiveVideo() {
  var video = state.activeVideo;

  clearVideoLoadTimer();
  clearVideoLoopTimer();

  if (!video) return;

  try {
    video.pause();
    video.removeAttribute("src");
    video.load();
  } catch (error) {
    noop();
  }

  state.activeVideo = null;
}

function clearStage() {
  releaseActiveVideo();
  clearElement(stage);
}

function shouldStartMuted() {
  var mutedParam = getQueryParam("muted");
  return mutedParam === "1" || mutedParam === "true" || state.openedFromQuery;
}

function scheduleVideoLoadNotice(item) {
  clearVideoLoadTimer();
}

function showVideoError(video) {
  var code = video && video.error ? video.error.code : 0;
  var detail = "Tente uma versao MP4 H.264 em 1080p ou 720p. Arquivos 4K ou com bitrate alto podem travar este navegador.";

  clearVideoLoadTimer();

  if (code === 4) {
    detail = "Formato ou codec nao suportado neste navegador. Use MP4 H.264 com audio AAC.";
  } else if (code === 3) {
    detail = "O navegador falhou ao decodificar o arquivo. Uma versao 1080p ou 720p costuma resolver em media boxes fracas.";
  } else if (code === 2) {
    detail = "A rede interrompeu o carregamento do video. Verifique o Wi-Fi/cabo ou use um arquivo menor.";
  }

  showStageMessage("Nao foi possivel reproduzir", detail);
}

function isVideoNearEnd(video) {
  var remaining;

  if (!video) return false;
  if (video.ended) return true;
  if (!window.isFinite || !isFinite(video.duration) || video.duration <= 0) return false;
  remaining = video.duration - video.currentTime;
  return remaining <= 0.25 || (video.paused && remaining <= 3);
}

function handleVideoFinished(video) {
  var now = Date.now();

  if (video && video !== state.activeVideo) return;
  if (state.isPaused) return;
  if (now - state.lastLoopRestartAt < 1200) return;

  state.lastLoopRestartAt = now;
  clearVideoLoadTimer();
  clearStageMessage();

  if (getPlaylist().length > 1) {
    goToNext();
  } else {
    restartVideo(video);
  }
}

function restartVideo(video) {
  clearVideoLoadTimer();
  clearStageMessage();

  if (!video || state.isPaused) return;
  if (video !== state.activeVideo || !state.activeMedia) return;

  renderActiveMedia(state.activeMedia);
}

function startVideoLoopWatchdog(video) {
  clearVideoLoopTimer();

  state.videoLoopTimer = window.setInterval(function () {
    if (!video || video !== state.activeVideo) {
      clearVideoLoopTimer();
      return;
    }

    if (isVideoNearEnd(video)) {
      handleVideoFinished(video);
    }
  }, 500);
}

function showPlayBlockedMessage() {
  clearVideoLoadTimer();
  showStageMessage(
    "Reproducao bloqueada",
    "Toque no botao reproduzir. Se for para iniciar sozinho na TV, abra com ?muted=1 ou ?lite=1."
  );
}

function startVideo(video) {
  var result;

  if (!video) return;
  clearStageMessage();
  clearVideoLoadTimer();

  try {
    result = video.play();
  } catch (error) {
    handleVideoPlayBlocked(video);
    return;
  }

  if (result && typeof result.catch === "function") {
    result.catch(function () {
      handleVideoPlayBlocked(video);
    });
  }
}

function handleVideoPlayBlocked(video) {
  var retry;

  if (!video.muted) {
    video.muted = true;

    try {
      retry = video.play();
    } catch (error) {
      showPlayBlockedMessage();
      return;
    }

    if (retry && typeof retry.catch === "function") {
      retry.catch(showPlayBlockedMessage);
    }
    return;
  }

  showPlayBlockedMessage();
}

function renderActiveMedia(item) {
  clearImageTimer();
  clearStage();
  mediaKind.textContent = item.type === "video" ? "Video" : "Imagem";
  mediaTitle.textContent = item.name;

  if (item.type === "video") {
    var video = document.createElement("video");
    video.src = item.url;
    video.loop = false;
    video.autoplay = false;
    video.controls = false;
    video.playsInline = true;
    video.preload = "metadata";
    video.muted = shouldStartMuted();
    video.disablePictureInPicture = true;
    video.setAttribute("preload", "metadata");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    video.addEventListener("ended", function () {
      handleVideoFinished(video);
    });
    video.addEventListener("timeupdate", function () {
      if (isVideoNearEnd(video)) handleVideoFinished(video);
    });
    video.addEventListener("playing", function () {
      clearVideoLoadTimer();
      clearStageMessage();
    });
    video.addEventListener("canplay", function () {
      clearVideoLoadTimer();
      clearStageMessage();
    });
    video.addEventListener("pause", function () {
      if (!state.isPaused && isVideoNearEnd(video)) handleVideoFinished(video);
    });
    video.addEventListener("waiting", function () {
      if (isVideoNearEnd(video)) handleVideoFinished(video);
      else clearVideoLoadTimer();
    });
    video.addEventListener("stalled", function () {
      if (isVideoNearEnd(video)) handleVideoFinished(video);
      else clearVideoLoadTimer();
    });
    video.addEventListener("error", function () {
      showVideoError(video);
    });

    stage.appendChild(video);
    state.activeVideo = video;
    startVideoLoopWatchdog(video);
    startVideo(video);
    prewarmNextMedia();
    return;
  }

  var image = document.createElement("img");
  image.src = item.url;
  image.alt = item.name;
  image.decoding = "async";
  image.loading = "eager";
  stage.appendChild(image);
  scheduleImageAdvance();
  prewarmNextMedia();
}

function openPlayer(item) {
  var playlist = getPlaylist();
  var index = -1;

  for (var itemIndex = 0; itemIndex < playlist.length; itemIndex += 1) {
    if (playlist[itemIndex].id === item.id) {
      index = itemIndex;
      break;
    }
  }

  state.activeMedia = item;
  state.activeIndex = index >= 0 ? index : 0;
  state.isPaused = false;

  addClass(player, "is-open");
  addClass(document.body, "is-playing-media");
  player.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  toggleClass(player, "controls-minimized", state.controlsMinimized);
  applyFitMode();
  updatePlayPauseUi();
  renderActiveMedia(item);
  showChromeBriefly();
  showInfoBriefly();

  if (!state.isLiteMode) requestFullscreen();

  updateUrl(item);
}

function closePlayer() {
  clearImageTimer();
  clearStage();
  state.activeMedia = null;
  state.activeIndex = -1;
  state.isPaused = false;
  state.controlsMinimized = false;
  window.clearTimeout(state.idleTimer);
  window.clearTimeout(state.chromeTimer);
  window.clearTimeout(state.infoTimer);
  setRestoreButtonVisible(false);
  removeClass(player, "is-open");
  removeClass(player, "show-chrome");
  removeClass(player, "show-info");
  removeClass(player, "is-paused");
  removeClass(player, "is-idle");
  removeClass(player, "controls-minimized");
  removeClass(document.body, "is-playing-media");
  player.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  exitFullscreen();

  if (window.history && window.history.replaceState) {
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch (error) {
      noop();
    }
  }
}

function goToIndex(index) {
  var playlist = getPlaylist();
  var nextIndex;
  var item;

  if (!playlist.length) return;

  nextIndex = (index + playlist.length) % playlist.length;
  item = playlist[nextIndex];
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
  var video;

  if (!state.activeMedia) return;

  state.isPaused = !state.isPaused;
  video = state.activeVideo || stage.querySelector("video");

  if (video) {
    if (state.isPaused) {
      clearVideoLoadTimer();
      video.pause();
    } else {
      startVideo(video);
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
  var targetId;
  var item = null;

  if (state.activeMedia) return;

  targetId = getQueryParam("play");
  if (!targetId) return;

  for (var index = 0; index < state.media.length; index += 1) {
    if (state.media[index].id === targetId || mediaHasAlias(state.media[index], targetId)) {
      item = state.media[index];
      break;
    }
  }

  if (item) {
    state.openedFromQuery = true;
    openPlayer(item);
    state.openedFromQuery = false;
  }
}

function mediaHasAlias(item, targetId) {
  if (!item || !item.aliases) return false;

  for (var index = 0; index < item.aliases.length; index += 1) {
    if (item.aliases[index] === targetId) return true;
  }

  return false;
}

for (var filterIndex = 0; filterIndex < filterButtons.length; filterIndex += 1) {
  filterButtons[filterIndex].addEventListener("click", function () {
    state.filter = this.getAttribute("data-filter");

    for (var index = 0; index < filterButtons.length; index += 1) {
      toggleClass(filterButtons[index], "is-active", filterButtons[index] === this);
    }

    renderMedia();
  });
}

refreshButton.addEventListener("click", loadMedia);
previousButton.addEventListener("click", goToPrevious);
playPauseButton.addEventListener("click", togglePlayback);
nextButton.addEventListener("click", goToNext);
infoButton.addEventListener("click", toggleInfo);
fitButton.addEventListener("click", toggleFitMode);
fullscreenButton.addEventListener("click", requestFullscreen);
minimizeControlsButton.addEventListener("click", function () {
  setControlsMinimized(true);
});
restoreControlsButton.addEventListener("click", function () {
  setControlsMinimized(false);
});
closeButton.addEventListener("click", closePlayer);

player.addEventListener("mousemove", handlePlayerActivity, false);
player.addEventListener("touchstart", handlePlayerActivity, false);
player.addEventListener("click", function (event) {
  if (event.target === player || event.target === stage) {
    handlePlayerActivity();
  }
});

document.addEventListener("keydown", function (event) {
  var key = event.key || "";
  var keyCode = event.keyCode || event.which;
  var lowerKey = key.toLowerCase ? key.toLowerCase() : "";

  if ((key === "Escape" || keyCode === 27) && state.activeMedia) {
    closePlayer();
    return;
  }

  if ((key === " " || keyCode === 32 || lowerKey === "k") && state.activeMedia) {
    if (event.preventDefault) event.preventDefault();
    togglePlayback();
  }

  if ((key === "ArrowRight" || keyCode === 39) && state.activeMedia) {
    goToNext();
  }

  if ((key === "ArrowLeft" || keyCode === 37) && state.activeMedia) {
    goToPrevious();
  }

  if (lowerKey === "f" && state.activeMedia) {
    requestFullscreen();
  }

  if (lowerKey === "i" && state.activeMedia) {
    toggleInfo();
  }

  if (lowerKey === "m" && state.activeMedia) {
    toggleFitMode();
  }
});

applyFitMode();
updatePerformanceMode();
loadMedia();
