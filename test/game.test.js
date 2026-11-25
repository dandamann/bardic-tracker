const test = require('node:test');
const assert = require('node:assert/strict');
const { initialState, applyAction } = require('../lib/game');

const add = () => applyAction(initialState(), { type: 'add', name: ' Thorn ' });

test('add, inspire, uninspire and remove', () => {
  let s = add();
  const { id } = s.characters[0];
  assert.deepEqual(s.characters[0], { id, name: 'Thorn', inspired: false, imageUrl: '' });
  const on = { type: 'setInspired', id, inspired: true };
  s = applyAction(applyAction(s, on), on); // repeating is harmless
  assert.equal(s.characters[0].inspired, true);
  s = applyAction(s, { ...on, inspired: false });
  assert.equal(s.characters[0].inspired, false);
  s = applyAction(s, { type: 'remove', id });
  assert.deepEqual(s.characters, []);
  assert.equal(s.version, 5);
});

test('rejects bad input without changing the original', () => {
  const s = add();
  for (const bad of [null, { type: 'toString' }, { type: 'add', name: ' ' },
    { type: 'add', name: 'x'.repeat(41) }, { type: 'remove', id: 'nope' },
    { type: 'setInspired', id: s.characters[0].id, inspired: 'yes' }]) {
    assert.throws(() => applyAction(s, bad));
  }
  assert.equal(s.version, 1);
});

test('import replaces the list, all or nothing', () => {
  const s = add();
  const next = applyAction(s, { type: 'import', characters: [{ name: 'Lyra', inspired: true }, { name: 'Mira' }] });
  assert.deepEqual(next.characters.map(({ name, inspired }) => [name, inspired]),
    [['Lyra', true], ['Mira', false]]);
  assert.notEqual(next.characters[0].id, next.characters[1].id);
  for (const characters of [undefined, [], 'Lyra', [null], [{ name: 5 }],
    [{ name: 'Ok' }, { name: ' ' }], [{ name: 'Ok', inspired: 'yes' }],
    Array(31).fill({ name: 'Ok' })]) {
    assert.throws(() => applyAction(s, { type: 'import', characters }), { name: 'Error' });
  }
  assert.equal(s.characters[0].name, 'Thorn');
});

test('image URLs: set, clear, import, and reject unsafe values', () => {
  let s = add();
  const set = (imageUrl) => ({ type: 'setImage', id: s.characters[0].id, imageUrl });
  s = applyAction(s, set(' https://example.com/a.png '));
  assert.equal(s.characters[0].imageUrl, 'https://example.com/a.png');
  for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AA', '/a.png', 'nope', 5,
    `https://example.com/${'a'.repeat(1000)}`]) {
    assert.throws(() => applyAction(s, set(bad)), { name: 'Error' });
  }
  assert.equal(applyAction(s, set('')).characters[0].imageUrl, '');
  const imported = applyAction(s, { type: 'import', characters: s.characters });
  assert.equal(imported.characters[0].imageUrl, 'https://example.com/a.png');
});
