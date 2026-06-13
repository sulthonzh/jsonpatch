# @sulthonzh/jsonpatch

> RFC 6902 JSON Patch — apply, diff, and validate patches with zero dependencies

JSON Patch is a standard way to describe changes to a JSON document. This library implements the full spec: all 6 operations (`add`, `remove`, `replace`, `move`, `copy`, `test`), JSON Pointer (RFC 6901) navigation, and a diff engine that generates patches between any two values.

## Why

You need to track what changed between two versions of a JSON document — for audit logs, collaborative editing, state synchronization, or API PATCH endpoints. This library handles both directions: apply patches and generate them.

## Install

```bash
npm install @sulthonzh/jsonpatch
```

## Quick Start

```js
const { applyPatch, diff, validate } = require('@sulthonzh/jsonpatch');

// Apply a patch
const doc = { name: 'Alice', age: 30 };
const result = applyPatch(doc, [
  { op: 'replace', path: '/age', value: 31 },
  { op: 'add', path: '/email', value: 'alice@example.com' },
]);
// → { name: 'Alice', age: 31, email: 'alice@example.com' }

// Generate a patch between two documents
const patch = diff(
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 30 }
);
// → [{ op: 'replace', path: '/name', value: 'Bob' }]

// Validate before applying
const check = validate([{ op: 'add', path: '/x', value: 1 }]);
// → { valid: true }
```

## API

### `applyPatch(doc, patch, opts?)`

Applies a JSON Patch array to a document. Returns a **new** document (original is not mutated unless `opts.mutate` is `true`).

```js
const result = applyPatch(doc, [
  { op: 'add', path: '/tags/-', value: 'new' },     // append to array
  { op: 'remove', path: '/temp' },                   // delete property
  { op: 'move', from: '/oldName', path: '/newName' },
  { op: 'copy', from: '/source', path: '/backup' },
  { op: 'test', path: '/version', value: 1 },        // assertion — throws if mismatch
]);
```

### `diff(a, b)`

Generates a minimal patch that transforms `a` into `b`. Uses prefix/suffix matching for arrays and key-level diffing for objects.

```js
const patch = diff(
  { users: [{ id: 1, name: 'Alice' }] },
  { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] }
);
// → [{ op: 'add', path: '/users/1', value: { id: 2, name: 'Bob' } }]
```

Roundtrip guarantee: `applyPatch(a, diff(a, b))` always equals `b`.

### `validate(patch)`

Checks structural validity without applying. Returns `{ valid: true }` or `{ valid: false, error: string, index?: number }`.

### `pointer.parse(ptr)` / `pointer.serialize(tokens)`

JSON Pointer (RFC 6901) utilities.

```js
pointer.parse('/foo/0/bar');  // → ['foo', '0', 'bar']
pointer.serialize(['a', 'b/c~d']);  // → '/a/b~1c~0d'
```

## All Operations

| Op | Description | Example |
|----|-------------|---------|
| `add` | Insert value at path (creates or overwrites) | `{ op: 'add', path: '/b', value: 2 }` |
| `remove` | Delete value at path | `{ op: 'remove', path: '/a' }` |
| `replace` | Replace value at path | `{ op: 'replace', path: '/a', value: 99 }` |
| `move` | Move value from one path to another | `{ op: 'move', from: '/a', path: '/b' }` |
| `copy` | Copy value from one path to another | `{ op: 'copy', from: '/a', path: '/b' }` |
| `test` | Assert path equals value (throws if not) | `{ op: 'test', path: '/v', value: 1 }` |

### Special paths

- `""` (empty string) → document root
- `"-"` in arrays → append (e.g., `"/items/-"`)
- `"/0"`, `"/1"` → array indices

### Escaping

`~` is `~0` and `/` is `~1` in JSON Pointers (RFC 6901).

```js
// Key "a/b" → pointer "/a~1b"
{ op: 'add', path: '/a~1b', value: 1 }
```

## CLI

```bash
# Apply a patch
jsonpatch apply doc.json patch.json

# Generate a diff
jsonpatch diff old.json new.json

# Validate a patch file
jsonpatch validate patch.json

# From stdin
cat doc.json | jsonpatch apply - patch.json --compact
```

## Design Choices

- **Zero dependencies.** No transitive bloat.
- **Immutable by default.** `applyPatch` returns a new document. Pass `{ mutate: true }` to avoid the clone cost.
- **Roundtrip-safe diff.** `diff(a, b)` then `applyPatch(a, ...)` always produces `b`.
- **Strict validation.** Leading zeros in array indices are rejected (RFC 6902 §4.1). Out-of-bounds indices throw.

## License

MIT
