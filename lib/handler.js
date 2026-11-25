// The /api/state endpoint, shared by the local server and Vercel.
const { timingSafeEqual, createHash } = require('node:crypto');
const { applyAction, GameError } = require('./game');
const { createStore } = require('./store');

// With ADMIN_PASSCODE set, these are the only changes allowed without it.
// An allow-list, so any action added later starts out locked.
const OPEN_ACTIONS = new Set(['setInspired']);

let store;
const digest = (s) => createHash('sha256').update(String(s)).digest();

// Clients URL-encode passcodes, because header values must be plain ASCII.
const matches = (header, passcode) =>
  timingSafeEqual(digest(header ?? ''), digest(encodeURIComponent(passcode)));

const canManage = (req) =>
  !process.env.ADMIN_PASSCODE || matches(req.headers['x-admin-passcode'], process.env.ADMIN_PASSCODE);

// What a client gets: the saved state, what this request may do, and the
// switcher link (sent here so APP_PASSCODE also protects it).
function reply(req, state) {
  const url = process.env.SOUNDBOARD_URL || '';
  return {
    ...state,
    adminRequired: Boolean(process.env.ADMIN_PASSCODE),
    canManage: canManage(req),
    soundboardUrl: /^https?:\/\//i.test(url) ? url : null,
  };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; // Vercel
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 65536) throw new GameError('Request too large.');
  }
  return JSON.parse(raw);
}

module.exports = async function handler(req, res) {
  try {
    const passcode = process.env.APP_PASSCODE;
    if (passcode && !matches(req.headers['x-passcode'], passcode)) {
      return send(res, 401, { error: 'Passcode required.' });
    }
    store ??= createStore();
    if (req.method === 'GET') return send(res, 200, reply(req, await store.read()));
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
    // Requiring JSON stops other websites from posting here without a CORS preflight.
    if (!String(req.headers['content-type']).startsWith('application/json')) {
      return send(res, 415, { error: 'Send JSON.' });
    }
    let action;
    try {
      action = await readJson(req);
    } catch (err) {
      return send(res, 400, { error: err instanceof GameError ? err.message : 'Invalid JSON.' });
    }
    if (!OPEN_ACTIONS.has(action?.type) && !canManage(req)) {
      return send(res, 403, { error: 'The admin passcode is required for that.' });
    }
    return send(res, 200, reply(req, await store.update((s) => applyAction(s, action))));
  } catch (err) {
    if (err instanceof GameError) return send(res, 409, { error: err.message });
    console.error(err);
    return send(res, 500, { error: err.message });
  }
};
