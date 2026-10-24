let offscreenCreating;
let activeTabId = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  if (offscreenCreating) { await offscreenCreating; return; }
  offscreenCreating = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["WORKERS"],
    justification: "Run a local Stockfish WebAssembly worker for read-only spectator evaluation.",
  });
  try { await offscreenCreating; } finally { offscreenCreating = null; }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "clipchess-page-state" && sender.tab?.id !== undefined) {
    const tabId = sender.tab.id;
    const state = message.state || {};
    chrome.runtime.sendMessage({ target: "clipchess-dashboard", type: "clipchess-page-state", tabId, state }).catch(() => {});
    return;
  }
  if (message?.type === "clipchess-position" && sender.tab?.id !== undefined) {
    activeTabId = sender.tab.id;
    ensureOffscreen().then(() => chrome.runtime.sendMessage({ target: "clipchess-engine", type: "position", fen: message.fen })).catch(() => {});
    return;
  }
  if (message?.type === "clipchess-stop") {
    if (sender.tab?.id === activeTabId || sender.tab?.id === undefined) {
      activeTabId = null;
      chrome.runtime.sendMessage({ target: "clipchess-engine", type: "stop" }).catch(() => {});
    }
    return;
  }
  if (message?.type === "clipchess-engine-eval" && sender.url?.endsWith("/offscreen.html")) {
    const evaluation = { score: message.score, mate: message.mate, depth: message.depth };
    if (activeTabId !== null) {
      chrome.tabs.sendMessage(activeTabId, { type: "clipchess-evaluation", ...evaluation }).catch(() => {});
      chrome.runtime.sendMessage({ target: "clipchess-dashboard", type: "clipchess-live-eval", tabId: activeTabId, evaluation }).catch(() => {});
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
    chrome.runtime.sendMessage({ target: "clipchess-engine", type: "stop" }).catch(() => {});
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.url && !changeInfo.url.startsWith("https://www.chess.com/game/")) {
    activeTabId = null;
    chrome.runtime.sendMessage({ target: "clipchess-engine", type: "stop" }).catch(() => {});
  }
});
