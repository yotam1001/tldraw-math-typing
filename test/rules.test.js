// Run: node --test
// Simulates typing one character at a time, the way content.js applies replacements.
const test = require('node:test');
const assert = require('node:assert');
require('../rules.js');
const MT = globalThis.MathTyping;

// Most tests below were written with every group on, including the as-you-type drawing
// groups that are off by default since /draw arrived.
const ALL_ON = { v: 3, categories: { fractions: true, stacked: true, blocks: true } };
const type = (input, settings = ALL_ON, { flush = false } = {}) => {
  const rules = MT.buildRules(settings);
  let text = '';
  for (const ch of input) {
    text += ch;
    for (let i = 0; i < 4; i++) {
      const rep = MT.findReplacement(rules, text);
      if (!rep) break;
      if (rep.stack) stacks.push(rep.stack);
      const next = text.slice(0, text.length - rep.length) + rep.text;
      if (next === text) break;
      text = next;
    }
  }
  if (flush) {
    const rep = MT.findPendingWord(rules, text);
    if (rep?.stack) stacks.push(rep.stack);
    if (rep) text = text.slice(0, text.length - rep.length) + rep.text;
  }
  return text;
};
let stacks = [];
// The stacked layout typing `input` asks for (the last one), or undefined.
const stackOf = (input, settings = ALL_ON, opts) => {
  stacks = [];
  type(input, settings, opts);
  return stacks[stacks.length - 1];
};

const cases = [
  // original behaviour
  ['sqrt', '√'], ['4sqrt(10)', '4√10'], ['sqrt(81+9)', '√(81+9)'], ['cbrt', '∛'],
  ['3//4 ', '¾ '], ['48//10 ', '⁴⁸⁄₁₀ '], ['2*3', '2×3'], ['8 div 2', '8 ÷ 2'],
  ['x^2', 'x²'], ['x^-12', 'x⁻¹²'], ['x_1', 'x₁'], ['x_12', 'x₁₂'],
  ['+-', '±'], ['>=', '≥'], ['<=', '≤'], ['!=', '≠'], ['->', '→'],
  ['2pi ', '2π '], ['90deg ', '90° '], ['inf ', '∞ '], ['alpha ', 'α '], ['delta ', 'Δ '],
  ['sigma ', 'Σ '],
  // new
  ['x^(n+1)', 'xⁿ⁺¹'], ['a_(n-1)', 'aₙ₋₁'], ['x^(Q)', 'x^(Q)'],
  ['2**3', '2·3'], ['a===b', 'a≡b'], ['wait...', 'wait…'], ['p<=>q', 'p⇔q'], ['a<->b', 'a↔b'],
  ['p=>q', 'p⇒q'], ['x~=3', 'x≈3'], ['-+', '∓'], ['x<-1', 'x<-1'],
  ['omega ', 'ω '], ['Omega ', 'Ω '], ['theta)', 'θ)'], ['pi*2', 'π×2'],
  ['int ', '∫ '], ['partial ', '∂ '], ['x in RR ', 'x in ℝ '], ['NN ', 'ℕ '],
  ['\\in ', '∈ '], ['\\int ', '∫ '], ['\\delta ', 'δ '], ['\\Delta ', 'Δ '], ['\\sum ', '∑ '],
  ['\\forall x', '∀ x'], ['\\subseteq ', '⊆ '], ['\\to ', '→ '], ['\\sqrt', '√'], ['\\pi ', 'π '],
  ['\\R ', 'ℝ '], ['\\infty ', '∞ '],
  // words inside other words stay
  ['spin ', 'spin '], ['alphabet ', 'alphabet '], ['the sum of ', 'the sum of '],
  ['print ', 'print '], ['menu ', 'menu '],
];
for (const [input, want] of cases) {
  test(`${input} -> ${want}`, () => assert.strictEqual(type(input), want));
}

test('Enter/Escape converts a trailing word', () => {
  assert.strictEqual(type('2pi', null, { flush: true }), '2π');
  assert.strictEqual(type('\\in', null, { flush: true }), '∈');
  assert.strictEqual(type('x', null, { flush: true }), 'x');
  assert.strictEqual(type('3//4', ALL_ON, { flush: true }), '¾');
});

test('categories can be switched off', () => {
  const s = { categories: { greek: false, symbols: false } };
  assert.strictEqual(type('alpha ', s), 'alpha ');
  assert.strictEqual(type('2*3', s), '2*3');
  assert.strictEqual(type('sqrt', s), '√');
});

test('custom shortcuts', () => {
  const s = { custom: [{ from: 'eps', to: 'ε' }, { from: ':=', to: '≔' }, { from: 'pi', to: 'PI!' }] };
  assert.strictEqual(type('eps ', s), 'ε ');
  assert.strictEqual(type('steps ', s), 'steps ');
  assert.strictEqual(type('a:=b', s), 'a≔b');
  assert.strictEqual(type('pi ', s), 'PI! ');
});

test('cheat sheet covers every category', () => {
  const cats = new Set(MT.cheatSheet().map((r) => r.cat));
  for (const c of MT.CATEGORIES) assert.ok(cats.has(c.id), c.id);
});

test('{} groups exponents and indices', () => {
  assert.strictEqual(type('e^{2x}'), 'e²ˣ');
  assert.strictEqual(type('e^{2x}+1'), 'e²ˣ+1');
  assert.strictEqual(type('e^{-x}'), 'e⁻ˣ');
  assert.strictEqual(type('x^{n+1}'), 'xⁿ⁺¹');
  assert.strictEqual(type('a_{ij}'), 'aᵢⱼ');
  assert.strictEqual(type('a_{n-1}'), 'aₙ₋₁');
  assert.strictEqual(type('e^{Q}'), 'e^{Q}'); // no superscript Q: left as typed
  // a bare ^ covers one character (and following digits)
  assert.strictEqual(type('e^2x'), 'e²x');
  assert.strictEqual(type('x^12y'), 'x¹²y');
});

test('stacked fractions', () => {
  assert.deepStrictEqual(stackOf('3//4 '), { type: 'fraction', num: '3', den: '4', after: '', pre: '' });
  assert.deepStrictEqual(stackOf('y=(x+1)//(x-1) '),
    { type: 'fraction', num: 'x+1', den: 'x-1', after: '', pre: '=' });
  assert.strictEqual(stackOf('1//2+').after, '+');
  assert.strictEqual(stackOf('pi//2 ').num, 'π');
  assert.strictEqual(stackOf('x^2//2 ').num, 'x²');
  assert.strictEqual(stackOf('3//4', ALL_ON, { flush: true }).den, '4');
  assert.strictEqual(stackOf('http://x '), undefined);
});

test('derivatives', () => {
  assert.deepStrictEqual(stackOf('d/dx '), { type: 'fraction', num: 'd', den: 'dx', after: '', pre: '', deriv: true });
  assert.strictEqual(stackOf('dy/dx=').num, 'dy');
  assert.strictEqual(stackOf('d^2y/dx^2 ').num, 'd²y');
  assert.strictEqual(stackOf('d^2y/dx^2 ').den, 'dx²');

  assert.strictEqual(stackOf('and/or '), undefined);
});

test('bounds on integrals, sums and limits', () => {
  assert.deepStrictEqual(stackOf('int_0^1 '), { type: 'bigop', op: '∫', lower: '0', upper: '1', pre: '' });
  assert.deepStrictEqual(stackOf('int_0^inf '), { type: 'bigop', op: '∫', lower: '0', upper: '∞', pre: '' });
  assert.deepStrictEqual(stackOf('sum_(i=1)^n '), { type: 'bigop', op: '∑', lower: 'i=1', upper: 'n', pre: '' });
  assert.deepStrictEqual(stackOf('\\prod_(k=1)^(10) '), { type: 'bigop', op: '∏', lower: 'k=1', upper: '10', pre: '' });
  assert.deepStrictEqual(stackOf('lim_(x->0) '), { type: 'bigop', op: 'lim', lower: 'x→0', upper: '', pre: '' });
  assert.strictEqual(stackOf('int x dx '), undefined);
  // inline fallback text (used outside plain text shapes)
  assert.strictEqual(type('int_0^1 '), '∫₀¹ ');
  // with stacked shapes off, the old inline scripts apply
  assert.strictEqual(type('int_0^1', { v: 3, categories: { stacked: false, draw: false } }), '∫₀¹');
});

test('hints list', () => {
  const keys = MT.hintEntries().map((h) => h.key);
  for (const k of ['alpha', '\\in', 'int_a^b', 'd/dx', 'RR']) assert.ok(keys.includes(k), k);
});

test('{} works for bounds and fractions', () => {
  assert.deepStrictEqual(stackOf('sum_{i=1}^{n} '), { type: 'bigop', op: '∑', lower: 'i=1', upper: 'n', pre: '' });
  assert.deepStrictEqual(stackOf('int_{0}^{pi} '), { type: 'bigop', op: '∫', lower: '0', upper: 'π', pre: '' });
  assert.strictEqual(stackOf('{x+1}//{x-1} ').num, 'x+1');
  assert.strictEqual(stackOf('partial/partial x ').den, '∂x');
});

test('brace commands', () => {
  assert.strictEqual(type('sqrt{x+1}'), '√(x+1)');
  assert.strictEqual(type('sqrt{2}'), '√2');
  assert.strictEqual(type('abs{x-3}'), '|x-3|');
  assert.strictEqual(type('vec{v}'), 'v\u20D7');
  assert.strictEqual(type('bar{x}'), 'x\u0304');
  assert.deepStrictEqual(stackOf('\\frac{a+1}{2}'), { type: 'fraction', num: 'a+1', den: '2', after: '', pre: '' });
});

test('equation blocks', () => {
  assert.strictEqual(MT.openBlockAt('y=//{x//'), 2);
  assert.strictEqual(MT.openBlockAt('3//{x+1'), -1); // a plain fraction, not a block
  assert.deepStrictEqual(MT.closedBlock('y = //{a//b}'), { start: 4, src: 'a//b' });
  assert.strictEqual(MT.closedBlock('//{a//{b}'), null); // the outer block is still open
  const flat = (n) => (n.k === 'row' ? n.items.map(flat).join('') : n.k === 'text' ? n.s
    : n.k === 'frac' ? `[${flat(n.num)}/${flat(n.den)}]` : n.k === 'paren' ? `(${flat(n.row)})`
      : n.k === 'sup' ? `^[${flat(n.row)}]` : n.k === 'sub' ? `_[${flat(n.row)}]` : n.k === 'sqrt' ? `√[${flat(n.row)}]`
        : n.k === 'group' ? flat(n.row) : '?');
  assert.strictEqual(flat(MT.parseBlock('x//{x+3} + 4 ± 4')), '[x/x+3] + 4 ± 4');
  assert.strictEqual(flat(MT.parseBlock('x//x+3+4')), '[x/x]+3+4');
  assert.strictEqual(flat(MT.parseBlock('{a+b}//{c//d} = 1//2')), '[a+b/[c/d]] = [1/2]');
  assert.strictEqual(flat(MT.parseBlock('(x+1)//(x-1)')), '[x+1/x-1]');
  assert.strictEqual(flat(MT.parseBlock('e^{x//2}')), 'e^[[x/2]]');
  assert.strictEqual(flat(MT.parseBlock('√(x+1)//2')), '[√[x+1]/2]');
  assert.strictEqual(flat(MT.parseBlock('\\frac{1}{x}')), '[1/x]');
});

test('a block can start after an operator', () => {
  assert.strictEqual(type('3*'), '3×');
  assert.deepStrictEqual(MT.closedBlock('3×//{x+1//2}'), { start: 2, src: 'x+1//2' });
});

test('defaults: nothing is drawn or folded while typing; /draw does it', () => {
  const D = null; // default settings
  assert.strictEqual(type('3//4 ', D), '3//4 ');
  assert.strictEqual(stackOf('3//4 ', D), undefined);
  assert.strictEqual(stackOf('d/dx ', D).den, 'dx'); // d/dx is the one exception: drawn at once
  assert.strictEqual(type('int_0^1 ', D), '∫_0^1 ');
  assert.strictEqual(type('sum_{i=1}^n ', D), '∑_{i=1}^n ');
  assert.strictEqual(type('x^2 + alpha ', D), 'x² + α ');
});

test('settings from before /draw drop the old as-you-type choices', () => {
  const old = { enabled: true, categories: { stacked: true, fractions: true, blocks: true, greek: false } };
  const s = MT.normalizeSettings(old);
  assert.strictEqual(s.categories.stacked, false);
  assert.strictEqual(s.categories.fractions, false);
  assert.strictEqual(s.categories.greek, false); // other choices are kept
  assert.strictEqual(s.categories.draw, true);
  // once saved in the new version, a choice to turn them on sticks
  assert.strictEqual(MT.normalizeSettings({ ...s, categories: { ...s.categories, stacked: true } }).categories.stacked, true);
});

test('/draw lines: bounds, derivatives and old //{…} blocks', () => {
  const flat = (n) => (n.k === 'row' ? n.items.map(flat).join('') : n.k === 'text' ? n.s
    : n.k === 'frac' ? `[${flat(n.num)}/${flat(n.den)}]` : n.k === 'group' ? `{${flat(n.row)}}`
      : n.k === 'bigop' ? `${n.op}<${n.lower ? flat(n.lower) : ''},${n.upper ? flat(n.upper) : ''}>`
        : n.k === 'sup' ? `^[${flat(n.row)}]` : n.k === 'paren' ? `(${flat(n.row)})` : '?');
  assert.strictEqual(flat(MT.parseBlock('∫_0^1 x² dx = 1//3')), '∫<0,1> x² dx = [1/3]');
  assert.strictEqual(flat(MT.parseBlock('∑_{i=1}^n i')), '∑<i=1,n> i');
  assert.strictEqual(flat(MT.parseBlock('lim_{x→0} sin(x)//x')), 'lim<x→0,> sin[(x)/x]'.replace('sin[(x)/x]', flat(MT.parseBlock('sin(x)//x'))));
  assert.strictEqual(flat(MT.parseBlock('d/dx e^{x//2}')), '[d/dx] e^[[x/2]]');
  assert.strictEqual(flat(MT.parseBlock('dy/dx = 3')), '[dy/dx] = 3');
  assert.strictEqual(flat(MT.parseBlock('and/or')), 'and/or');
  assert.strictEqual(flat(MT.parseBlock('//{x//{x+3}}')), '{[x/x+3]}');
});

test('//{…} blocks are on by default, also for settings saved before', () => {
  assert.strictEqual(MT.normalizeSettings(null).categories.blocks, true);
  assert.strictEqual(MT.normalizeSettings({ v: 2, categories: { blocks: false } }).categories.blocks, true);
  assert.strictEqual(MT.normalizeSettings({ v: 3, categories: { blocks: false } }).categories.blocks, false);
  assert.deepStrictEqual(MT.closedBlock('//{3//{x+2}}'), { start: 0, src: '3//{x+2}' });
});

test('a double backslash works like //', () => {
  assert.strictEqual(type('\\\\{67\\\\23}', null), '//{67//23}');
  assert.deepStrictEqual(MT.closedBlock(type('\\\\{67\\\\23}', null)), { start: 0, src: '67//23' });
});
