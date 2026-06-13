#!/usr/bin/env node
'use strict';

/**
 * jsonpatch CLI — Apply, validate, or diff JSON patches (RFC 6902)
 *
 * Usage:
 *   jsonpatch apply <doc.json> <patch.json>     Apply patch → output result
 *   jsonpatch validate <patch.json>              Validate patch structure
 *   jsonpatch diff <a.json> <b.json>             Generate patch from a → b
 *
 * Options:
 *   --indent <n>   Pretty-print with n spaces (default: 2)
 *   --compact      Compact output (no whitespace)
 *   -i, --stdin    Read doc from stdin (for apply/diff first arg)
 */

const fs = require('fs');
const path = require('path');
const { applyPatch, diff, validate } = require('./index');

// ─── Args parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { indent: 2, _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--indent') {
      args.indent = parseInt(argv[++i], 10) || 2;
    } else if (a === '--compact') {
      args.compact = true;
    } else if (a === '-i' || a === '--stdin') {
      args.stdin = true;
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (a === '--version' || a === '-v') {
      args.version = true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function readJSON(source, label) {
  let raw;
  if (source === '-') {
    raw = fs.readFileSync(0, 'utf8');
  } else {
    raw = fs.readFileSync(source, 'utf8');
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    process.stderr.write('Error parsing ' + label + ' as JSON: ' + err.message + '\n');
    process.exit(1);
  }
}

function output(result, indent) {
  const json = indent === 0
    ? JSON.stringify(result)
    : JSON.stringify(result, null, indent);
  process.stdout.write(json + '\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    console.log(pkg.version);
    return;
  }

  const cmd = args._[0];

  if (!cmd || args.help) {
    console.log(`jsonpatch — RFC 6902 JSON Patch CLI

Usage:
  jsonpatch apply <doc.json> <patch.json>   Apply patch → output result
  jsonpatch validate <patch.json>            Validate patch structure
  jsonpatch diff <a.json> <b.json>           Generate patch from a → b

Options:
  --indent <n>   Pretty-print indent (default: 2)
  --compact      Compact output
  -i, --stdin    Read first arg from stdin
  -h, --help     Show this help
  -v, --version  Show version

Exit codes:
  0  Success
  1  Parse / file error
  2  Patch application error
  3  Validation failure`);
    return;
  }

  const indent = args.compact ? 0 : args.indent;

  switch (cmd) {
    case 'apply': {
      if (args._.length < 3) {
        process.stderr.write('Usage: jsonpatch apply <doc.json> <patch.json>\n');
        process.exit(1);
      }
      const doc = readJSON(args._[1], 'document');
      const patch = readJSON(args._[2], 'patch');
      try {
        const result = applyPatch(doc, patch);
        output(result, indent);
      } catch (err) {
        process.stderr.write('Patch application failed: ' + err.message + '\n');
        process.exit(2);
      }
      break;
    }

    case 'validate': {
      if (args._.length < 2) {
        process.stderr.write('Usage: jsonpatch validate <patch.json>\n');
        process.exit(1);
      }
      const patch = readJSON(args._[1], 'patch');
      const result = validate(patch);
      if (result.valid) {
        console.log('✓ Valid patch (' + patch.length + ' operations)');
        process.exit(0);
      } else {
        console.log('✗ Invalid: ' + result.error);
        process.exit(3);
      }
      break;
    }

    case 'diff': {
      if (args._.length < 3) {
        process.stderr.write('Usage: jsonpatch diff <a.json> <b.json>\n');
        process.exit(1);
      }
      const a = readJSON(args._[1], 'first document');
      const b = readJSON(args._[2], 'second document');
      const patch = diff(a, b);
      output(patch, indent);
      break;
    }

    default:
      process.stderr.write('Unknown command: ' + cmd + '\nUse --help for usage.\n');
      process.exit(1);
  }
}

main();
