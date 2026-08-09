// jsx-es3-check.mjs — static guard for panel/jsx/** (Adobe ExtendScript, ES3).
//
// Nothing else in the lint/test setup exercises this dialect: eslint.config.js
// deliberately excludes panel/jsx (modern JS rules don't apply — see its
// comment), and the Node/V8-based simulator parses modern syntax just fine,
// so a chained-ternary mis-parse or a stray `const` only ever surfaces live
// in AE. This script re-checks host.jsx's own documented dialect contract
// ("ES3 only — no let/const/arrow/template-literals") plus the chained-
// ternary trap that already bit this codebase once (see DEVLOG / the
// es3-chained-ternary-trap memory) — it does not replace real ExtendScript
// syntax checking, it's a cheap net for the exact mistakes that have already
// cost debugging time.
//
// Comment- and string-aware: strings/comments are blanked out before pattern
// matching so words like "const" inside a comment, or "=>" inside a string,
// don't produce false positives.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const JSX_DIR = process.argv[2] ? resolve(process.argv[2]) : resolve(ROOT, 'panel', 'jsx');

function listSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (['.jsx', '.js'].includes(extname(entry)) && entry !== 'bundle.jsx') {
      out.push(full);
    }
  }
  return out;
}

// Blank out comments and string-literal bodies, preserving line breaks (for
// accurate line numbers) and overall length (for accurate column numbers).
// Also detects real template literals (backticks outside a string/comment)
// as a violation in its own right, since json2/ExtendScript has no such
// syntax to preserve.
function stripAndFindTemplateLiterals(src) {
  let out = '';
  const templateLiteralLines = [];
  let i = 0;
  const n = src.length;
  let line = 1;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out += src[i] === '\t' ? '\t' : ' '; i++; }
      continue;
    }
    if (c === '/' && c2 === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        if (src[i] === '\n') line++;
        i++;
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out += 'S';
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') { i++; }
        if (src[i] === '\n') line++;
        i++;
      }
      out += 'S';
      i++;
      continue;
    }
    if (c === '`') {
      templateLiteralLines.push(line);
      out += 'S';
      i++;
      // Consume through the matching closing backtick so its content (which
      // may itself contain ?:;{}()[] etc.) doesn't feed the other checks,
      // and so the closing backtick isn't mistaken for a second literal.
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') i++;
        if (src[i] === '\n') line++;
        i++;
      }
      out += 'S';
      i++;
      continue;
    }
    if (c === '\n') line++;
    out += c;
    i++;
  }
  return { stripped: out, templateLiteralLines };
}

function lineOf(stripped, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (stripped[i] === '\n') line++;
  return line;
}

function findAll(stripped, regex) {
  const hits = [];
  let m;
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  while ((m = re.exec(stripped))) {
    hits.push({ line: lineOf(stripped, m.index), match: m[0] });
    if (m[0].length === 0) re.lastIndex++; // avoid infinite loop on zero-width matches
  }
  return hits;
}

const CHECKS = [
  { id: 'let/const', regex: /\b(let|const)\b/, message: 'ES3 has no let/const — use var' },
  { id: 'arrow-fn', regex: /=>/, message: 'ES3 has no arrow functions — use function (...) {}' },
  { id: 'class', regex: /\bclass\s+\w/, message: 'ES3 has no class syntax — use a constructor function' },
  { id: 'spread-rest', regex: /\.\.\./, message: 'ES3 has no spread/rest (...) — use arguments/explicit loops' },
  { id: 'for-of', regex: /for\s*\([^)]*\bof\b/, message: 'ES3 has no for...of — use for...in or an index loop' },
  {
    id: 'chained-ternary',
    // ?<simple-run>:<simple-run>? with no ,;{}()[] in between — the exact
    // unparenthesized chain that mis-parses in ExtendScript. Explicitly
    // parenthesized ternaries (a ? b : (c ? d : e)) don't match, since that's
    // the documented safe form when a ternary is unavoidable — but plain
    // if/else is still the house style for 3+-way branches.
    regex: /\?[^?:,;{}()[\]]*:[^?:,;{}()[\]]*\?/,
    message: 'chained ternary (a?b:c?d:e) mis-parses in ExtendScript — use explicit if/else',
  },
];

let violations = 0;
const files = listSourceFiles(JSX_DIR);
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const { stripped, templateLiteralLines } = stripAndFindTemplateLiterals(src);
  const rel = relative(ROOT, file);

  for (const l of templateLiteralLines) {
    console.error(`${rel}:${l}  template literal (\`...\`) — ES3 has no template strings, use string concatenation`);
    violations++;
  }
  for (const check of CHECKS) {
    for (const hit of findAll(stripped, check.regex)) {
      console.error(`${rel}:${hit.line}  ${check.message}  [${check.id}]`);
      violations++;
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} ES3-compatibility violation(s) in panel/jsx/** across ${files.length} file(s).`);
  process.exit(1);
} else {
  console.log(`jsx-es3-check: ${files.length} file(s) clean.`);
}
