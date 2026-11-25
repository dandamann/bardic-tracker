const $ = (id) => document.getElementById(id);
const POLL_MS = 3000;
let state = null;
let passcode = '';
try { passcode = localStorage.getItem('passcode') || ''; } catch {}

// textContent everywhere: names are user input.
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
  clearTimeout(showError.timer);
  if (message) showError.timer = setTimeout(() => showError(''), 6000);
}

async function request(action) {
  const res = await fetch('/api/state', {
    method: action ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Passcode': encodeURIComponent(passcode) },
    body: action && JSON.stringify(action),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Error ${res.status}`), { status: res.status });
  return body;
}

// Ignore responses older than what is already shown.
function accept(next) {
  if (state && next.version < state.version) return;
  const changed = !state || next.version !== state.version;
  state = next;
  if (changed) render();
}

async function act(action) {
  try {
    accept(await request(action));
    showError('');
    return true;
  } catch (err) {
    showError(err.message);
    refresh();
    return false;
  }
}

let asking = false;
async function refresh() {
  if (asking) return;
  try {
    accept(await request());
    $('status').textContent = 'Synced';
  } catch (err) {
    if (err.status === 401) {
      asking = true;
      const entry = prompt('Party passcode:');
      asking = false;
      if (entry !== null) {
        passcode = entry;
        try { localStorage.setItem('passcode', entry); } catch {}
        setTimeout(refresh, 0);
      }
      $('status').textContent = 'Locked';
    } else {
      $('status').textContent = 'Offline';
      showError(err.message);
    }
  }
}

function row(c) {
  const toggle = el('button', {
    type: 'button',
    className: 'toggle',
    ariaPressed: String(c.inspired),
    onclick: () => act({ type: 'setInspired', id: c.id, inspired: !c.inspired }),
  },
  el('span', { className: 'name', textContent: c.name }),
  el('span', { className: 'badge', textContent: c.inspired ? '♪ Inspired' : 'Not inspired' }));
  const remove = el('button', {
    type: 'button',
    className: 'remove',
    textContent: '✕',
    ariaLabel: `Remove ${c.name}`,
    onclick: () => { if (confirm(`Remove ${c.name}?`)) act({ type: 'remove', id: c.id }); },
  });
  return el('li', {}, toggle, remove);
}

function render() {
  $('party').replaceChildren(...state.characters.map(row));
  $('empty').hidden = state.characters.length > 0;
}

$('form').onsubmit = async (event) => {
  event.preventDefault();
  const input = event.target.elements.name;
  if (await act({ type: 'add', name: input.value })) input.value = '';
};

// Poll only while the tab is visible, which also keeps hosted usage low.
setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
refresh();
