const PIECE_SRC = {
  wK: new URL("../assets/pieces/wK.svg", import.meta.url).href,
  wQ: new URL("../assets/pieces/wQ.svg", import.meta.url).href,
  wR: new URL("../assets/pieces/wR.svg", import.meta.url).href,
  wB: new URL("../assets/pieces/wB.svg", import.meta.url).href,
  wN: new URL("../assets/pieces/wN.svg", import.meta.url).href,
  wP: new URL("../assets/pieces/wP.svg", import.meta.url).href,
  bK: new URL("../assets/pieces/bK.svg", import.meta.url).href,
  bQ: new URL("../assets/pieces/bQ.svg", import.meta.url).href,
  bR: new URL("../assets/pieces/bR.svg", import.meta.url).href,
  bB: new URL("../assets/pieces/bB.svg", import.meta.url).href,
  bN: new URL("../assets/pieces/bN.svg", import.meta.url).href,
  bP: new URL("../assets/pieces/bP.svg", import.meta.url).href,
};

export function pieceSvg(color, type) {
  const key = color + type.toUpperCase();
  const src = PIECE_SRC[key];
  return `<img class="piece-img" src="${src}" width="41.5452" height="41.5452" alt="" draggable="false">`;
}
