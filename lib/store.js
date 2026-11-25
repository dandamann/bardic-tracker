// Two backends with the same interface: read() and update(fn).
const fs = require('node:fs/promises');
const path = require('node:path');
const { initialState } = require('./game');

function fileStore(file) {
  let queue = Promise.resolve();
  async function read() {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return initialState();
      throw err; // never silently overwrite a damaged save
    }
  }
  return {
    read,
    // Writes run one at a time, and rename makes each one atomic.
    update(fn) {
      const run = queue.then(async () => {
        const next = fn(await read());
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(`${file}.tmp`, JSON.stringify(next));
        await fs.rename(`${file}.tmp`, file);
        return next;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}

// Upstash Redis over its REST API.
function redisStore(url, token, key) {
  // Save only if nobody else saved since we read.
  const CAS = `
    local cur = redis.call('GET', KEYS[1])
    local ver = 0
    if cur then ver = cjson.decode(cur).version end
    if ver ~= tonumber(ARGV[1]) then return 0 end
    redis.call('SET', KEYS[1], ARGV[2])
    return 1`;

  async function command(args) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(`Redis error: ${body.error || res.status}`);
    return body.result;
  }
  async function read() {
    const raw = await command(['GET', key]);
    return raw ? JSON.parse(raw) : initialState();
  }
  return {
    read,
    async update(fn) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const current = await read();
        const next = fn(current);
        const saved = await command(['EVAL', CAS, '1', key, String(current.version), JSON.stringify(next)]);
        if (saved === 1) return next;
      }
      throw new Error('Too many simultaneous changes, please try again.');
    },
  };
}

function createStore(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return redisStore(url, token, env.STATE_KEY || 'bardic:state');
  if (env.VERCEL) {
    throw new Error('No Redis configured. Add an Upstash Redis store to this Vercel project, then redeploy.');
  }
  return fileStore(env.DATA_FILE || path.join(__dirname, '..', 'data', 'state.json'));
}

module.exports = { createStore };
