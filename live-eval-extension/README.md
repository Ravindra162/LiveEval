# ClipChess Live Eval (observer only)

This Chrome extension reads the current position from a Chess.com game spectator page and analyzes it locally with Stockfish 19 Lite. It supports shared links such as `/game/<id>` as well as `/game/live/<id>`. It renders only a score and evaluation bar; it never generates or displays candidate moves, arrows, or move suggestions.

The extension runs only when the Chess.com page reports `observing` and the game result is still `*`. It stays inactive on player pages and after the game ends. The page bridge reads the board state; it does not make moves or call Chess.com controls.

## Install in Chrome

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this folder: `live-eval-extension`.
5. Click the ClipChess toolbar icon, paste the shared Chess.com game link (for example, `https://www.chess.com/game/<id>?username=<name>`), and choose **Open game + live monitor**. Chrome opens the game tab and a dedicated extension dashboard. The dashboard shows connection state, current FEN, PGN when the page exposes it, page API hints, and local engine status. If the page does not expose PGN, changing FEN confirms that the live position feed is updating.

Use a separate spectator window for the recording. Do not share the evaluation with either player until the game is over. To record a short, capture the spectator page with OBS or another screen recorder and crop around the board and bar.

## Engine files and license

The extension bundles the Stockfish.js 19.0.1 lite single-threaded WebAssembly engine in `engine/`. This build is about 1.8 MB and runs without cross-origin-isolation headers. Stockfish.js is GPL-3.0; its license text is included as `engine/Copying.txt`.

## Scope and limits

- The bridge depends on Chess.com's page-internal `wc-chess-board.game` interface. Chess.com can change it, and it still needs a manual check against your current spectator page.
- The overlay is attached to the spectator tab so it can be captured in a recording. It is injected on `/game/*` pages but remains inactive unless Chess.com reports observer mode; it is not injected on `/play` pages.
- This is an educational broadcast overlay, not a game assistant. The official fair-play policy prohibits outside assistance for players during live games.
