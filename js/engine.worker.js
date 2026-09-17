import { chooseMove } from "./ai.js";

self.onmessage = (event) => {
  const { id, fen, depth, randomness } = event.data;
  try {
    const move = chooseMove(fen, { depth, randomness });
    self.postMessage({ id, move });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
