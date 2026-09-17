import { Chess } from "./js/game.js";
import { chooseMove } from "./js/ai.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const start = new Chess();
assert(start.moves().length === 20, `expected 20 moves, got ${start.moves().length}`);

const scholars = new Chess();
for (const move of ["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"]) {
  assert(scholars.move(move), `failed ${move}`);
}
assert(scholars.isCheckmate(), "scholar's mate should be checkmate");

const castle = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
const castleMoves = castle.moves();
assert(castleMoves.includes("e1g1"), "white can castle short");
assert(castleMoves.includes("e1c1"), "white can castle long");
castle.move("e1g1");
assert(castle.fen().startsWith("r3k2r/8/8/8/8/8/8/R4RK1 b kq -"), `castle fen ${castle.fen()}`);

const ep = new Chess();
ep.move("e2e4");
ep.move("d7d5");
ep.move("e4d5");
ep.move("c7c5");
assert(ep.moves().includes("d5c6"), `en passant missing in ${ep.moves().join(",")}`);

const promo = new Chess("8/4P3/8/8/8/8/8/4k2K w - - 0 1");
assert(promo.moves().includes("e7e8q"), "promotion to queen");
promo.move("e7e8q");
assert(promo.get("e8").type === "q", "promoted queen");

const morph = new Chess();
morph.move("e2e4");
const before = morph.get("e4").type;
const changed = morph.morphMoved("e4");
assert(changed && changed.type !== "k", "pawn should morph");
assert(changed.type !== before, "morphed piece should differ");
assert(morph.get("e4").color === "w", "morph keeps color");
const kingStay = new Chess();
kingStay.morphMoved("e1");
assert(kingStay.get("e1").type === "k", "king should not morph");

const ai = chooseMove(new Chess().fen(), { depth: 1, randomness: 0, random: () => 0.1 });
assert(ai && ai.from && ai.to, "ai returns a move");

console.log("all tests passed");
