const connection = document.getElementById("connection");
let currentTabId = null;

function checkCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    if (!tab?.id) {
      connection.textContent = "No active tab found.";
      connection.className = "connection bad";
      return;
    }
    currentTabId = tab.id;
    chrome.tabs.sendMessage(tab.id, { type: "clipchess-ping" }, (status) => {
      if (chrome.runtime.lastError || !status?.injected) {
        connection.textContent = "ClipChess is not connected to this tab. Open a Chess.com /game/ page here.";
        connection.className = "connection bad";
        return;
      }
      if (status.mode === "observing" && status.hasPosition) {
        connection.textContent = "Connected: spectator position detected; local analysis should start.";
        connection.className = "connection";
      } else if (status.mode === "observing") {
        connection.textContent = "Connected: spectator view detected; waiting for board position.";
        connection.className = "connection wait";
      } else {
        connection.textContent = `Connected, but spectator mode is not detected (mode: ${status.mode}).`;
        connection.className = "connection wait";
      }
    });
  });
}

checkCurrentTab();

const input = document.getElementById("game-url");
const error = document.getElementById("error");

function openGame() {
  error.hidden = true;
  let url;
  try { url = new URL(input.value.trim()); } catch {}
  if (!url || url.protocol !== "https:" || url.hostname !== "www.chess.com" || !url.pathname.startsWith("/game/")) {
    error.textContent = "Paste a link like https://www.chess.com/game/123456.";
    error.hidden = false;
    return;
  }
  chrome.tabs.create({ url: url.href }, (gameTab) => {
    const dashboardUrl = chrome.runtime.getURL(`dashboard.html?tabId=${gameTab.id}`);
    chrome.tabs.create({ url: dashboardUrl }, () => window.close());
  });
}

function openMonitor() {
  if (currentTabId === null) return;
  const dashboardUrl = chrome.runtime.getURL(`dashboard.html?tabId=${currentTabId}`);
  chrome.tabs.create({ url: dashboardUrl });
  window.close();
}

document.getElementById("open").addEventListener("click", openGame);
document.getElementById("monitor").addEventListener("click", openMonitor);
input.addEventListener("keydown", (event) => { if (event.key === "Enter") openGame(); });
