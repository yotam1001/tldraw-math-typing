# tldraw Math Typing

A Firefox / Zen and Chrome / Edge extension for writing maths on [tldraw.com](https://tldraw.com):

- **Symbols as you type**: `sqrt` → √, `x^2` → x², `alpha` → α, `\in` → ∈, `->` → →, and about 150 more.
- **Real equations on `/draw`**: write a line, end it with `/draw`, and it is laid out with stacked
  fractions, bounds above and below ∫ ∑ lim, raised exponents and roots, as grouped tldraw shapes.
- **Calculator**: `/calc`, `/diff`, `/integrate`, `/solve`, `/simplify`, `/factor`, `/expand` + Enter.
- **Graphs**: `/plot sin(x)`, `/plot x^2+y^2=9` + Enter draws a rough graph under the line.
- **Shapes**: `/draw triangle 3 4 5`, `/draw circle 3` … + Enter draws it with sides and angles marked.
- **Matching fonts**: symbols tldraw's fonts lack (∈ ℝ ⇒, superscript letters, Greek in handwriting)
  come from one bundled fallback font instead of whatever Windows finds.
- **Suggestions** under the caret while you type (Tab to use one) and a toolbar popup with a
  searchable cheat sheet, your own shortcuts and a switch for every feature.

Forked from [BoazCohenJ/tldraw-math-typing](https://github.com/BoazCohenJ/tldraw-math-typing).

## Install in Zen or Firefox
Zen doesn't require add-ons to be signed, so the unsigned package can stay installed:
1. In `about:config`, set `xpinstall.signatures.required` to `false`.
2. Build: `npx web-ext build --ignore-files "test/**" "dist/**" "tools/**"`, then rename the zip in `dist/` to `.xpi`.
3. Open the `.xpi` in Zen (drag it onto a window) and click **Add**.
4. If nothing converts, click the add-on's toolbar icon and press **Allow**: Firefox treats site
   access as optional for this kind of add-on, and without it the add-on never runs.

For a quick try that lasts until restart: `about:debugging` → This Firefox → Load Temporary Add-on → `manifest.json`.

## Install in Chrome or Edge
1. Build: `node tools/build-chrome.js` (Node 22.2+, no dependencies). It writes `dist/chrome/` and
   `dist/tldraw-math-typing-chrome-<version>.zip`, with a manifest that leaves out the Firefox-only keys.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked**
   and pick `dist/chrome`.
3. Tabs on tldraw.com that were already open get the extension right away, no reload needed.

The zip is the package for the Chrome Web Store or Edge Add-ons. Loading the repo folder itself also
works, but Chrome then lists warnings about the Firefox keys.

## Typing shortcuts
| Type | Get |
|---|---|
| `sqrt`, `cbrt`, `sqrt{x+1}` | √, ∛, √(x+1) |
| `*`, `**`, `div` | ×, ·, ÷ |
| `x^2`, `x^-12`, `e^{2x}`, `x^(n+1)` | x², x⁻¹², e²ˣ, xⁿ⁺¹ |
| `x_1`, `a_{n-1}` | x₁, aₙ₋₁ |
| `+-` `-+` `>=` `<=` `!=` `~=` `===` | ± ∓ ≥ ≤ ≠ ≈ ≡ |
| `->` `=>` `<->` `<=>` `...` | → ⇒ ↔ ⇔ … |
| `abs{x}`, `vec{v}`, `bar{x}`, `hat{x}` | \|x\|, v⃗, x̄, x̂ |
| `pi` `inf` `90deg` `int` `partial` `nabla` `forall` | π ∞ 90° ∫ ∂ ∇ ∀ |
| `alpha` … `omega`, `Gamma` … `Omega` | α … ω, Γ … Ω (`delta`, `sigma` give Δ, Σ) |
| `NN` `ZZ` `QQ` `RR` `CC` | ℕ ℤ ℚ ℝ ℂ |
| LaTeX: `\in` `\subseteq` `\cup` `\sum` `\exists` `\therefore` `\angle` `\delta` … | ∈ ⊆ ∪ ∑ ∃ ∴ ∠ δ … |

Words convert when you type the next space or symbol, or press Enter, Esc or Tab.
English words that clash (in, sum, because…) need a backslash. Backspace right after a change
puts back what you typed. **Alt+M** turns everything on and off.

## Drawing equations: `/draw`
While you write, `//`, `{…}` and `∫_0^1` stay as typed. End the line with `/draw` and a space (keep
typing to the right) or Enter (done), and the line is drawn as an equation:

| Write | Drawn as |
|---|---|
| `y = x//{x+3} + 4 /draw` | y = x over x+3, + 4 |
| `{a+b}//{c//d} = 1//2 /draw` | nested fractions; `{…}` groups a part, `(…)` too |
| `int_0^1 x^2 dx = 1//3 /draw` | ∫ with 0 below and 1 above |
| `sum_{i=1}^n i = n(n+1)//2 /draw` | ∑ with i=1 below and n above |
| `lim_{x->0} sin(x)//x /draw` | lim with x→0 below |
| `d/dx e^{x//2} /draw` | d over dx, and a raised x/2 exponent |
| `\frac{a}{b}`, `√(x+1)` inside the line | a fraction, a root with its bar |

Drawn equations are grouped shapes: Ctrl+Z takes them back. In box labels and sticky notes, which
can't hold shapes, they stay as text. Settings has older as-you-type modes (draw `3//4` as soon as
you type a space, or `3//4` → ¾), off by default.

## Tools: start a line with `/`, press Enter
| Line | Result |
|---|---|
| `/calc 2^10/3` | `2¹⁰/3 = 1024/3 ≈ 341.3333333` |
| `/diff x^3 sin(x)` (also `wrt t`) | `d/dx (x³·sin(x)) = 3x²·sin(x) + x³·cos(x)` |
| `/integrate x^2` | `∫ x² dx = x³/3 + C` |
| `/integrate e^(-x^2) from 0 to 1` | `∫₀¹ e^(−x²) dx = 0.7468241328` |
| `/solve x^2-5x+6=0` | `x² − 5x + 6 = 0  ⇒  x = 2 or x = 3` |
| `/simplify`, `/factor`, `/expand` … | `(x − 2)·(x − 3)` … |
| `/plot sin(x), cos(x) from -pi to pi` | a graph under the line |
| `/plot x^2+y^2=9`, `/draw x^2+y^2=25`, `/plot x^2-6x+y^2+t=0 where t=5` | curves given by an equation (`/draw` plots anything in x and y) |
| `/plot{…}`, `/draw{…}`, `\calc{…}` | braces and a backslash work too; other `/draw{…}` content is drawn as an equation |
| `/draw triangle 3 4 5`, `right triangle 3 4`, `circle 3`, `ellipse 3 2`, `square 4`, `rectangle 3 by 5`, `hexagon 2`, `polygon 7 2`, `angle 40` | the shape, sides and angles marked |

Lines without the slash are never run. Symbolic maths uses [nerdamer](https://github.com/jiggzson/nerdamer)
(MIT, in `vendor/`); numbers, graphs and shapes are computed by `mathtools.js`.

## Cursor
On Windows with "Hide pointer while typing" on, Firefox may not bring tldraw's crosshair back after
you type. Settings → Cursor has a fix for that (on by default) and a plain system crosshair option.

## Files
- `rules.js` typing shortcuts, `/draw` parsing · `mathtools.js` calculator, graphs, shapes
- `content.js` runs on tldraw.com · `page.js` draws shapes with tldraw's editor (page world)
- `fonts.js` fallback fonts, built by `tools/build-fonts.py` (Noto, SIL OFL, see `fonts/OFL.txt`)
- `popup.*` the toolbar popup

## Tests
`node --test` (typing rules, the calculator and figures, with eval disabled as in Firefox).
