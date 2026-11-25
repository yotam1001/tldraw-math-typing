// tldraw Math Typing: commands typed on a line and run with Enter.
//   calc 2^10/3            -> 2¹⁰/3 = 1024/3 ≈ 341.333
//   diff x^3 sin(x)        -> d/dx (x³·sin(x)) = 3x²·sin(x) + x³·cos(x)
//   integrate x^2 from 0 to 3, solve x^2-5x+6=0, simplify/factor/expand …
//   plot sin(x), plot x^2+y^2=9, draw triangle 3 4 5 …
// Parsing, numeric evaluation, pretty printing and figure geometry live here; symbolic work
// (derivatives, integrals, solving) uses the bundled nerdamer library when it is loaded.
// No browser dependencies, so tests can load it in Node.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- normalizing typed text
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ';
  const SUP_ASCII = '0123456789+-=()abcdefghijklmnoprstuvwxyz';
  const SUB = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ';
  const SUB_ASCII = '0123456789+-=()aehijklmnoprstuvx';
  const VULGAR = {
    '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5',
    '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅐': '1/7', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
    '⅑': '1/9', '⅒': '1/10',
  };
  const fromTable = (s, from, to) => [...s].map((c) => to[from.indexOf(c)]).join('');
  const supRe = new RegExp(`[${SUP}]+`, 'g');
  const subRe = new RegExp(`[${SUB}]+`, 'g');

  const normalize = (text) => {
    let s = String(text);
    // ⁴⁸⁄₁₀ -> (48)/(10)
    s = s.replace(new RegExp(`([${SUP}]+)⁄([${SUB}]+)`, 'g'),
      (m, a, b) => `((${fromTable(a, SUP, SUP_ASCII)})/(${fromTable(b, SUB, SUB_ASCII)}))`);
    s = s.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]/g, (c) => `(${VULGAR[c]})`);
    s = s.replace(supRe, (m) => `^(${fromTable(m, SUP, SUP_ASCII)})`);
    s = s.replace(subRe, (m) => `_${fromTable(m, SUB, SUB_ASCII)}`);
    s = s.replace(/[×·⋅∙]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
      .replace(/√/g, 'sqrt').replace(/∛/g, 'cbrt').replace(/π/g, 'pi').replace(/∞/g, 'inf')
      .replace(/≤/g, '<=').replace(/≥/g, '>=');
    return s;
  };

  // ---------------------------------------------------------------- parser
  const FUNCS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'arcsin',
    'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'sqrt', 'cbrt', 'abs', 'floor',
    'ceil', 'round', 'sign']);
  const CONSTS = new Set(['pi', 'e', 'inf']);
  const GREEK_NAMES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'kappa',
    'lambda', 'mu', 'nu', 'xi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega'];
  // Longest names first, so "sinh" wins over "sin" and "pi" is not p·i.
  const NAMES = [...FUNCS, ...CONSTS, ...GREEK_NAMES].sort((a, b) => b.length - a.length);

  const tokenize = (src) => {
    const s = normalize(src);
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const num = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
      if (num && !(num[2] && /[a-z]/i.test(s[i + num[0].length] || ''))) {
        out.push({ k: 'num', v: parseFloat(num[0]) });
        i += num[0].length;
        continue;
      }
      if (/[a-zA-ZͰ-Ͽ]/.test(c)) {
        const rest = s.slice(i);
        const name = NAMES.find((n) => rest.startsWith(n));
        if (name) {
          out.push({ k: FUNCS.has(name) ? 'fn' : 'id', v: name });
          i += name.length;
        } else {
          // one letter (implicit product: xy = x·y), with an optional _index
          const m = rest.match(/^.(_[0-9a-z]+)?/i);
          out.push({ k: 'id', v: m[0] });
          i += m[0].length;
        }
        continue;
      }
      if ('+-*/^(),!|=<>'.includes(c)) {
        if ((c === '<' || c === '>') && s[i + 1] === '=') { out.push({ k: 'op', v: c + '=' }); i += 2; continue; }
        if (c === '*' && s[i + 1] === '*') { out.push({ k: 'op', v: '^' }); i += 2; continue; }
        out.push({ k: 'op', v: c });
        i++;
        continue;
      }
      if ('[{'.includes(c)) { out.push({ k: 'op', v: '(' }); i++; continue; }
      if (']}'.includes(c)) { out.push({ k: 'op', v: ')' }); i++; continue; }
      throw new Error(`I don't understand "${c}"`);
    }
    return out;
  };

  const parse = (src) => {
    const toks = tokenize(src);
    let p = 0;
    let absDepth = 0;
    const peek = () => toks[p];
    const isOp = (v) => peek() && peek().k === 'op' && peek().v === v;
    const eat = (v) => {
      if (!isOp(v)) throw new Error(`expected "${v}"`);
      p++;
    };
    // Can the next token start a factor (for implicit multiplication)?
    const startsFactor = () => {
      const t = peek();
      if (!t) return false;
      if (t.k === 'num' || t.k === 'id' || t.k === 'fn') return true;
      if (t.k === 'op' && t.v === '(') return true;
      if (t.k === 'op' && t.v === '|' && absDepth === 0) return true;
      return false;
    };

    const parseExpr = () => {
      let a = parseTerm();
      while (isOp('+') || isOp('-')) {
        const o = toks[p++].v;
        a = { t: 'op', o, a, b: parseTerm() };
      }
      return a;
    };
    const parseTerm = () => {
      let a = parseUnary();
      for (;;) {
        if (isOp('*') || isOp('/')) {
          const o = toks[p++].v;
          a = { t: 'op', o, a, b: parseUnary() };
        } else if (startsFactor()) {
          a = { t: 'op', o: '*', a, b: parsePower() };
        } else break;
      }
      return a;
    };
    const parseUnary = () => {
      if (isOp('-')) { p++; return { t: 'neg', a: parseUnary() }; }
      if (isOp('+')) { p++; return parseUnary(); }
      return parsePower();
    };
    const parsePower = () => {
      let a = parsePostfix();
      if (isOp('^')) {
        p++;
        const b = isOp('-') ? (p++, { t: 'neg', a: parsePower() }) : parsePower();
        a = { t: 'op', o: '^', a, b };
      }
      return a;
    };
    const parsePostfix = () => {
      let a = parsePrimary();
      while (isOp('!')) { p++; a = { t: 'fn', n: 'fact', args: [a] }; }
      return a;
    };
    const parsePrimary = () => {
      const t = peek();
      if (!t) throw new Error('the expression ends too early');
      if (t.k === 'num') { p++; return { t: 'num', v: t.v }; }
      if (t.k === 'id') { p++; return { t: 'var', n: t.v }; }
      if (t.k === 'fn') {
        p++;
        if (isOp('^') && toks[p + 1] && toks[p + 1].k === 'num') {
          // sin^2(x) = (sin x)^2
          p++;
          const pw = toks[p++].v;
          return { t: 'op', o: '^', a: { t: 'fn', n: t.v, args: [parseFnArg()] }, b: { t: 'num', v: pw } };
        }
        return { t: 'fn', n: t.v, args: [parseFnArg()] };
      }
      if (t.k === 'op' && t.v === '(') {
        p++;
        const e = parseExpr();
        eat(')');
        return e;
      }
      if (t.k === 'op' && t.v === '|') {
        p++;
        absDepth++;
        const e = parseExpr();
        absDepth--;
        eat('|');
        return { t: 'fn', n: 'abs', args: [e] };
      }
      throw new Error(`unexpected "${t.v}"`);
    };
    // sin(x), or sin x / sin 2x without brackets (a run of factors up to the next function or + -)
    const parseFnArg = () => {
      if (isOp('(')) {
        p++;
        const e = parseExpr();
        eat(')');
        return e;
      }
      let a = parsePower();
      while (peek() && (peek().k === 'num' || peek().k === 'id')) a = { t: 'op', o: '*', a, b: parsePower() };
      return a;
    };

    const e = parseExpr();
    if (p < toks.length) throw new Error(`unexpected "${toks[p].v}"`);
    return e;
  };

  // ---------------------------------------------------------------- evaluation
  const fact = (n) => {
    if (n < 0 || n !== Math.floor(n)) return NaN;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  };
  const FN = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x),
    cot: (x) => 1 / Math.tan(x), asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin,
    arccos: Math.acos, arctan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    ln: Math.log, log: Math.log10, exp: Math.exp, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
    floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, fact,
    // nerdamer spellings in its results
    log10: Math.log10,
  };
  const evaluate = (n, env = {}) => {
    switch (n.t) {
      case 'num': return n.v;
      case 'var':
        if (n.n in env) return env[n.n];
        if (n.n === 'pi') return Math.PI;
        if (n.n === 'e') return Math.E;
        if (n.n === 'inf') return Infinity;
        throw new Error(`what is ${n.n}?`);
      case 'neg': return -evaluate(n.a, env);
      case 'fn': {
        const f = FN[n.n];
        if (!f) throw new Error(`unknown function ${n.n}`);
        return f(...n.args.map((a) => evaluate(a, env)));
      }
      case 'op': {
        const a = evaluate(n.a, env);
        const b = evaluate(n.b, env);
        switch (n.o) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return a / b;
          case '^': return a < 0 && Math.abs(b) < 1 && Math.round(1 / b) % 2 ? -Math.pow(-a, b) : Math.pow(a, b);
          default: throw new Error(`unknown operator ${n.o}`);
        }
      }
      default: throw new Error('bad expression');
    }
  };
  const freeVars = (n, out = new Set()) => {
    if (n.t === 'var' && !CONSTS.has(n.n)) out.add(n.n);
    for (const k of ['a', 'b']) if (n[k]) freeVars(n[k], out);
    if (n.args) n.args.forEach((a) => freeVars(a, out));
    return out;
  };
  const substitute = (n, name, value) => {
    if (n.t === 'var' && n.n === name) return value;
    const c = { ...n };
    for (const k of ['a', 'b']) if (n[k]) c[k] = substitute(n[k], name, value);
    if (n.args) c.args = n.args.map((a) => substitute(a, name, value));
    return c;
  };

  // ---------------------------------------------------------------- printing
  // For nerdamer: plain ASCII with explicit operators.
  const NERD_FN = { ln: 'log', log: 'log10', arcsin: 'asin', arccos: 'acos', arctan: 'atan' };
  const toNerd = (n) => {
    switch (n.t) {
      case 'num': return String(n.v);
      case 'var': return n.n === 'inf' ? 'Infinity' : n.n;
      case 'neg': return `(-${toNerd(n.a)})`;
      case 'fn': return n.n === 'fact' ? `factorial(${toNerd(n.args[0])})` : `${NERD_FN[n.n] || n.n}(${n.args.map(toNerd).join(',')})`;
      case 'op': return `(${toNerd(n.a)})${n.o}(${toNerd(n.b)})`;
      default: return '';
    }
  };

  const GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
    kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ',
    chi: 'χ', psi: 'ψ', omega: 'ω', pi: 'π', inf: '∞',
  };
  const supOf = (s) => ([...s].every((c) => SUP_ASCII.includes(c)) ? fromTable(s, SUP_ASCII, SUP) : null);

  const fmtNum = (v) => {
    if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : 'undefined';
    if (Number.isInteger(v)) return v < 0 ? `−${-v}` : String(v);
    const s = String(Number(v.toPrecision(10)));
    return s.startsWith('-') ? `−${s.slice(1)}` : s;
  };

  // Folds -(3) into -3 and drops *1, so printing sees plain numbers.
  const fold = (n) => {
    const c = { ...n };
    if (n.a) c.a = fold(n.a);
    if (n.b) c.b = fold(n.b);
    if (n.args) c.args = n.args.map(fold);
    if (c.t === 'neg' && c.a.t === 'num') return { t: 'num', v: -c.a.v };
    if (c.t === 'neg' && c.a.t === 'neg') return c.a.a;
    return c;
  };

  // Precedence for brackets: sum 1, product 2, unary minus 3, power 4, atom 5
  const prec = (n) => {
    if (n.t === 'op') return n.o === '+' || n.o === '-' ? 1 : n.o === '^' ? 4 : 2;
    if (n.t === 'neg') return 3;
    if (n.t === 'num' && n.v < 0) return 3;
    return 5;
  };
  const isNum = (n) => n.t === 'num';

  // Flattens a product into [numeric coefficient, other factors].
  const factors = (n, out = { c: 1, f: [], neg: false }) => {
    if (n.t === 'op' && n.o === '*') { factors(n.a, out); factors(n.b, out); return out; }
    if (n.t === 'neg') { out.neg = !out.neg; return factors(n.a, out); }
    if (n.t === 'num') { out.c *= n.v; return out; }
    out.f.push(n);
    return out;
  };

  const pretty = (n) => {
    const wrap = (child, min) => (prec(child) < min ? `(${pretty(child)})` : pretty(child));
    switch (n.t) {
      case 'num': return fmtNum(n.v);
      case 'var': return GREEK[n.n] || n.n.replace(/_(\w+)/, (m, i) => fromTable(i, SUB_ASCII, SUB) || m);
      case 'neg': return `−${wrap(n.a, 3)}`;
      case 'fn': {
        const [a] = n.args;
        if (n.n === 'abs') return `|${pretty(a)}|`;
        if (n.n === 'fact') return `${wrap(a, 5)}!`;
        if (n.n === 'sqrt' || n.n === 'cbrt') {
          const sym = n.n === 'sqrt' ? '√' : '∛';
          return prec(a) === 5 ? sym + pretty(a) : `${sym}(${pretty(a)})`;
        }
        const name = { log: 'ln', log10: 'log', asin: 'arcsin', acos: 'arccos', atan: 'arctan' }[n.n] || n.n;
        return `${name}(${n.args.map(pretty).join(', ')})`;
      }
      case 'op': {
        if ((n.o === '+' || n.o === '-') && !n.sorted) {
          const s = sortSum(n);
          if (s) return pretty(s);
        }
        if (n.o === '+' || n.o === '-') {
          const right = n.b;
          const negRight = right.t === 'neg' || (right.t === 'num' && right.v < 0) ||
            (right.t === 'op' && right.o === '*' && factors(right).c * (factors(right).neg ? -1 : 1) < 0);
          if (n.o === '+' && negRight) return `${pretty(n.a)} − ${pretty(negate(right))}`;
          if (n.o === '-') return `${pretty(n.a)} − ${wrap(n.b, 2)}`;
          return `${pretty(n.a)} + ${pretty(n.b)}`;
        }
        if (n.o === '^') {
          const r = rootOf(n);
          if (r) return r;
          if (isNegPow(n)) return `1/${pretty(flipPow(n))}`;
          const base = wrap(n.a, 5);
          const exp = n.b.t === 'num' ? String(n.b.v) : n.b.t === 'var' ? n.b.n
            : n.b.t === 'neg' && n.b.a.t !== 'op' ? `-${n.b.a.t === 'num' ? n.b.a.v : n.b.a.n}`
              : n.b.t === 'op' && n.b.o === '/' && isNum(n.b.a) && isNum(n.b.b) ? null : toPlain(n.b);
          const sup = exp != null ? supOf(exp) : null;
          if (sup) return base + sup;
          return `${base}^(${pretty(n.b)})`;
        }
        if (n.o === '/') return `${wrap(n.a, 2)}/${wrap(n.b, 3)}`;
        return prettyProduct(n);
      }
      default: return '?';
    }
  };
  // Polynomials in one variable print highest power first: 1 + 3x + x³ -> x³ + 3x + 1
  const degree = (n, v) => {
    if (n.t === 'num') return 0;
    if (n.t === 'var') return n.n === v ? 1 : n.n === 'pi' || n.n === 'e' ? 0 : null;
    if (n.t === 'neg') return degree(n.a, v);
    if (n.t === 'op' && n.o === '*') {
      const a = degree(n.a, v);
      const b = degree(n.b, v);
      return a == null || b == null ? null : a + b;
    }
    if (n.t === 'op' && n.o === '/' && freeVars(n.b).size === 0) return degree(n.a, v);
    if (n.t === 'op' && n.o === '^' && n.a.t === 'var' && n.a.n === v && n.b.t === 'num' && Number.isInteger(n.b.v) && n.b.v > 0) return n.b.v;
    return null;
  };
  const sortSum = (n) => {
    const terms = [];
    const walk = (x, neg) => {
      if (x.t === 'op' && (x.o === '+' || x.o === '-') && !x.sorted) {
        walk(x.a, neg);
        walk(x.b, x.o === '-' ? !neg : neg);
      } else terms.push({ x, neg });
    };
    walk(n, false);
    const vars = freeVars(n);
    if (vars.size !== 1) return null;
    const [v] = vars;
    const degs = terms.map((t) => degree(t.x, v));
    if (degs.some((d) => d == null)) return null;
    const order = terms.map((t, i) => ({ ...t, d: degs[i], i })).sort((a, b) => b.d - a.d || a.i - b.i);
    if (order.every((t, i) => t.i === i)) return null;
    const signed = (t) => (t.neg ? negate(t.x) : t.x);
    let acc = signed(order[0]);
    for (const t of order.slice(1)) acc = { t: 'op', o: '+', a: acc, b: signed(t) };
    const mark = (x) => {
      if (x.t === 'op' && (x.o === '+' || x.o === '-')) { x.sorted = true; mark(x.a); }
      return x;
    };
    return mark(acc);
  };
  const expVal = (n) => (n.b.t === 'num' ? n.b.v : n.b.t === 'op' && n.b.o === '/' && isNum(n.b.a) && isNum(n.b.b) ? n.b.a.v / n.b.b.v : null);
  // x^(1/2) -> √x, x^(1/3) -> ∛x
  const rootOf = (n) => {
    const e = expVal(n);
    if (e === 0.5 || e === 1 / 3) return pretty({ t: 'fn', n: e === 0.5 ? 'sqrt' : 'cbrt', args: [n.a] });
    return null;
  };
  const isNegPow = (n) => n.t === 'op' && n.o === '^' && expVal(n) != null && expVal(n) < 0;
  const flipPow = (n) => {
    const e = -expVal(n);
    return e === 1 ? n.a : { t: 'op', o: '^', a: n.a, b: { t: 'num', v: e } };
  };
  const toPlain = (n) => {
    // ASCII for exponents like 2x, n+1 (so they can become ²ˣ, ⁿ⁺¹)
    if (n.t === 'num') return n.v >= 0 && Number.isInteger(n.v) ? String(n.v) : null;
    if (n.t === 'var') return n.n.length === 1 ? n.n : null;
    if (n.t === 'neg') { const a = toPlain(n.a); return a == null ? null : `-${a}`; }
    if (n.t === 'op' && n.o !== '^' && n.o !== '/') {
      const a = toPlain(n.a);
      const b = toPlain(n.b);
      if (a == null || b == null) return null;
      return n.o === '*' ? a + b : `${a}${n.o}${b}`;
    }
    return null;
  };
  const negate = (n) => {
    if (n.t === 'neg') return n.a;
    if (n.t === 'num') return { t: 'num', v: -n.v };
    if (n.t === 'op' && n.o === '*') {
      const f = factors(n);
      return rebuild(-f.c * (f.neg ? -1 : 1), f.f);
    }
    return { t: 'neg', a: n };
  };
  const rebuild = (c, fs) => {
    let node = fs.length ? fs.reduce((a, b) => ({ t: 'op', o: '*', a, b })) : { t: 'num', v: Math.abs(c) };
    if (fs.length && Math.abs(c) !== 1) node = { t: 'op', o: '*', a: { t: 'num', v: Math.abs(c) }, b: node };
    return c < 0 ? { t: 'neg', a: node } : node;
  };
  // 3*x^2*sin(x) -> 3x²·sin(x) ; (1/2)*x -> x/2
  const prettyProduct = (n) => {
    const f = factors(n);
    let c = f.c * (f.neg ? -1 : 1);
    // numeric fraction factors such as (1/2) inside the product
    let den = 1;
    const rest = [];
    for (const x of f.f) {
      if (x.t === 'op' && x.o === '/' && isNum(x.a) && isNum(x.b)) { c *= x.a.v; den *= x.b.v; } else rest.push(x);
    }
    // Factors with negative powers go below the line: x·(1+x²)^(−1/2) -> x/√(1 + x²)
    const top = rest.filter((x) => !isNegPow(x));
    const bottom = rest.filter(isNegPow).map(flipPow);
    // variables (and their powers) first, then e/π powers, then functions and brackets
    const rank = (x) => {
      const v = x.t === 'var' ? x : x.t === 'op' && x.o === '^' && x.a.t === 'var' ? x.a : null;
      if (v) return v.n === 'e' || v.n === 'pi' ? 1 : 0;
      return 2;
    };
    const join = (list) => {
      list.sort((a, b) => rank(a) - rank(b));
      let body = '';
      list.forEach((x, i) => {
        const s = prec(x) < 2 || (x.t === 'op' && x.o === '/') ? `(${pretty(x)})` : pretty(x);
        const implicit = i === 0 || (rank(x) < 2 && rank(list[i - 1]) < 2);
        body += (implicit ? '' : '·') + s;
      });
      return body;
    };
    const sign = c < 0 ? '−' : '';
    const a = Math.abs(c);
    if (!top.length && !bottom.length) return sign + (den !== 1 ? `${fmtNum(a)}/${fmtNum(den)}` : fmtNum(a));
    const coef = a === 1 ? '' : fmtNum(a);
    let numPart = top.length ? join(top) : '';
    if (coef) numPart = numPart && rank([...top].sort((p, q) => rank(p) - rank(q))[0]) === 2 ? `${coef}·${numPart}` : coef + numPart;
    if (!numPart) numPart = '1';
    const denParts = [];
    if (den !== 1) denParts.push(fmtNum(den));
    if (bottom.length) denParts.push(join(bottom));
    if (!denParts.length) return sign + numPart;
    const needsWrap = (top.length > 1 || (top.length === 1 && prec(top[0]) < 2)) && coef;
    let denStr = denParts.join('');
    if (bottom.length > 1 || (bottom.length === 1 && prec(bottom[0]) < 4 && !/^[√∛]/.test(pretty(bottom[0])))) denStr = `(${denStr})`;
    return sign + (needsWrap ? `(${numPart})` : numPart) + '/' + denStr;
  };

  // ---------------------------------------------------------------- symbolic helpers (nerdamer)
  const nerd = () => root.nerdamer;
  const need = () => {
    if (!nerd()) throw new Error('the algebra library is not loaded');
    return nerd();
  };
  const fromNerd = (s) => fold(parse(String(s).replace(/\blog10\(/g, 'LOGTEN(').replace(/\blog\(/g, 'ln(').replace(/LOGTEN\(/g, 'log(')));
  // The shorter of a result and its simplified form. Only for expressions without functions:
  // nerdamer's simplify/factor can run for minutes on logs and trig.
  const tidy = (s) => {
    let best = pretty(fromNerd(s));
    if (/[a-z]{2,}\(/i.test(String(s))) return best;
    for (const op of ['simplify', 'factor']) {
      try {
        const alt = pretty(fromNerd(need()(`${op}(${s})`).toString()));
        if (alt.length < best.length) best = alt;
      } catch (_) { /* keep */ }
    }
    return best;
  };
  const unevaluated = (s, op) => new RegExp(`\\b${op}\\(`).test(String(s));
  const mainVar = (ast, prefer = 'x') => {
    const vs = [...freeVars(ast)];
    return vs.includes(prefer) ? prefer : vs[0] || prefer;
  };

  // Numeric integral (adaptive Simpson) for when there is no closed form.
  const simpson = (f, a, b) => {
    const n = 2000;
    const h = (b - a) / n;
    let s = f(a) + f(b);
    for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
    return (s * h) / 3;
  };

  const limitsText = (a, b) => {
    const pa = pretty(fold(parse(a)));
    const pb = pretty(fold(parse(b)));
    const plainA = pa.replace('−', '-');
    const plainB = pb.replace('−', '-');
    const sub = [...plainA].every((c) => SUB_ASCII.includes(c)) ? fromTable(plainA, SUB_ASCII, SUB) : null;
    const sup = supOf(plainB);
    return sub != null && sup != null ? `∫${sub}${sup}` : `∫ from ${pa} to ${pb}`;
  };

  // ---------------------------------------------------------------- commands
  // Commands start with a slash so ordinary notes ("solve for x…") never run by accident.
  const COMMANDS = /^\s*[/\\](calc|calculate|eval|diff|derive|derivative|integrate|integral|solve|simplify|factor|factorise|factorize|expand|plot|graph|draw|shape)\b\s*(.*)$/i;

  // Splits "a, b, c" at top-level commas.
  const splitTop = (s) => {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
      if ('([{'.includes(ch)) depth++;
      if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
  };

  // "… where t=5, k=2" -> { body, params }
  const takeParams = (s) => {
    const m = s.match(/^(.*?)\s+(?:where|with)\s+(.+)$/i);
    if (!m) return { body: s, params: {} };
    const params = {};
    for (const part of splitTop(m[2])) {
      const pm = part.match(/^\s*([a-zA-Zα-ω])\s*=\s*(.+)$/);
      if (!pm) throw new Error(`can't read "${part}" (use t=5)`);
      params[pm[1]] = evaluate(parse(pm[2]));
    }
    return { body: m[1], params };
  };
  // "… from a to b" -> { body, from, to }
  const takeRange = (s) => {
    const m = s.match(/^(.*?)\s+(?:from|for\s+x\s+from)\s+(.+?)\s+to\s+(.+)$/i);
    return m ? { body: m[1], from: m[2], to: m[3] } : { body: s };
  };

  const calc = (expr) => {
    const ast = parse(expr);
    const vars = freeVars(ast);
    if (vars.size) return simplifyCmd(expr, 'simplify');
    const v = evaluate(ast);
    let exact = null;
    if (nerd()) {
      try {
        const s = String(nerd()(toNerd(ast)));
        if (s.length < 30 && /^[-\d/*()^a-z+ ]+$/i.test(s) && /\/|sqrt|pi/.test(s) && !/factorial|\d\.\d/.test(s)) {
          exact = pretty(fromNerd(s));
          if (exact === pretty(ast)) exact = null;
        }
      } catch (_) { /* numeric only */ }
    }
    const num = fmtNum(v);
    return exact && exact !== num ? `${pretty(ast)} = ${exact} ≈ ${num}` : `${pretty(ast)} = ${num}`;
  };

  const diffCmd = (rest) => {
    const m = rest.match(/^(.*?)(?:\s+(?:wrt|by|for|d)\s+([a-zA-Zα-ω]))?\s*$/i);
    const ast = parse(m[1]);
    const v = m[2] || mainVar(ast);
    const out = need().diff(toNerd(ast), v).toString();
    return `d/d${v} (${pretty(ast)}) = ${tidy(out)}`;
  };

  const integrateCmd = (rest) => {
    const r = takeRange(rest);
    let body = r.body.trim();
    let v = null;
    const dm = body.match(/^(.*?)\s*d([a-zA-Z])\s*$/);
    if (dm && dm[1]) { body = dm[1]; v = dm[2]; }
    const ast = parse(body);
    v = v || mainVar(ast);
    let anti = null;
    try {
      const s = need()(`integrate(${toNerd(ast)}, ${v})`).toString();
      if (!unevaluated(s, 'integrate')) anti = s;
    } catch (_) { /* no closed form */ }
    if (r.from === undefined) {
      if (!anti) throw new Error("couldn't find a formula for that integral");
      return `∫ ${pretty(ast)} d${v} = ${tidy(anti)} + C`;
    }
    const a = evaluate(parse(r.from));
    const b = evaluate(parse(r.to));
    let value = null;
    if (anti) {
      try {
        const F = fromNerd(anti);
        value = evaluate(F, { [v]: b }) - evaluate(F, { [v]: a });
        if (!Number.isFinite(value)) value = null;
      } catch (_) { value = null; }
    }
    if (value == null) value = simpson((x) => evaluate(ast, { [v]: x }), a, b);
    return `${limitsText(r.from, r.to)} ${pretty(ast)} d${v} = ${fmtNum(value)}`;
  };

  const solveCmd = (rest) => {
    const m = rest.match(/^(.*?)(?:\s+for\s+([a-zA-Zα-ω]))?\s*$/i);
    let eq = m[1];
    if (!eq.includes('=')) eq += '=0';
    const [lhs, rhs] = eq.split('=');
    const la = parse(lhs);
    const ra = parse(rhs);
    const diffAst = { t: 'op', o: '-', a: la, b: ra };
    const v = m[2] || mainVar(diffAst);
    let sols = [];
    const hasFn = (n) => n.t === 'fn' || (n.t === 'op' && n.o === '^' && freeVars(n.b).size > 0) ||
      [n.a, n.b, ...(n.args || [])].some((k) => k && hasFn(k));
    if (!hasFn(diffAst)) {
      try {
        const s = need().solve(`${toNerd(la)}=${toNerd(ra)}`, v).toString();
        sols = splitTop(s.replace(/^\[|\]$/g, '')).filter((x) => x && !/\bi\b|\di\b|i\*/.test(x)).map((x) => {
          const node = fromNerd(x);
          const p = pretty(node);
          let num = null;
          try { num = evaluate(node); } catch (_) { /* symbolic */ }
          return p.length > 14 && num != null ? fmtNum(Number(num.toPrecision(10))) : p;
        });
      } catch (_) { sols = []; }
    }
    if (!sols.length) {
      // numeric roots on [-100, 100]
      const f = (x) => evaluate(diffAst, { [v]: x });
      const roots = [];
      let px = -100;
      let py = f(px);
      for (let i = 1; i <= 4000; i++) {
        const x = -100 + i * 0.05;
        const y = f(x);
        if (Number.isFinite(py) && Number.isFinite(y) && (py === 0 || py * y < 0)) {
          let lo = px;
          let hi = x;
          for (let k = 0; k < 60; k++) {
            const mid = (lo + hi) / 2;
            if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
          }
          const root = (lo + hi) / 2;
          if (Math.abs(f(root)) < 1e-6 && !roots.some((q) => Math.abs(q - root) < 1e-6)) roots.push(root);
        }
        px = x;
        py = y;
      }
      sols = roots.map(fmtNum);
    }
    const left = `${pretty(la)} = ${pretty(ra)}`;
    if (!sols.length) return `${left}  ⇒  no real solution`;
    return `${left}  ⇒  ${sols.map((s) => `${v} = ${s}`).join(' or ')}`;
  };

  const simplifyCmd = (expr, op) => {
    const ast = parse(expr);
    const fn = { simplify: 'simplify', factor: 'factor', factorise: 'factor', factorize: 'factor', expand: 'expand' }[op];
    const out = need()(`${fn}(${toNerd(ast)})`).toString();
    return `${pretty(ast)} = ${pretty(fromNerd(out))}`;
  };

  // ---------------------------------------------------------------- figures
  // A figure is drawn by page.js: items in math units (y up), fitted into a box of `size` px.
  //   { kind: 'poly', pts: [[x, y], …], closed?, color?, smooth?, thin? }
  //   { kind: 'ellipse', cx, cy, rx, ry, color? }
  //   { kind: 'text', x, y, text, scale?, color?, align? ('center'|'left'|'right'), valign? ('middle'|'top'|'bottom') }
  const COLORS = ['blue', 'red', 'green', 'violet', 'orange'];

  const niceStep = (span, target = 5) => {
    const raw = span / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  };

  const marchingSquares = (F, x0, x1, y0, y1, N) => {
    const dx = (x1 - x0) / N;
    const dy = (y1 - y0) / N;
    const val = [];
    for (let j = 0; j <= N; j++) {
      val.push([]);
      for (let i = 0; i <= N; i++) {
        let v;
        try { v = F(x0 + i * dx, y0 + j * dy); } catch (_) { v = NaN; }
        val[j].push(v);
      }
    }
    const segs = [];
    const lerp = (a, b, va, vb) => a + (b - a) * (va / (va - vb));
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const xa = x0 + i * dx;
        const xb = xa + dx;
        const ya = y0 + j * dy;
        const yb = ya + dy;
        const v00 = val[j][i];
        const v10 = val[j][i + 1];
        const v01 = val[j + 1][i];
        const v11 = val[j + 1][i + 1];
        if (![v00, v10, v01, v11].every(Number.isFinite)) continue;
        const pts = [];
        if ((v00 < 0) !== (v10 < 0)) pts.push([lerp(xa, xb, v00, v10), ya]);
        if ((v10 < 0) !== (v11 < 0)) pts.push([xb, lerp(ya, yb, v10, v11)]);
        if ((v01 < 0) !== (v11 < 0)) pts.push([lerp(xa, xb, v01, v11), yb]);
        if ((v00 < 0) !== (v01 < 0)) pts.push([xa, lerp(ya, yb, v00, v01)]);
        // Skip sign flips across a pole (like 1/x), where the values blow up instead of crossing 0.
        const big = Math.max(...[v00, v10, v01, v11].map(Math.abs));
        const scale = Math.hypot(dx, dy) * 50;
        if (big > scale * 1e3) continue;
        if (pts.length === 2) segs.push(pts);
        if (pts.length === 4) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
      }
    }
    // Join segments into polylines.
    const key = (p) => `${p[0].toFixed(9)},${p[1].toFixed(9)}`;
    const ends = new Map();
    segs.forEach((s, idx) => {
      for (const p of s) {
        const k = key(p);
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push(idx);
      }
    });
    const used = new Array(segs.length).fill(false);
    const lines = [];
    for (let s = 0; s < segs.length; s++) {
      if (used[s]) continue;
      used[s] = true;
      const line = [segs[s][0], segs[s][1]];
      for (const dir of [1, -1]) {
        for (;;) {
          const end = dir === 1 ? line[line.length - 1] : line[0];
          const next = (ends.get(key(end)) || []).find((i) => !used[i]);
          if (next === undefined) break;
          used[next] = true;
          const [a, b] = segs[next];
          const other = key(a) === key(end) ? b : a;
          if (dir === 1) line.push(other); else line.unshift(other);
        }
      }
      lines.push(line);
    }
    return lines.filter((l) => l.length > 2 || segs.length < 10);
  };

  const thin = (pts, max) => {
    if (pts.length <= max) return pts;
    const step = (pts.length - 1) / (max - 1);
    return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]);
  };

  // Roots of h on [a, b]: sign changes on a fine grid, refined by bisection.
  const rootsOf = (h, a, b, n = 800) => {
    const out = [];
    let px = a;
    let py = h(a);
    for (let i = 1; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      const y = h(x);
      if (Number.isFinite(py) && Number.isFinite(y)) {
        if (py === 0) out.push(px);
        else if (py * y < 0) {
          let lo = px;
          let hi = x;
          for (let k = 0; k < 60; k++) {
            const mid = (lo + hi) / 2;
            if (h(lo) * h(mid) <= 0) hi = mid; else lo = mid;
          }
          const r = (lo + hi) / 2;
          // a real crossing, not a jump across a pole (like tan x)
          if (Math.abs(h(r)) < 1e-6 * (1 + Math.abs(h(lo)) + Math.abs(h(hi))) || Math.abs(h(r)) < 1e-9) out.push(r);
        }
      }
      px = x;
      py = y;
    }
    return out;
  };

  // Points where the plotted curves cross, inside the view (at most 12).
  const intersections = (explicit, implicit, x0, x1, y0, y1) => {
    const pts = [];
    const safe = (f) => (x) => { try { return f(x); } catch (_) { return NaN; } };
    const fy = explicit.map((c) => safe((x) => evaluate(c.f, { x })));
    for (let i = 0; i < explicit.length; i++) {
      for (let j = i + 1; j < explicit.length; j++) {
        for (const x of rootsOf((x) => fy[i](x) - fy[j](x), x0, x1)) pts.push([x, fy[i](x)]);
      }
      // a function crossing a curve given by an equation: F(x, f(x)) = 0
      for (const c of implicit) {
        const F = safe((x) => evaluate(c.F, { x, y: fy[i](x) }));
        for (const x of rootsOf(F, x0, x1)) pts.push([x, fy[i](x)]);
      }
    }
    const inView = pts.filter(([x, y]) => Number.isFinite(y) && y >= y0 && y <= y1 && x >= x0 && x <= x1);
    const unique = [];
    const tol = (x1 - x0) * 1e-6;
    for (const p of inView) if (!unique.some((q) => Math.abs(q[0] - p[0]) < tol && Math.abs(q[1] - p[1]) < tol * 10)) unique.push(p);
    return unique.slice(0, 12);
  };
  // If the traced points form a whole circle, its centre and radius (else null).
  const circleCentre = (pts) => {
    if (pts.length < 40) return null;
    let ax = Infinity; let bx = -Infinity; let ay = Infinity; let by = -Infinity;
    for (const [x, y] of pts) { ax = Math.min(ax, x); bx = Math.max(bx, x); ay = Math.min(ay, y); by = Math.max(by, y); }
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    const rs = pts.map(([x, y]) => Math.hypot(x - cx, y - cy));
    const r = rs.reduce((a, b) => a + b, 0) / rs.length;
    if (!(r > 0) || Math.abs((bx - ax) - (by - ay)) > r * 0.05) return null;
    if (rs.some((v) => Math.abs(v - r) > r * 0.03)) return null;
    // all the way round: points in every quarter
    const quarters = new Set(pts.map(([x, y]) => (x >= cx ? 1 : 0) + (y >= cy ? 2 : 0)));
    return quarters.size === 4 ? { x: cx, y: cy, r } : null;
  };

  // 2 decimals at most, no trailing zeros, −0 as 0
  const fmtPoint = (v) => fmtNum(Math.abs(v) < 5e-3 ? 0 : Number(v.toFixed(2)));

  const plotCmd = (rest) => {
    const { body: b1, params } = takeParams(rest);
    const r = takeRange(b1);
    const parts = splitTop(r.body);
    if (!parts.length) throw new Error('what should I plot? e.g. plot sin(x)');
    const explicit = [];
    const implicit = [];
    for (const part of parts) {
      const eq = part.split('=');
      if (eq.length > 2) throw new Error(`"${part}" has more than one =`);
      let lhs = eq.length === 2 ? parse(eq[0]) : { t: 'var', n: 'y' };
      let rhs = eq.length === 2 ? parse(eq[1]) : parse(eq[0]);
      for (const [k, v] of Object.entries(params)) {
        lhs = substitute(lhs, k, { t: 'num', v });
        rhs = substitute(rhs, k, { t: 'num', v });
      }
      const label = eq.length === 2 ? `${pretty(lhs)} = ${pretty(rhs)}` : `y = ${pretty(rhs)}`;
      const vars = new Set([...freeVars(lhs), ...freeVars(rhs)]);
      const other = [...vars].filter((v) => v !== 'x' && v !== 'y');
      if (other.length) throw new Error(`what is ${other.join(', ')}? add e.g. "where ${other[0]}=1"`);
      if (lhs.t === 'var' && lhs.n === 'y' && !freeVars(rhs).has('y')) explicit.push({ f: rhs, label });
      else if (rhs.t === 'var' && rhs.n === 'y' && !freeVars(lhs).has('y')) explicit.push({ f: lhs, label });
      else implicit.push({ F: { t: 'op', o: '-', a: lhs, b: rhs }, label });
    }

    let x0 = r.from !== undefined ? evaluate(parse(r.from)) : null;
    let x1 = r.to !== undefined ? evaluate(parse(r.to)) : null;
    let y0;
    let y1;
    const curves = [];

    // Implicit curves: find where they live on a coarse grid, then trace them finely.
    let equal = false;
    if (implicit.length) {
      equal = true; // circles stay round, also next to y = … lines
      let bx0 = Infinity; let bx1 = -Infinity; let by0 = Infinity; let by1 = -Infinity;
      const R = x0 != null ? Math.max(Math.abs(x0), Math.abs(x1)) : 25;
      for (const c of implicit) {
        const F = (x, y) => evaluate(c.F, { x, y });
        for (const l of marchingSquares(F, -R, R, -R, R, 100)) {
          for (const [x, y] of l) {
            bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
          }
        }
      }
      if (!Number.isFinite(bx0)) throw new Error(`nothing to draw: ${implicit[0].label} has no points near the origin`);
      const span = Math.max(bx1 - bx0, by1 - by0, 1) * 1.3;
      const cx = (bx0 + bx1) / 2;
      const cy = (by0 + by1) / 2;
      if (x0 == null) { x0 = Math.min(cx - span / 2, -1); x1 = Math.max(cx + span / 2, 1); }
      y0 = Math.min(cy - span / 2, -1);
      y1 = Math.max(cy + span / 2, 1);
      if (equal) {
        const s = Math.max(x1 - x0, y1 - y0);
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        x0 = mx - s / 2; x1 = mx + s / 2; y0 = my - s / 2; y1 = my + s / 2;
      }
    }
    if (x0 == null) { x0 = -10; x1 = 10; }

    // Explicit curves: sample, choose a y range that ignores spikes, split at jumps.
    const samples = explicit.map((c) => {
      const pts = [];
      for (let i = 0; i <= 400; i++) {
        const x = x0 + ((x1 - x0) * i) / 400;
        let y;
        try { y = evaluate(c.f, { x }); } catch (e) { throw new Error(`${c.label}: ${e.message}`); }
        pts.push([x, y]);
      }
      return pts;
    });
    if (explicit.length) {
      const ys = samples.flat().map((p) => p[1]).filter(Number.isFinite).sort((a, b) => a - b);
      if (!ys.length) throw new Error('the function has no values in that range');
      const lo = ys[Math.floor(ys.length * 0.03)];
      const hi = ys[Math.ceil(ys.length * 0.97) - 1];
      let ey0 = lo;
      let ey1 = hi;
      if (ey1 - ey0 < 1e-9) { ey0 -= 1; ey1 += 1; }
      const pad = (ey1 - ey0) * 0.15;
      ey0 -= pad; ey1 += pad;
      if (ey0 > 0 && ey0 < (ey1 - ey0) * 0.5) ey0 = -(ey1 - ey0) * 0.08;
      if (ey1 < 0 && -ey1 < (ey1 - ey0) * 0.5) ey1 = (ey1 - ey0) * 0.08;
      y0 = y0 == null ? ey0 : Math.min(y0, ey0);
      y1 = y1 == null ? ey1 : Math.max(y1, ey1);
    }

    explicit.forEach((c, k) => {
      const span = y1 - y0;
      let cur = [];
      const flush = () => { if (cur.length > 1) curves.push({ pts: cur, color: COLORS[k % COLORS.length] }); cur = []; };
      samples[k].forEach(([x, y], i) => {
        const prev = samples[k][i - 1];
        const ok = Number.isFinite(y) && y > y0 - span * 2 && y < y1 + span * 2;
        if (!ok || (prev && Number.isFinite(prev[1]) && Math.abs(y - prev[1]) > span * 0.8)) flush();
        if (ok) cur.push([x, Math.max(y0 - span * 0.05, Math.min(y1 + span * 0.05, y))]);
      });
      flush();
      // keep only the visible parts
    });
    const centres = [];
    implicit.forEach((c, k) => {
      const F = (x, y) => evaluate(c.F, { x, y });
      const lines = marchingSquares(F, x0, x1, y0, y1, 160);
      for (const l of lines) {
        curves.push({ pts: l, color: COLORS[(explicit.length + k) % COLORS.length] });
      }
      const centre = circleCentre(lines.flat());
      if (centre) centres.push({ ...centre, color: COLORS[(explicit.length + k) % COLORS.length] });
    });

    // Axes, ticks and labels
    const items = [];
    const ax = y0 <= 0 && y1 >= 0 ? 0 : y0;
    const ay = x0 <= 0 && x1 >= 0 ? 0 : x0;
    items.push({ kind: 'poly', pts: [[x0, ax], [x1, ax]], color: 'grey', thin: true, arrow: true });
    items.push({ kind: 'poly', pts: [[ay, y0], [ay, y1]], color: 'grey', thin: true, arrow: true });
    items.push({ kind: 'text', x: x1, y: ax, text: 'x', scale: 0.6, color: 'grey', align: 'left', valign: 'middle', dx: 4 });
    items.push({ kind: 'text', x: ay, y: y1, text: 'y', scale: 0.6, color: 'grey', align: 'center', valign: 'bottom', dy: -2 });
    const sx = niceStep(x1 - x0);
    const sy = niceStep(y1 - y0);
    const tickLabel = (v) => fmtNum(Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(6)));
    for (let t = Math.ceil(x0 / sx) * sx; t <= x1 - sx * 0.3; t += sx) {
      if (Math.abs(t - ay) < sx * 0.3) continue;
      items.push({ kind: 'tick', x: t, y: ax, dir: 'x' });
      items.push({ kind: 'text', x: t, y: ax, text: tickLabel(t), scale: 0.5, color: 'grey', align: 'center', valign: 'top', dy: 4 });
    }
    for (let t = Math.ceil(y0 / sy) * sy; t <= y1 - sy * 0.3; t += sy) {
      if (Math.abs(t - ax) < sy * 0.3) continue;
      items.push({ kind: 'tick', x: ay, y: t, dir: 'y' });
      items.push({ kind: 'text', x: ay, y: t, text: tickLabel(t), scale: 0.5, color: 'grey', align: 'right', valign: 'middle', dx: -5 });
    }
    for (const c of curves) items.push({ kind: 'poly', pts: thin(c.pts, 240), color: c.color, smooth: true });
    // The centre of each circle, with its coordinates and radius.
    for (const c of centres) {
      items.push({ kind: 'dot', x: c.x, y: c.y, color: c.color });
      items.push({ kind: 'text', x: c.x, y: c.y, text: `(${fmtPoint(c.x)}, ${fmtPoint(c.y)})  r = ${fmtPoint(c.r)}`,
        scale: 0.5, color: c.color, align: 'left', valign: 'top', dx: 5, dy: 3 });
    }

    // Where curves cross: a dot and its coordinates.
    for (const p of intersections(explicit, implicit, x0, x1, y0, y1)) {
      items.push({ kind: 'dot', x: p[0], y: p[1] });
      items.push({ kind: 'text', x: p[0], y: p[1], text: `(${fmtPoint(p[0])}, ${fmtPoint(p[1])})`, scale: 0.5,
        align: 'left', valign: 'bottom', dx: 5, dy: -3 });
    }

    // A small legend when there is more than one curve
    const labels = [...explicit, ...implicit].map((c) => c.label);
    if (labels.length > 1) {
      labels.forEach((l, k) => items.push({
        kind: 'text', x: x0, y: y0, text: l, scale: 0.55, color: COLORS[k % COLORS.length],
        align: 'left', valign: 'top', dy: 26 + k * 18,
      }));
    }
    return {
      caption: labels.join(',  '),
      figure: { bounds: { x0, x1, y0, y1 }, equal, size: [360, 270], items },
    };
  };

  const fmt = (v) => fmtNum(Number(Number(v).toPrecision(4)));

  // ---------------------------------------------------------------- shapes
  const shapeCmd = (rest) => {
    const s = rest.trim().toLowerCase().replace(/,/g, ' ');
    const nums = (s.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    const items = [];
    const poly = (pts) => items.push({ kind: 'poly', pts, closed: true });
    const label = (x, y, text, opts = {}) => items.push({ kind: 'text', x, y, text, scale: 0.55, ...opts });
    // Label each side of a polygon at its midpoint, pushed outwards.
    const sideLabels = (pts, texts) => {
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        if (!texts[i]) return;
        const mx = (p[0] + q[0]) / 2;
        const my = (p[1] + q[1]) / 2;
        const len = Math.hypot(mx - cx, my - cy) || 1;
        const span = Math.max(...pts.map((t) => Math.hypot(t[0] - cx, t[1] - cy)));
        label(mx + ((mx - cx) / len) * span * 0.14, my + ((my - cy) / len) * span * 0.14, texts[i]);
      });
    };
    const vertexLabels = (pts, names) => {
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const span = Math.max(...pts.map((t) => Math.hypot(t[0] - cx, t[1] - cy)));
      pts.forEach((p, i) => {
        const len = Math.hypot(p[0] - cx, p[1] - cy) || 1;
        label(p[0] + ((p[0] - cx) / len) * span * 0.12, p[1] + ((p[1] - cy) / len) * span * 0.12, names[i], { scale: 0.6 });
      });
    };
    const angleArc = (v, a, b, text) => {
      // small arc at vertex v between the directions to a and b
      const t0 = Math.atan2(a[1] - v[1], a[0] - v[0]);
      let t1 = Math.atan2(b[1] - v[1], b[0] - v[0]);
      let d = t1 - t0;
      while (d <= -Math.PI) d += 2 * Math.PI;
      while (d > Math.PI) d -= 2 * Math.PI;
      t1 = t0 + d;
      const r = Math.min(Math.hypot(a[0] - v[0], a[1] - v[1]), Math.hypot(b[0] - v[0], b[1] - v[1])) * 0.22;
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const t = t0 + (d * i) / 16;
        pts.push([v[0] + r * Math.cos(t), v[1] + r * Math.sin(t)]);
      }
      items.push({ kind: 'poly', pts, color: 'grey', thin: true, smooth: true });
      if (text) {
        const tm = t0 + d / 2;
        label(v[0] + r * 1.9 * Math.cos(tm), v[1] + r * 1.9 * Math.sin(tm), text, { scale: 0.45, color: 'grey' });
      }
    };
    const deg = (rad) => `${fmt((rad * 180) / Math.PI)}°`;
    const angleAt = (v, a, b) => {
      const u = [a[0] - v[0], a[1] - v[1]];
      const w = [b[0] - v[0], b[1] - v[1]];
      return Math.acos((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w)));
    };
    const triangle = (a, b, c, opts = {}) => {
      if (a + b <= c || a + c <= b || b + c <= a) throw new Error(`${fmt(a)}, ${fmt(b)}, ${fmt(c)} can't make a triangle`);
      // base c along the x axis, A at origin, B at (c, 0)
      const A = [0, 0];
      const B = [c, 0];
      const x = (b * b + c * c - a * a) / (2 * c);
      const C = [x, Math.sqrt(Math.max(0, b * b - x * x))];
      const pts = [A, B, C];
      poly(pts);
      sideLabels(pts, [fmt(c), fmt(a), fmt(b)]);
      vertexLabels(pts, ['A', 'B', 'C']);
      for (const [v, p, q] of [[A, B, C], [B, C, A], [C, A, B]]) {
        const ang = angleAt(v, p, q);
        if (Math.abs(ang - Math.PI / 2) < 1e-6) {
          const r = Math.min(a, b, c) * 0.12;
          const u = [(p[0] - v[0]) / Math.hypot(p[0] - v[0], p[1] - v[1]), (p[1] - v[1]) / Math.hypot(p[0] - v[0], p[1] - v[1])];
          const w = [(q[0] - v[0]) / Math.hypot(q[0] - v[0], q[1] - v[1]), (q[1] - v[1]) / Math.hypot(q[0] - v[0], q[1] - v[1])];
          items.push({ kind: 'poly', pts: [[v[0] + u[0] * r, v[1] + u[1] * r], [v[0] + (u[0] + w[0]) * r, v[1] + (u[1] + w[1]) * r], [v[0] + w[0] * r, v[1] + w[1] * r]], color: 'grey', thin: true });
        } else {
          angleArc(v, p, q, deg(ang));
        }
      }
      return `triangle ${fmt(a)}, ${fmt(b)}, ${fmt(c)}`;
    };
    const regular = (n, side) => {
      const R = side / (2 * Math.sin(Math.PI / n));
      const pts = Array.from({ length: n }, (_, i) => {
        const t = Math.PI / 2 + Math.PI / n + (2 * Math.PI * i) / n;
        return [R * Math.cos(t), R * Math.sin(t)];
      });
      poly(pts);
      sideLabels(pts, pts.map((_, i) => (i === Math.floor(n / 2) ? fmt(side) : '')));
    };
    const NAMED = { pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, nonagon: 9, decagon: 10 };

    let caption;
    if (/^circle/.test(s)) {
      const r = nums[0] || 2;
      items.push({ kind: 'ellipse', cx: 0, cy: 0, rx: r, ry: r });
      items.push({ kind: 'poly', pts: [[0, 0], [r, 0]], color: 'grey', thin: true });
      items.push({ kind: 'dot', x: 0, y: 0 });
      label(r / 2, 0, `r = ${fmt(r)}`, { valign: 'bottom', dy: -3, scale: 0.5 });
      caption = `circle, r = ${fmt(r)}`;
    } else if (/^(ellipse|oval)/.test(s)) {
      const a = nums[0] || 3;
      const b = nums[1] || 2;
      items.push({ kind: 'ellipse', cx: 0, cy: 0, rx: a, ry: b });
      items.push({ kind: 'poly', pts: [[-a, 0], [a, 0]], color: 'grey', thin: true });
      items.push({ kind: 'poly', pts: [[0, -b], [0, b]], color: 'grey', thin: true });
      label(a / 2, 0, fmt(a), { valign: 'bottom', dy: -3, scale: 0.5 });
      label(0, b / 2, fmt(b), { align: 'left', dx: 4, scale: 0.5 });
      caption = `ellipse ${fmt(a)} × ${fmt(b)}`;
    } else if (/^square/.test(s)) {
      const a = nums[0] || 3;
      const pts = [[0, 0], [a, 0], [a, a], [0, a]];
      poly(pts);
      sideLabels(pts, [fmt(a), fmt(a), '', '']);
      caption = `square, side ${fmt(a)}`;
    } else if (/^(rectangle|rect)/.test(s)) {
      const m = s.match(/(-?\d+(?:\.\d+)?)\s*(?:x|by|×|\*)\s*(-?\d+(?:\.\d+)?)/);
      const a = m ? Number(m[1]) : nums[0] || 4;
      const b = m ? Number(m[2]) : nums[1] || 2;
      const pts = [[0, 0], [a, 0], [a, b], [0, b]];
      poly(pts);
      sideLabels(pts, [fmt(a), fmt(b), '', '']);
      caption = `rectangle ${fmt(a)} × ${fmt(b)}`;
    } else if (/^right\s*triangle/.test(s)) {
      const a = nums[0] || 3;
      const b = nums[1] || 4;
      triangle(b, a, Math.hypot(a, b), { right: true });
      caption = `right triangle ${fmt(a)}, ${fmt(b)}, ${fmt(Math.hypot(a, b))}`;
    } else if (/^(equilateral\s*)?triangle/.test(s)) {
      if (nums.length >= 3) caption = triangle(nums[0], nums[1], nums[2]);
      else {
        const a = nums[0] || 4;
        caption = triangle(a, a, a);
      }
    } else if (/^(regular\s*)?polygon/.test(s) || Object.keys(NAMED).some((k) => s.startsWith(k))) {
      const named = Object.keys(NAMED).find((k) => s.startsWith(k));
      const n = named ? NAMED[named] : Math.round(nums.shift() || 6);
      if (n < 3 || n > 40) throw new Error('a polygon needs 3 to 40 sides');
      const side = nums[0] || 2;
      regular(n, side);
      caption = `regular ${n}-gon, side ${fmt(side)}`;
    } else if (/^angle/.test(s)) {
      const a = ((nums[0] ?? 60) * Math.PI) / 180;
      const L = 4;
      const v = [0, 0];
      const p = [L, 0];
      const q = [L * Math.cos(a), L * Math.sin(a)];
      items.push({ kind: 'poly', pts: [p, v, q] });
      angleArc(v, p, q, deg(a));
      caption = `angle ${deg(a)}`;
    } else {
      throw new Error('I can draw: circle r, ellipse a b, square a, rectangle a by b, triangle a b c, right triangle a b, polygon n side, hexagon side, angle θ');
    }
    // bounds
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    const grow = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    for (const it of items) {
      if (it.kind === 'poly') it.pts.forEach((p) => grow(...p));
      if (it.kind === 'ellipse') { grow(it.cx - it.rx, it.cy - it.ry); grow(it.cx + it.rx, it.cy + it.ry); }
    }
    return { caption, figure: { bounds: { x0, x1, y0, y1 }, equal: true, size: [240, 240], items } };
  };

  // The graph of an equation in x and y ("y = 3x^2 + 2x", "x^2+y^2=25", "1//x = y"), or null.
  // Fractions typed as // and groups typed as {…} are read as / and (…).
  const asPlot = (src) => {
    const text = String(src).replace(/\/\//g, '/').trim();
    const sides = text.split('=');
    if (sides.length !== 2) return null;
    let vars;
    try { vars = new Set(sides.flatMap((side) => [...freeVars(parse(side))])); } catch (_) { return null; }
    // needs an x: "y = 3//4 + 1" is an equation to lay out, not a flat line
    if (!vars.has('x') || ![...vars].every((v) => v === 'x' || v === 'y')) return null;
    return plotCmd(text);
  };

  const SHAPE_WORD = /^(circle|ellipse|oval|square|rectangle|rect|right\s*triangle|equilateral|triangle|regular|polygon|pentagon|hexagon|heptagon|octagon|nonagon|decagon|angle)\b/i;
  const balanced = (s) => {
    let d = 0;
    for (const c of s) {
      if (c === '{') d++;
      if (c === '}' && --d < 0) return false;
    }
    return d === 0;
  };

  // Runs a command line. Returns { text } to replace the line, { figure, caption } to draw,
  // { equation } to lay out as a drawn equation, or null when the line is not a command.
  // Throws with a readable message on errors.
  const runCommand = (line, enabled = { cas: true, plot: true, shapes: true }) => {
    const m = String(line).match(COMMANDS);
    if (!m) return null;
    const cmd = m[1].toLowerCase();
    let rest = m[2].trim();
    // "… /draw" at the end of a line is an equation to lay out, not a shape
    if (cmd === 'draw' && /\/draw\s*$/i.test(rest)) return null;
    // /plot{x^2+y^2=25}: braces around the whole argument are optional
    if (/^\{[\s\S]*\}$/.test(rest) && balanced(rest.slice(1, -1))) rest = rest.slice(1, -1).trim();
    // (plain words like "/draw blob" still get the list of shapes)
    if (cmd === 'draw' && rest && !SHAPE_WORD.test(rest) && /[=/^_{}()+\-*×·0-9²³√∫∑]/.test(rest)) {
      // /draw x^2+y^2=25 draws the graph; anything else is an equation to lay out
      const plot = enabled.plot ? asPlot(rest) : null;
      return plot || { equation: rest };
    }
    const kind = cmd === 'plot' || cmd === 'graph' ? 'plot' : cmd === 'draw' || cmd === 'shape' ? 'shapes' : 'cas';
    if (!enabled[kind]) return null;
    if (!rest) throw new Error(`/${cmd} what? e.g. ${kind === 'shapes' ? '/draw triangle 3 4 5' : kind === 'plot' ? '/plot sin(x)' : `/${cmd} x^2`}`);
    switch (cmd) {
      case 'calc': case 'calculate': case 'eval': return { text: calc(rest) };
      case 'diff': case 'derive': case 'derivative': return { text: diffCmd(rest) };
      case 'integrate': case 'integral': return { text: integrateCmd(rest) };
      case 'solve': return { text: solveCmd(rest) };
      case 'simplify': case 'factor': case 'factorise': case 'factorize': case 'expand': return { text: simplifyCmd(rest, cmd) };
      case 'plot': case 'graph': return plotCmd(rest);
      case 'draw': case 'shape': return shapeCmd(rest);
      default: return null;
    }
  };

  root.MathTools = { normalize, parse, evaluate, pretty, toNerd, runCommand, asPlot, COMMANDS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
