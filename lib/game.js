// Pure state changes: (state, action) -> new state. No I/O.
const { randomUUID } = require('node:crypto');

const MAX_CHARACTERS = 30;

const initialState = () => ({ version: 0, characters: [] });

class GameError extends Error {}

function find(state, id) {
  const c = state.characters.find((x) => x.id === id);
  if (!c) throw new GameError('That character no longer exists.');
  return c;
}

const handlers = {
  add(s, a) {
    const name = String(a.name ?? '').trim();
    if (!name || name.length > 40) throw new GameError('Name must be 1 to 40 characters.');
    if (s.characters.length >= MAX_CHARACTERS) throw new GameError('The party is full.');
    s.characters.push({ id: randomUUID(), name, inspired: false });
  },
  remove(s, a) {
    const c = find(s, a.id);
    s.characters = s.characters.filter((x) => x !== c);
  },
  // Takes the wanted value instead of toggling, so two people tapping
  // the same character at once don't cancel each other out.
  setInspired(s, a) {
    if (typeof a.inspired !== 'boolean') throw new GameError('Invalid value.');
    find(s, a.id).inspired = a.inspired;
  },
};

function applyAction(state, action) {
  const type = action?.type;
  if (!Object.hasOwn(handlers, type)) throw new GameError('Unknown action.');
  const next = structuredClone(state);
  next.version = state.version + 1;
  handlers[type](next, action);
  return next;
}

module.exports = { initialState, applyAction, GameError };
