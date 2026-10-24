const params = new URLSearchParams(location.search);
const tabId = Number(params.get("tabId"));
const badge = document.getElementById("connection-badge");
const pageStatus = document.getElementById("page-status");
const mode = document.getElementById("mode");
const result = document.getElementById("result");
const pgn = document.getElementById("pgn");
const fen = document.getElementById("fen");
const turn = document.getElementById("turn");
const moveCount = document.getElementById("move-count");
const lastUpdate = document.getElementById("last-update");
const evaluation = document.getElementById("evaluation");
const depth = document.getElementById("depth");
const apiHints = document.getElementById("api-hints");
const povSelect = document.getElementById("pov-select");
const povStatus = document.getElementById("pov-status");
let connected = false;
let detectedPov = "white";
let povSource = "default board orientation";
let povOverride = "auto";
let latestEvaluation = null;

function effectivePov() {
  return povOverride === "auto" ? detectedPov : povOverride;
}

function renderPov() {
  const pov = effectivePov();
  const source = povOverride === "auto" ? `Auto · ${povSource || "board orientation"}` : "Manual selection";
  povStatus.textContent = `${source} · ${pov.toUpperCase()} POV`;
  if (latestEvaluation) renderEvaluation(latestEvaluation);
}

function setBadge(text, state) {
  badge.textContent = text;
  badge.className = `badge ${state || "wait"}`;
}

function renderState(state) {
  connected = true;
  if (state.detectedPov || state.pov) detectedPov = state.detectedPov || state.pov;
  if (state.povSource) povSource = state.povSource;
  if (state.povOverride && povSelect.value === "auto") povOverride = state.povOverride;
  if (povSelect.value !== povOverride) povSelect.value = povOverride;
  const modeName = state.mode || "unknown";
  mode.textContent = modeName;
  result.textContent = `Game result: ${state.result || "in progress / unknown"}`;
  const hasPosition = state.hasPosition ?? Boolean(state.fen);
  if (state.mode === "observing" && hasPosition) {
    pageStatus.textContent = "Extension connected · spectator mode";
    setBadge("CONNECTED", "good");
  } else if (state.mode === "playing") {
    pageStatus.textContent = "Extension connected · this is a player view";
    setBadge("PLAYER VIEW", "bad");
  } else {
    pageStatus.textContent = `Extension connected · waiting for observer mode (${modeName})`;
    setBadge("CONNECTED · CHECK MODE", "wait");
  }
  if (state.fen) {
    fen.textContent = state.fen;
    const fenFields = state.fen.trim().split(/\s+/);
    turn.textContent = fenFields[1] === "w" ? "WHITE TO MOVE" : fenFields[1] === "b" ? "BLACK TO MOVE" : "—";
  } else {
    fen.textContent = "No FEN received yet.";
  }
  if (state.pgn) {
    pgn.textContent = state.pgn;
    moveCount.textContent = `${state.pgn.length} chars`;
  } else {
    pgn.textContent = hasPosition
      ? "Position feed is live, but PGN is not exposed by the detected Chess.com page interface yet. FEN above confirms current position updates."
      : "Waiting for Chess.com move data…";
    moveCount.textContent = "0 chars";
  }
  apiHints.textContent = state.moveApiHints?.length ? state.moveApiHints.join(" · ") : "No PGN/move/history methods detected";
  if (state.evaluation) latestEvaluation = state.evaluation;
  renderPov();
  lastUpdate.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
}

function renderEvaluation(value) {
  latestEvaluation = value;
  const factor = effectivePov() === "black" ? -1 : 1;
  const score = (Number(value?.score) || 0) * factor;
  const mate = value?.mate == null ? null : Number(value.mate) * factor;
  evaluation.textContent = mate ? `${mate > 0 ? "M" : "−M"}${Math.abs(mate)}` : `${score > 0 ? "+" : ""}${score.toFixed(1)}`;
  depth.textContent = `Depth ${value?.depth || "—"} · local Stockfish · ${effectivePov().toUpperCase()} POV`;
}

povSelect.addEventListener("change", () => {
  povOverride = povSelect.value;
  renderPov();
  if (Number.isInteger(tabId) && tabId > 0) {
    chrome.tabs.sendMessage(tabId, { type: "clipchess-set-pov", pov: povOverride }, () => void chrome.runtime.lastError);
  }
});

function pingTab() {
  if (!Number.isInteger(tabId) || tabId <= 0) {
    pageStatus.textContent = "No game tab linked. Open the monitor from the ClipChess popup.";
    setBadge("NO GAME TAB", "bad");
    return;
  }
  chrome.tabs.sendMessage(tabId, { type: "clipchess-ping" }, (state) => {
    if (chrome.runtime.lastError || !state?.injected) {
      if (!connected) {
        pageStatus.textContent = "Waiting for ClipChess content script. Keep the Chess.com game tab open; refresh it after reloading the extension.";
        setBadge("WAITING FOR PAGE", "wait");
      }
      return;
    }
    renderState(state);
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target !== "clipchess-dashboard" || message.tabId !== tabId) return;
  if (message.type === "clipchess-page-state") renderState(message.state || {});
  if (message.type === "clipchess-live-eval") renderEvaluation(message.evaluation);
});

pingTab();
setInterval(pingTab, 1800);
