(() => {
  const CHANNEL = "clipchess-observer-position-v1";
  const HOST_ID = "clipchess-live-eval-host";
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let lastFen = "";
  let currentPageState = { mode: "loading", fen: "", result: "", pgn: "", moveApiHints: [], pov: "white", povSource: "waiting for board" };
  let currentEvaluation = null;
  let povOverride = "auto";
  let enabled = true;
  let host;
  let shadow;
  let dragResizeHandler;

  function ensureOverlay() {
    if (host?.isConnected) return shadow;
    host = document.createElement("div");
    host.id = HOST_ID;
    Object.assign(host.style, { position: "fixed", zIndex: "2147483647", top: "50%", right: "24px", transform: "translateY(-50%)", pointerEvents: "auto", touchAction: "none" });
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host{all:initial}.card{position:relative;font:14px/1.35 Arial,sans-serif;color:#f5f5ec;background:rgba(17,19,16,.96);border:1px solid #535a4d;border-radius:14px;padding:16px;display:flex;gap:14px;align-items:stretch;box-shadow:0 12px 30px #0006;min-width:190px;backdrop-filter:blur(8px);cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}.card.dragging{cursor:grabbing;box-shadow:0 16px 36px #0009}.drag-hint{position:absolute;right:8px;top:5px;color:#91998a;font:8px/1 Arial,sans-serif;letter-spacing:.12em}
        .copy{display:flex;flex-direction:column;justify-content:space-between;min-height:96px}.label{font-size:10px;letter-spacing:.12em;color:#b9cb9e;font-weight:700}.score{font-size:34px;font-weight:700;line-height:1}.meta{font-size:11px;color:#aab09f}.meter{width:22px;height:100px;border:1px solid #8c9087;border-radius:5px;overflow:hidden;background:#292b27;position:relative;flex:none}.meter.black{transform:rotate(180deg)}.white{position:absolute;left:0;right:0;bottom:0;background:#f0efe5}.zero{position:absolute;left:0;right:0;top:50%;height:1px;background:#7b7c72}
      </style>
      <div class="card" role="status" aria-label="Live evaluation, observer view only" title="Drag anywhere on this panel to move it">
        <span class="drag-hint" aria-hidden="true">DRAG</span>
        <div class="copy"><span class="label">OBSERVER · WHITE POV</span><b class="score">—</b><span class="meta">Waiting for position</span></div>
        <div class="meter"><i class="white"></i><i class="zero"></i></div>
      </div>`;
    document.documentElement.appendChild(host);
    makeDraggable(shadow.querySelector(".card"));
    return shadow;
  }

  function makeDraggable(card) {
    let drag = null;
    let customPosition = false;

    function moveTo(left, top) {
      const rect = host.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - rect.height);
      host.style.left = `${clamp(left, 0, maxLeft)}px`;
      host.style.top = `${clamp(top, 0, maxTop)}px`;
      host.style.right = "auto";
      host.style.bottom = "auto";
      host.style.transform = "none";
      customPosition = true;
    }

    card.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      moveTo(rect.left, rect.top);
      card.classList.add("dragging");
      card.setPointerCapture(event.pointerId);
    });

    card.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      moveTo(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    });

    function stopDragging(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      card.classList.remove("dragging");
      if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
    }

    card.addEventListener("pointerup", stopDragging);
    card.addEventListener("pointercancel", stopDragging);
    if (dragResizeHandler) window.removeEventListener("resize", dragResizeHandler);
    dragResizeHandler = () => {
      if (!customPosition || !host?.isConnected) return;
      const rect = host.getBoundingClientRect();
      moveTo(rect.left, rect.top);
    };
    window.addEventListener("resize", dragResizeHandler);
  }

  function showStatus(text, show = true) {
    if (!show) { host?.remove(); host = null; shadow = null; return; }
    const root = ensureOverlay();
    root.querySelector(".score").textContent = "—";
    root.querySelector(".meta").textContent = text;
  }

  function effectivePov() {
    return povOverride === "auto" ? (currentPageState.pov || "white") : povOverride;
  }

  function renderPerspective() {
    if (!host?.isConnected) return;
    const pov = effectivePov();
    shadow.querySelector(".label").textContent = `OBSERVER · ${pov.toUpperCase()} POV`;
    shadow.querySelector(".meter").classList.toggle("black", pov === "black");
  }

  function renderEvaluation() {
    if (!currentEvaluation || !enabled || !host?.isConnected) return;
    const root = ensureOverlay();
    const pov = effectivePov();
    renderPerspective();
    const factor = pov === "black" ? -1 : 1;
    const score = clamp((Number(currentEvaluation.score) || 0) * factor, -10, 10);
    const mate = currentEvaluation.mate == null ? null : Number(currentEvaluation.mate) * factor;
    root.querySelector(".label").textContent = `OBSERVER · ${pov.toUpperCase()} POV`;
    root.querySelector(".meter").classList.toggle("black", pov === "black");
    root.querySelector(".score").textContent = mate ? `${mate > 0 ? "M" : "−M"}${Math.abs(mate)}` : `${score > 0 ? "+" : ""}${score.toFixed(1)}`;
    root.querySelector(".meta").textContent = `Depth ${currentEvaluation.depth || "—"} · local engine`;
    const whiteScore = clamp(Number(currentEvaluation.score) || 0, -6, 6);
    root.querySelector(".white").style.height = `${(whiteScore + 6) / 12 * 100}%`;
  }

  function validFen(fen) {
    const parts = String(fen || "").trim().split(/\s+/);
    return parts.length >= 4 && /^[prnbqkPRNBQK1-8/]+$/.test(parts[0]) && /^[wb]$/.test(parts[1]);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== CHANNEL) return;
    const { mode, fen, result } = event.data.state || {};
    currentPageState = { mode, fen, result, pgn: event.data.state?.pgn || "", moveApiHints: event.data.state?.moveApiHints || [], pov: event.data.state?.pov || "white", povSource: event.data.state?.povSource || "unknown" };
    chrome.runtime.sendMessage({ type: "clipchess-page-state", state: currentPageState }).catch(() => {});
    renderPerspective();
    renderEvaluation();
    if (mode !== "observing") {
      lastFen = "";
      chrome.runtime.sendMessage({ type: "clipchess-stop", reason: "Open a spectator view to enable the bar." }).catch(() => {});
      showStatus(mode === "playing" ? "Off on player pages" : "Waiting for spectator view", mode !== "loading");
      return;
    }
    if (result && result !== "*") {
      lastFen = "";
      chrome.runtime.sendMessage({ type: "clipchess-stop", reason: "Game finished" }).catch(() => {});
      showStatus("Game finished · review after play", true);
      return;
    }
    if (!validFen(fen)) { showStatus("Waiting for board position", true); return; }
    ensureOverlay();
    if (fen !== lastFen) {
      lastFen = fen;
      shadow.querySelector(".meta").textContent = "Analyzing locally…";
      chrome.runtime.sendMessage({ type: "clipchess-position", fen }).catch(() => {});
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "clipchess-ping") {
      sendResponse({
        injected: true,
        mode: currentPageState.mode,
        hasPosition: validFen(currentPageState.fen),
        fen: currentPageState.fen,
        pgn: currentPageState.pgn,
        moveApiHints: currentPageState.moveApiHints,
        result: currentPageState.result,
        pov: effectivePov(),
        detectedPov: currentPageState.pov,
        povSource: currentPageState.povSource,
        povOverride,
        evaluation: currentEvaluation,
        overlay: Boolean(host?.isConnected),
      });
      return;
    }
    if (!message || message.type !== "clipchess-evaluation") return;
    currentEvaluation = { score: message.score, mate: message.mate, depth: message.depth };
    renderEvaluation();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "clipchess-set-pov") {
      if (["auto", "white", "black"].includes(message.pov)) {
        povOverride = message.pov;
        renderPerspective();
        renderEvaluation();
      }
      return;
    }
    if (message?.type !== "clipchess-toggle") return;
    enabled = Boolean(message.enabled);
    if (!enabled) host?.remove();
    else if (lastFen) showStatus("Analyzing locally…", true);
  });

  showStatus("Waiting for spectator view", true);
})();
