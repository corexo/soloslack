'use strict';

/**
 * Static design scanner for the Design Book.
 *
 * Reads a frontend repo directory as TEXT ONLY (never require()/eval/exec of
 * scanned files) and extracts framework info, design tokens, UI components
 * and screens using regex / simple string logic.
 */

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage', '.expo',
  'android', 'ios', '.turbo', '.cache', 'vendor', 'Pods', '__tests__',
  '__mocks__', 'storybook-static',
]);
const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const STYLE_EXT = new Set(['.css', '.scss']);
const SFC_EXT = new Set(['.vue', '.svelte']);
const MAX_FILE_SIZE = 300 * 1024;
const MAX_FILES = 4000;
const TOKEN_CAP = 300;
const COMPONENT_CAP = 400;
const SCREEN_CAP = 300;
const COMPONENT_DIRS = new Set(['components', 'ui', 'widgets', 'design-system']);

// ---------------------------------------------------------------- helpers

const toPosix = (p) => p.split(path.sep).join('/');

function stripJsComments(src) {
  // Keeps string literals intact so "https://x" is not treated as a comment.
  return src.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (m, str) => (str ? str : ' ')
  );
}

function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
}

/** Index of the bracket closing the one at s[i]; -1 if unbalanced. Skips strings. */
function matchClose(s, i) {
  const open = s[i];
  const close = { '{': '}', '(': ')', '[': ']' }[open];
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      j++;
      while (j < s.length && s[j] !== q) {
        if (s[j] === '\\') j++;
        j++;
      }
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/** Split on commas that are not nested in brackets or strings. */
function splitTopLevel(s, sep = ',') {
  const out = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length && s[j] !== c) {
        if (s[j] === '\\') j++;
        j++;
      }
      cur += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if ('{[(<'.includes(c) && !(c === '<' && s[i + 1] === '=')) depth++;
    else if ('}])>'.includes(c) && !(c === '>' && s[i - 1] === '=')) depth = Math.max(0, depth - 1);
    if (c === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const isPascal = (n) => /^[A-Z][A-Za-z0-9]*$/.test(n);

function pascalFromBase(base) {
  return base
    .replace(/\.[^.]+$/, '')
    .split(/[^A-Za-z0-9]+|(?=[A-Z][a-z])/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
}

function humanize(seg) {
  const words = seg
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean);
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function pushCapped(list, item) {
  if (list.length < TOKEN_CAP) list.push(item);
}

// ---------------------------------------------------------------- walking

async function walk(root) {
  const files = [];
  let truncated = false;

  async function rec(dir) {
    if (truncated) return;
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (truncated) return;
      if (e.isSymbolicLink()) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        await rec(abs);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        const rel = toPosix(path.relative(root, abs));
        if (ext === '.json') {
          // package.json of app roots: repo root and up to 4 directories below it
          if (e.name !== 'package.json' || rel.split('/').length > 5) continue;
        } else if (!CODE_EXT.has(ext) && !STYLE_EXT.has(ext) && !SFC_EXT.has(ext)) continue;
        if (/\.d\.ts$/.test(e.name)) continue;
        if (files.length >= MAX_FILES) {
          truncated = true;
          return;
        }
        files.push({ abs, rel, ext, base: e.name });
      }
    }
  }

  await rec(root);
  return { files, truncated };
}

// ---------------------------------------------------------------- tokens: CSS

const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FN_RE = /^(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix|color)\(/i;
const LENGTH_RE = /^-?[\d.]+(?:px|rem|em)$/i;

function isDarkPrelude(p) {
  return /\bdark\b/i.test(p);
}

function parseCssVars(text, cb) {
  const css = stripCssComments(text);
  const stack = [];
  let buf = '';
  const flush = () => {
    const m = /^--([\w-]+)\s*:\s*([\s\S]+)$/.exec(buf.trim());
    buf = '';
    if (!m) return;
    const value = m[2].replace(/!important/i, '').replace(/\s+/g, ' ').trim();
    if (value) cb(m[1], value, stack.some(isDarkPrelude));
  };
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c) {
        if (css[j] === '\\') j++;
        j++;
      }
      buf += css.slice(i, j + 1);
      i = j;
    } else if (c === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (c === '}') {
      flush();
      stack.pop();
    } else if (c === ';') flush();
    else buf += c;
  }
}

/** Returns { kind, entry } or null for a CSS custom property. */
function classifyVar(name, value) {
  const lower = name.toLowerCase();
  if (/^(tw|webkit|moz)-/.test(lower)) return null; // framework-internal vars
  const pureVar = /^var\(.*\)$/.test(value) && !/color-mix/i.test(value);
  if (pureVar) return null;
  const isColorValue = HEX_RE.test(value) || COLOR_FN_RE.test(value);

  if (/radius|rounded/.test(lower)) return { kind: 'radii', entry: { value } };
  if (/shadow/.test(lower) && !(isColorValue && /color/.test(lower))) {
    return { kind: 'shadows', entry: { value } };
  }
  if (isColorValue) return { kind: 'colors', entry: { value } };
  if (/font|text-|leading|tracking/.test(lower)) {
    const t = { family: '', size: '', weight: '' };
    if (/family|font-(sans|serif|mono|display|body|heading)/.test(lower) || /[,"']/.test(value)) t.family = value;
    else if (/weight/.test(lower) || /^[1-9]00$/.test(value) || /^(bold|normal|medium|light)$/i.test(value)) t.weight = value;
    else t.size = value; // sizes, line-height, letter-spacing: best-effort bucket
    return { kind: 'typography', entry: t };
  }
  if (/space|spacing|gap|size-|^(sm|md|lg|xl)/.test(lower) && LENGTH_RE.test(value)) {
    return { kind: 'spacing', entry: { value } };
  }
  if (/color/.test(lower)) return { kind: 'colors', entry: { value } };
  return null;
}

// ---------------------------------------------------------------- tokens: Tailwind config / JS themes

/**
 * Tolerant object-literal reader. s[i] must be '{'. Collects [pathArray, value]
 * where value is a string or string[] (arrays of string literals only).
 * Returns index after the closing brace.
 */
function readObject(s, i, prefix, out, depthGuard = 0) {
  if (depthGuard > 8) return matchClose(s, i) + 1 || s.length;
  i++; // skip '{'
  const n = s.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(s[i])) i++;
    if (i >= n) break;
    if (s[i] === '}') return i + 1;
    // key
    let key = null;
    if (s[i] === '"' || s[i] === "'" || s[i] === '`') {
      const q = s[i];
      let j = i + 1;
      while (j < n && s[j] !== q) j++;
      key = s.slice(i + 1, j);
      i = j + 1;
    } else if (s[i] === '[') {
      const e = matchClose(s, i);
      i = e < 0 ? n : e + 1;
    } else if (s.startsWith('...', i)) {
      // spread: skip expression
      i = skipExpr(s, i);
      continue;
    } else {
      const m = /^[\w$.-]+/.exec(s.slice(i, i + 80));
      if (!m) {
        i++;
        continue;
      }
      key = m[0];
      i += m[0].length;
    }
    while (i < n && /\s/.test(s[i])) i++;
    if (s[i] !== ':') {
      // shorthand or method: skip
      i = skipExpr(s, i);
      continue;
    }
    i++;
    while (i < n && /\s/.test(s[i])) i++;
    const p = key == null || key === 'DEFAULT' ? prefix : [...prefix, key];
    if (s[i] === '{') {
      i = readObject(s, i, p, out, depthGuard + 1);
    } else if (s[i] === '"' || s[i] === "'" || s[i] === '`') {
      const q = s[i];
      let j = i + 1;
      while (j < n && s[j] !== q) {
        if (s[j] === '\\') j++;
        j++;
      }
      if (p.length) out.push([p, s.slice(i + 1, j)]);
      i = skipExpr(s, j + 1);
    } else if (s[i] === '[') {
      const e = matchClose(s, i);
      if (e < 0) return n;
      const inner = s.slice(i + 1, e);
      const strs = splitTopLevel(inner)
        .map((x) => x.trim())
        .filter((x) => /^(["'`]).*\1$/.test(x))
        .map((x) => x.slice(1, -1));
      if (strs.length && p.length) out.push([p, strs]);
      i = skipExpr(s, e + 1);
    } else {
      const m = /^-?[\d.]+/.exec(s.slice(i, i + 20));
      if (m && p.length) out.push([p, m[0]]);
      i = skipExpr(s, i);
    }
  }
  return n;
}

/** Skip to the next top-level ',' (consumed) or to the closing '}' (not consumed). */
function skipExpr(s, i) {
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < n && s[i] !== q) {
        if (s[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') {
      const e = matchClose(s, i);
      i = e < 0 ? n : e + 1;
      continue;
    }
    if (c === ',') return i + 1;
    if (c === '}') return i;
    i++;
  }
  return n;
}

function looksLikeColor(v) {
  return typeof v === 'string' && (HEX_RE.test(v.trim()) || COLOR_FN_RE.test(v.trim()));
}

function parseTailwindConfig(text, source, tokens, seen) {
  const src = stripJsComments(text);
  const re = /\b(colors|fontFamily|spacing|borderRadius|boxShadow)\s*:\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const kind = m[1];
    const braceIdx = m.index + m[0].length - 1;
    const out = [];
    readObject(src, braceIdx, [], out);
    for (const [p, v] of out) {
      const name = p.join('-');
      if (kind === 'colors') {
        if (looksLikeColor(v)) add(tokens.colors, seen.colors, { name, value: v.trim(), source });
      } else if (kind === 'fontFamily') {
        const family = Array.isArray(v) ? v.join(', ') : v;
        add(tokens.typography, seen.typography, { name, family, size: '', weight: '', sample: '', source });
      } else if (kind === 'spacing') {
        add(tokens.spacing, seen.spacing, { name, value: Array.isArray(v) ? v.join(', ') : v, source });
      } else if (kind === 'borderRadius') {
        add(tokens.radii, seen.radii, { name, value: Array.isArray(v) ? v.join(', ') : v, source });
      } else if (kind === 'boxShadow') {
        add(tokens.shadows, seen.shadows, { name, value: Array.isArray(v) ? v.join(', ') : v, source });
      }
    }
  }
}

function parseThemeFile(text, source, tokens, seen) {
  const src = stripJsComments(text);
  const re =
    /(\{)|(\})|(['"]?)([\w$-]+)\3\s*:\s*\{|(?:const|let|var)\s+([\w$]+)\s*=\s*(['"`])(#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch)\([^'"`]*\))\6|(['"]?)([\w$-]+)\8\s*:\s*(['"`])(#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch)\([^'"`]*\))\10/g;
  const stack = [];
  const IGNORE = new Set(['colors', 'color', 'palette', 'theme', 'tokens']);
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) stack.push(null);
    else if (m[2]) stack.pop();
    else if (m[4]) stack.push(m[4]);
    else if (m[5]) {
      add(tokens.colors, seen.colors, { name: m[5], value: m[7], source });
    } else if (m[9]) {
      const prefix = stack.filter((k) => k && !IGNORE.has(k));
      add(tokens.colors, seen.colors, { name: [...prefix, m[9]].join('-'), value: m[11], source });
    }
  }
}

function add(list, seenSet, item) {
  if (list.length >= TOKEN_CAP) return;
  const key = `${item.name}\u0000${item.value !== undefined ? item.value : item.family + '|' + item.size + '|' + item.weight}`;
  if (seenSet.has(key)) return;
  seenSet.add(key);
  list.push(item);
}

// ---------------------------------------------------------------- components

function interfaceKeys(src, names) {
  for (const nm of names) {
    const re = new RegExp(`(?:interface\\s+${nm}\\b[^{=]*|type\\s+${nm}\\s*(?:<[^>]*>)?\\s*=\\s*(?:[\\w.<>,\\s&|]*&\\s*)?)\\{`);
    const m = re.exec(src);
    if (!m) continue;
    const open = m.index + m[0].length - 1;
    const close = matchClose(src, open);
    if (close < 0) continue;
    const body = src.slice(open + 1, close);
    // Strip nested blocks so only top-level members remain.
    let flat = '';
    let depth = 0;
    for (const c of body) {
      if ('{(['.includes(c)) {
        if (depth === 0) flat += c;
        depth++;
      } else if ('})]'.includes(c)) {
        depth = Math.max(0, depth - 1);
        if (depth === 0) flat += c;
      } else if (depth === 0) flat += c;
    }
    const keys = [];
    const kre = /(?:^|[;,\n])\s*(?:readonly\s+)?(['"]?)([\w$-]+)\1\??\s*[:(]/g;
    let km;
    while ((km = kre.exec(flat))) keys.push(km[2]);
    if (keys.length) return keys;
  }
  return [];
}

function destructuredKeys(paramText) {
  const t = paramText.trim();
  if (!t.startsWith('{')) return [];
  const close = matchClose(t, 0);
  if (close < 0) return [];
  const keys = [];
  for (const item of splitTopLevel(t.slice(1, close))) {
    const s = item.trim();
    if (!s || s.startsWith('...')) continue;
    const m = /^(['"]?)([\w$-]+)\1/.exec(s);
    if (m) keys.push(m[2]);
  }
  return keys;
}

function findParams(src, name) {
  const patterns = [
    new RegExp(`function\\s+${name}\\s*(?:<[^>(]*>)?\\s*\\(`),
    new RegExp(`(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*(?:(?:React\\.)?(?:memo|forwardRef|observer)(?:<[^>(]*>)?\\(\\s*)?(?:async\\s*)?(?:function\\s*\\w*\\s*)?\\(`),
  ];
  for (const re of patterns) {
    const m = re.exec(src);
    if (!m) continue;
    const open = m.index + m[0].length - 1;
    const close = matchClose(src, open);
    if (close < 0) continue;
    return src.slice(open + 1, close);
  }
  // single bare param: const X = props =>
  return '';
}

function cleanDescription(raw) {
  return raw
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*+\s?/, '').trim())
    .filter((l) => l && !/^@\w+/.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

function findDescription(src, name) {
  const re = new RegExp(
    `(\\/\\*\\*[\\s\\S]*?\\*\\/)\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function|const|class|let|var)\\s+${name}\\b`
  );
  let m = re.exec(src);
  if (m) return cleanDescription(m[1]);
  m = /^\s*(?:['"]use (?:client|server)['"];?\s*)?(\/\*[\s\S]*?\*\/)/.exec(src);
  if (m && !/license|copyright/i.test(m[1])) return cleanDescription(m[1]);
  return '';
}

function onlyReexports(src) {
  const lines = stripJsComments(src)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return true;
  const joined = stripJsComments(src);
  if (/<[A-Za-z]/.test(joined) && /return\s*\(?\s*</.test(joined)) return false;
  return !/\bfunction\b|=>|\bclass\b/.test(joined);
}

function detectComponentName(src, base) {
  let m = /export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/.exec(src);
  if (m && isPascal(m[1])) return { name: m[1], exported: true };
  m = /export\s+default\s+(?:React\.)?(?:memo|forwardRef|observer)\(\s*(?:function\s+)?([A-Za-z_$][\w$]*)/.exec(src);
  if (m && isPascal(m[1])) return { name: m[1], exported: true };
  m = /export\s+default\s+([A-Z][\w$]*)\s*;?\s*$/m.exec(src);
  if (m) return { name: m[1], exported: true };
  const re = /export\s+(?:async\s+)?(?:function|const|class|let|var)\s+([A-Z][\w$]*)/g;
  m = re.exec(src);
  if (m) return { name: m[1], exported: true };
  m = /export\s*\{([^}]*)\}/.exec(src);
  if (m) {
    for (const part of m[1].split(',')) {
      const nm = part.trim().split(/\s+as\s+/)[0].trim();
      if (isPascal(nm)) return { name: nm, exported: true };
    }
  }
  const hasExport = /\bexport\b/.test(src);
  m = /(?:^|\n)\s*(?:async\s+)?(?:function|class|const)\s+([A-Z][\w$]*)/.exec(src);
  if (m) return { name: m[1], exported: false };
  return { name: pascalFromBase(base) || base, exported: hasExport };
}

function analyzeComponent(file, text) {
  const { rel, ext, base } = file;
  let name;
  let exported = true;
  let props = [];
  let description = '';

  if (ext === '.vue' || ext === '.svelte') {
    name = pascalFromBase(base) || base.replace(/\.[^.]+$/, '');
    const keys = new Set();
    if (ext === '.vue') {
      let m = /defineProps\s*<\s*\{/.exec(text);
      if (m) {
        const open = m.index + m[0].length - 1;
        const close = matchClose(text, open);
        if (close > 0) {
          const tmp = `interface __P ${text.slice(open, close + 1)}`;
          interfaceKeys(tmp, ['__P']).forEach((k) => keys.add(k));
        }
      }
      m = /defineProps\s*(?:<[^>]*>)?\s*\(\s*([\[{])/.exec(text);
      if (m) {
        const open = m.index + m[0].length - 1;
        const close = matchClose(text, open);
        if (close > 0) {
          const inner = text.slice(open + 1, close);
          if (m[1] === '[') {
            for (const x of splitTopLevel(inner)) {
              const s = x.trim().replace(/^["'`]|["'`]$/g, '');
              if (s) keys.add(s);
            }
          } else {
            const out = [];
            readObject(text, open, [], out);
            splitTopLevel(inner).forEach((it) => {
              const k = /^\s*(['"]?)([\w$-]+)\1\s*:/.exec(it);
              if (k) keys.add(k[2]);
            });
          }
        }
      }
      m = /\bprops\s*:\s*([\[{])/.exec(text);
      if (m && keys.size === 0) {
        const open = m.index + m[0].length - 1;
        const close = matchClose(text, open);
        if (close > 0) {
          for (const it of splitTopLevel(text.slice(open + 1, close))) {
            const k = /^\s*(['"]?)([\w$-]+)\1\s*(?::|$|,)/.exec(it);
            if (k) keys.add(k[2]);
          }
        }
      }
    } else {
      let m;
      const re = /export\s+let\s+([\w$]+)/g;
      while ((m = re.exec(text))) keys.add(m[1]);
      m = /let\s*\{([^}]*)\}\s*(?::[^=]+)?=\s*\$props\(\)/.exec(text);
      if (m) destructuredKeys(`{${m[1]}}`).forEach((k) => keys.add(k));
    }
    props = [...keys];
    const dm = /<script[^>]*>\s*(\/\*[\s\S]*?\*\/)/.exec(text) || /^\s*<!--([\s\S]*?)-->/.exec(text);
    if (dm) description = cleanDescription(dm[1].startsWith('/*') ? dm[1] : `/*${dm[1]}*/`);
  } else {
    const src = stripJsCommentsKeepDocs(text);
    const det = detectComponentName(src, base);
    name = det.name;
    exported = det.exported;
    props = destructuredKeys(findParams(src, name));
    const ifaceKeys = interfaceKeys(src, [`${name}Props`, 'Props']);
    props = [...new Set([...props, ...ifaceKeys])];
    description = findDescription(text, name);
  }

  return {
    name,
    path: rel,
    props: props.slice(0, 30),
    description,
    usageCount: 0,
    snippet: text.split('\n').slice(0, 60).join('\n'),
    exported,
  };
}

/** Remove // and plain block comments but keep nothing special - docs are read from raw text separately. */
function stripJsCommentsKeepDocs(text) {
  return stripJsComments(text);
}

function isComponentCandidate(file, text) {
  const { rel, ext, base } = file;
  if (!(ext === '.jsx' || ext === '.tsx' || ext === '.vue' || ext === '.svelte' || ext === '.js' || ext === '.ts')) return false;
  if (/\.(test|spec|stories)\./i.test(base)) return false;
  const segs = rel.split('/');
  segs.pop();
  if (!segs.some((s) => COMPONENT_DIRS.has(s.toLowerCase()))) return false;
  if (ext === '.js' || ext === '.ts') {
    if (!/return\s*\(/.test(text) || !/</.test(text)) return false;
  }
  if (/^index\./.test(base) && ext !== '.vue' && ext !== '.svelte' && onlyReexports(text)) return false;
  return true;
}

// ---------------------------------------------------------------- screens

function routeFromSegments(segs) {
  const parts = segs.filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
  return '/' + parts.join('/');
}

function screenName(route) {
  if (route === '/') return 'Home';
  const segs = route.split('/').filter(Boolean);
  const last = segs[segs.length - 1];
  if (/^\[.*\]$/.test(last)) return 'Detail';
  return humanize(last) || 'Screen';
}

function screenFlow(route) {
  if (route === '/') return 'home';
  const first = route.split('/').filter(Boolean).find((s) => !/^\[.*\]$/.test(s));
  return first ? first.toLowerCase() : 'app';
}

function noExt(p) {
  return p.replace(/\.[^./]+$/, '');
}

function collectFileScreens(files, framework, hasExpoApp, rootPrefix) {
  const screens = [];
  for (const f of files) {
    if (!CODE_EXT.has(f.ext) || /\.(test|spec|stories)\./i.test(f.base)) continue;
    const fullPath = f.rel;
    const rel = rootPrefix ? f.rel.slice(rootPrefix.length) : f.rel; // relative to the app root
    let m = /^(?:src\/)?app\/(?:(.*)\/)?page\.(?:js|jsx|ts|tsx)$/.exec(rel);
    if (m) {
      const route = routeFromSegments(m[1] ? m[1].split('/') : []);
      screens.push({ name: screenName(route), route, path: fullPath, flow: screenFlow(route), router: 'next-app' });
      continue;
    }
    if (framework === 'next') {
      m = /^(?:src\/)?pages\/(.+)\.(?:js|jsx|ts|tsx|mjs)$/.exec(rel);
      if (m) {
        const segs = m[1].split('/');
        if (segs[0] === 'api') continue;
        const last = segs[segs.length - 1];
        if (['_app', '_document', '_error', '_middleware', '404', '500'].includes(last) && segs.length === 1) continue;
        if (last.startsWith('_')) continue;
        if (last === 'index') segs.pop();
        const route = routeFromSegments(segs);
        screens.push({ name: screenName(route), route, path: fullPath, flow: screenFlow(route), router: 'next-pages' });
        continue;
      }
    }
    if (framework === 'expo' && hasExpoApp) {
      m = /^(?:src\/)?app\/(.+)\.(?:js|jsx|ts|tsx)$/.exec(rel);
      if (m) {
        const segs = m[1].split('/');
        const last = segs[segs.length - 1];
        if (last.startsWith('_') || last.startsWith('+')) continue;
        if (last === 'index') segs.pop();
        const route = routeFromSegments(segs);
        screens.push({ name: screenName(route), route, path: fullPath, flow: screenFlow(route), router: 'expo-router' });
      }
    }
  }
  return screens;
}

function navFlow(navVar) {
  const stripped = (navVar || '').replace(/(Navigator|Stack|Tabs?|Drawer|Nav)$/i, '');
  return stripped ? stripped.toLowerCase() : 'app';
}

function collectNavigationScreens(files, texts, out = new Map(), keyPrefix = '') {
  for (const f of files) {
    if (!CODE_EXT.has(f.ext)) continue;
    const text = texts.get(f.rel);
    if (!text || !/\bScreen\b|component\s*:/.test(text)) continue;
    try {
      const re1 = /<(\w+)\.Screen\b([^>]*)/g;
      let m;
      while ((m = re1.exec(text))) {
        const attrs = m[2];
        const nm = /\bname=(?:"([^"]+)"|'([^']+)'|\{\s*["'`]([^"'`]+)["'`]\s*\})/.exec(attrs);
        if (!nm || !/\bcomponent=|\bgetComponent=/.test(text.slice(m.index, m.index + 400))) continue;
        const name = nm[1] || nm[2] || nm[3];
        if (!out.has(keyPrefix + name)) {
          out.set(keyPrefix + name, { name, route: name, path: f.rel, flow: navFlow(m[1]), router: 'react-navigation' });
        }
      }
      const re2 = /\bname\s*:\s*['"]([^'"]+)['"]\s*,\s*component\s*:\s*[\w.]+/g;
      while ((m = re2.exec(text))) {
        if (!out.has(keyPrefix + m[1])) {
          out.set(keyPrefix + m[1], { name: m[1], route: m[1], path: f.rel, flow: 'app', router: 'react-navigation' });
        }
      }
    } catch {
      /* ignore bad file */
    }
  }
  return [...out.values()];
}

// ---------------------------------------------------------------- main

function detectFramework(pkg, tailwindExtra) {
  let name = 'unknown';
  let tailwind = false;
  let packageName = null;
  let expoRouter = false;
  if (pkg && typeof pkg === 'object') {
    packageName = typeof pkg.name === 'string' ? pkg.name : null;
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const has = (k) => Object.prototype.hasOwnProperty.call(deps, k);
    if (has('next')) name = 'next';
    else if (has('expo')) name = 'expo';
    else if (has('react-native')) name = 'react-native';
    else if (has('vue') || has('nuxt')) name = 'vue';
    else if (has('svelte') || has('@sveltejs/kit')) name = 'svelte';
    else if (has('react')) name = 'react';
    tailwind = has('tailwindcss');
    if (name === 'unknown' || name === 'react-native' || name === 'react') {
      if (has('expo-router')) name = 'expo';
    }
    expoRouter = has('expo-router');
  }
  return { name, tailwind: tailwind || tailwindExtra, packageName, expoRouter };
}

async function scanRepo(dir) {
  if (typeof dir !== 'string' || !dir) throw new Error('scanRepo: directory path is required');
  const root = path.resolve(dir);
  let st;
  try {
    st = await fs.promises.stat(root);
  } catch {
    throw new Error(`scanRepo: directory not found: ${root}`);
  }
  if (!st.isDirectory()) throw new Error(`scanRepo: not a directory: ${root}`);

  const { files, truncated } = await walk(root);

  // Read every file once.
  const texts = new Map();
  let filesScanned = 0;
  const BATCH = 64;
  for (let i = 0; i < files.length; i += BATCH) {
    await Promise.all(
      files.slice(i, i + BATCH).map(async (f) => {
        try {
          const s = await fs.promises.stat(f.abs);
          if (s.size > MAX_FILE_SIZE) return;
          texts.set(f.rel, await fs.promises.readFile(f.abs, 'utf8'));
          filesScanned++;
        } catch {
          /* unreadable file */
        }
      })
    );
  }
  const readable = files.filter((f) => texts.has(f.rel));

  // Framework: find app roots (dirs with a package.json, depth <= 4) and keep UI ones.
  let tailwindExtra = readable.some((f) => /^tailwind\.config\.(js|cjs|mjs|ts)$/.test(f.base));
  if (!tailwindExtra) {
    tailwindExtra = readable.some(
      (f) => STYLE_EXT.has(f.ext) && /@import\s+["']tailwindcss|@tailwind\b/.test(texts.get(f.rel))
    );
  }
  const UI = ['next', 'expo', 'react-native', 'vue', 'svelte', 'react'];
  const roots = [];
  for (const f of readable) {
    if (f.base !== 'package.json') continue;
    let pkg;
    try {
      pkg = JSON.parse(texts.get(f.rel));
    } catch {
      continue;
    }
    const det = detectFramework(pkg, false);
    if (!UI.includes(det.name)) continue;
    const rootRel = f.rel === 'package.json' ? '' : f.rel.slice(0, -'/package.json'.length);
    roots.push({ root: rootRel, prefix: rootRel ? rootRel + '/' : '', det });
  }
  // Assign each source file to its deepest enclosing UI root.
  const rootFiles = new Map(roots.map((r) => [r.root, []]));
  const byDepth = [...roots].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const f of readable) {
    const owner = byDepth.find((r) => !r.prefix || f.rel.startsWith(r.prefix));
    if (owner) rootFiles.get(owner.root).push(f);
  }
  for (const r of roots) {
    r.fileCount = rootFiles.get(r.root).length;
    r.rank = UI.indexOf(r.det.name);
  }
  const primary = [...roots].sort((a, b) => a.rank - b.rank || b.fileCount - a.fileCount)[0] || null;
  const framework = {
    name: primary ? primary.det.name : 'unknown',
    tailwind: tailwindExtra || roots.some((r) => r.det.tailwind),
    packageName: primary ? primary.det.packageName : null,
    root: primary ? primary.root : '',
    apps: roots.map((r) => ({ root: r.root, name: r.det.name, packageName: r.det.packageName })),
  };

  // Tokens
  const tokens = { colors: [], typography: [], spacing: [], radii: [], shadows: [] };
  const seen = { colors: new Set(), typography: new Set(), spacing: new Set(), radii: new Set(), shadows: new Set() };

  for (const f of readable) {
    try {
      const text = texts.get(f.rel);
      if (STYLE_EXT.has(f.ext)) {
        parseCssVars(text, (rawName, value, dark) => {
          const c = classifyVar(rawName, value);
          if (!c) return;
          const name = dark ? `${rawName} (dark)` : rawName;
          const e = c.entry;
          if (c.kind === 'typography') {
            add(tokens.typography, seen.typography, { name, family: e.family, size: e.size, weight: e.weight, sample: '', source: f.rel });
          } else {
            add(tokens[c.kind], seen[c.kind], { name, value: e.value, source: f.rel });
          }
        });
      }
    } catch {
      /* skip */
    }
  }
  for (const f of readable) {
    try {
      if (CODE_EXT.has(f.ext) && /^tailwind\.config\./.test(f.base)) {
        parseTailwindConfig(texts.get(f.rel), f.rel, tokens, seen);
      }
    } catch {
      /* skip */
    }
  }
  for (const f of readable) {
    try {
      if (!CODE_EXT.has(f.ext) || /^tailwind\.config\./.test(f.base)) continue;
      if (!/theme|colors|palette|tokens|design-?system/i.test(f.base)) continue;
      const segs = f.rel.split('/');
      segs.pop();
      if (segs.some((s) => s.toLowerCase() === 'components')) continue;
      parseThemeFile(texts.get(f.rel), f.rel, tokens, seen);
    } catch {
      /* skip */
    }
  }

  // Components
  let components = [];
  for (const f of readable) {
    try {
      const text = texts.get(f.rel);
      if (!isComponentCandidate(f, text)) continue;
      components.push(analyzeComponent(f, text));
    } catch {
      /* skip */
    }
  }
  components.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  components = components.slice(0, COMPONENT_CAP);

  const usageFiles = readable.filter((f) => CODE_EXT.has(f.ext) || SFC_EXT.has(f.ext));
  for (const comp of components) {
    const needle = `<${comp.name}`;
    let count = 0;
    for (const f of usageFiles) {
      if (f.rel === comp.path) continue;
      const text = texts.get(f.rel);
      let idx = text.indexOf(needle);
      while (idx !== -1) {
        if (/[\s/>]/.test(text[idx + needle.length] || '')) {
          count++;
          break;
        }
        idx = text.indexOf(needle, idx + 1);
      }
    }
    comp.usageCount = count;
  }

  // Screens (per UI root, router logic uses paths relative to that root)
  const allScreens = [];
  const navMap = new Map();
  for (const r of roots) {
    const rf = rootFiles.get(r.root);
    let hasExpoApp = false;
    if (r.det.name === 'expo') {
      const pre = r.prefix;
      hasExpoApp = rf.some((f) => {
        const rel = f.rel.slice(pre.length);
        return /^(?:src\/)?app\//.test(rel) && CODE_EXT.has(f.ext) && !/^page\./.test(f.base);
      });
    }
    for (const sc of collectFileScreens(rf, r.det.name, hasExpoApp, r.prefix)) allScreens.push(sc);
    collectNavigationScreens(rf, texts, navMap, `${r.root}\u0000`); // dedupe key = root + name
  }
  const screens = [...allScreens, ...navMap.values()]
    .sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : a.path < b.path ? -1 : 1))
    .slice(0, SCREEN_CAP);

  return {
    framework,
    tokens,
    components,
    screens,
    stats: { filesScanned, truncated },
  };
}

module.exports = { scanRepo };
