// Prints every non-ASCII character the extension can type, as a JSON array (for build-fonts.py).
require('../rules.js');
const MT = globalThis.MathTyping;

const set = new Set();
const addAll = (s) => {
  for (const ch of s) if (ch.codePointAt(0) > 127) set.add(ch);
};
for (const r of MT.cheatSheet()) addAll(r.get);
for (const h of MT.hintEntries()) addAll(h.out);
// every superscript, subscript and fraction character, and the fraction slash
addAll('⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ');
addAll('₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ');
addAll('½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒⁄');
// drop arrows and dashes used only in cheat-sheet prose
process.stdout.write(JSON.stringify([...set].filter((c) => !'—–'.includes(c))));
