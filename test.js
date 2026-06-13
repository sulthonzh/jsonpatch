'use strict';

/**
 * Tests for @sulthonzh/jsonpatch
 * Run: node test.js
 */

const assert = require('assert');
const { applyPatch, diff, validate, pointer, _deepEqual, _deepClone } = require('./index');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.log('  ✗ ' + name);
    console.log('    ' + err.message);
  }
}

function eq(actual, expected, msg) {
  assert.deepStrictEqual(actual, expected, msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ─── JSON Pointer ─────────────────────────────────────────────────────────────

test('pointer.parse: empty string → []', () => {
  eq(pointer.parse(''), []);
});

test('pointer.parse: root slash → [""]', () => {
  eq(pointer.parse('/'), ['']);
});

test('pointer.parse: simple path', () => {
  eq(pointer.parse('/foo'), ['foo']);
});

test('pointer.parse: nested path', () => {
  eq(pointer.parse('/foo/bar/baz'), ['foo', 'bar', 'baz']);
});

test('pointer.parse: escaped tilde (~0)', () => {
  eq(pointer.parse('/a~0b'), ['a~b']);
});

test('pointer.parse: escaped slash (~1)', () => {
  eq(pointer.parse('/a~1b'), ['a/b']);
});

test('pointer.parse: combined escapes', () => {
  eq(pointer.parse('/a~01b'), ['a~1b']);
});

test('pointer.parse: throws on non-string', () => {
  assert.throws(() => pointer.parse(42), /must be a string/);
});

test('pointer.parse: throws when not starting with /', () => {
  assert.throws(() => pointer.parse('foo'), /must start with/);
});

test('pointer.serialize: empty tokens → ""', () => {
  eq(pointer.serialize([]), '');
});

test('pointer.serialize: single token', () => {
  eq(pointer.serialize(['foo']), '/foo');
});

test('pointer.serialize: multiple tokens', () => {
  eq(pointer.serialize(['a', 'b', 'c']), '/a/b/c');
});

test('pointer.serialize: escapes special chars', () => {
  eq(pointer.serialize(['a/b', 'c~d']), '/a~1b/c~0d');
});

test('pointer.serialize: roundtrip', () => {
  const ptr = '/foo~1bar/baz~0qux';
  eq(pointer.serialize(pointer.parse(ptr)), ptr);
});

// ─── ADD operation ────────────────────────────────────────────────────────────

test('add: root replace', () => {
  const result = applyPatch({ a: 1 }, [{ op: 'add', path: '', value: { b: 2 } }]);
  eq(result, { b: 2 });
});

test('add: new property', () => {
  const result = applyPatch({ a: 1 }, [{ op: 'add', path: '/b', value: 2 }]);
  eq(result, { a: 1, b: 2 });
});

test('add: replace existing property', () => {
  const result = applyPatch({ a: 1 }, [{ op: 'add', path: '/a', value: 99 }]);
  eq(result, { a: 99 });
});

test('add: nested property', () => {
  const result = applyPatch({ a: { b: 1 } }, [{ op: 'add', path: '/a/c', value: 2 }]);
  eq(result, { a: { b: 1, c: 2 } });
});

test('add: append to array with "-"', () => {
  const result = applyPatch([1, 2, 3], [{ op: 'add', path: '/-', value: 4 }]);
  eq(result, [1, 2, 3, 4]);
});

test('add: insert at array index', () => {
  const result = applyPatch([1, 2, 3], [{ op: 'add', path: '/1', value: 99 }]);
  eq(result, [1, 99, 2, 3]);
});

test('add: insert at start of array', () => {
  const result = applyPatch([1, 2], [{ op: 'add', path: '/0', value: 0 }]);
  eq(result, [0, 1, 2]);
});

test('add: does not mutate original', () => {
  const orig = { a: 1 };
  applyPatch(orig, [{ op: 'add', path: '/b', value: 2 }]);
  eq(orig, { a: 1 });
});

test('add: mutate mode', () => {
  const orig = { a: 1 };
  const result = applyPatch(orig, [{ op: 'add', path: '/b', value: 2 }], { mutate: true });
  assert(result === orig, 'should be same object');
  eq(orig, { a: 1, b: 2 });
});

// ─── REMOVE operation ─────────────────────────────────────────────────────────

test('remove: property', () => {
  const result = applyPatch({ a: 1, b: 2 }, [{ op: 'remove', path: '/a' }]);
  eq(result, { b: 2 });
});

test('remove: from array', () => {
  const result = applyPatch([1, 2, 3], [{ op: 'remove', path: '/1' }]);
  eq(result, [1, 3]);
});

test('remove: nested', () => {
  const result = applyPatch({ a: { b: 1, c: 2 } }, [{ op: 'remove', path: '/a/c' }]);
  eq(result, { a: { b: 1 } });
});

test('remove: throws on missing property', () => {
  assert.throws(
    () => applyPatch({ a: 1 }, [{ op: 'remove', path: '/b' }]),
    /does not exist/
  );
});

test('remove: throws on root', () => {
  assert.throws(
    () => applyPatch({ a: 1 }, [{ op: 'remove', path: '' }]),
    /Cannot remove document root/
  );
});

// ─── REPLACE operation ────────────────────────────────────────────────────────

test('replace: property value', () => {
  const result = applyPatch({ a: 1, b: 2 }, [{ op: 'replace', path: '/a', value: 99 }]);
  eq(result, { a: 99, b: 2 });
});

test('replace: array element', () => {
  const result = applyPatch([1, 2, 3], [{ op: 'replace', path: '/1', value: 99 }]);
  eq(result, [1, 99, 3]);
});

test('replace: root document', () => {
  const result = applyPatch({ a: 1 }, [{ op: 'replace', path: '', value: [1, 2] }]);
  eq(result, [1, 2]);
});

// ─── MOVE operation ───────────────────────────────────────────────────────────

test('move: property to property', () => {
  const result = applyPatch({ a: 1, b: 2 }, [{ op: 'move', from: '/a', path: '/c' }]);
  eq(result, { b: 2, c: 1 });
});

test('move: within array', () => {
  const result = applyPatch(['a', 'b', 'c'], [{ op: 'move', from: '/0', path: '/2' }]);
  eq(result, ['b', 'c', 'a']);
});

// ─── COPY operation ───────────────────────────────────────────────────────────

test('copy: duplicate property', () => {
  const result = applyPatch({ a: 1 }, [{ op: 'copy', from: '/a', path: '/b' }]);
  eq(result, { a: 1, b: 1 });
});

test('copy: original stays', () => {
  const result = applyPatch({ a: { x: 1 } }, [{ op: 'copy', from: '/a', path: '/b' }]);
  eq(result, { a: { x: 1 }, b: { x: 1 } });
  // Ensure deep copy (modifying one doesn't affect the other)
  result.a.x = 2;
  eq(result.b.x, 1);
});

// ─── TEST operation ───────────────────────────────────────────────────────────

test('test: equal value passes', () => {
  const result = applyPatch({ a: 1 }, [{ op: 'test', path: '/a', value: 1 }]);
  eq(result, { a: 1 });
});

test('test: mismatched value throws', () => {
  assert.throws(
    () => applyPatch({ a: 1 }, [{ op: 'test', path: '/a', value: 2 }]),
    /Test failed/
  );
});

test('test: deep object comparison', () => {
  applyPatch(
    { a: { b: { c: 1 } } },
    [{ op: 'test', path: '/a', value: { b: { c: 1 } } }]
  );
});

test('test: array comparison', () => {
  applyPatch([1, 2, 3], [{ op: 'test', path: '', value: [1, 2, 3] }]);
});

// ─── Multi-op patches ─────────────────────────────────────────────────────────

test('multi-op: sequence of operations', () => {
  const patch = [
    { op: 'add', path: '/c', value: 3 },
    { op: 'remove', path: '/a' },
    { op: 'replace', path: '/b', value: 99 },
  ];
  const result = applyPatch({ a: 1, b: 2 }, patch);
  eq(result, { b: 99, c: 3 });
});

test('multi-op: test guards subsequent ops', () => {
  assert.throws(() => {
    applyPatch({ a: 1 }, [
      { op: 'test', path: '/a', value: 2 },
      { op: 'add', path: '/b', value: 3 },
    ]);
  });
});

// ─── Validate ─────────────────────────────────────────────────────────────────

test('validate: valid patch', () => {
  const result = validate([{ op: 'add', path: '/a', value: 1 }]);
  eq(result, { valid: true });
});

test('validate: not an array', () => {
  const result = validate({ op: 'add' });
  eq(result.valid, false);
  assert(/must be an array/.test(result.error));
});

test('validate: missing op', () => {
  const result = validate([{ path: '/a', value: 1 }]);
  eq(result.valid, false);
  assert(/Invalid or missing "op"/.test(result.error));
});

test('validate: invalid op name', () => {
  const result = validate([{ op: 'delete', path: '/a' }]);
  eq(result.valid, false);
});

test('validate: missing path', () => {
  const result = validate([{ op: 'add', value: 1 }]);
  eq(result.valid, false);
  assert(/path/.test(result.error));
});

test('validate: missing value for add', () => {
  const result = validate([{ op: 'add', path: '/a' }]);
  eq(result.valid, false);
  assert(/value/.test(result.error));
});

test('validate: missing from for move', () => {
  const result = validate([{ op: 'move', path: '/b' }]);
  eq(result.valid, false);
  assert(/from/.test(result.error));
});

test('validate: empty patch', () => {
  eq(validate([]), { valid: true });
});

// ─── Diff ─────────────────────────────────────────────────────────────────────

test('diff: identical → empty patch', () => {
  eq(diff({ a: 1 }, { a: 1 }), []);
});

test('diff: add property', () => {
  const patch = diff({ a: 1 }, { a: 1, b: 2 });
  eq(patch, [{ op: 'add', path: '/b', value: 2 }]);
});

test('diff: remove property', () => {
  const patch = diff({ a: 1, b: 2 }, { a: 1 });
  eq(patch, [{ op: 'remove', path: '/b' }]);
});

test('diff: replace primitive', () => {
  const patch = diff({ a: 1 }, { a: 2 });
  eq(patch, [{ op: 'replace', path: '/a', value: 2 }]);
});

test('diff: nested object change', () => {
  const patch = diff({ a: { b: 1 } }, { a: { b: 2 } });
  eq(patch, [{ op: 'replace', path: '/a/b', value: 2 }]);
});

test('diff: array changes', () => {
  const patch = diff([1, 2], [1, 2, 3]);
  assert(patch.some(op => op.op === 'add' && op.value === 3));
});

test('diff: roundtrip — diff then apply = target', () => {
  const a = { x: 1, y: { z: [1, 2] }, arr: ['a', 'b'] };
  const b = { x: 2, y: { z: [1, 2, 3] }, arr: ['a', 'b', 'c'], new: true };
  const patch = diff(a, b);
  const result = applyPatch(a, patch);
  eq(result, b);
});

test('diff: type change → replace root', () => {
  const patch = diff({ a: 1 }, [1, 2]);
  eq(patch, [{ op: 'replace', path: '', value: [1, 2] }]);
});

test('diff: null to value', () => {
  const patch = diff(null, { a: 1 });
  eq(patch, [{ op: 'replace', path: '', value: { a: 1 } }]);
});

test('diff: special characters in keys', () => {
  const patch = diff({ 'a/b': 1 }, { 'a/b': 2, 'c~d': 3 });
  const result = applyPatch({ 'a/b': 1 }, patch);
  eq(result, { 'a/b': 2, 'c~d': 3 });
});

// ─── Deep utilities ───────────────────────────────────────────────────────────

test('deepClone: primitives', () => {
  eq(_deepClone(42), 42);
  eq(_deepClone('hello'), 'hello');
  eq(_deepClone(null), null);
});

test('deepClone: object', () => {
  const orig = { a: { b: [1, 2] } };
  const clone = _deepClone(orig);
  clone.a.b.push(3);
  eq(orig.a.b, [1, 2]);
});

test('deepEqual: various types', () => {
  assert(_deepEqual(1, 1));
  assert(_deepEqual({ a: [1, 2] }, { a: [1, 2] }));
  assert(!_deepEqual({ a: 1 }, { a: 2 }));
  assert(!_deepEqual([1, 2], [1, 2, 3]));
  assert(_deepEqual(null, null));
  assert(!_deepEqual(null, undefined));
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

test('edge: empty patch returns doc unchanged', () => {
  const doc = { a: 1 };
  const result = applyPatch(doc, []);
  eq(result, { a: 1 });
});

test('edge: deeply nested add', () => {
  const doc = { a: { b: { c: {} } } };
  const result = applyPatch(doc, [{ op: 'add', path: '/a/b/c/d', value: 'deep' }]);
  eq(result, { a: { b: { c: { d: 'deep' } } } });
});

test('edge: array index leading zeros rejected', () => {
  assert.throws(
    () => applyPatch([1, 2], [{ op: 'add', path: '/01', value: 3 }]),
    /leading zeros/
  );
});

test('edge: array index out of bounds', () => {
  assert.throws(
    () => applyPatch([1, 2], [{ op: 'add', path: '/5', value: 3 }]),
    /out of bounds/
  );
});

test('edge: value deep-cloned in patch', () => {
  const val = { x: 1 };
  const result = applyPatch({}, [{ op: 'add', path: '/a', value: val }]);
  val.x = 999;
  eq(result.a, { x: 1 });
});

test('edge: move from child to parent path', () => {
  // Move only relocates the value at /a/b/c → /a/d, parent /a/b stays as {}
  const result = applyPatch(
    { a: { b: { c: 1 } } },
    [{ op: 'move', from: '/a/b/c', path: '/a/d' }]
  );
  eq(result, { a: { b: {}, d: 1 } });
});

test('edge: copy then test', () => {
  const result = applyPatch(
    { a: 42 },
    [
      { op: 'copy', from: '/a', path: '/b' },
      { op: 'test', path: '/b', value: 42 },
    ]
  );
  eq(result, { a: 42, b: 42 });
});

test('diff+apply: complex nested roundtrip', () => {
  const a = {
    users: [
      { id: 1, name: 'Alice', roles: ['admin'] },
      { id: 2, name: 'Bob', roles: ['user'] },
    ],
    meta: { version: 1 },
  };
  const b = {
    users: [
      { id: 1, name: 'Alice', roles: ['admin', 'editor'] },
      { id: 2, name: 'Bob', roles: ['user'] },
      { id: 3, name: 'Carol', roles: ['user'] },
    ],
    meta: { version: 2, updated: true },
  };
  const patch = diff(a, b);
  const result = applyPatch(a, patch);
  eq(result, b);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
