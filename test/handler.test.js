// Sends real HTTP requests to the API handler to check what the passcodes lock.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bardic-'));
process.env.DATA_FILE = path.join(dir, 'state.json');
for (const key of ['APP_PASSCODE', 'ADMIN_PASSCODE', 'VERCEL', 'KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']) {
  delete process.env[key];
}
const handler = require('../lib/handler');

test('passcodes are enforced by the server', async (t) => {
  const server = http.createServer(handler).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  async function call(action, headers = {}) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/state`, {
      method: action === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: action === undefined ? undefined : JSON.stringify(action),
    });
    return { status: res.status, body: await res.json() };
  }

  // Nothing set: everything is open.
  let res = await call({ type: 'add', name: 'Thorn' });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.adminRequired, res.body.canManage], [false, true]);
  const { id } = res.body.characters[0];

  process.env.ADMIN_PASSCODE = 'owl bear';
  const admin = { 'X-Admin-Passcode': 'owl%20bear' };
  const locked = [
    { type: 'add', name: 'Intruder' },
    { type: 'remove', id },
    { type: 'setImage', id, imageUrl: 'https://example.com/a.png' },
    { type: 'import', characters: [{ name: 'Intruder' }] },
    { type: 'somethingNew' },
    null,
  ];
  const before = (await call()).body;
  for (const headers of [{}, { 'X-Admin-Passcode': 'wrong' }, { 'X-Passcode': 'owl%20bear' }]) {
    for (const action of locked) {
      assert.equal((await call(action, headers)).status, 403, JSON.stringify(action));
    }
  }
  assert.deepEqual((await call()).body, before); // nothing changed

  // Viewing and inspiration stay open.
  assert.deepEqual([before.adminRequired, before.canManage], [true, false]);
  res = await call({ type: 'setInspired', id, inspired: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.characters[0].inspired, true);
  // An open action can't smuggle in other changes.
  res = await call({ type: 'setInspired', id, inspired: false, name: 'X', imageUrl: 'https://example.com/x.png' });
  assert.deepEqual(res.body.characters[0], { id, name: 'Thorn', inspired: false, imageUrl: '' });

  assert.equal((await call(undefined, admin)).body.canManage, true);
  // With the passcode, each locked action works (in an order that keeps the id valid).
  const [add, remove, setImage, importList] = locked;
  for (const action of [add, setImage, remove, importList]) {
    assert.equal((await call(action, admin)).status, 200, action.type);
  }
  assert.deepEqual((await call()).body.characters.map((c) => c.name), ['Intruder']);

  // APP_PASSCODE still locks everything, and admin actions need both.
  process.env.APP_PASSCODE = 'party';
  assert.equal((await call()).status, 401);
  assert.equal((await call(undefined, admin)).status, 401);
  assert.equal((await call({ type: 'add', name: 'A' }, { 'X-Passcode': 'party' })).status, 403);
  assert.equal((await call({ type: 'add', name: 'A' }, { ...admin, 'X-Passcode': 'party' })).status, 200);
});
