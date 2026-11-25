// tldraw Math Typing: auto-replaces math shortcuts while you type in a tldraw text box.
// Alt+M turns it on/off. Settings live in extension storage and are edited from the toolbar popup.
(() => {
  'use strict';
  // Runs once per tab, even when background.js also puts it into a tab that was already open.
  if (globalThis.__mathTypingContent) return;
  globalThis.__mathTypingContent = true;

  const MT = globalThis.MathTyping;
  const TOOLS = globalThis.MathTools;
  const FONTS = globalThis.MathTypingFonts;
  const ext = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'settings';

  let settings = MT.normalizeSettings(null);
  let rules = MT.buildRules(settings);
  let hintList = MT.hintEntries(settings);

  const applySettings = (s) => {
    settings = MT.normalizeSettings(s);
    rules = MT.buildRules(settings);
    hintList = MT.hintEntries(settings);
    applyFonts();
    if (!settings.enabled || !settings.hints) hideHints();
  };

  const loadSettings = async () => {
    try {
      const got = await ext.storage.local.get(STORAGE_KEY);
      applySettings(got[STORAGE_KEY]);
    } catch (_) { applyFonts(); }
  };
  const saveSettings = () => {
    try { ext.storage.local.set({ [STORAGE_KEY]: settings }); } catch (_) {}
  };
  try {
    ext.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) applySettings(changes[STORAGE_KEY].newValue);
    });
  } catch (_) {}

  // ---------------------------------------------------------------- fonts
  // tldraw's fonts lack many math symbols, so the browser fills them from random system fonts.
  // These faces sit in front of each tldraw font and cover only the characters that font lacks,
  // plus every superscript/subscript so exponent runs stay one size (see fonts.js).
  let fontsLoaded = null;
  const loadFonts = () => {
    if (fontsLoaded || !FONTS) return fontsLoaded;
    fontsLoaded = (async () => {
      // The subsets are inlined in fonts.js: Firefox won't let a content script fetch its own files.
      const files = {};
      for (const [file, b64] of Object.entries(FONTS.files)) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        files[file] = bytes.buffer;
      }
      for (const [tlFont, faces] of Object.entries(FONTS.faces)) {
        for (const f of faces) {
          // Firefox content scripts must hand page objects a copy made for the page.
          const data = typeof cloneInto === 'function' ? cloneInto(files[f.file], window) : files[f.file].slice(0);
          const face = new FontFace(`mathtyping_${tlFont}`, data, {
            unicodeRange: f.range, weight: '100 900', style: 'normal',
          });
          await face.load();
          document.fonts.add(face);
        }
      }
    })().catch((err) => {
      console.warn('[math typing] fonts', err);
      document.documentElement.dataset.mathtypingFontError = String(err);
    });
    return fontsLoaded;
  };
  const applyFonts = () => {
    const on = settings.enabled && settings.fonts && !!FONTS;
    if (on) loadFonts();
    document.documentElement.classList.toggle('mathtyping-fonts', on);
    document.documentElement.classList.toggle('mathtyping-system-cursor', settings.systemCursor);
  };

  // ---------------------------------------------------------------- cursor
  // After typing, the first mouse move swaps the canvas cursor for two frames, which makes
  // Firefox draw tldraw's crosshair again if Windows hid the pointer while you typed.
  let typedSinceMove = false;
  window.addEventListener('keydown', () => { typedSinceMove = true; }, true);
  window.addEventListener('pointermove', () => {
    if (!typedSinceMove) return;
    typedSinceMove = false;
    if (!settings.cursorKick) return;
    const rootEl = document.documentElement;
    rootEl.classList.add('mathtyping-cursor-kick');
    requestAnimationFrame(() => requestAnimationFrame(() => rootEl.classList.remove('mathtyping-cursor-kick')));
  }, true);

  loadSettings();

  // ---------------------------------------------------------------- editing helpers
  let applying = false;
  const insertText = (text) => {
    applying = true;
    try {
      if (text) document.execCommand('insertText', false, text);
      else document.execCommand('delete', false);
    } finally { applying = false; }
  };

  const isEditable = (el) =>
    el instanceof HTMLElement && !!el.closest('.tl-container') &&
    (el.tagName === 'TEXTAREA' || el.isContentEditable);

  // The caret's text node and offset (contenteditable), or the textarea itself.
  const caretInfo = (el) => {
    if (el && el.tagName === 'TEXTAREA') {
      if (el.selectionStart !== el.selectionEnd) return null;
      return { before: el.value.slice(0, el.selectionStart), textarea: el, pos: el.selectionStart };
    }
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.anchorNode) return null;
    let node = sel.anchorNode;
    let offset = sel.anchorOffset;
    if (node.nodeType !== Node.TEXT_NODE) {
      const prev = node.childNodes[offset - 1];
      if (!prev || prev.nodeType !== Node.TEXT_NODE) return { before: '', sel, node: null, offset: 0 };
      node = prev;
      offset = prev.data.length;
    }
    return { before: node.data.slice(0, offset), sel, node, offset };
  };

  // Select the last `length` characters before the caret and type `text` over them.
  const replaceBeforeCaret = (info, length, text) => {
    if (length === 0) {
      if (text) insertText(text);
      return;
    }
    if (info.textarea) {
      info.textarea.setSelectionRange(info.pos - length, info.pos);
    } else {
      if (!info.node) return;
      const range = document.createRange();
      range.setStart(info.node, info.offset - length);
      range.setEnd(info.node, info.offset);
      info.sel.removeAllRanges();
      info.sel.addRange(range);
    }
    insertText(text);
  };

  // ---------------------------------------------------------------- stacked shapes
  // A plain tldraw text shape can hand a fraction or bounds to page.js, which draws them
  // as real shapes. Anything else (a label inside a box, a note) gets the inline version.
  const canDraw = (el) =>
    document.documentElement.dataset.mathtypingPage === '1' &&
    el.closest('[data-shape-type]')?.dataset.shapeType === 'text';
  // d/dx is drawn as you type (its own switch); other fractions only with "draw as you type".
  // Never inside a /command line, which is read as text.
  const canStack = (el, rep) => {
    if (!canDraw(el)) return false;
    const info = caretInfo(el);
    if (info && /^\s*[/\\][a-z]/i.test(info.before)) return false;
    if (settings.categories.stacked) return true;
    return !!(rep && rep.stack && rep.stack.deriv && settings.categories.deriv);
  };

  // Sends a drawing request to page.js. Returns whether it drew it (the reply is synchronous).
  const askPage = (req) => {
    stackResult = null;
    const nonce = Math.random().toString(36).slice(2);
    document.dispatchEvent(new CustomEvent('mathtyping:stack', { detail: JSON.stringify({ ...req, nonce }) }));
    if (stackResult && stackResult.ok) return true;
    const why = stackResult ? stackResult.reason || 'an older version is still running in this tab; reload the tab'
      : 'the page script did not answer; reload the tab';
    toast(`Math typing: couldn't draw it: ${why}`, 6000);
    return false;
  };

  let stackResult = null;
  document.addEventListener('mathtyping:stack-done', (e) => {
    // Several page scripts can answer (an old version left in the tab): a success wins.
    try {
      const r = JSON.parse(e.detail);
      if (!stackResult || !stackResult.ok) stackResult = r;
    } catch (_) {}
  });

  const stack = (el, info, rep, finish) => {
    const pre = rep.stack.pre || '';
    const removed = info.before.slice(info.before.length - rep.length + pre.length);
    replaceBeforeCaret(info, rep.length - pre.length, '');
    last = null;
    hideHints();
    // Give tldraw a moment to take in the deletion before reading the caret position.
    setTimeout(() => {
      if (!askPage({ ...rep.stack, finish: !!finish })) {
        // Could not draw it: put the text back, in its inline form when there is one.
        const now = caretInfo(el);
        if (now) replaceBeforeCaret(now, 0, rep.text.slice(pre.length) || removed);
      }
    }, 30);
  };

  // ---------------------------------------------------------------- converting
  // The most recent replacement, so Backspace right after it can undo it.
  let last = null;

  // Applies replacements before the caret, repeating so chains work (pi* -> π×).
  // `first` finds the first replacement; later ones use the normal rules.
  const inBlock = (before) => settings.categories.blocks && MT.openBlockAt(before) >= 0;

  const convert = (el, first, finish = false) => {
    let start = null;
    for (let i = 0; i < 4; i++) {
      const info = caretInfo(el);
      if (!info) break;
      const rep = (i === 0 ? first : MT.findReplacement)(rules, info.before);
      if (!rep) break;
      // Inside an open //{ … } block, fractions wait for the block to close.
      if (inBlock(info.before.slice(0, -1)) &&
          (rep.stack || info.before.slice(info.before.length - rep.length).includes('//'))) break;
      if (rep.stack && canStack(el, rep)) {
        stack(el, info, rep, finish);
        return;
      }
      if (rep.text === info.before.slice(info.before.length - rep.length)) break; // nothing to do
      if (start === null) start = info.before;
      replaceBeforeCaret(info, rep.length, rep.text);
    }
    if (start === null) return;
    // Remember what changed, for Backspace undo.
    const info = caretInfo(el);
    if (!info) return;
    const end = info.before;
    let p = 0;
    while (p < start.length && p < end.length && start[p] === end[p]) p++;
    last = { el, original: start.slice(p), text: end.slice(p) };
  };

  // ---------------------------------------------------------------- equation blocks and commands
  // Typing the } that closes //{ … } draws the whole equation as shapes.
  const drawBlock = (el) => {
    if (!settings.categories.blocks || !canDraw(el)) return false;
    const info = caretInfo(el);
    const blk = info && MT.closedBlock(info.before);
    if (!blk || !blk.src.trim()) return false;
    const length = info.before.length - blk.start;
    stack(el, info, { length, text: info.before.slice(blk.start), stack: { type: 'block', tree: MT.parseBlock(blk.src), pre: '' } }, false);
    return true;
  };

  // "… /draw" then space or Enter: the line is drawn as an equation.
  const drawLine = (el, finish) => {
    if (!settings.categories.draw) return false;
    const info = caretInfo(el);
    const m = info && info.before.match(/^([\s\S]*?)\s*\/draw\s?$/);
    if (!m || !m[1].trim()) return false;
    if (!canDraw(el)) {
      toast('Math typing: /draw needs a plain text box (T tool)', 5000);
      return true;
    }
    // An equation in x and y gets its graph; anything else is laid out as an equation.
    let plot = null;
    try { plot = settings.categories.plot && TOOLS ? TOOLS.asPlot(m[1]) : null; } catch (_) { plot = null; }
    if (plot) {
      last = null;
      hideHints();
      drawFigure(el, info, plot, plot.caption);
      return true;
    }
    stack(el, info, {
      length: info.before.length, text: info.before,
      stack: { type: 'block', tree: MT.parseBlock(m[1].trimEnd()), pre: '' },
    }, finish);
    return true;
  };

  // Enter at the end of a line like "/calc 2^10" or "/plot sin(x)" runs it.
  const runCommandLine = (el, info) => {
    if (!TOOLS) return false;
    const on = settings.categories;
    let res;
    try {
      res = TOOLS.runCommand(info.before, { cas: on.cas, plot: on.plot, shapes: on.shapes });
    } catch (err) {
      toast(`Math typing: ${err.message}`, 5000);
      return true; // keep the line so it can be fixed
    }
    if (!res) return false;
    last = null;
    hideHints();
    if (res.equation) {
      // /draw{ … }: lay the equation out like "… /draw"
      if (!canDraw(el)) {
        toast('Math typing: /draw needs a plain text box (T tool)');
        return true;
      }
      stack(el, info, {
        length: info.before.length, text: info.before,
        stack: { type: 'block', tree: MT.parseBlock(res.equation), pre: '' },
      }, true);
      return true;
    }
    if (res.text) {
      replaceBeforeCaret(info, info.before.length, res.text);
      return true;
    }
    if (!canDraw(el)) {
      toast('Math typing: graphs and shapes need a plain text box (T tool)');
      return true;
    }
    drawFigure(el, info, res, /^\s*[/\\]draw\s+(?:circle|ellipse|oval|square|rect|right|equilateral|triangle|regular|polygon|pentagon|hexagon|heptagon|octagon|nonagon|decagon|angle)/i.test(info.before) ? '' : res.caption);
    return true;
  };

  // Replaces the line with its caption and draws the figure under it; puts the line back on failure.
  const drawFigure = (el, info, res, caption) => {
    const original = info.before;
    replaceBeforeCaret(info, info.before.length, caption);
    setTimeout(() => {
      if (askPage({ type: 'figure', figure: res.figure })) return;
      const now = caretInfo(el);
      if (now && now.before.endsWith(caption)) replaceBeforeCaret(now, caption.length, original);
    }, 30);
  };

  // ---------------------------------------------------------------- hints
  // A small list under the caret: what the word you are typing can turn into.
  // Tab takes the highlighted one, ↑/↓ move, Esc closes it.
  let hintBox = null;
  let hintItems = [];
  let hintIndex = 0;
  let hintFor = null; // { el, token }

  const ensureHintBox = () => {
    if (hintBox) return hintBox;
    hintBox = document.createElement('div');
    Object.assign(hintBox.style, {
      position: 'fixed', zIndex: '2147483647', display: 'none', minWidth: '160px', maxWidth: '320px',
      background: 'rgba(28,28,32,0.96)', color: '#f2f2f4', borderRadius: '8px', padding: '4px',
      font: '13px/1.35 system-ui, sans-serif', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    });
    hintBox.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep the caret in the text box
      const row = e.target.closest('[data-i]');
      if (row) acceptHint(Number(row.dataset.i));
    });
    document.body.appendChild(hintBox);
    return hintBox;
  };

  const hideHints = () => {
    if (hintBox) hintBox.style.display = 'none';
    hintItems = [];
    hintFor = null;
  };

  const renderHints = (rect) => {
    const box = ensureHintBox();
    box.replaceChildren();
    hintItems.forEach((h, i) => {
      const row = document.createElement('div');
      row.dataset.i = String(i);
      Object.assign(row.style, {
        display: 'flex', gap: '10px', alignItems: 'baseline', padding: '3px 8px', borderRadius: '5px',
        cursor: 'pointer', background: i === hintIndex ? 'rgba(110,160,255,0.28)' : 'transparent',
      });
      const key = document.createElement('code');
      key.textContent = h.key;
      Object.assign(key.style, { font: '12px ui-monospace, Consolas, monospace', color: '#b9c6ff' });
      const out = document.createElement('span');
      out.textContent = h.out;
      out.style.fontSize = '15px';
      row.append(key, out);
      if (h.note) {
        const note = document.createElement('span');
        note.textContent = h.note;
        Object.assign(note.style, { color: '#9a9aa2', fontSize: '11px', marginLeft: 'auto' });
        row.append(note);
      }
      box.append(row);
    });
    const foot = document.createElement('div');
    foot.textContent = 'Tab to use · ↑↓ to pick · Esc to close';
    Object.assign(foot.style, { color: '#8a8a92', fontSize: '11px', padding: '2px 8px 1px' });
    box.append(foot);
    box.style.display = 'block';
    const top = rect.bottom + 6;
    const height = box.offsetHeight;
    box.style.top = `${top + height > window.innerHeight ? rect.top - height - 6 : top}px`;
    box.style.left = `${Math.min(rect.left, window.innerWidth - box.offsetWidth - 8)}px`;
  };

  const updateHints = (el) => {
    if (!settings.enabled || !settings.hints) return hideHints();
    const info = caretInfo(el);
    const m = info && info.before.match(/(?:^|[^A-Za-z\\/])([\\/]?[A-Za-z]{2,})$/);
    if (!m) return hideHints();
    const token = m[1];
    const plainTok = token.replace(/^[\\/]/, '');
    const lower = plainTok.toLowerCase();
    const scored = [];
    for (const h of hintList) {
      const key = h.key.replace(/^[\\/]/, '');
      if (token.startsWith('\\') && !h.key.startsWith('\\')) continue;
      if (token.startsWith('/') !== h.key.startsWith('/')) continue;
      if (!key.toLowerCase().startsWith(lower)) continue;
      let score = key.length;
      if (key.startsWith(plainTok)) score -= 100; // same case first
      if (key === plainTok) score -= 100; // exact match first
      if (h.key.startsWith('\\') && !token.startsWith('\\')) score += 20; // LaTeX after plain words
      scored.push([score, h]);
    }
    if (!scored.length) return hideHints();
    scored.sort((a, b) => a[0] - b[0]);
    const seen = new Set();
    hintItems = [];
    for (const [, h] of scored) {
      const sig = h.key + h.out;
      if (seen.has(sig)) continue;
      seen.add(sig);
      hintItems.push(h);
      if (hintItems.length === 6) break;
    }
    hintIndex = 0;
    hintFor = { el, token };
    let rect;
    try {
      const r = info.sel.getRangeAt(0).cloneRange();
      if (info.node && info.offset > 0) r.setStart(info.node, info.offset - 1);
      rect = r.getBoundingClientRect();
    } catch (_) {}
    if (!rect || (!rect.width && !rect.height)) rect = el.getBoundingClientRect();
    renderHints(rect);
  };

  // What accepting a hint types: the symbol, or the start of a template (∫_, d/dx …).
  const hintInsert = (h) => {
    if (h.key === 'int_a^b') return '∫_';
    if (h.key.startsWith('sum_')) return '∑_';
    if (h.key.startsWith('prod_')) return '∏_';
    if (h.key.startsWith('lim_')) return 'lim_';
    if (h.note === 'stacked') return h.key;
    if (h.note === 'then Enter') return h.key + ' ';
    if (h.key === '/draw') return '/draw';
    return h.out;
  };

  const acceptHint = (i) => {
    const h = hintItems[i];
    const target = hintFor;
    hideHints();
    if (!h || !target) return;
    const info = caretInfo(target.el);
    if (!info || !info.before.endsWith(target.token)) return;
    replaceBeforeCaret(info, target.token.length, hintInsert(h));
    last = null;
  };

  // ---------------------------------------------------------------- events
  document.addEventListener('input', (e) => {
    if (applying) return;
    last = null;
    const el = e.target;
    if (!settings.enabled || !isEditable(el)) return hideHints();
    if (e.inputType !== 'insertText') {
      setTimeout(() => updateHints(el), 0);
      return;
    }
    // Let the editor finish handling the keystroke first.
    setTimeout(() => {
      convert(el, MT.findReplacement);
      if (e.data === '}' && drawBlock(el)) return;
      if (e.data === ' ' && drawLine(el, false)) return;
      updateHints(el);
    }, 0);
  }, true);

  window.addEventListener('keydown', (e) => {
    const el = document.activeElement;

    // The hint list, while it is open
    if (hintItems.length && hintFor && el === hintFor.el && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        acceptHint(hintIndex);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const n = hintItems.length;
        hintIndex = (hintIndex + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        const rect = hintBox.getBoundingClientRect();
        renderHints({ top: rect.top - 6, bottom: rect.top - 6, left: rect.left });
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        hideHints();
        return;
      }
    }

    // Backspace right after a replacement restores what you typed (√ -> sqrt).
    if (e.key === 'Backspace' && last && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const info = caretInfo(last.el);
      const undo = last;
      last = null;
      if (!info || !info.before.endsWith(undo.text)) return;
      e.preventDefault();
      e.stopPropagation();
      replaceBeforeCaret(info, undo.text.length, undo.original);
      return;
    }

    // Enter / Escape / Tab: convert a word that has no space after it yet (2pi -> 2π).
    if ((e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') && settings.enabled &&
        !e.isComposing && isEditable(el)) {
      last = null;
      hideHints();
      const info = caretInfo(el);
      if (e.key === 'Enter' && !e.shiftKey && info && /\/draw\s?$/.test(info.before) && drawLine(el, true)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && info && runCommandLine(el, info)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const rep = info && MT.findPendingWord(rules, info.before);
      if (rep && rep.stack && canStack(el, rep)) {
        // A stacked fraction/bound at the end: draw it and stop editing.
        e.preventDefault();
        e.stopPropagation();
        stack(el, info, rep, true);
        return;
      }
      convert(el, MT.findPendingWord);
      return;
    }

    // Alt+M toggles the auto-replace on and off.
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyM') {
      e.preventDefault();
      e.stopPropagation();
      settings.enabled = !settings.enabled;
      saveSettings();
      applySettings(settings);
      toast(settings.enabled ? 'Math typing: ON  (sqrt → √)' : 'Math typing: OFF');
    }
  }, true);

  // Clicking away from the text box: convert a trailing word too (inline only).
  document.addEventListener('focusout', (e) => {
    hideHints();
    if (!settings.enabled || applying || !isEditable(e.target)) return;
    last = null;
    const info = caretInfo(e.target);
    const rep = info && MT.findPendingWord(rules, info.before);
    if (rep && rep.stack) return; // stacked layouts need the caret; leave the text as typed
    convert(e.target, MT.findPendingWord);
  }, true);

  document.addEventListener('mousedown', (e) => {
    if (hintBox && !hintBox.contains(e.target)) hideHints();
  }, true);

  let toastEl = null;
  let toastTimer = 0;
  const toast = (msg, ms = 1600) => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      Object.assign(toastEl.style, {
        position: 'fixed', left: '50%', bottom: '80px', transform: 'translateX(-50%)',
        background: 'rgba(30,30,30,0.92)', color: '#fff', padding: '8px 14px', borderRadius: '8px',
        font: '14px system-ui, sans-serif', zIndex: '2147483647', pointerEvents: 'none',
      });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  };
})();
