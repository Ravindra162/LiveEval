(() => {
  const CHANNEL = "clipchess-observer-position-v1";
  let previous = "";
  let lastSentAt = 0;

  function readPgn(game) {
    for (const method of ["getPGN", "getPgn", "getPGNString", "getPgnString"]) {
      try {
        const value = game[method]?.();
        if (typeof value === "string" && value.trim()) return value.trim();
      } catch {}
    }
    for (const property of ["pgn", "PGN", "gamePgn"]) {
      try {
        const value = game[property];
        if (typeof value === "string" && value.trim()) return value.trim();
      } catch {}
    }
    return "";
  }

  function readMoveApiHints(game) {
    try {
      const names = new Set();
      for (let object = game; object && object !== Object.prototype; object = Object.getPrototypeOf(object)) {
        for (const name of Object.getOwnPropertyNames(object)) {
          if (/pgn|move|history/i.test(name)) names.add(name);
        }
      }
      return [...names].slice(0, 30);
    } catch { return []; }
  }

  function readPerspective(board, game) {
    // Chess.com changes its internal game object over time, so check a few
    // common option names and the board element before falling back to White.
    try {
      const options = game.getOptions?.() || game.options || {};
      if (typeof options.isWhiteOnBottom === "boolean") {
        return { pov: options.isWhiteOnBottom ? "white" : "black", povSource: "game options" };
      }
      if (typeof options.whiteOnBottom === "boolean") {
        return { pov: options.whiteOnBottom ? "white" : "black", povSource: "game options" };
      }
      if (typeof options.flipped === "boolean") {
        return { pov: options.flipped ? "black" : "white", povSource: "game options" };
      }
      if (typeof game.isWhiteOnBottom === "boolean") {
        return { pov: game.isWhiteOnBottom ? "white" : "black", povSource: "game options" };
      }
      const orientation = String(options.orientation || options.boardOrientation || game.orientation || "").toLowerCase();
      if (orientation.includes("black")) return { pov: "black", povSource: "game options" };
      if (orientation.includes("white")) return { pov: "white", povSource: "game options" };
    } catch {}

    let computedTransform = "";
    try { computedTransform = getComputedStyle(board).transform; } catch {}
    const boardText = [board.className, computedTransform, ...[...board.attributes].map(({ name, value }) => `${name}=${value}`)]
      .join(" ").toLowerCase();
    if (/orientation[^ ]*black|black[^ ]*orientation|black[-_= ]?bottom|flipped|rotate[-_= ]?180|matrix\(\s*-1,\s*0,\s*0,\s*-1/.test(boardText)) {
      return { pov: "black", povSource: "board orientation" };
    }
    if (/orientation[-_= ]?white|white[-_= ]?bottom/.test(boardText)) {
      return { pov: "white", povSource: "board orientation" };
    }
    return { pov: "white", povSource: "default board orientation" };
  }

  function readState() {
    const board = document.querySelector("wc-chess-board");
    const game = board?.game;
    if (!game) return { mode: "loading", fen: "", result: "", pgn: "", moveApiHints: [], pov: "white", povSource: "waiting for board" };
    let mode = "unknown";
    let fen = "";
    let result = "";
    try {
      const modeValue = game.getMode?.();
      mode = typeof modeValue === "string" ? modeValue : modeValue?.name || modeValue?.mode || "unknown";
    } catch {}
    try { fen = game.getFEN?.() || ""; } catch {}
    try { result = game.getResult?.() || ""; } catch {}
    return { mode, fen, result, pgn: readPgn(game), moveApiHints: readMoveApiHints(game), ...readPerspective(board, game) };
  }

  function publish() {
    const state = readState();
    const signature = `${state.mode}|${state.fen}|${state.result}|${state.pgn}|${state.pov}|${state.povSource}`;
    const now = Date.now();
    if (signature !== previous || now - lastSentAt > 1200) {
      previous = signature;
      lastSentAt = now;
      window.postMessage({ channel: CHANNEL, state }, location.origin);
    }
  }

  publish();
  window.setInterval(publish, 400);
})();
