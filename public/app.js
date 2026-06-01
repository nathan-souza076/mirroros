var imageDurationMs = 8000;
var activityThrottleMs = 180;
var heavyVideoBytes = 25 * 1024 * 1024;
var playlistStorageKey = "mirroros-user-playlists";
var apiStorageKey = "mirroros-api-url";
var apiBaseUrl = getApiBaseUrl();

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
  playlists: [],
  activePlaylistId: getQueryParam("playlist") || "all",
  storedPlaylistPayload: { playlists: [], deletedIds: [] },
  embeddedPlaylistIds: {},
  editingPlaylistId: null,
  serverPlaylistsAvailable: false,
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
var playerProgress = document.querySelector("#playerProgress");
var progressElapsed = document.querySelector("#progressElapsed");
var progressDuration = document.querySelector("#progressDuration");
var progressFill = document.querySelector("#progressFill");
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
var playlistSelect = document.querySelector("#playlistSelect");
var managePlaylistsButton = document.querySelector("#managePlaylistsButton");
var playlistEditor = document.querySelector("#playlistEditor");
var closePlaylistEditorButton = document.querySelector("#closePlaylistEditorButton");
var newPlaylistButton = document.querySelector("#newPlaylistButton");
var playlistList = document.querySelector("#playlistList");
var playlistNameInput = document.querySelector("#playlistNameInput");
var playlistItems = document.querySelector("#playlistItems");
var savePlaylistButton = document.querySelector("#savePlaylistButton");
var deletePlaylistButton = document.querySelector("#deletePlaylistButton");
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

function getApiBaseUrl() {
  var configured = getQueryParam("api") || getQueryParam("server");

  if (!configured) {
    if (window.MIRROROS_API_URL) {
      configured = window.MIRROROS_API_URL;
    } else if (typeof MIRROROS_API_URL !== "undefined") {
      configured = MIRROROS_API_URL;
    }
  }

  if (!configured) {
    configured = getStoredValue(apiStorageKey, "");
  }

  configured = String(configured || "").replace(/\/+$/, "");

  if (getQueryParam("api") || getQueryParam("server")) {
    setStoredValue(apiStorageKey, configured);
  }

  return configured;
}

function toApiUrl(path) {
  if (!apiBaseUrl) return path;
  return apiBaseUrl + path;
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

function formatTimecode(seconds) {
  var totalSeconds;
  var hours;
  var minutes;
  var remainder;

  if (!seconds || !isFinite(seconds) || seconds < 0) return "0:00";

  totalSeconds = Math.floor(seconds);
  hours = Math.floor(totalSeconds / 3600);
  minutes = Math.floor((totalSeconds % 3600) / 60);
  remainder = totalSeconds % 60;

  if (hours > 0) {
    return hours + ":" +
      (minutes < 10 ? "0" : "") + minutes + ":" +
      (remainder < 10 ? "0" : "") + remainder;
  }

  return minutes + ":" + (remainder < 10 ? "0" : "") + remainder;
}

function resetVideoProgress() {
  if (progressFill) progressFill.style.width = "0%";
  if (progressElapsed) progressElapsed.textContent = "0:00";
  if (progressDuration) progressDuration.textContent = "0:00";
}

function setVideoProgressActive(isActive) {
  toggleClass(player, "is-video", isActive);

  if (playerProgress) {
    playerProgress.setAttribute("aria-hidden", isActive ? "false" : "true");
  }

  if (!isActive) resetVideoProgress();
}

function updateVideoProgress(video) {
  var duration;
  var current;
  var percent = 0;

  if (!video) {
    resetVideoProgress();
    return;
  }

  duration = video.duration;
  current = video.currentTime || 0;

  if (duration && isFinite(duration) && duration > 0) {
    percent = Math.max(0, Math.min(100, (current / duration) * 100));
  }

  if (progressFill) progressFill.style.width = percent + "%";
  if (progressElapsed) progressElapsed.textContent = formatTimecode(current);
  if (progressDuration) progressDuration.textContent = formatTimecode(duration);
}

function getPlaylistTokenValue(token) {
  if (token && typeof token === "object") {
    return token.id || token.fileName || token.name || token.url || "";
  }

  return token;
}

function findMediaByPlaylistToken(token) {
  var value = String(getPlaylistTokenValue(token) || "");

  for (var index = 0; index < state.media.length; index += 1) {
    var item = state.media[index];

    if (
      item.id === value ||
      item.fileName === value ||
      item.name === value ||
      item.url === value ||
      safeDecode(item.url) === value
    ) {
      return item;
    }
  }

  return null;
}

function normalizePlaylists(payload, options) {
  var source = Array.isArray(payload) ? payload : payload && payload.playlists;
  var allowEmpty = options && options.allowEmpty;
  var isStored = options && options.isStored;
  var normalized = [];

  if (!Array.isArray(source)) return normalized;

  for (var index = 0; index < source.length; index += 1) {
    var playlist = source[index];
    var playlistItems = playlist && playlist.items;
    var items = [];
    var itemIds = [];
    var seen = {};
    var playlistId;

    if (!playlist || !Array.isArray(playlistItems)) continue;

    for (var itemIndex = 0; itemIndex < playlistItems.length; itemIndex += 1) {
      var media = findMediaByPlaylistToken(playlistItems[itemIndex]);
      if (!media || seen[media.id]) continue;

      seen[media.id] = true;
      items.push(media);
      itemIds.push(media.id);
    }

    if (!items.length && !allowEmpty) continue;

    playlistId = String(playlist.id || playlist.name || "playlist-" + (normalized.length + 1));

    normalized.push({
      id: playlistId,
      name: playlist.name || playlist.id || "Playlist " + (normalized.length + 1),
      items: items,
      itemIds: itemIds,
      isStored: !!isStored
    });
  }

  return normalized;
}

function normalizeStoredPlaylistsPayload(payload) {
  var rawPlaylists = Array.isArray(payload) ? payload : payload && payload.playlists;
  var rawDeletedIds = payload && payload.deletedIds;
  var normalized = { playlists: [], deletedIds: [] };
  var seenDeleted = {};

  if (Array.isArray(rawPlaylists)) {
    for (var index = 0; index < rawPlaylists.length; index += 1) {
      var playlist = rawPlaylists[index];
      var items = [];

      if (!playlist || !playlist.id) continue;

      if (Array.isArray(playlist.items)) {
        for (var itemIndex = 0; itemIndex < playlist.items.length; itemIndex += 1) {
          var itemId = String(getPlaylistTokenValue(playlist.items[itemIndex]) || "");
          if (itemId) items.push(itemId);
        }
      }

      normalized.playlists.push({
        id: String(playlist.id),
        name: String(playlist.name || playlist.id),
        items: items
      });
    }
  }

  if (Array.isArray(rawDeletedIds)) {
    for (var deletedIndex = 0; deletedIndex < rawDeletedIds.length; deletedIndex += 1) {
      var deletedId = String(rawDeletedIds[deletedIndex] || "");
      if (!deletedId || seenDeleted[deletedId]) continue;

      seenDeleted[deletedId] = true;
      normalized.deletedIds.push(deletedId);
    }
  }

  return normalized;
}

function loadStoredPlaylistsPayload() {
  var raw = getStoredValue(playlistStorageKey, "");

  if (!raw) return normalizeStoredPlaylistsPayload(state.storedPlaylistPayload);

  try {
    return normalizeStoredPlaylistsPayload(JSON.parse(raw));
  } catch (error) {
    return { playlists: [], deletedIds: [] };
  }
}

function saveStoredPlaylistsPayload(payload) {
  var normalized = normalizeStoredPlaylistsPayload(payload);
  state.storedPlaylistPayload = normalized;
  setStoredValue(playlistStorageKey, JSON.stringify(normalized));
  return normalized;
}

function getEmbeddedPlaylistPayload() {
  var payload = window.MIRROROS_PLAYLISTS;

  if (!payload && typeof MIRROROS_PLAYLISTS !== "undefined") {
    payload = MIRROROS_PLAYLISTS;
  }

  return payload;
}

function getEmbeddedPlaylists() {
  return normalizePlaylists(getEmbeddedPlaylistPayload(), { allowEmpty: false, isStored: false });
}

function applyServerPlaylistsPayload(payload) {
  state.serverPlaylistsAvailable = true;
  state.storedPlaylistPayload = normalizeStoredPlaylistsPayload(payload);
  state.playlists = normalizePlaylists(state.storedPlaylistPayload, { allowEmpty: true, isStored: true });
  state.embeddedPlaylistIds = {};
}

function mergePlaylists(embeddedPlaylists, storedPayload) {
  var deleted = {};
  var positions = {};
  var merged = [];
  var storedPlaylists;

  for (var deletedIndex = 0; deletedIndex < storedPayload.deletedIds.length; deletedIndex += 1) {
    deleted[storedPayload.deletedIds[deletedIndex]] = true;
  }

  state.embeddedPlaylistIds = {};

  for (var embeddedIndex = 0; embeddedIndex < embeddedPlaylists.length; embeddedIndex += 1) {
    var embedded = embeddedPlaylists[embeddedIndex];
    state.embeddedPlaylistIds[embedded.id] = true;

    if (deleted[embedded.id]) continue;

    positions[embedded.id] = merged.length;
    merged.push(embedded);
  }

  storedPlaylists = normalizePlaylists(storedPayload, { allowEmpty: true, isStored: true });

  for (var storedIndex = 0; storedIndex < storedPlaylists.length; storedIndex += 1) {
    var stored = storedPlaylists[storedIndex];

    if (typeof positions[stored.id] === "number") {
      merged[positions[stored.id]] = stored;
    } else {
      positions[stored.id] = merged.length;
      merged.push(stored);
    }
  }

  return merged;
}

function loadEmbeddedPlaylists() {
  var embeddedPlaylists = getEmbeddedPlaylists();

  state.serverPlaylistsAvailable = false;
  state.storedPlaylistPayload = loadStoredPlaylistsPayload();
  state.playlists = mergePlaylists(embeddedPlaylists, state.storedPlaylistPayload);
}

function loadPlaylists(onDone) {
  fetchJson(toApiUrl("/api/playlists"), function (payload) {
    applyServerPlaylistsPayload(payload);
    onDone();
  }, function () {
    loadEmbeddedPlaylists();
    onDone();
  });
}

function getActivePlaylist() {
  if (state.activePlaylistId === "all") return null;

  for (var index = 0; index < state.playlists.length; index += 1) {
    if (state.playlists[index].id === state.activePlaylistId) {
      return state.playlists[index];
    }
  }

  return null;
}

function getPlaylistById(id) {
  for (var index = 0; index < state.playlists.length; index += 1) {
    if (state.playlists[index].id === id) {
      return state.playlists[index];
    }
  }

  return null;
}

function getPlaylistSource() {
  var playlist = getActivePlaylist();
  return playlist ? playlist.items : state.media;
}

function renderPlaylistOptions() {
  var hasSelectedPlaylist = state.activePlaylistId === "all";

  if (!playlistSelect) return;

  clearElement(playlistSelect);

  var allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Todas as midias";
  playlistSelect.appendChild(allOption);

  for (var index = 0; index < state.playlists.length; index += 1) {
    var playlist = state.playlists[index];
    var option = document.createElement("option");
    option.value = playlist.id;
    option.textContent = playlist.name + " (" + playlist.items.length + ")";
    playlistSelect.appendChild(option);

    if (playlist.id === state.activePlaylistId) {
      hasSelectedPlaylist = true;
    }
  }

  if (!hasSelectedPlaylist) {
    state.activePlaylistId = "all";
  }

  playlistSelect.value = state.activePlaylistId;
  playlistSelect.disabled = false;
}

function trimText(value) {
  return String(value || "").replace(/^\s+|\s+$/g, "");
}

function getStoredPlaylistIndex(payload, id) {
  for (var index = 0; index < payload.playlists.length; index += 1) {
    if (payload.playlists[index].id === id) return index;
  }

  return -1;
}

function removeDeletedPlaylistId(payload, id) {
  var deletedIds = [];

  for (var index = 0; index < payload.deletedIds.length; index += 1) {
    if (payload.deletedIds[index] !== id) deletedIds.push(payload.deletedIds[index]);
  }

  payload.deletedIds = deletedIds;
}

function addDeletedPlaylistId(payload, id) {
  for (var index = 0; index < payload.deletedIds.length; index += 1) {
    if (payload.deletedIds[index] === id) return;
  }

  payload.deletedIds.push(id);
}

function persistPlaylistPayload(payload, onDone) {
  var normalized = normalizeStoredPlaylistsPayload(payload);

  if (state.serverPlaylistsAvailable) {
    sendJson(toApiUrl("/api/playlists"), "PUT", normalized, function (serverPayload) {
      applyServerPlaylistsPayload(serverPayload);

      if (onDone) onDone("Playlist salva para todos");
    }, function () {
      state.serverPlaylistsAvailable = false;
      saveStoredPlaylistsPayload(normalized);
      loadEmbeddedPlaylists();

      if (window.alert) {
        window.alert("Nao foi possivel salvar para todos agora. A playlist ficou salva neste aparelho.");
      }

      if (onDone) onDone("Playlist salva neste aparelho");
    });
    return;
  }

  saveStoredPlaylistsPayload(normalized);
  loadEmbeddedPlaylists();

  if (onDone) onDone("Playlist salva neste aparelho");
}

function getEditablePlaylistPayload() {
  if (state.serverPlaylistsAvailable) {
    return normalizeStoredPlaylistsPayload(state.storedPlaylistPayload);
  }

  return normalizeStoredPlaylistsPayload({
    playlists: state.playlists
  });
}

function upsertStoredPlaylist(id, name, itemIds, onDone) {
  var payload = getEditablePlaylistPayload();
  var storedIndex = getStoredPlaylistIndex(payload, id);
  var playlist = {
    id: id,
    name: trimText(name) || "Playlist",
    items: itemIds || []
  };

  if (storedIndex >= 0) {
    payload.playlists[storedIndex] = playlist;
  } else {
    payload.playlists.push(playlist);
  }

  removeDeletedPlaylistId(payload, id);
  persistPlaylistPayload(payload, onDone);
}

function deleteStoredPlaylist(id, onDone) {
  var payload = getEditablePlaylistPayload();
  var playlists = [];

  for (var index = 0; index < payload.playlists.length; index += 1) {
    if (payload.playlists[index].id !== id) playlists.push(payload.playlists[index]);
  }

  payload.playlists = playlists;

  if (!state.serverPlaylistsAvailable && state.embeddedPlaylistIds[id]) {
    addDeletedPlaylistId(payload, id);
  } else {
    removeDeletedPlaylistId(payload, id);
  }

  persistPlaylistPayload(payload, onDone);
}

function createPlaylistId() {
  var id;

  do {
    id = "user-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  } while (getPlaylistById(id));

  return id;
}

function makeUniquePlaylistName() {
  var baseName = "Nova playlist";
  var name = baseName;
  var suffix = 2;
  var exists = true;

  while (exists) {
    exists = false;

    for (var index = 0; index < state.playlists.length; index += 1) {
      if (state.playlists[index].name === name) {
        exists = true;
        break;
      }
    }

    if (exists) {
      name = baseName + " " + suffix;
      suffix += 1;
    }
  }

  return name;
}

function getCheckedPlaylistItemIds() {
  var ids = [];
  var checkboxes;

  if (!playlistItems || !playlistItems.querySelectorAll) return ids;

  checkboxes = playlistItems.querySelectorAll("input[type=checkbox]");

  for (var index = 0; index < checkboxes.length; index += 1) {
    if (checkboxes[index].checked) ids.push(checkboxes[index].value);
  }

  return ids;
}

function refreshPlaylistsAfterChange(message) {
  renderPlaylistOptions();
  renderMedia();
  renderPlaylistEditor();
  updatePlaylistUrl();

  if (message) setStatus(message);
}

function renderPlaylistList() {
  if (!playlistList) return;

  clearElement(playlistList);

  if (!state.playlists.length) {
    var empty = document.createElement("span");
    empty.className = "playlist-empty";
    empty.textContent = "Nenhuma playlist";
    playlistList.appendChild(empty);
    return;
  }

  for (var index = 0; index < state.playlists.length; index += 1) {
    var playlist = state.playlists[index];
    var button = document.createElement("button");
    var name = document.createElement("strong");
    var count = document.createElement("span");

    button.className = "playlist-list-item";
    if (playlist.id === state.editingPlaylistId) addClass(button, "is-active");
    button.type = "button";

    name.textContent = playlist.name;
    count.textContent = playlist.items.length + " midia" + (playlist.items.length === 1 ? "" : "s");

    button.appendChild(name);
    button.appendChild(count);

    (function (playlistId) {
      button.addEventListener("click", function () {
        state.editingPlaylistId = playlistId;
        renderPlaylistEditor();
      });
    })(playlist.id);

    playlistList.appendChild(button);
  }
}

function renderPlaylistMediaItems(playlist) {
  var selected = {};

  if (!playlistItems) return;

  clearElement(playlistItems);

  if (playlist) {
    for (var selectedIndex = 0; selectedIndex < playlist.items.length; selectedIndex += 1) {
      selected[playlist.items[selectedIndex].id] = true;
    }
  }

  for (var index = 0; index < state.media.length; index += 1) {
    var item = state.media[index];
    var label = document.createElement("label");
    var checkbox = document.createElement("input");
    var text = document.createElement("span");
    var title = document.createElement("strong");
    var meta = document.createElement("small");

    label.className = "playlist-media-row";

    checkbox.type = "checkbox";
    checkbox.value = item.id;
    checkbox.checked = !!selected[item.id];
    checkbox.disabled = !playlist;

    title.textContent = item.name;
    meta.textContent = (item.type === "video" ? "Video" : "Imagem") + " / " + formatBytes(item.size);

    text.appendChild(title);
    text.appendChild(meta);
    label.appendChild(checkbox);
    label.appendChild(text);
    playlistItems.appendChild(label);
  }
}

function renderPlaylistEditor() {
  var playlist = getPlaylistById(state.editingPlaylistId);

  if (!playlistEditor) return;

  if (!playlist && state.playlists.length) {
    state.editingPlaylistId = state.playlists[0].id;
    playlist = state.playlists[0];
  }

  renderPlaylistList();

  if (playlistNameInput) {
    playlistNameInput.value = playlist ? playlist.name : "";
    playlistNameInput.disabled = !playlist;
  }

  if (newPlaylistButton) newPlaylistButton.disabled = false;
  if (savePlaylistButton) savePlaylistButton.disabled = !playlist;
  if (deletePlaylistButton) deletePlaylistButton.disabled = !playlist;

  renderPlaylistMediaItems(playlist);
}

function openPlaylistEditor() {
  if (!playlistEditor) return;

  if (state.activePlaylistId !== "all" && getActivePlaylist()) {
    state.editingPlaylistId = state.activePlaylistId;
  } else if (!getPlaylistById(state.editingPlaylistId) && state.playlists.length) {
    state.editingPlaylistId = state.playlists[0].id;
  }

  addClass(document.body, "is-editing-playlists");
  playlistEditor.setAttribute("aria-hidden", "false");
  renderPlaylistEditor();

  if (!state.serverPlaylistsAvailable) {
    setStatus("Sem servidor global. Edicoes ficam neste aparelho");
  }

  if (playlistNameInput && !playlistNameInput.disabled) {
    try {
      playlistNameInput.focus();
      playlistNameInput.select();
    } catch (error) {
      noop();
    }
  }
}

function closePlaylistEditor() {
  if (!playlistEditor) return;

  removeClass(document.body, "is-editing-playlists");
  playlistEditor.setAttribute("aria-hidden", "true");
}

function createNewPlaylist() {
  var id = createPlaylistId();
  var name = makeUniquePlaylistName();

  state.activePlaylistId = id;
  state.editingPlaylistId = id;
  upsertStoredPlaylist(id, name, [], refreshPlaylistsAfterChange);
}

function savePlaylistFromEditor() {
  var playlist = getPlaylistById(state.editingPlaylistId);
  var name;

  if (!playlist) return;

  name = playlistNameInput ? playlistNameInput.value : playlist.name;
  state.activePlaylistId = playlist.id;
  state.editingPlaylistId = playlist.id;
  upsertStoredPlaylist(playlist.id, name, getCheckedPlaylistItemIds(), refreshPlaylistsAfterChange);
}

function deletePlaylistFromEditor() {
  var playlist = getPlaylistById(state.editingPlaylistId);
  var confirmed = true;

  if (!playlist) return;

  if (window.confirm) {
    confirmed = window.confirm("Apagar a playlist \"" + playlist.name + "\"?");
  }

  if (!confirmed) return;

  deleteStoredPlaylist(playlist.id);

  if (state.activePlaylistId === playlist.id) {
    state.activePlaylistId = "all";
  }

  state.editingPlaylistId = null;
  deleteStoredPlaylist(playlist.id, refreshPlaylistsAfterChange);
}

function getFilteredMedia() {
  var source = getPlaylistSource();

  if (state.filter === "all") return source;

  var filtered = [];
  for (var index = 0; index < source.length; index += 1) {
    if (source[index].type === state.filter) filtered.push(source[index]);
  }

  return filtered;
}

function getPlaylist() {
  var filtered = getFilteredMedia();
  return filtered.length ? filtered : getPlaylistSource();
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
  var playlist = getActivePlaylist();
  clearElement(grid);
  mediaCount.textContent = state.media.length;

  if (!media.length) {
    var empty = document.createElement("div");
    var playlistHasItems = playlist && playlist.items.length;
    var emptyHtml;
    empty.className = "empty-state";

    if (playlist && playlistHasItems) {
      emptyHtml = [
        "<strong>Nenhuma midia neste filtro</strong>",
        "<span>" + playlist.items.length + " arquivo" + (playlist.items.length === 1 ? "" : "s") + " na playlist.</span>"
      ].join("");
    } else if (playlist) {
      emptyHtml = [
        "<strong>Playlist vazia</strong>",
        "<span>0 arquivos selecionados.</span>"
      ].join("");
    } else {
      emptyHtml = [
        "<strong>Nenhuma midia encontrada</strong>",
        "<span>Atualize o manifest.json ou coloque arquivos na pasta media local.</span>"
      ].join("");
    }

    empty.innerHTML = emptyHtml;
    grid.appendChild(empty);
    setStatus(playlist ? playlist.name + ": 0 arquivos" : "Sem midias");
    return;
  }

  for (var index = 0; index < media.length; index += 1) {
    grid.appendChild(createMediaCard(media[index]));
  }

  setStatus(
    (playlist ? playlist.name + ": " : "") +
    media.length +
    " arquivo" +
    (media.length === 1 ? "" : "s")
  );
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

function sendJson(url, method, payload, onSuccess, onError) {
  var xhr = new XMLHttpRequest();

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;

    if (xhr.status >= 200 && xhr.status < 300) {
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
    xhr.open(method, url, true);
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.send(JSON.stringify(payload));
  } catch (error) {
    onError(error);
  }
}

function withApiMediaUrls(payload) {
  var media;
  var clone;

  if (!apiBaseUrl) return payload;

  media = Array.isArray(payload) ? payload : payload && payload.media;
  if (!Array.isArray(media)) return payload;

  clone = Array.isArray(payload) ? [] : {};

  if (!Array.isArray(payload)) {
    for (var key in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        clone[key] = payload[key];
      }
    }
  }

  clone.media = [];

  for (var index = 0; index < media.length; index += 1) {
    var item = {};

    for (var itemKey in media[index]) {
      if (Object.prototype.hasOwnProperty.call(media[index], itemKey)) {
        item[itemKey] = media[index][itemKey];
      }
    }

    if (item.url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(String(item.url))) {
      item.url = String(item.url).charAt(0) === "/"
        ? apiBaseUrl + item.url
        : apiBaseUrl + "/" + item.url;
    }

    clone.media.push(item);
  }

  return clone;
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

function completeMediaLoad(payload) {
  var loadedMedia = normalizeManifest(payload);

  if (!loadedMedia.length) {
    failMediaLoad(new Error("Manifest sem midias"));
    return;
  }

  state.media = loadedMedia;
  updatePerformanceMode();
  loadPlaylists(function () {
    renderPlaylistOptions();
    renderMedia();
    openFromQuery();
    refreshButton.disabled = false;
  });
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

  fetchJson(toApiUrl("/api/media"), function (payload) {
    completeMediaLoad(withApiMediaUrls(payload));
  }, function () {
    if (loadEmbeddedManifest()) return;

    fetchJson("manifest.json", completeMediaLoad, failMediaLoad);
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

function updatePlaylistUrl() {
  var nextUrl;

  if (!window.history || !window.history.replaceState) return;

  if (window.URLSearchParams) {
    try {
      var params = new URLSearchParams(window.location.search);
      params.delete("play");

      if (state.activePlaylistId === "all") {
        params.delete("playlist");
      } else {
        params.set("playlist", state.activePlaylistId);
      }

      nextUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    } catch (error) {
      nextUrl = null;
    }
  }

  if (!nextUrl) {
    nextUrl = state.activePlaylistId === "all"
      ? window.location.pathname
      : window.location.pathname + "?playlist=" + encodeURIComponent(state.activePlaylistId);
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

  if (getActivePlaylist() && getPlaylist().length > 1) {
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
    } else {
      updateVideoProgress(video);
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
  setVideoProgressActive(item.type === "video");

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
      updateVideoProgress(video);
      handleVideoFinished(video);
    });
    video.addEventListener("timeupdate", function () {
      updateVideoProgress(video);
      if (isVideoNearEnd(video)) handleVideoFinished(video);
    });
    video.addEventListener("loadedmetadata", function () {
      updateVideoProgress(video);
    });
    video.addEventListener("durationchange", function () {
      updateVideoProgress(video);
    });
    video.addEventListener("playing", function () {
      clearVideoLoadTimer();
      clearStageMessage();
      updateVideoProgress(video);
    });
    video.addEventListener("canplay", function () {
      clearVideoLoadTimer();
      clearStageMessage();
      updateVideoProgress(video);
    });
    video.addEventListener("pause", function () {
      updateVideoProgress(video);
      if (!state.isPaused && isVideoNearEnd(video)) handleVideoFinished(video);
    });
    video.addEventListener("waiting", function () {
      updateVideoProgress(video);
      if (isVideoNearEnd(video)) handleVideoFinished(video);
      else clearVideoLoadTimer();
    });
    video.addEventListener("stalled", function () {
      updateVideoProgress(video);
      if (isVideoNearEnd(video)) handleVideoFinished(video);
      else clearVideoLoadTimer();
    });
    video.addEventListener("error", function () {
      showVideoError(video);
    });

    stage.appendChild(video);
    state.activeVideo = video;
    updateVideoProgress(video);
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
  setVideoProgressActive(false);
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

  updatePlaylistUrl();
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

if (playlistSelect) {
  playlistSelect.addEventListener("change", function () {
    state.activePlaylistId = playlistSelect.value || "all";
    renderMedia();
    updatePlaylistUrl();
  });
}

if (managePlaylistsButton) {
  managePlaylistsButton.addEventListener("click", openPlaylistEditor);
}

if (closePlaylistEditorButton) {
  closePlaylistEditorButton.addEventListener("click", closePlaylistEditor);
}

if (newPlaylistButton) {
  newPlaylistButton.addEventListener("click", createNewPlaylist);
}

if (savePlaylistButton) {
  savePlaylistButton.addEventListener("click", savePlaylistFromEditor);
}

if (deletePlaylistButton) {
  deletePlaylistButton.addEventListener("click", deletePlaylistFromEditor);
}

if (playlistNameInput) {
  playlistNameInput.addEventListener("keydown", function (event) {
    var key = event.key || "";
    var keyCode = event.keyCode || event.which;

    if (key === "Enter" || keyCode === 13) {
      if (event.preventDefault) event.preventDefault();
      savePlaylistFromEditor();
    }
  });
}

if (playlistEditor) {
  playlistEditor.addEventListener("click", function (event) {
    if (event.target === playlistEditor) {
      closePlaylistEditor();
    }
  });
}

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

  if ((key === "Escape" || keyCode === 27) && hasClass(document.body, "is-editing-playlists")) {
    closePlaylistEditor();
    return;
  }

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
