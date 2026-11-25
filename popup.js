(() => {
  'use strict';
  const MT = globalThis.MathTyping;
  const ext = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = 'settings';
  const $ = (id) => document.getElementById(id);

  let settings = MT.normalizeSettings(null);
  const save = () => ext.storage.local.set({ [STORAGE_KEY]: settings });
  const catLabel = Object.fromEntries(MT.CATEGORIES.map((c) => [c.id, c.label]));
  const SHORT = {
    symbols: 'Operators', roots: 'Roots', deriv: 'd/dx', scripts: 'Exponents', fractions: 'Fractions', draw: '/draw',
    stacked: 'Stacked', blocks: 'Blocks', braces: 'Braces', greek: 'Greek', words: 'Words', sets: 'Sets',
    latex: 'LaTeX',
  };

  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };
  const copy = (btn, value, shown) => {
    navigator.clipboard.writeText(value).then(() => {
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = shown; }, 700);
    }).catch(() => {});
  };
  const switchEl = (checked, onChange) => {
    const input = el('input', { type: 'checkbox', checked });
    input.addEventListener('change', () => onChange(input.checked));
    return el('span', { className: 'switch' }, input, el('span', { className: 'track' }, el('span', { className: 'thumb' })));
  };

  // Tabs
  for (const btn of document.querySelectorAll('.tabs button')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b === btn);
      for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.id === btn.dataset.tab);
      if (btn.dataset.tab === 'sheet') $('search').focus();
    });
  }

  // ---------------------------------------------------------------- shortcuts list
  const TOOL_CATS = new Set(MT.CATEGORIES.filter((c) => c.group === 'tools').map((c) => c.id));
  const rows = MT.cheatSheet().filter((r) => !TOOL_CATS.has(r.cat));
  let chip = null;
  const renderChips = () => {
    const box = $('chips');
    box.replaceChildren();
    const cats = ['all', ...new Set(rows.map((r) => r.cat))];
    for (const c of cats) {
      const b = el('button', { textContent: c === 'all' ? 'All' : SHORT[c] || c, className: (chip || 'all') === c ? 'active' : '' });
      b.addEventListener('click', () => { chip = c === 'all' ? null : c; renderChips(); renderSheet(); });
      box.append(b);
    }
  };
  const renderSheet = () => {
    const q = $('search').value.trim().toLowerCase();
    const list = $('sheet-list');
    list.replaceChildren();
    const custom = settings.custom.map((c) => ({ cat: 'custom', type: c.from, get: c.to }));
    let lastCat = null;
    for (const r of [...custom, ...rows]) {
      if (chip && r.cat !== chip) continue;
      const label = r.cat === 'custom' ? 'My shortcuts' : catLabel[r.cat];
      if (q && !`${r.type} ${r.get} ${label}`.toLowerCase().includes(q)) continue;
      if (r.cat !== lastCat) {
        list.append(el('h3', { textContent: label }));
        lastCat = r.cat;
      }
      const sym = r.get.split(/\s{2}|\s\(/)[0];
      const out = el('button', { className: 'out', textContent: r.get, title: `Copy ${sym}` });
      out.addEventListener('click', () => copy(out, sym, r.get));
      const off = r.cat !== 'custom' && !settings.categories[r.cat];
      list.append(el('div', { className: 'item' + (off ? ' off' : '') }, el('code', { textContent: r.type }), out));
    }
    if (!list.children.length) list.append(el('p', { className: 'empty', textContent: 'No matches.' }));
  };

  // ---------------------------------------------------------------- tools
  const TOOLS = [
    { id: 'draw', icon: '½', name: 'Draw equations',
      text: 'Write the line as you like, then type /draw at its end (and space or Enter). // makes a fraction, {…} groups a part.',
      examples: ['y = x//{x+3} + 4 /draw', '{a+b}//{c//d} = 1//2 /draw', 'int_0^1 x^2 dx = 1//3 /draw', 'sum_{i=1}^n i = n(n+1)//2 /draw', 'd/dx e^{x//2} /draw'] },
    { id: 'cas', icon: '∑', name: 'Calculator',
      text: 'Start the line with a command and press Enter: the answer is written after it.',
      examples: ['/calc 2^10/3', '/diff x^3 sin(x)', '/integrate x^2 from 0 to 3', '/solve x^2-5x+6=0', '/factor x^2-5x+6', '/simplify (x^2-1)/(x-1)'] },
    { id: 'plot', icon: '〜', name: 'Graphs',
      text: 'Draws a rough graph under the line. Equations with y work too.',
      examples: ['/plot sin(x)', '/plot sin(x), cos(x) from -pi to pi', '/plot x^2+y^2=9', '/plot x^2-6x+y^2+t=0 where t=5'] },
    { id: 'shapes', icon: '△', name: 'Shapes',
      text: 'Draws the shape with its sides and angles marked.',
      examples: ['/draw triangle 3 4 5', '/draw right triangle 3 4', '/draw circle 3', '/draw rectangle 3 by 5', '/draw hexagon 2', '/draw angle 40'] },
  ];
  const renderTools = () => {
    const box = $('tool-cards');
    box.replaceChildren();
    for (const t of TOOLS) {
      const on = !!settings.categories[t.id];
      const examples = el('div', { className: 'examples' });
      for (const ex of t.examples) {
        const b = el('button', { textContent: ex, title: 'Copy' });
        b.addEventListener('click', () => copy(b, ex, ex));
        examples.append(b);
      }
      const sw = switchEl(on, (v) => { settings.categories[t.id] = v; save(); renderTools(); renderCategories(); });
      box.append(el('div', { className: 'card' + (on ? '' : ' off') },
        el('div', { className: 'card-head' }, el('span', { className: 'icon', textContent: t.icon }), el('strong', { textContent: t.name }), sw),
        el('p', { textContent: t.text }), examples));
    }
  };

  // ---------------------------------------------------------------- custom shortcuts
  const renderCustom = () => {
    const ul = $('custom-list');
    ul.replaceChildren();
    settings.custom.forEach((c, i) => {
      const del = el('button', { className: 'remove', textContent: '×', title: 'Remove' });
      del.addEventListener('click', () => {
        settings.custom.splice(i, 1);
        save();
        render();
      });
      ul.append(el('li', { className: 'item' }, el('code', { textContent: c.from }), el('span', { className: 'out', textContent: c.to }), del));
    });
    if (!settings.custom.length) ul.append(el('li', { className: 'empty', textContent: 'None yet. Try eps → ε.' }));
  };
  $('custom-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const from = $('custom-from').value.trim();
    const to = $('custom-to').value;
    if (!from || !to) return;
    settings.custom = settings.custom.filter((c) => c.from !== from);
    settings.custom.push({ from, to });
    save();
    $('custom-from').value = '';
    $('custom-to').value = '';
    $('custom-from').focus();
    render();
  });

  // ---------------------------------------------------------------- settings
  const renderCategories = () => {
    const box = $('categories');
    box.replaceChildren();
    for (const c of MT.CATEGORIES) {
      if (c.group === 'tools' || c.id === 'draw') continue; // on the Tools tab
      const sw = switchEl(!!settings.categories[c.id], (v) => {
        settings.categories[c.id] = v;
        save();
        renderSheet();
      });
      box.append(el('label', { className: 'row' }, el('span', { textContent: c.label }), sw));
    }
  };
  const OPTIONS = [['opt-hints', 'hints'], ['opt-fonts', 'fonts'], ['opt-cursorKick', 'cursorKick'], ['opt-systemCursor', 'systemCursor']];
  for (const [id, key] of OPTIONS) {
    $(id).addEventListener('change', () => {
      settings[key] = $(id).checked;
      save();
    });
  }

  $('enabled').addEventListener('change', () => {
    settings.enabled = $('enabled').checked;
    save();
    renderStatus();
  });
  $('search').addEventListener('input', renderSheet);

  const renderStatus = () => {
    $('status').textContent = settings.enabled ? 'On for tldraw.com' : 'Off: nothing changes while you type';
  };

  const render = () => {
    $('enabled').checked = settings.enabled;
    for (const [id, key] of OPTIONS) $(id).checked = settings[key];
    renderStatus();
    renderChips();
    renderSheet();
    renderTools();
    renderCustom();
    renderCategories();
  };

  try { $('version').textContent = `v${ext.runtime.getManifest().version}`; } catch (_) {}

  ext.storage.local.get(STORAGE_KEY).then((got) => {
    settings = MT.normalizeSettings(got[STORAGE_KEY]);
    render();
  });
  // Alt+M on the page while the popup is open
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    settings = MT.normalizeSettings(changes[STORAGE_KEY].newValue);
    render();
  });

  // Firefox treats MV3 site access as optional: without it the content script never runs.
  const ORIGINS = { origins: ['https://tldraw.com/*', 'https://*.tldraw.com/*'] };
  const checkAccess = async () => {
    let ok = true;
    try { ok = await ext.permissions.contains(ORIGINS); } catch (_) {}
    $('access').hidden = ok;
  };
  $('grant').addEventListener('click', async () => {
    try { await ext.permissions.request(ORIGINS); } catch (_) {}
    checkAccess();
  });
  checkAccess();

  render();
  $('search').focus();
})();
