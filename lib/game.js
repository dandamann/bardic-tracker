// Pure state changes: (state, action) -> new state. No I/O.
const { randomUUID } = require('node:crypto');

const MAX_CHARACTERS = 30;
const MAX_URL_LENGTH = 1000;

const initialState = () => ({ version: 0, characters: [] });

class GameError extends Error {}

// Only the address is stored. Empty means no image.
function imageUrl(raw = '') {
  if (typeof raw !== 'string') throw new GameError('Image URL must be text.');
  if (!raw.trim()) return '';
  let url;
  try {
    url = new URL(raw.trim());
  } catch {}
  if (!['http:', 'https:'].includes(url?.protocol)) {
    throw new GameError('Image URL must start with http:// or https://');
  }
  if (url.href.length > MAX_URL_LENGTH) throw new GameError('Image URL is too long.');
  return url.href;
}

function newCharacter(rawName, inspired = false, rawImageUrl = '') {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name || name.length > 40) throw new GameError('Name must be 1 to 40 characters.');
  if (typeof inspired !== 'boolean') throw new GameError('"inspired" must be true or false.');
  return { id: randomUUID(), name, inspired, imageUrl: imageUrl(rawImageUrl) };
}

function find(state, id) {
  const c = state.characters.find((x) => x.id === id);
  if (!c) throw new GameError('That character no longer exists.');
  return c;
}

const handlers = {
  add(s, a) {
    const character = newCharacter(a.name, false, a.imageUrl);
    if (s.characters.length >= MAX_CHARACTERS) throw new GameError('The party is full.');
    s.characters.push(character);
  },
  // Replaces the whole list. Any invalid entry rejects the whole import.
  import(s, a) {
    if (!Array.isArray(a.characters) || a.characters.length === 0) {
      throw new GameError('No characters found to import.');
    }
    if (a.characters.length > MAX_CHARACTERS) {
      throw new GameError(`A party can have at most ${MAX_CHARACTERS} characters.`);
    }
    s.characters = a.characters.map((c) => newCharacter(c?.name, c?.inspired, c?.imageUrl));
  },
  setImage(s, a) {
    find(s, a.id).imageUrl = imageUrl(a.imageUrl);
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
