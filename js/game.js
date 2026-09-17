const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FILES = "abcdefgh";
const KNIGHT_DELTAS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];
const KING_DELTAS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function squareName(r, c) {
  return FILES[c] + (8 - r);
}

export function parseSquare(name) {
  return { r: 8 - Number(name[1]), c: FILES.indexOf(name[0]) };
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isWhite(piece) {
  return piece === piece.toUpperCase();
}

function pieceColor(piece) {
  return isWhite(piece) ? "w" : "b";
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export class Chess {
  constructor(fen = START_FEN) {
    this._undo = [];
    this._history = [];
    this._positions = [];
    this.load(fen);
  }

  load(fen) {
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split("/");
    this.board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (ch >= "1" && ch <= "8") {
          c += Number(ch);
        } else {
          this.board[r][c] = ch;
          c += 1;
        }
      }
    }
    this.turnColor = parts[1] || "w";
    const castle = parts[2] || "-";
    this.castling = {
      K: castle.includes("K"),
      Q: castle.includes("Q"),
      k: castle.includes("k"),
      q: castle.includes("q"),
    };
    this.ep = parts[3] && parts[3] !== "-" ? parseSquare(parts[3]) : null;
    this.halfmove = Number(parts[4] || 0);
    this.fullmove = Number(parts[5] || 1);
    this._undo = [];
    this._history = [];
    this._positions = [this.positionKey()];
  }

  fen() {
    const ranks = this.board.map((row) => {
      let empty = 0;
      let out = "";
      for (const cell of row) {
        if (!cell) {
          empty += 1;
        } else {
          if (empty) out += empty;
          empty = 0;
          out += cell;
        }
      }
      if (empty) out += empty;
      return out;
    });
    let castle = "";
    if (this.castling.K) castle += "K";
    if (this.castling.Q) castle += "Q";
    if (this.castling.k) castle += "k";
    if (this.castling.q) castle += "q";
    const ep = this.ep ? squareName(this.ep.r, this.ep.c) : "-";
    return `${ranks.join("/")} ${this.turnColor} ${castle || "-"} ${ep} ${this.halfmove} ${this.fullmove}`;
  }

  positionKey() {
    const ranks = this.board.map((row) => {
      let empty = 0;
      let out = "";
      for (const cell of row) {
        if (!cell) {
          empty += 1;
        } else {
          if (empty) out += empty;
          empty = 0;
          out += cell;
        }
      }
      if (empty) out += empty;
      return out;
    });
    let castle = "";
    if (this.castling.K) castle += "K";
    if (this.castling.Q) castle += "Q";
    if (this.castling.k) castle += "k";
    if (this.castling.q) castle += "q";
    const ep = this.ep ? squareName(this.ep.r, this.ep.c) : "-";
    return `${ranks.join("/")} ${this.turnColor} ${castle || "-"} ${ep}`;
  }

  turn() {
    return this.turnColor;
  }

  get(square) {
    const { r, c } = parseSquare(square);
    const piece = this.board[r][c];
    if (!piece) return null;
    return { type: piece.toLowerCase(), color: pieceColor(piece) };
  }

  morphMoved(square) {
    const { r, c } = parseSquare(square);
    const current = this.board[r][c];
    if (!current) return null;
    const type = current.toLowerCase();
    if (type === "k") return null;
    const options = ["p", "n", "b", "r", "q"].filter((item) => item !== type);
    const next = options[Math.floor(Math.random() * options.length)];
    this.board[r][c] = isWhite(current) ? next.toUpperCase() : next;
    if (this._positions.length) this._positions[this._positions.length - 1] = this.positionKey();
    return this.get(square);
  }

  moves({ verbose = false, square } = {}) {
    const legal = this._legalMoves(square ? parseSquare(square) : null);
    if (!verbose) {
      return legal.map((move) => this._uci(move));
    }
    return legal.map((move) => this._verbose(move));
  }

  move(input) {
    const legal = this._legalMoves();
    let chosen = null;
    if (typeof input === "string") {
      chosen = legal.find((move) => this._uci(move) === input || this._toSAN(move, legal) === input);
    } else {
      chosen = legal.find((move) => {
        const from = squareName(move.from.r, move.from.c);
        const to = squareName(move.to.r, move.to.c);
        if (from !== input.from || to !== input.to) return false;
        if (move.promotion) {
          return (input.promotion || "q") === move.promotion;
        }
        return true;
      });
    }
    if (!chosen) return null;
    const san = this._toSAN(chosen, legal);
    this._apply(chosen);
    const verbose = this._verbose(chosen, san);
    if (this.isCheckmate()) verbose.san += "#";
    else if (this.isCheck()) verbose.san += "+";
    this._history.push(verbose);
    this._positions.push(this.positionKey());
    return verbose;
  }

  undo() {
    const snap = this._undo.pop();
    if (!snap) return null;
    this.board = snap.board;
    this.turnColor = snap.turnColor;
    this.castling = snap.castling;
    this.ep = snap.ep;
    this.halfmove = snap.halfmove;
    this.fullmove = snap.fullmove;
    this._history.pop();
    this._positions.pop();
    return snap.move;
  }

  history({ verbose = false } = {}) {
    if (verbose) return this._history.slice();
    return this._history.map((move) => move.san);
  }

  isCheck() {
    return this._inCheck(this.turnColor);
  }

  isCheckmate() {
    return this._inCheck(this.turnColor) && this._legalMoves().length === 0;
  }

  isStalemate() {
    return !this._inCheck(this.turnColor) && this._legalMoves().length === 0;
  }

  isInsufficientMaterial() {
    const pieces = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (piece && piece.toLowerCase() !== "k") pieces.push({ piece, r, c });
      }
    }
    if (pieces.length === 0) return true;
    if (pieces.length === 1) {
      const type = pieces[0].piece.toLowerCase();
      return type === "n" || type === "b";
    }
    if (pieces.length === 2 && pieces.every((item) => item.piece.toLowerCase() === "b")) {
      const colorA = (pieces[0].r + pieces[0].c) % 2;
      const colorB = (pieces[1].r + pieces[1].c) % 2;
      return colorA === colorB && pieceColor(pieces[0].piece) !== pieceColor(pieces[1].piece);
    }
    return false;
  }

  isThreefold() {
    const key = this.positionKey();
    return this._positions.filter((item) => item === key).length >= 3;
  }

  isDraw() {
    return this.isStalemate() || this.isInsufficientMaterial() || this.halfmove >= 100 || this.isThreefold();
  }

  isGameOver() {
    return this.isCheckmate() || this.isDraw();
  }

  winner() {
    if (!this.isCheckmate()) return null;
    return this.turnColor === "w" ? "b" : "w";
  }

  _legalMoves(onlySquare = null) {
    const pseudo = this._pseudoMoves(onlySquare);
    const legal = [];
    for (const move of pseudo) {
      this._apply(move);
      const safe = !this._inCheck(move.color);
      this.undoApply();
      if (safe) legal.push(move);
    }
    return legal;
  }

  undoApply() {
    const snap = this._undo.pop();
    this.board = snap.board;
    this.turnColor = snap.turnColor;
    this.castling = snap.castling;
    this.ep = snap.ep;
    this.halfmove = snap.halfmove;
    this.fullmove = snap.fullmove;
  }

  _pseudoMoves(onlySquare) {
    const moves = [];
    const color = this.turnColor;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (onlySquare && (r !== onlySquare.r || c !== onlySquare.c)) continue;
        const piece = this.board[r][c];
        if (!piece || pieceColor(piece) !== color) continue;
        const type = piece.toLowerCase();
        if (type === "p") this._pawnMoves(r, c, color, moves);
        else if (type === "n") this._deltaMoves(r, c, color, KNIGHT_DELTAS, false, moves);
        else if (type === "b") this._slideMoves(r, c, color, BISHOP_DIRS, moves);
        else if (type === "r") this._slideMoves(r, c, color, ROOK_DIRS, moves);
        else if (type === "q") this._slideMoves(r, c, color, BISHOP_DIRS.concat(ROOK_DIRS), moves);
        else if (type === "k") {
          this._deltaMoves(r, c, color, KING_DELTAS, false, moves);
          this._castleMoves(r, c, color, moves);
        }
      }
    }
    return moves;
  }

  _pushMove(moves, fromR, fromC, toR, toC, extra = {}) {
    const moving = this.board[fromR][fromC];
    const captured = extra.captured ?? this.board[toR][toC];
    moves.push({
      from: { r: fromR, c: fromC },
      to: { r: toR, c: toC },
      piece: moving,
      color: pieceColor(moving),
      captured: captured || null,
      promotion: extra.promotion || null,
      castle: extra.castle || null,
      ep: Boolean(extra.ep),
    });
  }

  _pawnMoves(r, c, color, moves) {
    const dir = color === "w" ? -1 : 1;
    const start = color === "w" ? 6 : 1;
    const last = color === "w" ? 0 : 7;
    const fwd = r + dir;
    if (inBounds(fwd, c) && !this.board[fwd][c]) {
      this._pawnTo(moves, r, c, fwd, c, last, null);
      const two = r + dir * 2;
      if (r === start && inBounds(two, c) && !this.board[two][c]) {
        this._pushMove(moves, r, c, two, c);
      }
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const target = this.board[nr][nc];
      if (target && pieceColor(target) !== color) {
        this._pawnTo(moves, r, c, nr, nc, last, target);
      } else if (this.ep && this.ep.r === nr && this.ep.c === nc) {
        const captured = this.board[r][nc];
        this._pushMove(moves, r, c, nr, nc, { captured, ep: true });
      }
    }
  }

  _pawnTo(moves, r, c, nr, nc, last, captured) {
    if (nr === last) {
      for (const promo of ["q", "r", "b", "n"]) {
        this._pushMove(moves, r, c, nr, nc, { captured, promotion: promo });
      }
    } else {
      this._pushMove(moves, r, c, nr, nc, { captured });
    }
  }

  _deltaMoves(r, c, color, deltas, _unused, moves) {
    for (const [dr, dc] of deltas) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const target = this.board[nr][nc];
      if (!target || pieceColor(target) !== color) {
        this._pushMove(moves, r, c, nr, nc, { captured: target });
      }
    }
  }

  _slideMoves(r, c, color, dirs, moves) {
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc)) {
        const target = this.board[nr][nc];
        if (!target) {
          this._pushMove(moves, r, c, nr, nc);
        } else {
          if (pieceColor(target) !== color) this._pushMove(moves, r, c, nr, nc, { captured: target });
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  }

  _castleMoves(r, c, color, moves) {
    if (this._inCheck(color)) return;
    if (color === "w" && r === 7 && c === 4) {
      if (this.castling.K) this._tryCastle(moves, r, c, 7, 5, 6, 7);
      if (this.castling.Q) this._tryCastle(moves, r, c, 7, 3, 2, 0, 1);
    }
    if (color === "b" && r === 0 && c === 4) {
      if (this.castling.k) this._tryCastle(moves, r, c, 0, 5, 6, 7);
      if (this.castling.q) this._tryCastle(moves, r, c, 0, 3, 2, 0, 1);
    }
  }

  _tryCastle(moves, r, c, rookR, passC, kingToC, rookC, extraEmptyC) {
    const rook = this.board[rookR][rookC];
    if (!rook || rook.toLowerCase() !== "r") return;
    if (this.board[r][passC] || this.board[r][kingToC]) return;
    if (extraEmptyC !== undefined && this.board[r][extraEmptyC]) return;
    const enemyIsWhite = this.turnColor === "b";
    if (this._isAttacked(r, passC, enemyIsWhite) || this._isAttacked(r, kingToC, enemyIsWhite)) return;
    this._pushMove(moves, r, c, r, kingToC, { castle: kingToC > c ? "K" : "Q" });
  }

  _apply(move) {
    this._undo.push({
      board: cloneBoard(this.board),
      turnColor: this.turnColor,
      castling: { ...this.castling },
      ep: this.ep ? { ...this.ep } : null,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
      move,
    });

    const { from, to } = move;
    const moving = this.board[from.r][from.c];
    this.board[from.r][from.c] = null;

    if (move.ep) {
      this.board[from.r][to.c] = null;
    }

    this.board[to.r][to.c] = move.promotion
      ? (move.color === "w" ? move.promotion.toUpperCase() : move.promotion)
      : moving;

    if (move.castle) {
      if (move.castle === "K") {
        this.board[from.r][7] = null;
        this.board[from.r][5] = move.color === "w" ? "R" : "r";
      } else {
        this.board[from.r][0] = null;
        this.board[from.r][3] = move.color === "w" ? "R" : "r";
      }
    }

    if (moving.toLowerCase() === "p" && Math.abs(to.r - from.r) === 2) {
      this.ep = { r: (from.r + to.r) / 2, c: from.c };
    } else {
      this.ep = null;
    }

    if (moving === "K") {
      this.castling.K = false;
      this.castling.Q = false;
    }
    if (moving === "k") {
      this.castling.k = false;
      this.castling.q = false;
    }
    if (moving === "R" && from.r === 7 && from.c === 7) this.castling.K = false;
    if (moving === "R" && from.r === 7 && from.c === 0) this.castling.Q = false;
    if (moving === "r" && from.r === 0 && from.c === 7) this.castling.k = false;
    if (moving === "r" && from.r === 0 && from.c === 0) this.castling.q = false;
    if (move.captured === "R" && to.r === 7 && to.c === 7) this.castling.K = false;
    if (move.captured === "R" && to.r === 7 && to.c === 0) this.castling.Q = false;
    if (move.captured === "r" && to.r === 0 && to.c === 7) this.castling.k = false;
    if (move.captured === "r" && to.r === 0 && to.c === 0) this.castling.q = false;

    if (moving.toLowerCase() === "p" || move.captured) this.halfmove = 0;
    else this.halfmove += 1;
    if (this.turnColor === "b") this.fullmove += 1;
    this.turnColor = this.turnColor === "w" ? "b" : "w";
  }

  _inCheck(color) {
    const king = color === "w" ? "K" : "k";
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c] === king) {
          return this._isAttacked(r, c, color === "b");
        }
      }
    }
    return false;
  }

  _isAttacked(r, c, byWhite) {
    const enemyPawn = byWhite ? "P" : "p";
    const pawnDir = byWhite ? 1 : -1;
    for (const dc of [-1, 1]) {
      const pr = r + pawnDir;
      const pc = c + dc;
      if (inBounds(pr, pc) && this.board[pr][pc] === enemyPawn) return true;
    }
    const enemyKnight = byWhite ? "N" : "n";
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && this.board[nr][nc] === enemyKnight) return true;
    }
    const enemyKing = byWhite ? "K" : "k";
    for (const [dr, dc] of KING_DELTAS) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && this.board[nr][nc] === enemyKing) return true;
    }
    if (this._rayHas(r, c, BISHOP_DIRS, byWhite ? "B" : "b", byWhite ? "Q" : "q")) return true;
    if (this._rayHas(r, c, ROOK_DIRS, byWhite ? "R" : "r", byWhite ? "Q" : "q")) return true;
    return false;
  }

  _rayHas(r, c, dirs, slider, queen) {
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc)) {
        const piece = this.board[nr][nc];
        if (piece) {
          if (piece === slider || piece === queen) return true;
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
    return false;
  }

  _uci(move) {
    const promo = move.promotion ? move.promotion : "";
    return squareName(move.from.r, move.from.c) + squareName(move.to.r, move.to.c) + promo;
  }

  _verbose(move, san) {
    return {
      from: squareName(move.from.r, move.from.c),
      to: squareName(move.to.r, move.to.c),
      piece: move.piece.toLowerCase(),
      color: move.color,
      captured: move.captured ? move.captured.toLowerCase() : undefined,
      promotion: move.promotion || undefined,
      flags: move.castle ? (move.castle === "K" ? "k" : "q") : move.ep ? "e" : move.captured ? "c" : "n",
      san: san || this._toSAN(move),
    };
  }

  _toSAN(move, legalMoves = null) {
    if (move.castle === "K") return "O-O";
    if (move.castle === "Q") return "O-O-O";
    const type = move.piece.toUpperCase();
    const to = squareName(move.to.r, move.to.c);
    const from = squareName(move.from.r, move.from.c);
    let text = "";
    if (type === "P") {
      if (move.captured) text += from[0] + "x" + to;
      else text += to;
      if (move.promotion) text += "=" + move.promotion.toUpperCase();
      return text;
    }
    text = type;
    const pool = legalMoves || this._legalMoves();
    const others = pool.filter((item) => {
      if (item === move) return false;
      return (
        item.piece === move.piece &&
        item.to.r === move.to.r &&
        item.to.c === move.to.c &&
        !item.castle
      );
    });
    if (others.length) {
      const sameFile = others.some((item) => item.from.c === move.from.c);
      const sameRank = others.some((item) => item.from.r === move.from.r);
      if (!sameFile) text += from[0];
      else if (!sameRank) text += from[1];
      else text += from;
    }
    if (move.captured) text += "x";
    text += to;
    if (move.promotion) text += "=" + move.promotion.toUpperCase();
    return text;
  }
}

export { START_FEN };
