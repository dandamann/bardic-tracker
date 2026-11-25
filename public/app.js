const $ = (id) => document.getElementById(id);
const POLL_MS = 3000;
let state = null;
let passcode = '';
let adminPasscode = '';
try {
  passcode = localStorage.getItem('passcode') || '';
  adminPasscode = localStorage.getItem('adminPasscode') || '';
} catch {}

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

async function request(action, admin = adminPasscode) {
  const res = await fetch('/api/state', {
    method: action ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Passcode': encodeURIComponent(passcode),
      'X-Admin-Passcode': encodeURIComponent(admin),
    },
    body: action && JSON.stringify(action),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Error ${res.status}`), { status: res.status });
  return body;
}

// The bar only appears when the server has a soundboard address.
function showSwitcher(url) {
  if (url) $('soundboardLink').href = url;
  document.querySelector('.app-switcher').hidden = !url;
}

// Ignore responses older than what is already shown.
function accept(next) {
  if (state && next.version < state.version) return;
  const changed = !state || next.version !== state.version || next.canManage !== state.canManage;
  state = next;
  showSwitcher(next.soundboardUrl);
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

// Shows the first letter if there is no image or it fails to load.
function avatar(c) {
  const initial = () => el('span', { className: 'avatar', textContent: [...c.name][0].toUpperCase(), ariaHidden: 'true' });
  if (!c.imageUrl) return initial();
  const img = el('img', { className: 'avatar', alt: '', referrerPolicy: 'no-referrer' });
  img.onerror = () => img.replaceWith(initial());
  img.src = c.imageUrl;
  return img;
}

function embedUrl(name) {
  const url = new URL('/embed', location.origin);
  // %20 rather than "+" for spaces, so the link is easy to read and edit
  if (name) url.search = `character=${encodeURIComponent(name)}`;
  if (passcode) url.hash = `passcode=${encodeURIComponent(passcode)}`;
  return url.href;
}

async function copyLink(button, link) {
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    // Browsers only allow clipboard access on HTTPS or localhost.
    prompt('Copy this embed link:', link);
    return;
  }
  const label = button.dataset.label ??= button.textContent;
  button.textContent = '✓';
  clearTimeout(button.timer);
  button.timer = setTimeout(() => { button.textContent = label; }, 1500);
}

function row(c) {
  const toggle = el('button', {
    type: 'button',
    className: 'toggle',
    ariaPressed: String(c.inspired),
    onclick: () => act({ type: 'setInspired', id: c.id, inspired: !c.inspired }),
  },
  avatar(c),
  el('span', { className: 'info' },
    el('span', { className: 'name', textContent: c.name }),
    el('span', { className: 'badge', textContent: c.inspired ? '♪ Inspired' : 'Not inspired' })));
  const link = el('button', {
    type: 'button',
    className: 'side',
    textContent: '🔗',
    title: 'Copy OBS embed link',
    ariaLabel: `Copy embed link for ${c.name}`,
    onclick: (event) => copyLink(event.currentTarget, embedUrl(c.name)),
  });
  const image = el('button', {
    type: 'button',
    className: 'side',
    textContent: '🖼',
    title: 'Change image',
    ariaLabel: `Change image for ${c.name}`,
    onclick: () => {
      const url = prompt(`Image URL for ${c.name} (leave blank to remove):`, c.imageUrl || '');
      if (url !== null) act({ type: 'setImage', id: c.id, imageUrl: url });
    },
  });
  const remove = el('button', {
    type: 'button',
    className: 'side',
    textContent: '✕',
    ariaLabel: `Remove ${c.name}`,
    onclick: () => { if (confirm(`Remove ${c.name}?`)) act({ type: 'remove', id: c.id }); },
  });
  // Only hides the controls. The server is what refuses locked changes.
  return el('li', {}, toggle, link, ...(state.canManage ? [image, remove] : []));
}

function render() {
  $('party').replaceChildren(...state.characters.map(row));
  $('empty').hidden = state.characters.length > 0;
  $('exportBtn').disabled = state.characters.length === 0;
  $('importBtn').disabled = false;
  $('importBtn').hidden = $('form').hidden = !state.canManage;
  $('empty').textContent = state.canManage
    ? 'No characters yet. Add your party below.'
    : 'No characters yet. Press Manage to add your party.';
  $('manageBtn').hidden = !state.adminRequired;
  $('manageBtn').textContent = state.canManage ? '🔓 Lock' : '🔒 Manage';
}

function setAdminPasscode(value) {
  adminPasscode = value;
  try { localStorage.setItem('adminPasscode', value); } catch {}
}

$('manageBtn').onclick = async () => {
  if (state.canManage) {
    setAdminPasscode('');
    state = { ...state, canManage: false }; // hide the controls straight away
    render();
    return refresh();
  }
  const entry = prompt('Admin passcode:');
  if (!entry) return;
  try {
    const next = await request(undefined, entry); // check it before saving it
    if (!next.canManage) return showError('That admin passcode is not right.');
    setAdminPasscode(entry);
    accept(next);
    showError('');
  } catch (err) {
    showError(err.message);
  }
};

$('embedBtn').onclick = (event) => copyLink(event.currentTarget, embedUrl());

$('exportBtn').onclick = () => {
  const characters = state.characters.map(({ name, inspired, imageUrl }) => ({ name, inspired, imageUrl }));
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ characters }, null, 2)], { type: 'application/json' }));
  el('a', { href: url, download: 'bardic-party.json' }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async (event) => {
  const [file] = event.target.files;
  event.target.value = ''; // lets the same file be picked again
  if (!file) return;
  let characters;
  try {
    ({ characters } = JSON.parse(await file.text()));
  } catch {}
  if (!Array.isArray(characters)) return showError('That file is not a character list export.');
  if (state.characters.length &&
      !confirm(`Replace the shared list with ${characters.length} imported character(s)? This affects everyone.`)) return;
  await act({ type: 'import', characters });
};

$('form').onsubmit = async (event) => {
  event.preventDefault();
  const form = event.target;
  const { name, imageUrl } = form.elements;
  if (await act({ type: 'add', name: name.value, imageUrl: imageUrl.value })) form.reset();
};

// Poll only while the tab is visible, which also keeps hosted usage low.
setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
refresh();
