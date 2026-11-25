const test = require('node:test');
const assert = require('node:assert/strict');
const { initialState, applyAction } = require('../lib/game');

const add = () => applyAction(initialState(), { type: 'add', name: ' Thorn ' });

test('add, inspire, uninspire and remove', () => {
  let s = add();
  const { id } = s.characters[0];
  assert.deepEqual(s.characters[0], { id, name: 'Thorn', inspired: false });
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
