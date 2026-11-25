// Run: node --test
// Loads nerdamer and mathtools.js the way the browser does: plain scripts, and with code
// generation from strings disabled (Firefox extensions block eval/new Function).
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, Math }, { codeGeneration: { strings: false, wasm: false } });
ctx.window = ctx;
ctx.globalThis = ctx;
for (const f of ['vendor/nerdamer/nerdamer.core.js', 'vendor/nerdamer/Algebra.js', 'vendor/nerdamer/Calculus.js',
  'vendor/nerdamer/Solve.js', 'rules.js', 'mathtools.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const run = (line) => ctx.MathTools.runCommand('/' + line);
const text = (line) => run(line).text;

const CASES = [
  ['calc 2^10/3', '2¹⁰/3 = 1024/3 ≈ 341.3333333'],
  ['calc 2¹⁰/3', '2¹⁰/3 = 1024/3 ≈ 341.3333333'],
  ['calc 3! + 4', '3! + 4 = 10'],
  ['calc sin(pi/6)', 'sin(π/6) = 1/2 ≈ 0.5'],
  ['diff x^3 sin(x)', 'd/dx (x³·sin(x)) = 3x²·sin(x) + x³·cos(x)'],
  ['diff x³·sin(x)', 'd/dx (x³·sin(x)) = 3x²·sin(x) + x³·cos(x)'],
  ['diff sqrt(x^2+1)', 'd/dx (√(x² + 1)) = x/√(x² + 1)'],
  ['diff t^2 wrt t', 'd/dt (t²) = 2t'],
  ['integrate x^2', '∫ x² dx = x³/3 + C'],
  ['integrate 1/(1+x^2)', '∫ 1/(x² + 1) dx = arctan(x) + C'],
  ['integrate x^2 from 0 to 3', '∫₀³ x² dx = 9'],
  ['integrate sin(x) from 0 to pi', '∫ from 0 to π sin(x) dx = 2'],
  ['integrate e^(-x^2) from 0 to 1', '∫₀¹ e^(−x²) dx = 0.7468241328'],
  ['solve x^2-5x+6=0', 'x² − 5x + 6 = 0  ⇒  x = 2 or x = 3'],
  ['solve 2x+3=7', '2x + 3 = 7  ⇒  x = 2'],
  ['solve x^3=2', 'x³ = 2  ⇒  x = 1.25992105'],
  ['solve cos(x)=x', 'cos(x) = x  ⇒  x = 0.7390851332'],
  ['solve x^2=-1', 'x² = −1  ⇒  no real solution'],
  ['simplify (x^2-1)/(x-1)', '(x² − 1)/(x − 1) = x + 1'],
  ['factor x^2-5x+6', 'x² − 5x + 6 = (x − 2)·(x − 3)'],
  ['expand (x+1)^3', '(x + 1)³ = x³ + 3x² + 3x + 1'],
];
for (const [line, want] of CASES) test(line, () => assert.strictEqual(text(line), want));

test('not a command', () => {
  assert.strictEqual(ctx.MathTools.runCommand('hello there'), null);
  // without the slash nothing runs, so notes like these stay as they are
  assert.strictEqual(ctx.MathTools.runCommand('solve x^2=4 by factoring'), null);
  assert.strictEqual(ctx.MathTools.runCommand('plot twist'), null);
  // "… /draw" at the end of a line is an equation, not a shape
  assert.strictEqual(ctx.MathTools.runCommand('/draw x//2 /draw'), null);
});

test('commands can be switched off', () => {
  assert.strictEqual(ctx.MathTools.runCommand('/calc 1+1', { cas: false, plot: true, shapes: true }), null);
  assert.strictEqual(ctx.MathTools.runCommand('/plot x', { cas: true, plot: false, shapes: true }), null);
});

test('plots', () => {
  const p = run('plot sin(x)');
  assert.strictEqual(p.caption, 'y = sin(x)');
  assert.ok(p.figure.items.some((i) => i.kind === 'poly' && i.color === 'blue' && i.pts.length > 50));
  const c = run('plot x^2+y^2=9');
  assert.ok(c.figure.equal);
  const curve = c.figure.items.filter((i) => i.kind === 'poly' && i.color === 'blue');
  const r = curve.flatMap((i) => i.pts).map(([x, y]) => Math.hypot(x, y));
  assert.ok(r.every((v) => Math.abs(v - 3) < 0.1), 'points of the circle are 3 from the centre');
  assert.ok(run('plot x^2-6x+y^2+t=0 where t=5').figure);
  assert.throws(() => run('plot x^2-6x+y^2+t=0'), /what is t/);
  assert.strictEqual(run('plot sin(x), cos(x)').caption, 'y = sin(x),  y = cos(x)');
  // tan jumps at its poles: the curve must be split, not joined across the gap
  const tan = run('plot tan(x) from -pi to pi').figure.items.filter((i) => i.kind === 'poly' && i.color === 'blue');
  assert.ok(tan.length >= 3);
});

test('shapes', () => {
  const t = run('draw triangle 3 4 5');
  assert.strictEqual(t.caption, 'triangle 3, 4, 5');
  const texts = t.figure.items.filter((i) => i.kind === 'text').map((i) => i.text);
  for (const want of ['3', '4', '5', 'A', 'B', 'C', '36.87°', '53.13°']) assert.ok(texts.includes(want), want);
  // the right angle gets a square mark, not a label
  assert.ok(!texts.includes('90°'));
  assert.strictEqual(run('draw right triangle 3 4').caption, 'right triangle 3, 4, 5');
  assert.throws(() => run('draw triangle 1 2 5'), /can't make a triangle/);
  assert.ok(run('draw circle 3').figure.items.some((i) => i.kind === 'ellipse' && i.rx === 3));
  assert.strictEqual(run('draw rectangle 3 by 5').caption, 'rectangle 3 × 5');
  assert.strictEqual(run('draw hexagon 2').caption, 'regular 6-gon, side 2');
  assert.throws(() => run('draw blob'), /I can draw/);
});

test('/draw with an equation in x and y plots it; braces are optional', () => {
  const run2 = (l) => ctx.MathTools.runCommand(l);
  assert.strictEqual(run2('/draw x^2+y^2=25').caption, 'x² + y² = 25');
  assert.strictEqual(run2('/draw x² + y² =25').caption, 'x² + y² = 25');
  assert.strictEqual(run2('/plot{x^2+y^2=25}').caption, 'x² + y² = 25');
  assert.strictEqual(run2('/draw{x^2+y^2=25}').caption, 'x² + y² = 25');
  assert.strictEqual(run2('/calc{2^10}').text, '2¹⁰ = 1024');
  assert.strictEqual(run2('/draw{triangle 3 4 5}').caption, 'triangle 3, 4, 5');
  // other /draw{…} content is an equation to lay out
  assert.strictEqual(JSON.stringify(run2('/draw{a//b = c}')), JSON.stringify({ equation: 'a//b = c' }));
  assert.strictEqual(JSON.stringify(run2('/draw{x//{x+3} + 4}')), JSON.stringify({ equation: 'x//{x+3} + 4' }));
  // backslash works like slash
  assert.strictEqual(run2('\\plot{sin(x)}').caption, 'y = sin(x)');
});

test('asPlot: equations in x (and y) graph; others do not', () => {
  assert.strictEqual(ctx.MathTools.asPlot('y = 3x^2 + 2x').caption, 'y = 3x² + 2x');
  assert.strictEqual(ctx.MathTools.asPlot('y = x//{x+3}').caption, 'y = x/(x + 3)');
  assert.strictEqual(ctx.MathTools.asPlot('y = 3//4 + 1'), null);
  assert.strictEqual(ctx.MathTools.asPlot('a//b = c'), null);
  assert.strictEqual(ctx.MathTools.asPlot('x^2 + 1'), null);
});

test('plots mark where curves cross', () => {
  const pts = (l) => [...run(l).figure.items.filter((i) => i.kind === 'text' && i.text.startsWith('(') && !i.text.includes('r =')).map((i) => i.text)];
  assert.deepStrictEqual(pts('plot x+2, 4-x'), ['(1, 3)']);
  assert.deepStrictEqual(pts('plot x^2, 2x+3'), ['(−1, 1)', '(3, 9)']);
  assert.deepStrictEqual(pts('plot x^2+y^2=25, y=x'), ['(−3.54, −3.54)', '(3.54, 3.54)']);
  assert.deepStrictEqual(pts('plot sin(x)'), []);
  assert.deepStrictEqual(pts('plot tan(x), 0 from -3 to 3'), ['(0, 0)']); // no fake points at the poles ±π/2
  assert.ok(run('plot x+2, 4-x').figure.items.some((i) => i.kind === 'dot' && Math.abs(i.x - 1) < 1e-9));
});

test('circles get their centre marked', () => {
  const centre = (l) => [...run(l).figure.items.filter((i) => i.kind === 'text' && i.text.includes('r =')).map((i) => i.text)];
  assert.deepStrictEqual(centre('plot x^2+y^2=25'), ['(0, 0)  r = 5']);
  assert.deepStrictEqual(centre('plot x^2-6x+y^2+t=0 where t=5'), ['(3, 0)  r = 2']);
  assert.deepStrictEqual(centre('plot (x-1)^2+(y+2)^2=9, y=x'), ['(1, −2)  r = 3']);
  assert.deepStrictEqual(centre('plot x^2/9+y^2/4=1'), []); // an ellipse is not a circle
  assert.deepStrictEqual(centre('plot sin(x)'), []);
});
