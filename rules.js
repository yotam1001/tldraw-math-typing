// tldraw Math Typing: the shortcut tables and the matching engine.
// Shared by the content script and the popup's cheat sheet. Has no browser dependencies,
// so tests can load it in Node.
(function (root) {
  'use strict';

  const SUP = {
    0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ',
    l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ',
    x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  };
  const SUB = {
    0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
    a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ',
    r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
  };
  const VULGAR = {
    '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '2/5': '⅖',
    '3/5': '⅗', '4/5': '⅘', '1/6': '⅙', '5/6': '⅚', '1/7': '⅐', '1/8': '⅛', '3/8': '⅜',
    '5/8': '⅝', '7/8': '⅞', '1/9': '⅑', '1/10': '⅒',
  };

  // Categories the popup can switch on and off.
  const CATEGORIES = [
    { id: 'symbols', label: 'Operators, relations and arrows' },
    { id: 'roots', label: 'Roots (sqrt, cbrt)' },
    { id: 'scripts', label: 'Exponents and indices (x^2, e^{2x}, x_1)' },
    { id: 'draw', label: '/draw at the end of a line draws it as an equation' },
    { id: 'deriv', label: 'Draw d/dx, dy/dx, ∂/∂x stacked as you type the space after' },
    { id: 'fractions', label: 'Fractions as you type (3//4 → ¾)', off: true },
    { id: 'stacked', label: 'Draw fractions and bounds as you type, no /draw needed', off: true },
    { id: 'blocks', label: 'Draw //{…} as soon as } closes it (no /draw needed)' },
    { id: 'braces', label: 'Brace commands (abs{x}, \\frac{a}{b}, vec{v}, bar{x})' },
    { id: 'greek', label: 'Greek letters (alpha, theta…)' },
    { id: 'words', label: 'Math words (pi, inf, deg, int…)' },
    { id: 'sets', label: 'Number sets (RR, NN, ZZ…)' },
    { id: 'latex', label: 'LaTeX commands (\\in, \\sum, \\forall…)' },
    { id: 'cas', label: 'Calculator: calc, diff, integrate, solve… + Enter', group: 'tools' },
    { id: 'plot', label: 'Graphs: plot sin(x), plot x^2+y^2=9 + Enter', group: 'tools' },
    { id: 'shapes', label: 'Shapes: draw triangle 3 4 5 + Enter', group: 'tools' },
  ];

  // Typed sequences that change as soon as they are complete. Order matters: longer ones first.
  const SYMBOLS = [
    ['××', '·', '** (two stars)'], // `*` becomes × at once, so `**` arrives here as ××
    ['===', '≡'],
    ['...', '…'],
    ['≤>', '⇔', '<=>'],
    ['<→', '↔', '<->'],
    ['←>', '↔', '<-> (tldraw turns <- into ← itself)'],
    ['*', '×'],
    ['+-', '±'],
    ['-+', '∓'],
    ['>=', '≥'],
    ['<=', '≤'],
    ['!=', '≠'],
    ['~=', '≈'],
    ['->', '→'],
    ['=>', '⇒'],
  ];

  // Whole words, converted when the next space, symbol or Enter is typed.
  const GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'Δ', epsilon: 'ε', theta: 'θ', lambda: 'λ',
    mu: 'μ', sigma: 'Σ', phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω',
  };
  const WORDS = {
    pi: 'π', inf: '∞', deg: '°', div: '÷', int: '∫', partial: '∂', approx: '≈', forall: '∀',
    emptyset: '∅',
  };
  const SETS = { NN: 'ℕ', ZZ: 'ℤ', QQ: 'ℚ', RR: 'ℝ' };

  // LaTeX names, typed with a backslash: `\in ` -> `∈ `. These cover English words
  // (in, sum, because…) that would misfire without the backslash.
  const LATEX = {
    // Greek, exactly as LaTeX spells them (\delta is lowercase δ, \Delta is Δ)
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ',
    mu: 'μ', pi: 'π', sigma: 'σ', phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω',
    // sets and logic
    in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩', emptyset: '∅',
    forall: '∀', exists: '∃', therefore: '∴', because: '∵', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ',
    // calculus and operators
    sum: '∑', prod: '∏', int: '∫', partial: '∂', infty: '∞', cdot: '·', times: '×', div: '÷',
    pm: '±', mp: '∓',
    // relations
    leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', cong: '≅',
    // geometry
    angle: '∠', perp: '⊥', parallel: '∥', triangle: '△', degree: '°',
    // arrows
    to: '→', gets: '←', implies: '⇒', iff: '⇔',
    // misc
    ldots: '…',
  };

    const ACCENTS = { bar: '\u0304', vec: '\u20D7', hat: '\u0302', dot: '\u0307' };

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const mapAll = (s, table) => {
    let out = '';
    for (const ch of s) {
      const v = table[ch];
      if (v === undefined) return null;
      out += v;
    }
    return out;
  };

  const unwrap = (s) => (/^\(.*\)$|^\{.*\}$/.test(s) ? s.slice(1, -1) : s);

  // A rule that converts `table` keys when they are followed by a non-letter.
  // The character before the word must not be a letter or a backslash.
  const wordRule = (table) => {
    const names = Object.keys(table).sort((a, b) => b.length - a.length).map(escapeRe);
    const re = new RegExp(`(^|[^a-zA-Z\\\\])(${names.join('|')})([^a-zA-Z])$`);
    return [re, (m) => m[1] + table[m[2]] + m[3]];
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    hints: true, // suggestions under the caret while typing
    fonts: true, // draw symbols missing from tldraw's fonts with matching fallback fonts
    cursorKick: true, // redraw tldraw's cursor on the first mouse move after typing
    systemCursor: false, // use the plain system crosshair instead of tldraw's image cursor
    categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, !c.off])),
    custom: [], // [{ from: 'eps', to: 'ε' }]
  };

  // Version 2 stopped drawing while typing (use /draw); forget older choices for those groups.
  const SETTINGS_VERSION = 3;
  const normalizeSettings = (s) => {
    s = s || {};
    let cats = s.categories || {};
    if ((s.v || 1) < 2) {
      cats = { ...cats };
      for (const c of CATEGORIES) if (c.off) delete cats[c.id];
    }
    // Version 3 turned //{…} blocks back on: nobody types //{ by accident.
    if ((s.v || 1) < 3) {
      cats = { ...cats };
      delete cats.blocks;
    }
    return {
      v: SETTINGS_VERSION,
      enabled: s.enabled !== false,
      hints: s.hints !== false,
      fonts: s.fonts !== false,
      cursorKick: s.cursorKick !== false,
      systemCursor: s.systemCursor === true,
      categories: { ...DEFAULT_SETTINGS.categories, ...cats },
      custom: Array.isArray(s.custom)
        ? s.custom.filter((c) => c && typeof c.from === 'string' && c.from && typeof c.to === 'string')
        : [],
    };
  };

  // Big operators that can take bounds above and below.
  const BIG_OPS = '∫∬∮∑∏';
  // One bound: a (…) or {…} group, or a run of characters without spaces, brackets, ^ or _.
  const BOUND = String.raw`(?:\([^()]*\)|\{[^{}]*\}|[^\s(){}^_]+)`;
  // Matches the start of a bound spec right before `_` or `^`, so exponent rules leave it alone.
  const IN_BOUNDS = String.raw`(?<!(?:[${BIG_OPS}]|lim)(?:_${BOUND})?)`;
  // A fraction part: a (…) or {…} group, or letters, digits, dots, roots and exponents.
  const PART = String.raw`(\([^()]+\)|\{[^{}]+\}|[\p{L}\p{N}.√∛∞]+)`;

  // Builds the list of [regex, fn] rules for the given settings.
  // Each regex is tested on the text right before the caret. fn returns the replacement
  // for match[0] (a string), { text, stack } for something that can be drawn stacked, or null.
  const buildRules = (settings) => {
    const s = normalizeSettings(settings);
    const on = s.categories;
    const rules = [];
    const stacked = on.stacked;
    // Leave ∫_0^1 and friends as typed when they will be drawn (as you type, or by /draw).
    const keepBounds = stacked || on.draw;
    // Converts shortcuts inside a bound or fraction part (inf -> ∞, pi -> π).
    const tidy = (text) => {
      text = unwrap(text);
      const rep = findPendingWord(rules, text);
      return rep ? text.slice(0, text.length - rep.length) + rep.text : text;
    };

    // Custom shortcuts come first so they can override the built-ins.
    for (const { from, to } of s.custom) {
      if (/^[a-zA-Z0-9]+$/.test(from)) {
        const re = new RegExp(`(^|[^a-zA-Z0-9\\\\])(${escapeRe(from)})([^a-zA-Z0-9])$`);
        rules.push([re, (m) => m[1] + to + m[3]]);
      } else {
        rules.push([new RegExp(`${escapeRe(from)}$`), () => to]);
      }
    }

    if (stacked) {
      // ∫_0^1 , ∑_(i=1)^n , lim_(x→0)  followed by a space: bounds above and below.
      rules.push([new RegExp(`(^|[^a-zA-Z])([${BIG_OPS}]|lim)(?:_(${BOUND}))?(?:\\^(${BOUND}))?(\\s)$`), (m) => {
        const [, pre, op, lo, hi] = m;
        if (!lo && !hi) return null;
        if (op === 'lim' && hi) return null;
        const lower = lo ? tidy(lo) : '';
        const upper = hi ? tidy(hi) : '';
        // Outside a plain text shape it falls back to ∫₀¹ when the bounds have script forms.
        const subs = lower ? mapAll(lower, SUB) : '';
        const sups = upper ? mapAll(upper, SUP) : '';
        const inline = subs != null && sups != null ? pre + op + subs + sups + m[5] : m[0];
        return { text: inline, stack: { type: 'bigop', op, lower, upper, pre } };
      }]);
    }

    if (stacked || on.deriv) {
      // d/dx, dy/dx, d²y/dx², ∂/∂x (or ∂/∂ x) followed by a space or symbol: drawn stacked
      rules.push([/(^|[^\p{L}\p{N}])([d∂][²³]?[a-zA-Z]?)\/([d∂] ?[a-zA-Z][²³]?)([^\p{L}\p{N}])$/u, (m) => ({
        text: m[0],
        stack: { type: 'fraction', num: m[2], den: m[3].replace(' ', ''), after: m[4].trim(), pre: m[1], deriv: true },
      })]);
    }

    if (keepBounds) {
      // sum_ / prod_ -> ∑_ / ∏_ (plain `sum` stays a word otherwise)
      rules.push([/(^|[^a-zA-Z\\])(sum|prod)([_^])$/, (m) => m[1] + (m[2] === 'sum' ? '∑' : '∏') + m[3]]);
    }

    // \\ is easy to type for // (fractions, //{…} blocks): treat it the same.
    rules.push([/\\\\$/, () => '//']);

    if (on.latex) {
      const names = Object.keys(LATEX).sort((a, b) => b.length - a.length).join('|');
      rules.push([new RegExp(`\\\\(${names})([^a-zA-Z])$`), (m) => LATEX[m[1]] + m[2]]);
    }

    if (on.roots) {
      rules.push([/\\?sqrt$/i, () => '√']); // `\sqrt` works too
      rules.push([/\\?cbrt$/i, () => '∛']);
      // √(10) -> √10 when the inside is a single number or letter (keeps brackets for √(81+9))
      rules.push([/([√∛])\(([0-9a-zA-Z.]+)\)$/, (m) => m[1] + m[2]]);
      // sqrt{x+1} -> √(x+1), sqrt{2} -> √2
      rules.push([/([√∛])\{([^{}]*)\}$/, (m) => m[1] + (/^[\p{L}\p{N}.]+$/u.test(m[2]) ? m[2] : `(${m[2]})`)]);
    }

    if (on.braces) {
      // abs{x} -> |x|
      rules.push([/\\?abs\{([^{}]*)\}$/, (m) => `|${m[1]}|`]);
      // bar{x} -> x̄, vec{v} -> v⃗, hat{x} -> x̂, dot{x} -> ẋ, ddot{x} -> ẍ
      rules.push([/\\?(bar|vec|hat|dot)\{([^{}]*)\}$/, (m) => {
        const mark = ACCENTS[m[1]];
        return [...m[2]].map((c) => (/\s/.test(c) ? c : c + mark)).join('');
      }]);
    }
    if (on.braces && stacked) {
      // \frac{a}{b} -> a stacked fraction (inline a⁄b where shapes can't be drawn)
      rules.push([/(^|[^a-zA-Z])\\frac\{([^{}]*)\}\{([^{}]*)\}$/, (m) => {
        const num = mapAll(m[2], SUP);
        const den = mapAll(m[3], SUB);
        return {
          text: num && den ? m[1] + num + '⁄' + den : m[0],
          stack: { type: 'fraction', num: m[2], den: m[3], after: '', pre: m[1] },
        };
      }]);
    }

    if (on.symbols) {
      for (const [from, to] of SYMBOLS) rules.push([new RegExp(`${escapeRe(from)}$`), () => to]);
    }

    if (on.scripts) {
      const guard = keepBounds ? IN_BOUNDS : '';
      // grouped, when the closing bracket is typed: e^{2x} -> e²ˣ, x^(n+1) -> xⁿ⁺¹, a_{n-1} -> aₙ₋₁
      const group = String.raw`(?:\{([^{}]+)\}|\(([^()]+)\))$`;
      const inside = (m) => (m[1] ?? m[2]).replace(/ /g, '');
      rules.push([new RegExp(`${guard}\\^${group}`), (m) => mapAll(inside(m), SUP)]);
      rules.push([new RegExp(`${guard}_${group}`), (m) => mapAll(inside(m), SUB)]);
      // single: x^2 -> x², x_1 -> x₁ (`^{` and `^(` wait for the group above)
      rules.push([new RegExp(`${guard}\\^([^({])$`), (m) => SUP[m[1]] ?? null]);
      rules.push([new RegExp(`${guard}_([^({])$`), (m) => SUB[m[1]] ?? null]);
      // keep typing digits after an exponent/index: x²3 -> x²³, x⁻1 -> x⁻¹
      rules.push([/([⁰¹²³⁴⁵⁶⁷⁸⁹⁻])([0-9])$/, (m) => m[1] + SUP[m[2]]]);
      rules.push([/([₀₁₂₃₄₅₆₇₈₉₋])([0-9])$/, (m) => m[1] + SUB[m[2]]]);
    }

    if (on.fractions || stacked) {
      // 3//4 followed by a space or symbol -> stacked 3 over 4, or ¾ ; 48//10 -> ⁴⁸⁄₁₀
      // (x+1)//(x-1) works for stacked fractions.
      const re = new RegExp(String.raw`(^|[^\p{L}\p{N}.)])${PART}\/\/${PART}([^\p{L}\p{N}./])$`, 'u');
      rules.push([re, (m) => {
        const [, pre, a, b, after] = m;
        const key = `${a}/${b}`;
        let inline = null;
        if (on.fractions) {
          if (VULGAR[key]) inline = pre + VULGAR[key] + after;
          else {
            const num = mapAll(a, SUP);
            const den = mapAll(b, SUB);
            if (num && den) inline = pre + num + '⁄' + den + after;
          }
        }
        if (!stacked) return inline;
        return {
          text: inline ?? m[0],
          stack: { type: 'fraction', num: tidy(a), den: tidy(b), after: after.trim(), pre },
        };
      }]);
    }

    if (on.words) rules.push(wordRule(WORDS));
    if (on.greek) rules.push(wordRule(GREEK));
    if (on.sets) rules.push(wordRule(SETS));
    return rules;
  };

  // Returns { length, text, stack? }: replace the last `length` characters before the caret
  // with `text`, or draw `stack` as real shapes when the editor allows it.
  const findReplacement = (rules, before) => {
    for (const [re, fn] of rules) {
      const m = before.match(re);
      if (!m) continue;
      const rep = fn(m);
      if (rep == null) continue;
      if (typeof rep === 'string') {
        if (rep !== m[0]) return { length: m[0].length, text: rep };
        continue;
      }
      return { length: m[0].length, text: rep.text, stack: rep.stack };
    }
    return null;
  };

  // For Enter/Escape/Tab/click-away: converts a word that has no space after it yet.
  // Pretends a space was typed, then drops that space from the result.
  const findPendingWord = (rules, before) => {
    const rep = findReplacement(rules, before + ' ');
    if (!rep || !rep.text.endsWith(' ') || rep.length < 2) return null;
    return { length: rep.length - 1, text: rep.text.slice(0, -1), stack: rep.stack };
  };

  // ---------------------------------------------------------------- equation blocks
  // //{ … } lays out a whole equation with real (nestable) fractions. Inside a block,
  // a//b is a fraction of the pieces next to it; {…} groups a piece; ^{…} and _{…} raise
  // and lower; √(…) gets a bar over it.

  // Where the innermost still-open //{ starts in `before`, or -1.
  const openBlockAt = (before) => {
    const stack = [];
    for (let i = 0; i < before.length; i++) {
      // A block starts at //{ with nothing attached in front (3//{x+1} is a plain fraction).
      if (before.startsWith('//{', i) && (i === 0 || !/[\p{L}\p{N}.)}\]]/u.test(before[i - 1]))) {
        stack.push({ block: true, at: i });
        i += 2;
        continue;
      }
      if (before[i] === '{') stack.push({ block: false, at: i });
      else if (before[i] === '}') stack.pop();
    }
    const blocks = stack.filter((x) => x.block);
    return blocks.length ? blocks[0].at : -1;
  };

  // If `before` ends by closing a //{ … } block, returns { start, src, pre }.
  const closedBlock = (before) => {
    if (!before.endsWith('}')) return null;
    const open = openBlockAt(before.slice(0, -1));
    if (open < 0) return null;
    if (openBlockAt(before) >= 0) return null; // still inside an outer block
    return { start: open, src: before.slice(open + 3, -1) };
  };

  const OPERATOR = /[\s+\-−=±∓×·÷<>≤≥≠≈≡→⇒⇔↔,;:|]/;

  // Parses the inside of a block into nodes:
  //   { k: 'row', items }  { k: 'text', s }  { k: 'frac', num, den }  { k: 'paren', row }
  //   { k: 'sup', row }  { k: 'sub', row }  { k: 'sqrt', row }  { k: 'bigop', op, lower, upper }
  const parseBlock = (src) => {
    let i = 0;
    const row = (items) => ({ k: 'row', items });
    const parseRow = (close) => {
      const items = [];
      const pushText = (c) => {
        const last = items[items.length - 1];
        const op = OPERATOR.test(c);
        if (last && last.k === 'text' && !op && !last.op) last.s += c;
        else items.push({ k: 'text', s: c, op });
      };
      while (i < src.length) {
        const c = src[i];
        if (close && c === close) { i++; return row(items); }
        // d/dx, dy/dx, d²y/dx², ∂/∂x
        const prevCh = i > 0 ? src[i - 1] : '';
        const dm = !/[\p{L}\p{N}]/u.test(prevCh) && src.slice(i).match(/^([d∂][²³]?[a-zA-Z]?)\/([d∂] ?[a-zA-Z][²³]?)(?![\p{L}\p{N}])/u);
        if (dm) {
          i += dm[0].length;
          items.push({ k: 'frac', num: row([{ k: 'text', s: dm[1] }]), den: row([{ k: 'text', s: dm[2].replace(' ', '') }]) });
          continue;
        }
        // ∫ ∑ ∏ lim with bounds: ∫_0^1, ∑_{i=1}^n, lim_{x→0}
        const opm = src.slice(i).match(/^([∫∬∮∑∏]|lim)(?=[_^])/);
        if (opm) {
          i += opm[0].length;
          const node = { k: 'bigop', op: opm[1], lower: null, upper: null };
          while (src[i] === '_' || src[i] === '^') {
            const which = src[i] === '_' ? 'lower' : 'upper';
            i++;
            node[which] = asRow(parseOperand());
          }
          items.push(node);
          continue;
        }
        if (src.startsWith('//', i)) {
          i += 2;
          let num = items.pop();
          if (!num || (num.k === 'text' && num.op)) {
            if (num) items.push(num);
            // //{…} with nothing in front is just a group (the old block syntax)
            if (src[i] === '{') {
              i++;
              items.push({ k: 'group', row: parseRow('}') });
              continue;
            }
            num = { k: 'text', s: '' };
          }
          const den = parseOperand();
          items.push({ k: 'frac', num: asRow(num), den: asRow(den) });
          continue;
        }
        if (src.startsWith('\\frac', i)) {
          i += 5;
          const num = parseOperand();
          const den = parseOperand();
          items.push({ k: 'frac', num: asRow(num), den: asRow(den) });
          continue;
        }
        if (c === '{') { i++; items.push({ k: 'group', row: parseRow('}') }); continue; }
        if (c === '(') { i++; items.push({ k: 'paren', row: parseRow(')') }); continue; }
        if ((c === '^' || c === '_') && i + 1 < src.length) {
          i++;
          items.push({ k: c === '^' ? 'sup' : 'sub', row: asRow(parseOperand()) });
          continue;
        }
        if ((c === '√' || c === '∛') && (src[i + 1] === '(' || src[i + 1] === '{')) {
          i++;
          const inner = parseOperand();
          items.push({ k: 'sqrt', root: c, row: asRow(inner) });
          continue;
        }
        pushText(c);
        i++;
      }
      return row(items);
    };
    // One piece: {group}, (group) without its brackets, or a run of letters/digits/symbols.
    const parseOperand = () => {
      while (src[i] === ' ') i++;
      const c = src[i];
      if (c === '{') { i++; return { k: 'group', row: parseRow('}') }; }
      if (c === '(') { i++; return { k: 'group', row: parseRow(')') }; }
      let s = '';
      while (i < src.length && !OPERATOR.test(src[i]) && !'{}()^_/'.includes(src[i])) s += src[i++];
      return { k: 'text', s };
    };
    const asRow = (n) => (n.k === 'group' || n.k === 'paren' ? n.row : n.k === 'row' ? n : row([n]));
    return parseRow(null);
  };

  // Suggestions for the hint list: { key, out, note? }. `key` is what you type.
  const hintEntries = (settings) => {
    const s = normalizeSettings(settings);
    const on = s.categories;
    const out = [];
    const add = (key, val, note) => out.push({ key, out: val, note });
    for (const c of s.custom) if (/^[a-zA-Z0-9]+$/.test(c.from)) add(c.from, c.to);
    if (on.words) for (const [k, v] of Object.entries(WORDS)) add(k, v);
    if (on.greek) for (const [k, v] of Object.entries(GREEK)) add(k, v);
    if (on.sets) for (const [k, v] of Object.entries(SETS)) add(k, v);
    if (on.roots) { add('sqrt', '√'); add('cbrt', '∛'); add('sqrt{…}', '√(…)', 'brackets'); }
    if (on.braces) {
      add('abs{…}', '|…|', 'absolute value');
      add('\\frac{a}{b}', 'a⁄b', 'stacked');
      for (const [k, mark] of Object.entries(ACCENTS)) add(`${k}{x}`, 'x' + mark);
    }
    if (on.blocks) add('//{…}', '½', 'equation block');
    if (on.draw) add('/draw', '½', 'draw this line as an equation');
    const tools = [['cas', ['/calc', '/diff', '/integrate', '/solve', '/simplify', '/factor', '/expand']],
      ['plot', ['/plot']], ['shapes', ['/draw triangle', '/draw circle', '/draw rectangle', '/draw square', '/draw hexagon', '/draw angle']]];
    for (const [cat, keys] of tools) if (on[cat]) for (const k of keys) add(k, '↵', 'then Enter');
    if (on.latex) for (const [k, v] of Object.entries(LATEX)) add('\\' + k, v);
    if (on.stacked || on.draw) {
      add('int_a^b', '∫', 'bounds above and below');
      add('sum_{i=1}^n', '∑', 'bounds above and below');
      add('prod_{i=1}^n', '∏', 'bounds above and below');
      add('lim_{x->0}', 'lim', 'bound below');
      add('d/dx', 'd⁄dx', 'stacked');
      add('dy/dx', 'dy⁄dx', 'stacked');
    }
    return out;
  };

  // Rows for the popup's cheat sheet: { cat, type, get }.
  const cheatSheet = () => {
    const rows = [];
    const add = (cat, type, get) => rows.push({ cat, type, get });
    for (const [from, to, label] of SYMBOLS) add('symbols', label || from, to);
    add('roots', 'sqrt', '√ (4sqrt(10) → 4√10)');
    add('roots', 'cbrt', '∛');
    add('roots', 'sqrt{x+1}  sqrt{2}', '√(x+1)  √2');
    add('braces', 'abs{x-3}', '|x-3|');
    add('braces', '\\frac{a}{b}', 'a over b, stacked');
    add('braces', 'vec{v}  bar{x}  hat{x}  dot{x}', 'v⃗  x̄  x̂  ẋ');
    add('deriv', 'd/dx  dy/dx  d²y/dx²  ∂/∂x + space', 'drawn stacked at once');
    add('draw', 'y = x//{x+3} + 4 /draw', 'the line as an equation');
    add('draw', '{a+b}//{c//d} /draw', 'fractions can nest; {…} groups');
    add('draw', 'int_0^1 x dx /draw', '∫ with 0 below, 1 above');
    add('draw', 'sum_{i=1}^n i /draw', '∑ with bounds');
    add('draw', 'lim_{x->0} sin(x)//x /draw', 'lim with x→0 below');
    add('draw', 'd/dx e^{x//2} /draw', 'stacked d/dx, raised exponent');
    add('blocks', '//{x//{x+3} + 4}', 'drawn when } closes it');
    add('scripts', 'x^2  x^-12  e^x', 'x²  x⁻¹²  eˣ');
    add('scripts', 'e^{2x}  x^{n+1}  or  x^(n+1)', 'e²ˣ  xⁿ⁺¹');
    add('scripts', 'x_1  a_{ij}  a_{n-1}', 'x₁  aᵢⱼ  aₙ₋₁');
    add('fractions', '3//4 + space', '¾ (inline)');
    add('fractions', '48//10 + space', '⁴⁸⁄₁₀ (inline)');
    add('stacked', '3//4  {x+1}//{x-1}', 'stacked over a line');
    add('stacked', 'd/dx  dy/dx  d²y/dx²  ∂/∂x', 'd⁄dx stacked');
    add('stacked', 'int_0^1 + space', '∫ with 0 below, 1 above');
    add('stacked', 'sum_{i=1}^n + space', '∑ with bounds');
    add('stacked', 'lim_{x->0} + space', 'lim with x→0 below');
    add('cas', 'calc 2^10/3', '2¹⁰/3 = 1024/3 ≈ 341.33');
    add('cas', 'diff x^3 sin(x)', '3x²·sin(x) + x³·cos(x)');
    add('cas', 'integrate x^2', 'x³/3 + C');
    add('cas', 'integrate x^2 from 0 to 3', '9');
    add('cas', 'solve x^2-5x+6=0', 'x = 2 or x = 3');
    add('cas', 'simplify / factor / expand …', '(x − 2)·(x − 3)');
    add('plot', 'plot sin(x)', 'graph under the line');
    add('plot', 'plot sin(x), cos(x) from -pi to pi', 'two curves');
    add('plot', 'plot x^2+y^2=9', 'curves given by an equation');
    add('plot', 'plot x^2-6x+y^2+t=0 where t=5', 'fill in other letters');
    add('shapes', 'draw triangle 3 4 5', 'sides, angles, vertices');
    add('shapes', 'draw right triangle 3 4', 'with the right-angle mark');
    add('shapes', 'draw circle 3  /  ellipse 3 2', 'radius marked');
    add('shapes', 'draw square 4  /  rectangle 3 by 5', 'sides marked');
    add('shapes', 'draw hexagon 2  /  polygon 7 2', 'regular polygons');
    add('shapes', 'draw angle 40', 'angle with its arc');
    for (const [k, v] of Object.entries(WORDS)) add('words', k, v);
    for (const [k, v] of Object.entries(GREEK)) add('greek', k, v);
    for (const [k, v] of Object.entries(SETS)) add('sets', k, v);
    for (const [k, v] of Object.entries(LATEX)) add('latex', '\\' + k, v);
    return rows;
  };

  root.MathTyping = {
    CATEGORIES, DEFAULT_SETTINGS, normalizeSettings, buildRules, findReplacement,
    findPendingWord, hintEntries, cheatSheet, openBlockAt, closedBlock, parseBlock,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
