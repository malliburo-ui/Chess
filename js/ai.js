import { Chess } from "./game.js";

const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PST = {
  p: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  n: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  b: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  r: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0],
  ],
  q: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ],
  k: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20],
  ],
};

const BOOK = {
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "g1f3", "c2c4"],
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -": ["e7e5", "c7c5", "e7e6", "c7c6", "d7d5", "g8f6"],
  "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -": ["d7d5", "g8f6", "e7e6"],
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["g1f3", "b1c3", "f1c4"],
  "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["g1f3", "d2d4", "b1c3"],
  "rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq -": ["c2c4", "d2d4", "g2g3"],
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": ["b8c6", "g8f6"],
  "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -": ["f1b5", "d2d4", "f1c4"],
};

function pstValue(type, r, c, white) {
  const table = PST[type];
  return white ? table[r][c] : table[7 - r][c];
}

function evaluate(game) {
  if (game.isCheckmate()) return game.turn() === "w" ? -100000 : 100000;
  if (game.isStalemate() || game.isInsufficientMaterial()) return 0;

  let score = 0;
  let bishops = { w: 0, b: 0 };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = game.board[r][c];
      if (!piece) continue;
      const type = piece.toLowerCase();
      const white = piece === piece.toUpperCase();
      const value = PIECE_VALUE[type] + pstValue(type, r, c, white);
      score += white ? value : -value;
      if (type === "b") bishops[white ? "w" : "b"] += 1;
    }
  }
  if (bishops.w >= 2) score += 30;
  if (bishops.b >= 2) score -= 30;
  return score;
}

function orderedMoves(game) {
  const moves = game._legalMoves();
  moves.sort((a, b) => {
    const capA = a.captured ? PIECE_VALUE[a.captured.toLowerCase()] - PIECE_VALUE[a.piece.toLowerCase()] / 10 : -1;
    const capB = b.captured ? PIECE_VALUE[b.captured.toLowerCase()] - PIECE_VALUE[b.piece.toLowerCase()] / 10 : -1;
    const promoA = a.promotion === "q" ? 800 : 0;
    const promoB = b.promotion === "q" ? 800 : 0;
    return capB + promoB - (capA + promoA);
  });
  return moves;
}

function negamax(game, depth, alpha, beta, ply) {
  if (depth <= 0) return (game.turn() === "w" ? 1 : -1) * evaluate(game);

  const moves = orderedMoves(game);
  if (moves.length === 0) {
    if (game.isCheck()) return -100000 + ply;
    return 0;
  }

  let best = -Infinity;
  for (const move of moves) {
    game._apply(move);
    const score = -negamax(game, depth - 1, -beta, -alpha, ply + 1);
    game.undoApply();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function bookLookup(game) {
  const key = game.positionKey();
  if (BOOK[key]) return BOOK[key];
  const stripped = key.replace(/ [a-h][1-8]$/, " -");
  return BOOK[stripped] || null;
}

function pickBookMove(game, random) {
  const options = bookLookup(game);
  if (!options || !options.length) return null;
  const legal = new Set(game.moves());
  const playable = options.filter((uci) => legal.has(uci));
  if (!playable.length) return null;
  return playable[Math.floor(random() * playable.length)];
}

export function chooseMove(fen, options = {}) {
  const game = new Chess(fen);
  const depth = options.depth ?? 3;
  const randomness = options.randomness ?? 0;
  const rng = options.random || Math.random;

  const book = pickBookMove(game, rng);
  if (book && rng() > randomness * 0.3) return { from: book.slice(0, 2), to: book.slice(2, 4), promotion: book[4] };

  const moves = orderedMoves(game);
  if (!moves.length) return null;

  if (rng() < randomness) {
    const move = moves[Math.floor(rng() * Math.min(moves.length, 4))];
    return toResult(move);
  }

  let bestScore = -Infinity;
  const scored = [];
  for (const move of moves) {
    game._apply(move);
    const score = -negamax(game, depth - 1, -Infinity, Infinity, 1);
    game.undoApply();
    scored.push({ move, score });
    if (score > bestScore) bestScore = score;
  }

  const window = randomness > 0.2 ? 80 : 25;
  const candidates = scored.filter((item) => item.score >= bestScore - window);
  const chosen = candidates[Math.floor(rng() * candidates.length)];
  return toResult(chosen.move);
}

function toResult(move) {
  const files = "abcdefgh";
  return {
    from: files[move.from.c] + (8 - move.from.r),
    to: files[move.to.c] + (8 - move.to.r),
    promotion: move.promotion || undefined,
  };
}
