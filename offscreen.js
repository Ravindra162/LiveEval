const ENGINE_URL = chrome.runtime.getURL("engine/stockfish-19-lite-single.js");
const engine = new Worker(ENGINE_URL);
let ready = false;
let searching = false;
let currentFen = "";
let activeFen = "";
let queuedFen = "";

engine.onmessage = (event) => {
  const line = String(event.data || "");
  if (line === "uciok") { engine.postMessage("isready"); return; }
  if (line === "readyok") { ready = true; if (currentFen) search(currentFen); return; }
  const depth = line.match(/\bdepth\s+(\d+)/);
  const cp = line.match(/\bscore\s+cp\s+(-?\d+)/);
  const mate = line.match(/\bscore\s+mate\s+(-?\d+)/);
  if (/\bbestmove\s+\S+/.test(line)) {
    searching = false;
    activeFen = "";
    if (queuedFen && queuedFen === currentFen) {
      const next = queuedFen;
      queuedFen = "";
      runSearch(next);
    }
    return;
  }
  if (!depth || (!cp && !mate) || !activeFen || activeFen !== currentFen) return;
  const blackToMove = activeFen.split(/\s+/)[1] === "b";
  const raw = cp ? Number(cp[1]) / 100 : null;
  const rawMate = mate ? Number(mate[1]) : null;
  chrome.runtime.sendMessage({
    type: "clipchess-engine-eval",
    score: raw === null ? (rawMate > 0 ? 10 : -10) * (blackToMove ? -1 : 1) : raw * (blackToMove ? -1 : 1),
    mate: rawMate === null ? null : rawMate * (blackToMove ? -1 : 1),
    depth: Number(depth[1]),
  }).catch(() => {});
};

engine.postMessage("uci");

function search(fen) {
  if (!fen) return;
  currentFen = fen;
  if (!ready) return;
  if (searching) {
    queuedFen = fen;
    engine.postMessage("stop");
    return;
  }
  runSearch(fen);
}

function runSearch(fen) {
  if (!ready || !fen) return;
  currentFen = fen;
  activeFen = fen;
  searching = true;
  engine.postMessage(`position fen ${fen}`);
  engine.postMessage("go movetime 900");
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target !== "clipchess-engine") return;
  if (message.type === "position" && typeof message.fen === "string") search(message.fen);
  if (message.type === "stop") {
    currentFen = "";
    activeFen = "";
    queuedFen = "";
    searching = false;
    engine.postMessage("stop");
  }
});
