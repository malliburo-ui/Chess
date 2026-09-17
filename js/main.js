import { Chess, squareName } from "./game.js";
import { pieceSvg } from "./pieces.js";
import { chooseMove } from "./ai.js";
import { startPvp } from "./pvp.js";

const LEVEL = { depth: 3, randomness: 0.08 };

const state = {
  game: new Chess(),
  playerColor: "w",
  selected: null,
  legal: [],
  lastMove: null,
  thinking: false,
  promotion: null,
  requestId: 0,
  animating: null,
  ready: false,
};

const els = {
  board: document.querySelector("#board"),
  promoRoot: document.querySelector("#promo-root"),
  overlay: document.querySelector("#result-overlay"),
  overlayTitle: document.querySelector("#result-title"),
  overlayText: document.querySelector("#result-text"),
  dragLayer: document.querySelector("#drag-layer"),
  lobby: document.querySelector("#lobby"),
  lobbyTitle: document.querySelector("#lobby-title"),
  lobbyText: document.querySelector("#lobby-text"),
  invite: document.querySelector("#invite"),
  inviteText: document.querySelector("#invite-text"),
  copyLink: document.querySelector("#copy-link"),
};

const moveSoundUrl = new URL("../assets/sounds/move.wav", import.meta.url).href + "?v=10";
const captureSoundUrl = new URL("../assets/sounds/capture.wav", import.meta.url).href + "?v=10";
const moveSound = new Audio(moveSoundUrl);
const captureSound = new Audio(captureSoundUrl);
moveSound.preload = "auto";
captureSound.preload = "auto";
moveSound.volume = 1;
captureSound.volume = 1;

const drag = {
  active: false,
  from: null,
  pointerId: null,
  x: 0,
  y: 0,
  visualX: 0,
  visualY: 0,
  vx: 0,
  angle: 0,
  size: 0,
  el: null,
  lastT: 0,
  lastX: 0,
  lastY: 0,
  tickT: 0,
  av: 0,
  hover: null,
  raf: 0,
};

let net = null;
let worker = null;
try {
  worker = new Worker(new URL("./engine.worker.js", import.meta.url), { type: "module" });
} catch {
  worker = null;
}

function isPvp() {
  return Boolean(net?.ready);
}

function isOver() {
  return state.game.isGameOver();
}

function isPlayerTurn() {
  if (net?.role === "guest" && !isPvp()) return false;
  return !isOver() && state.game.turn() === state.playerColor && !state.thinking && !state.animating;
}

function squareFromEvent(event) {
  const square = event.target.closest("[data-square]");
  return square ? square.dataset.square : null;
}

function squareFromPoint(x, y) {
  const node = document.elementFromPoint(x, y);
  const square = node?.closest?.("[data-square]");
  return square ? square.dataset.square : null;
}

function clearDropTarget() {
  els.board.querySelector(".drop-target")?.classList.remove("drop-target");
  drag.hover = null;
}

function setDropTarget(square) {
  if (drag.hover === square) return;
  clearDropTarget();
  if (!square || !state.legal.some((move) => move.to === square)) return;
  const el = els.board.querySelector(`[data-square="${square}"]`);
  if (el) {
    el.classList.add("drop-target");
    drag.hover = square;
  }
}

function beginDrag(from, event) {
  const source = els.board.querySelector(`[data-square="${from}"]`);
  const pieceEl = source?.querySelector(".piece");
  if (!pieceEl) return;

  const rect = pieceEl.getBoundingClientRect();
  drag.active = true;
  drag.from = from;
  drag.pointerId = event.pointerId;
  drag.size = Math.max(rect.width, rect.height) * 1.18;
  drag.x = event.clientX;
  drag.y = event.clientY;
  drag.visualX = event.clientX;
  drag.visualY = event.clientY;
  drag.vx = 0;
  drag.av = 0;
  drag.angle = 0;
  drag.lastT = performance.now();
  drag.tickT = 0;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;

  source.classList.add("source-drag");
  document.body.classList.add("dragging");

  const ghost = document.createElement("div");
  ghost.className = "drag-piece";
  ghost.style.width = `${drag.size}px`;
  ghost.style.height = `${drag.size}px`;
  ghost.innerHTML = pieceEl.innerHTML;
  els.dragLayer.replaceChildren(ghost);
  drag.el = ghost;
  paintDrag();

  try {
    els.board.setPointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }
  if (drag.raf) cancelAnimationFrame(drag.raf);
  drag.raf = requestAnimationFrame(tickDrag);
}

function paintDrag() {
  if (!drag.el) return;
  const half = drag.size / 2;
  drag.el.style.transform =
    `translate(${drag.visualX - half}px, ${drag.visualY - half - 10}px) rotate(${drag.angle}deg)`;
}

function tickDrag(now) {
  if (!drag.active) return;
  const dt = Math.min(0.032, drag.tickT ? (now - drag.tickT) / 1000 : 0.016);
  drag.tickT = now;
  drag.visualX += (drag.x - drag.visualX) * Math.min(1, 9 * dt);
  drag.visualY += (drag.y - drag.visualY) * Math.min(1, 9 * dt);
  // Pivot at the top: drag left, the base lags right, like carrying a real piece.
  const targetAngle = Math.max(-38, Math.min(38, -drag.vx * 0.1));
  drag.av += (120 * (targetAngle - drag.angle) - 9 * drag.av) * dt;
  drag.angle += drag.av * dt;
  drag.vx *= Math.exp(-2.6 * dt);
  paintDrag();
  drag.raf = requestAnimationFrame(tickDrag);
}

function moveDrag(event) {
  if (!drag.active) return;
  const now = performance.now();
  const dt = Math.max(8, now - drag.lastT);
  const instVx = ((event.clientX - drag.lastX) / dt) * 1000;
  drag.vx = drag.vx * 0.55 + instVx * 0.45;
  drag.x = event.clientX;
  drag.y = event.clientY;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  drag.lastT = now;
  setDropTarget(squareFromPoint(event.clientX, event.clientY));
}

function endDrag(event) {
  if (!drag.active) return;
  const from = drag.from;
  const x = Number.isFinite(event.clientX) ? event.clientX : drag.x;
  const y = Number.isFinite(event.clientY) ? event.clientY : drag.y;
  const to = squareFromPoint(x, y) || drag.hover;
  cancelDrag();
  if (to && to !== from) attemptMove(from, to);
}

function cancelDrag() {
  if (drag.raf) cancelAnimationFrame(drag.raf);
  drag.raf = 0;
  drag.active = false;
  drag.from = null;
  drag.pointerId = null;
  drag.el = null;
  drag.vx = 0;
  drag.angle = 0;
  drag.av = 0;
  els.dragLayer.replaceChildren();
  document.body.classList.remove("dragging");
  els.board.querySelector(".source-drag")?.classList.remove("source-drag");
  clearDropTarget();
}

function legalFrom(square) {
  return state.game.moves({ verbose: true, square });
}

function paintHighlights() {
  for (const btn of els.board.querySelectorAll(".square")) {
    const name = btn.dataset.square;
    btn.classList.toggle("selected", state.selected === name);
    btn.classList.remove("hint", "capture", "drop-target");
    const legalMove = state.legal.find((move) => move.to === name);
    if (legalMove) btn.classList.add(legalMove.captured ? "capture" : "hint");
  }
}

function render() {
  if (!drag.active && !state.animating) els.dragLayer.replaceChildren();
  const flipped = state.playerColor === "b";
  const kingSq = findKing(state.game.turn());
  const inCheck = state.game.isCheck();
  els.board.replaceChildren();
  els.promoRoot.replaceChildren();

  for (let displayRow = 0; displayRow < 8; displayRow++) {
    for (let displayCol = 0; displayCol < 8; displayCol++) {
      const r = flipped ? 7 - displayRow : displayRow;
      const c = flipped ? 7 - displayCol : displayCol;
      const name = squareName(r, c);
      const light = (r + c) % 2 === 0;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `square ${light ? "light" : "dark"}`;
      button.dataset.square = name;
      button.setAttribute("aria-label", name);

      if (state.lastMove && (state.lastMove.from === name || state.lastMove.to === name)) {
        button.classList.add("last");
      }
      if (state.selected === name) button.classList.add("selected");
      if (inCheck && kingSq === name) button.classList.add("check");

      const legalMove = state.legal.find((move) => move.to === name);
      if (legalMove) button.classList.add(legalMove.captured ? "capture" : "hint");

      const piece = state.game.board[r][c];
      if (piece) {
        const wrap = document.createElement("span");
        wrap.className = "piece";
        if (state.animating?.hide?.includes(name)) wrap.classList.add("is-hidden");
        wrap.innerHTML = pieceSvg(piece === piece.toUpperCase() ? "w" : "b", piece.toLowerCase());
        button.append(wrap);
      }

      els.board.append(button);
    }
  }

  if (state.promotion) renderPromotion();
  renderStatus();
}

function findKing(color) {
  const king = color === "w" ? "K" : "k";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (state.game.board[r][c] === king) return squareName(r, c);
    }
  }
  return null;
}

function renderPromotion() {
  const { to, from } = state.promotion;
  const menu = document.createElement("div");
  menu.className = "promo";
  const list = document.createElement("div");
  list.className = "promo-list";
  for (const type of ["q", "r", "b", "n"]) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "promo-piece";
    option.innerHTML = pieceSvg(state.playerColor, type);
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      finishMove(from, to, type);
    });
    list.append(option);
  }
  menu.append(list);
  els.promoRoot.append(menu);
}

function resultText() {
  if (state.game.isCheckmate()) {
    return state.game.winner() === state.playerColor
      ? "Мат. Вы победили"
      : isPvp()
        ? "Мат. Соперник победил"
        : "Мат. Компьютер победил";
  }
  if (state.game.isStalemate()) return "Пат — ничья";
  if (state.game.isDraw()) return "Ничья";
  return "Партия окончена";
}

function renderLobby() {
  const guestWaiting = net?.role === "guest" && !isPvp() && !isOver();
  if (els.lobby) els.lobby.hidden = !guestWaiting;
  if (els.invite) els.invite.hidden = net?.role === "guest";
  if (els.inviteText) {
    els.inviteText.textContent = isPvp()
      ? "Друг в игре"
      : "Пока друг не зашёл — можно играть с компьютером";
  }
}

function renderStatus() {
  renderLobby();
  if (isOver()) {
    els.overlay.hidden = false;
    els.overlayTitle.textContent = state.game.isCheckmate()
      ? state.game.winner() === state.playerColor
        ? "Победа"
        : "Поражение"
      : "Ничья";
    els.overlayText.textContent = resultText();
  } else {
    els.overlay.hidden = true;
  }
}

function selectSquare(square) {
  if (!isPlayerTurn() || state.promotion) return;
  const piece = state.game.get(square);
  if (state.selected && state.legal.some((move) => move.to === square)) {
    attemptMove(state.selected, square);
    return;
  }
  if (piece && piece.color === state.playerColor) {
    state.selected = square;
    state.legal = legalFrom(square);
    paintHighlights();
    return;
  }
  state.selected = null;
  state.legal = [];
  paintHighlights();
}

function attemptMove(from, to) {
  const options = state.game.moves({ verbose: true, square: from }).filter((move) => move.to === to);
  if (!options.length) return;
  const promotion = options[0].promotion
    ? options[Math.floor(Math.random() * options.length)].promotion
    : undefined;
  finishMove(from, to, promotion);
}

function finishMove(from, to, promotion) {
  cancelDrag();
  const moving = state.game.get(from);
  const played = state.game.move({ from, to, promotion });
  if (!played) return;
  state.game.morphMoved(played.to);
  state.selected = null;
  state.legal = [];
  state.promotion = null;
  state.lastMove = { from, to };
  playSound(Boolean(played.captured));
  render();
  if (isPvp()) {
    net.send({
      type: "move",
      fen: state.game.fen(),
      from,
      to,
      moving,
      captured: Boolean(played.captured),
      flags: played.flags,
      rook: castleRookSquares(played),
    });
    return;
  }
  if (!isOver()) window.setTimeout(computerMove, 120);
}

function castleRookSquares(played) {
  if (played.flags !== "k" && played.flags !== "q") return null;
  const rank = played.color === "w" ? "1" : "8";
  if (played.flags === "k") return { from: `h${rank}`, to: `f${rank}` };
  return { from: `a${rank}`, to: `d${rank}` };
}

function squareRect(name) {
  return els.board.querySelector(`[data-square="${name}"]`)?.getBoundingClientRect() ?? null;
}

function flyPiece({ from, to, html }) {
  return new Promise((resolve) => {
    const startBox = squareRect(from);
    const endBox = squareRect(to);
    if (!startBox || !endBox) {
      resolve();
      return;
    }
    const size = Math.min(startBox.width, startBox.height) * 0.8863;
    const ghost = document.createElement("div");
    ghost.className = "drag-piece fly-piece";
    ghost.style.width = `${size}px`;
    ghost.style.height = `${size}px`;
    ghost.innerHTML = html;
    els.dragLayer.append(ghost);

    const x0 = startBox.x + startBox.width / 2;
    const y0 = startBox.y + startBox.height / 2;
    const x1 = endBox.x + endBox.width / 2;
    const y1 = endBox.y + endBox.height / 2;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const ms = Math.min(580, Math.max(360, 300 + dist * 0.55));
    const lift = Math.min(32, 12 + dist * 0.045);
    const half = size / 2;
    const started = performance.now();

    const paint = (x, y) => {
      ghost.style.transform = `translate(${x - half}px, ${y - half}px)`;
    };
    paint(x0, y0);

    const frame = (now) => {
      if (state.animating == null) {
        ghost.remove();
        resolve();
        return;
      }
      const t = Math.min(1, (now - started) / ms);
      const ease = 1 - (1 - t) ** 3;
      const x = x0 + (x1 - x0) * ease;
      const y = y0 + (y1 - y0) * ease - Math.sin(Math.PI * t) * lift;
      paint(x, y);
      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }
      ghost.remove();
      resolve();
    };
    requestAnimationFrame(frame);
  });
}

function computerMove() {
  if (isPvp() || state.game.turn() === state.playerColor || isOver()) return;
  state.thinking = true;
  const payload = {
    id: ++state.requestId,
    fen: state.game.fen(),
    depth: LEVEL.depth,
    randomness: LEVEL.randomness,
  };

  const apply = (move) => {
    if (payload.id !== state.requestId || isOver() || isPvp()) {
      state.thinking = false;
      render();
      return;
    }
    if (!move) {
      state.thinking = false;
      render();
      return;
    }
    const moving = state.game.get(move.from);
    const played = state.game.move(move);
    if (!played || !moving) {
      state.thinking = false;
      render();
      return;
    }
    const rook = castleRookSquares(played);
    state.game.morphMoved(played.to);
    state.lastMove = { from: played.from, to: played.to };
    state.animating = { hide: rook ? [played.to, rook.to] : [played.to] };
    render();

    const flights = [
      flyPiece({
        from: played.from,
        to: played.to,
        html: pieceSvg(moving.color, moving.type),
      }),
    ];
    if (rook) {
      flights.push(
        flyPiece({
          from: rook.from,
          to: rook.to,
          html: pieceSvg(played.color, "r"),
        }),
      );
    }

    Promise.all(flights).then(() => {
      if (payload.id !== state.requestId) return;
      playSound(Boolean(played.captured));
      state.animating = null;
      state.thinking = false;
      render();
    });
  };

  if (worker) {
    const onMessage = (event) => {
      if (event.data.id !== payload.id) return;
      worker.removeEventListener("message", onMessage);
      apply(event.data.move);
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage(payload);
    return;
  }

  window.setTimeout(() => apply(chooseMove(payload.fen, payload)), 20);
}

function applyRemoteMove(payload) {
  if (!payload?.fen || !payload.from || !payload.to) return;
  state.requestId += 1;
  const requestId = state.requestId;
  state.game.load(payload.fen);
  state.selected = null;
  state.legal = [];
  state.promotion = null;
  state.lastMove = { from: payload.from, to: payload.to };
  const rook = payload.rook || null;
  state.animating = { hide: rook ? [payload.to, rook.to] : [payload.to] };
  render();

  const moving = payload.moving || { color: "b", type: "p" };
  const flights = [
    flyPiece({
      from: payload.from,
      to: payload.to,
      html: pieceSvg(moving.color, moving.type),
    }),
  ];
  if (rook) {
    flights.push(
      flyPiece({
        from: rook.from,
        to: rook.to,
        html: pieceSvg(moving.color === "w" ? "w" : "b", "r"),
      }),
    );
  }

  Promise.all(flights).then(() => {
    if (requestId !== state.requestId) return;
    playSound(Boolean(payload.captured));
    state.animating = null;
    render();
  });
}

function resetBoard() {
  state.requestId += 1;
  state.game = new Chess();
  state.selected = null;
  state.legal = [];
  state.lastMove = null;
  state.thinking = false;
  state.promotion = null;
  state.animating = null;
  els.dragLayer.replaceChildren();
  render();
  if (!isPvp() && net?.role !== "guest" && state.game.turn() !== state.playerColor) {
    computerMove();
  }
}

function newGame() {
  resetBoard();
  net?.send({ type: "reset" });
}

let audioCtx = null;
let audioReady = false;
let moveBuffer = null;
let captureBuffer = null;

function getAudioCtx() {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      audioCtx = null;
    }
  }
  return audioCtx;
}

async function loadSoundBuffers() {
  const ctx = getAudioCtx();
  if (!ctx || moveBuffer) return;
  try {
    const [moveData, captureData] = await Promise.all([
      fetch(moveSoundUrl).then((res) => res.arrayBuffer()),
      fetch(captureSoundUrl).then((res) => res.arrayBuffer()),
    ]);
    moveBuffer = await ctx.decodeAudioData(moveData.slice(0));
    captureBuffer = await ctx.decodeAudioData(captureData.slice(0));
  } catch {
    /* HTMLAudio fallback remains */
  }
}

function unlockAudio() {
  if (audioReady) return;
  audioReady = true;
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") ctx.resume();
  loadSoundBuffers();
}

function playWoodBody(capture) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = capture ? 0.55 : 0.42;
  master.connect(ctx.destination);

  const wood = ctx.createOscillator();
  wood.type = "triangle";
  wood.frequency.setValueAtTime(capture ? 980 : 860, t);
  wood.frequency.exponentialRampToValueAtTime(420, t + 0.06);
  const woodGain = ctx.createGain();
  woodGain.gain.setValueAtTime(0.22, t);
  woodGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  wood.connect(woodGain).connect(master);
  wood.start(t);
  wood.stop(t + 0.1);

  const click = ctx.createOscillator();
  click.type = "sine";
  click.frequency.setValueAtTime(capture ? 2100 : 1850, t);
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.16, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  click.connect(clickGain).connect(master);
  click.start(t);
  click.stop(t + 0.04);
}

function playSound(capture) {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") ctx.resume();

  const buffer = capture ? captureBuffer : moveBuffer;
  if (ctx && buffer) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    source.connect(gain).connect(ctx.destination);
    source.start();
    return;
  }

  playWoodBody(capture);
  const sample = capture ? captureSound : moveSound;
  const node = sample.cloneNode();
  node.volume = 0.85;
  const play = node.play();
  if (play && typeof play.catch === "function") play.catch(() => {});
}

els.board.addEventListener("pointerdown", (event) => {
  if (event.button != null && event.button !== 0) return;
  if (!isPlayerTurn() || state.promotion) return;
  unlockAudio();
  const square = squareFromEvent(event);
  if (!square) return;
  const piece = state.game.get(square);
  if (state.selected && state.legal.some((move) => move.to === square) && (!piece || piece.color !== state.playerColor)) {
    cancelDrag();
    attemptMove(state.selected, square);
    return;
  }
  if (!piece || piece.color !== state.playerColor) {
    state.selected = null;
    state.legal = [];
    paintHighlights();
    return;
  }
  selectSquare(square);
  event.preventDefault();
  beginDrag(square, event);
});

document.addEventListener("pointermove", moveDrag, { capture: true, passive: true });
document.addEventListener("pointerup", endDrag, { capture: true });
document.addEventListener("pointercancel", cancelDrag, { capture: true });
window.addEventListener("pointermove", moveDrag, { passive: true });
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", cancelDrag);

loadSoundBuffers();

document.querySelector("#play-again").addEventListener("click", newGame);

els.copyLink.addEventListener("click", async () => {
  if (!net?.url) return;
  try {
    await navigator.clipboard.writeText(net.url);
    els.copyLink.textContent = "Скопировано";
    window.setTimeout(() => {
      els.copyLink.textContent = "Копировать ссылку";
    }, 1200);
  } catch {
    window.prompt("Скопируйте ссылку", net.url);
  }
});

net = startPvp({
  onStatus(text) {
    if (els.lobbyText) els.lobbyText.textContent = text;
  },
  onReady(color) {
    state.requestId += 1;
    state.thinking = false;
    state.animating = null;
    els.dragLayer.replaceChildren();
    state.ready = true;
    state.playerColor = color;
    render();
  },
  getSnapshot() {
    return { fen: state.game.fen(), lastMove: state.lastMove };
  },
  onSync(payload) {
    if (!payload?.fen || net?.role === "host") return;
    state.game.load(payload.fen);
    state.lastMove = payload.lastMove || null;
    state.selected = null;
    state.legal = [];
    render();
  },
  onMove(payload) {
    applyRemoteMove(payload);
  },
  onReset() {
    resetBoard();
  },
  onPeerLeft() {
    state.ready = false;
    if (els.lobbyText) els.lobbyText.textContent = "Друг отключился. Подождите или откройте ссылку ещё раз.";
    render();
    if (net?.role !== "guest" && !isOver() && state.game.turn() !== state.playerColor) {
      computerMove();
    }
  },
});

if (net?.role === "guest") {
  state.playerColor = "b";
  if (els.invite) els.invite.hidden = true;
}

render();
