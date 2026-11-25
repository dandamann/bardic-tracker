// View-only overlay for OBS. It only ever reads the shared state.
const params = new URLSearchParams(location.search);
// ?refresh=seconds, from 1 to 60. Anything missing or invalid means 3.
const seconds = Number(params.get('refresh') ?? 3);
const POLL_MS = (seconds >= 1 && seconds <= 60 ? seconds : 3) * 1000;
const onlyInspired = params.get('show') === 'inspired';
document.body.classList.toggle('row', params.get('layout') === 'row');
// After "#" so the passcode is not part of the page address sent to the server.
const passcode = new URLSearchParams(location.hash.slice(1)).get('passcode') || '';

// ?character=name shows just one character.
const wanted = (params.get('character') || '').trim().toLowerCase();

// The full name wins. Otherwise part of a name works if only one character has it.
function pick(characters) {
  if (!wanted) return characters;
  const exact = characters.filter((c) => c.name.toLowerCase() === wanted);
  if (exact.length) return exact.slice(0, 1);
  const partial = characters.filter((c) => c.name.toLowerCase().includes(wanted));
  return partial.length === 1 ? partial : [];
}

const party = document.getElementById('party');
const message = document.getElementById('message');
let shown = null;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function avatar(c) {
  const initial = () => el('span', { className: 'avatar', textContent: [...c.name][0].toUpperCase() });
  if (!c.imageUrl) return initial();
  const img = el('img', { className: 'avatar', alt: '', referrerPolicy: 'no-referrer' });
  img.onerror = () => img.replaceWith(initial());
  img.src = c.imageUrl;
  return img;
}

function render(characters) {
  const picked = pick(characters);
  const missing = Boolean(wanted) && picked.length === 0;
  message.textContent = missing ? `No single character matches "${params.get('character')}".` : '';
  message.hidden = !missing;
  party.replaceChildren(...picked
    .filter((c) => c.inspired || !onlyInspired)
    .map((c) => el('li', { className: c.inspired ? 'inspired' : '' },
      avatar(c),
      el('span', { className: 'name', textContent: c.name }),
      el('span', { className: 'note', textContent: c.inspired ? '♪' : '', ariaLabel: c.inspired ? 'Inspired' : '' }))));
}

async function refresh() {
  try {
    const res = await fetch('/api/state', {
      headers: { 'X-Passcode': encodeURIComponent(passcode) },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) {
      party.replaceChildren();
      shown = null;
      message.textContent = 'Add #passcode=YOUR_PASSCODE to the end of the overlay URL.';
      message.hidden = false;
      return;
    }
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const state = await res.json();
    if (state.version !== shown) {
      shown = state.version;
      render(state.characters);
    }
  } catch {
    // Keep the last list on stream. Only show a problem if nothing has loaded yet.
    if (shown === null) {
      message.textContent = 'Connecting to the tracker…';
      message.hidden = false;
    }
  } finally {
    setTimeout(refresh, POLL_MS);
  }
}

window.addEventListener('hashchange', () => location.reload());
refresh();
