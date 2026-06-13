'use strict';

/**
 * @sulthonzh/jsonpatch
 * RFC 6902 JSON Patch implementation — zero dependencies
 *
 * Supports all 6 operations: add, remove, replace, move, copy, test
 * Plus diff() to generate patches between two values.
 */

// ─── JSON Pointer (RFC 6901) ──────────────────────────────────────────────────

/**
 * Parse a JSON Pointer string into an array of reference tokens.
 * "" → [], "/" → [""], "/foo" → ["foo"], "/a/b" → ["a","b"], "/a~1b" → ["a/b"]
 */
function parsePointer(ptr) {
  if (typeof ptr !== 'string') {
    throw new TypeError('pointer must be a string, got ' + typeof ptr);
  }
  if (ptr === '') return [];
  if (ptr[0] !== '/') {
    throw new Error('JSON pointer must start with "/" or be empty: ' + ptr);
  }
  return ptr.slice(1).split('/').map((seg) =>
    seg.replace(/~1/g, '/').replace(/~0/g, '~')
  );
}

/**
 * Serialize tokens back into a JSON Pointer string.
 */
function serializePointer(tokens) {
  if (!Array.isArray(tokens)) {
    throw new TypeError('tokens must be an array');
  }
  if (tokens.length === 0) return '';
  return '/' + tokens
    .map(String)
    .map((s) => s.replace(/~/g, '~0').replace(/\//g, '~1'))
    .join('/');
}

// ─── Pointer navigation ───────────────────────────────────────────────────────

/**
 * Get the value at a JSON Pointer path.
 */
function getValue(target, tokens) {
  let cur = target;
  for (let i = 0; i < tokens.length; i++) {
    if (cur === null || cur === undefined) {
      throw new Error('Cannot resolve pointer at token "' + tokens[i] + '" — parent is null');
    }
    if (Array.isArray(cur)) {
      const idx = parseArrayIndex(tokens[i], cur.length, false);
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      cur = cur[tokens[i]];
    } else {
      throw new Error('Cannot resolve pointer at token "' + tokens[i] + '" — not an object/array');
    }
  }
  return cur;
}

/**
 * Set or add a value at a JSON Pointer path.
 * Returns the mutated target (for chaining / root replace).
 */
function setValue(target, tokens, value) {
  if (tokens.length === 0) {
    // Replacing entire document
    return value;
  }

  const parent = getValue(target, tokens.slice(0, -1));
  if (parent === null || parent === undefined) {
    throw new Error('Parent path does not exist: ' + serializePointer(tokens.slice(0, -1)));
  }

  const last = tokens[tokens.length - 1];

  if (Array.isArray(parent)) {
    if (last === '-') {
      parent.push(value);
    } else {
      const idx = parseArrayIndex(last, parent.length, true);
      parent.splice(idx, 0, value);
    }
  } else if (typeof parent === 'object') {
    parent[last] = value;
  } else {
    throw new Error('Cannot set property on non-object/array value');
  }

  return target;
}

/**
 * Remove the value at a JSON Pointer path.
 * Returns the mutated target.
 */
function removeValue(target, tokens) {
  if (tokens.length === 0) {
    throw new Error('Cannot remove document root');
  }

  const parent = getValue(target, tokens.slice(0, -1));
  if (parent === null || parent === undefined) {
    throw new Error('Parent path does not exist: ' + serializePointer(tokens.slice(0, -1)));
  }

  const last = tokens[tokens.length - 1];

  if (Array.isArray(parent)) {
    const idx = parseArrayIndex(last, parent.length, false);
    parent.splice(idx, 1);
  } else if (typeof parent === 'object') {
    if (!(last in parent)) {
      throw new Error('Property "' + last + '" does not exist');
    }
    delete parent[last];
  } else {
    throw new Error('Cannot remove from non-object/array value');
  }

  return target;
}

/**
 * Parse a string into an array index, validating the range.
 */
function parseArrayIndex(str, currentLength, allowAppend) {
  if (typeof str !== 'string' || !/^\d+$/.test(str)) {
    throw new Error('Invalid array index: ' + str);
  }
  // No leading zeros (RFC 6902 §4.1)
  if (str.length > 1 && str[0] === '0') {
    throw new Error('Array index must not have leading zeros: ' + str);
  }
  const idx = parseInt(str, 10);
  const maxLen = allowAppend ? currentLength : currentLength - 1;
  if (idx < 0 || idx > maxLen) {
    throw new Error('Array index out of bounds: ' + idx + ' (length: ' + currentLength + ')');
  }
  return idx;
}

// ─── Deep clone & deep equal ──────────────────────────────────────────────────

function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone);
  const obj = {};
  for (const key of Object.keys(value)) {
    obj[key] = deepClone(value[key]);
  }
  return obj;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// ─── Operations ───────────────────────────────────────────────────────────────

const OPS = {
  add(target, { path, value }) {
    return setValue(target, parsePointer(path), deepClone(value));
  },

  remove(target, { path }) {
    return removeValue(target, parsePointer(path));
  },

  replace(target, { path, value }) {
    const tokens = parsePointer(path);
    if (tokens.length === 0) return deepClone(value);
    removeValue(target, tokens);
    setValue(target, tokens, deepClone(value));
    return target;
  },

  move(target, { from, path }) {
    const fromTokens = parsePointer(from);
    const val = deepClone(getValue(target, fromTokens));
    removeValue(target, fromTokens);
    setValue(target, parsePointer(path), val);
    return target;
  },

  copy(target, { from, path }) {
    const fromTokens = parsePointer(from);
    const val = deepClone(getValue(target, fromTokens));
    setValue(target, parsePointer(path), val);
    return target;
  },

  test(target, { path, value }) {
    const actual = getValue(target, parsePointer(path));
    return deepEqual(actual, value);
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate that a patch object is well-formed.
 * Returns { valid: boolean, error?: string, op?: string, index?: number }.
 */
function validate(patch) {
  if (!Array.isArray(patch)) {
    return { valid: false, error: 'Patch must be an array' };
  }
  const validOps = Object.keys(OPS);

  for (let i = 0; i < patch.length; i++) {
    const op = patch[i];
    if (typeof op !== 'object' || op === null || Array.isArray(op)) {
      return { valid: false, error: 'Operation ' + i + ' must be an object', index: i };
    }
    if (typeof op.op !== 'string' || !OPS[op.op]) {
      return { valid: false, error: 'Invalid or missing "op" at index ' + i, index: i };
    }
    if (typeof op.path !== 'string') {
      return { valid: false, error: 'Missing or invalid "path" at index ' + i, index: i };
    }
    if ((op.op === 'add' || op.op === 'replace' || op.op === 'test') && op.value === undefined) {
      return { valid: false, error: 'Missing "value" for ' + op.op + ' at index ' + i, index: i };
    }
    if ((op.op === 'move' || op.op === 'copy') && typeof op.from !== 'string') {
      return { valid: false, error: 'Missing "from" for ' + op.op + ' at index ' + i, index: i };
    }
  }

  return { valid: true };
}

/**
 * Apply a JSON Patch to a document.
 * Returns a NEW patched document (does not mutate the input).
 *
 * @param {object|array} doc — the document to patch
 * @param {array} patch — array of patch operations
 * @param {object} opts — { mutate?: boolean } if true, mutates the input doc
 * @returns {object|array} the patched document
 * @throws if any operation fails
 */
function applyPatch(doc, patch, opts) {
  opts = opts || {};
  const check = validate(patch);
  if (!check.valid) {
    throw new Error(check.error);
  }

  let result = opts.mutate ? doc : deepClone(doc);

  for (let i = 0; i < patch.length; i++) {
    const op = patch[i];
    const fn = OPS[op.op];

    if (op.op === 'test') {
      if (!fn(result, op)) {
        throw new Error('Test failed at index ' + i + ': ' + op.path + ' does not match expected value');
      }
    } else {
      try {
        result = fn(result, op);
      } catch (err) {
        throw new Error('Operation ' + op.op + ' failed at index ' + i + ': ' + err.message);
      }
    }
  }

  return result;
}

/**
 * Generate a JSON Patch that transforms `a` into `b`.
 * Produces minimal "replace/add/remove" operations.
 *
 * @param {*} a — source value
 * @param {*} b — target value
 * @param {string} [ptr] — current pointer prefix
 * @returns {array} patch operations
 */
function diff(a, b, ptr) {
  ptr = ptr || '';
  const ops = [];

  if (deepEqual(a, b)) {
    return ops;
  }

  // Type mismatch or primitive — replace entirely
  if (typeof a !== typeof b ||
      a === null || b === null ||
      Array.isArray(a) !== Array.isArray(b) ||
      typeof a !== 'object') {
    ops.push({ op: 'replace', path: ptr, value: deepClone(b) });
    return ops;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    // Array diff: detect common prefix/suffix, emit add/remove for the rest
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && deepEqual(a[prefix], b[prefix])) {
      prefix++;
    }
    let suffixA = a.length - 1;
    let suffixB = b.length - 1;
    while (suffixA >= prefix && suffixB >= prefix && deepEqual(a[suffixA], b[suffixB])) {
      suffixA--;
      suffixB--;
    }

    // Remove items from a that are gone
    for (let i = suffixA; i >= prefix; i--) {
      ops.push({ op: 'remove', path: ptr + '/' + prefix });
    }
    // Add new items
    for (let i = prefix; i <= suffixB; i++) {
      ops.push({ op: 'add', path: ptr + '/' + i, value: deepClone(b[i]) });
    }

    // Prefix and suffix matched via deepEqual — no recursive diff needed
    return ops;
  }

  // Both are plain objects
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  // Removed keys
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) {
      ops.push({ op: 'remove', path: ptr + '/' + escapeToken(k) });
    }
  }

  // Added or changed keys
  for (const k of bKeys) {
    const childPtr = ptr + '/' + escapeToken(k);
    if (!Object.prototype.hasOwnProperty.call(a, k)) {
      ops.push({ op: 'add', path: childPtr, value: deepClone(b[k]) });
    } else if (!deepEqual(a[k], b[k])) {
      if (typeof a[k] === 'object' && a[k] !== null &&
          typeof b[k] === 'object' && b[k] !== null &&
          Array.isArray(a[k]) === Array.isArray(b[k])) {
        ops.push(...diff(a[k], b[k], childPtr));
      } else {
        ops.push({ op: 'replace', path: childPtr, value: deepClone(b[k]) });
      }
    }
  }

  return ops;
}

function escapeToken(str) {
  return String(str).replace(/~/g, '~0').replace(/\//g, '~1');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  applyPatch,
  diff,
  validate,
  // Low-level utilities
  pointer: { parse: parsePointer, serialize: serializePointer },
  // Internal helpers (for testing)
  _deepClone: deepClone,
  _deepEqual: deepEqual,
};
