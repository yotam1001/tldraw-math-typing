// tldraw Math Typing: runs in the page (world: MAIN) so it can use tldraw's `window.editor`.
// The content script asks it, through DOM events, to draw things as real shapes:
//   fraction  a stacked fraction where the caret is, then carry on typing to the right
//   bigop     ∫ ∑ ∏ lim with bounds above and below
//   block     a whole equation //{…} with nested fractions, exponents and roots
//   figure    a graph or a geometric shape, under the current text box
(() => {
  'use strict';
  // When the add-on updates, Zen puts the new version into open tabs, but the old page script
  // stays running there. Take its place so only this version answers.
  if (typeof window.__mathTypingPage === 'function') {
    document.removeEventListener('mathtyping:stack', window.__mathTypingPage);
  }
  document.documentElement.dataset.mathtypingPage = '1';

  const doc = (text) => ({
    type: 'doc',
    content: [text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }],
  });
  const plain = (rt) => (rt?.content || [])
    .map((p) => (p.content || []).map((n) => n.text || '').join('')).join('\n');
  const newId = () => 'shape:mt' + Math.random().toString(36).slice(2, 12);
  // Fractional indices for line-shape points: a0…az, then b10, b11 …
  const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const indexKey = (i) => (i < 62 ? 'a' + DIGITS[i] : 'b' + DIGITS[Math.floor(i / 62)] + DIGITS[i % 62]);

  // The caret in page coordinates: x at the caret, y at the middle of its line.
  const caretPoint = (editor) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;
    let rect = null;
    let x = null;
    if (node && node.nodeType === Node.TEXT_NODE && offset > 0) {
      const r = document.createRange();
      r.setStart(node, offset - 1);
      r.setEnd(node, offset);
      rect = r.getBoundingClientRect();
      x = rect.right;
    } else if (node) {
      const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      rect = el.getBoundingClientRect();
      x = rect.left;
    }
    if (!rect || (!rect.width && !rect.height)) return null;
    return editor.screenToPage({ x, y: (rect.top + rect.bottom) / 2 });
  };

  // Drawing helpers bound to one editor and one text style.
  const kit = (editor, style) => {
    const { color, size, font, scale } = style;
    const base = { color, size, font, scale, autoSize: true, textAlign: 'start' };
    const created = [];
    const bounds = (sid) => editor.getShapePageBounds(sid);
    const text = (t, mul = 1, opts = {}) => {
      const sid = newId();
      editor.createShape({
        id: sid, type: 'text', x: 0, y: 0,
        props: { ...base, color: opts.color || color, scale: scale * mul, richText: doc(t) },
      });
      created.push(sid);
      return sid;
    };
    const moveTo = (sid, x, y) => {
      const s = editor.getShape(sid);
      const b = bounds(sid);
      editor.updateShape({ id: sid, type: s.type, x: s.x + (x - b.x), y: s.y + (y - b.y) });
    };
    // A line through page points.
    const line = (pts, opts = {}) => {
      if (pts.length < 2) return null;
      const sid = newId();
      const [x0, y0] = pts[0];
      const points = {};
      pts.forEach(([x, y], i) => {
        const id = indexKey(i);
        points[id] = { id, index: id, x: x - x0, y: y - y0 };
      });
      editor.createShape({
        id: sid, type: 'line', x: x0, y: y0,
        props: {
          color: opts.color || color, scale, size: opts.thin ? 's' : 'm',
          dash: font === 'draw' ? 'draw' : 'solid', spline: opts.smooth ? 'cubic' : 'line', points,
        },
      });
      created.push(sid);
      return sid;
    };
    const ellipse = (x, y, w, h, opts = {}) => {
      const sid = newId();
      editor.createShape({
        id: sid, type: 'geo', x, y,
        props: {
          geo: 'ellipse', w, h, color: opts.color || color, fill: opts.fill || 'none', scale,
          size: opts.thin ? 's' : 'm', dash: font === 'draw' ? 'draw' : 'solid',
        },
      });
      created.push(sid);
      return sid;
    };
    const probe = text('M', 1);
    const lineH = bounds(probe).h;
    editor.deleteShapes([probe]);
    created.pop();
    return { editor, base, created, bounds, text, moveTo, line, ellipse, lineH };
  };

  // Leaves the text box. Deletes it when the command left it empty.
  const leaveEditing = (editor, id) => {
    editor.setEditingShape(null);
    editor.setCurrentTool('select');
    const s = editor.getShape(id);
    if (s && !plain(s.props.richText).trim()) {
      editor.deleteShapes([id]);
      return true;
    }
    return false;
  };

  // Starts a new text box at (x, centre y) and puts the caret in it.
  const carryOn = (k, x, cy, after) => {
    const { editor } = k;
    const cont = k.text('', 1);
    k.created.pop();
    const cb = k.bounds(cont);
    k.moveTo(cont, x, cy - cb.h / 2);
    editor.select(cont);
    editor.setEditingShape(cont);
    if (after) setTimeout(() => { document.execCommand('insertText', false, after); }, 60);
  };

  // ---------------------------------------------------------------- stacked fractions and bounds
  const buildStack = (editor, req, id, p) => {
    const k = kit(editor, editor.getShape(id).props);
    leaveEditing(editor, id);
    const { lineH } = k;
    const gap = lineH * 0.12;
    const left = p.x + gap;
    const cy = p.y;
    let right = left;

    if (req.type === 'fraction') {
      const num = k.text(req.num, 0.85);
      const den = k.text(req.den, 0.85);
      const nb = k.bounds(num);
      const db = k.bounds(den);
      const w = Math.max(nb.w, db.w) + lineH * 0.2;
      k.moveTo(num, left + (w - nb.w) / 2, cy - nb.h * 0.94);
      k.moveTo(den, left + (w - db.w) / 2, cy - db.h * 0.06);
      k.line([[left, cy], [left + w, cy]], { thin: true });
      right = left + w;
    } else {
      const mul = req.op === 'lim' ? 1 : /[∑∏]/.test(req.op) ? 1.5 : 1.8;
      const op = k.text(req.op, mul);
      let ob = k.bounds(op);
      k.moveTo(op, left, cy - ob.h / 2);
      ob = k.bounds(op);
      const ocx = ob.x + ob.w / 2;
      let minX = ob.x;
      right = ob.x + ob.w;
      const place = (t, above) => {
        if (!t) return;
        const sid = k.text(t, 0.6);
        const b = k.bounds(sid);
        const tuck = req.op === 'lim' ? 0.22 : 0.1;
        const y = above ? ob.y - b.h + ob.h * tuck : ob.y + ob.h - ob.h * tuck;
        k.moveTo(sid, ocx - b.w / 2, y);
        minX = Math.min(minX, ocx - b.w / 2);
        right = Math.max(right, ocx + b.w / 2);
      };
      place(req.upper, true);
      place(req.lower, false);
      if (minX < left) {
        const shift = left - minX;
        for (const sid of k.created) {
          const s = editor.getShape(sid);
          editor.updateShape({ id: sid, type: s.type, x: s.x + shift });
        }
        right += shift;
      }
    }
    return { k, right, cy };
  };

  // ---------------------------------------------------------------- equation blocks
  // Boxes measure themselves around a horizontal axis: w, up (above), down (below).
  const buildBlock = (editor, req, id, p) => {
    const k = kit(editor, editor.getShape(id).props);
    leaveEditing(editor, id);
    const { lineH } = k;

    const textBox = (s, mul) => {
      if (!s.trim()) {
        const w = lineH * mul * 0.28 * s.length;
        return { w, up: 0, down: 0, draw() {} };
      }
      const sid = k.text(s, mul);
      const b = k.bounds(sid);
      return { w: b.w, up: b.h / 2, down: b.h / 2, draw(x, axis) { k.moveTo(sid, x, axis - b.h / 2); } };
    };

    const rowBox = (row, mul) => {
      // merge neighbouring text into one piece
      const items = [];
      for (const it of row.items) {
        const last = items[items.length - 1];
        if (it.k === 'text' && last && last.k === 'text') last.s += it.s;
        else items.push(it.k === 'text' ? { ...it } : it);
      }
      const parts = [];
      let prev = null;
      for (const it of items) {
        if (it.k === 'sup' || it.k === 'sub') {
          const b = rowBox(it.row, Math.max(0.5, mul * 0.65));
          const ref = prev || { up: lineH * mul * 0.5, down: lineH * mul * 0.5 };
          const shift = it.k === 'sup' ? -(ref.up * 0.6) : ref.down * 0.5;
          parts.push({ box: b, shift });
          prev = null;
          continue;
        }
        const b = nodeBox(it, mul);
        parts.push({ box: b, shift: 0 });
        prev = b;
      }
      let w = 0;
      let up = 0;
      let down = 0;
      for (const { box, shift } of parts) {
        w += box.w;
        up = Math.max(up, box.up - shift);
        down = Math.max(down, box.down + shift);
      }
      return {
        w, up, down,
        draw(x, axis) {
          let cx = x;
          for (const { box, shift } of parts) {
            box.draw(cx, axis + shift);
            cx += box.w;
          }
        },
      };
    };

    const nodeBox = (n, mul) => {
      if (n.k === 'text') return textBox(n.s, mul);
      if (n.k === 'group' || n.k === 'row') return rowBox(n.k === 'row' ? n : n.row, mul);
      if (n.k === 'frac') {
        const m2 = Math.max(0.55, mul * 0.9);
        const num = rowBox(n.num, m2);
        const den = rowBox(n.den, m2);
        const gap = lineH * mul * 0.06;
        const pad = lineH * mul * 0.12;
        const w = Math.max(num.w, den.w) + pad * 2;
        return {
          w: w + pad, up: num.up + num.down + gap, down: den.up + den.down + gap,
          draw(x, axis) {
            k.line([[x + pad / 2, axis], [x + pad / 2 + w, axis]], { thin: true });
            num.draw(x + pad / 2 + (w - num.w) / 2, axis - gap - num.down);
            den.draw(x + pad / 2 + (w - den.w) / 2, axis + gap + den.up);
          },
        };
      }
      if (n.k === 'bigop') {
        const opMul = n.op === 'lim' ? mul : /[∑∏]/.test(n.op) ? mul * 1.5 : mul * 1.7;
        const op = textBox(n.op, opMul);
        const small = Math.max(0.45, mul * 0.6);
        const lo = n.lower ? rowBox(n.lower, small) : null;
        const hi = n.upper ? rowBox(n.upper, small) : null;
        const H = op.up + op.down;
        const tuck = H * (n.op === 'lim' ? 0.2 : 0.1);
        const pad = lineH * mul * 0.1;
        const w = Math.max(op.w, lo ? lo.w : 0, hi ? hi.w : 0) + pad * 2;
        return {
          w,
          up: op.up + (hi ? hi.up + hi.down - tuck : 0),
          down: op.down + (lo ? lo.up + lo.down - tuck : 0),
          draw(x, axis) {
            const cx = x + w / 2;
            op.draw(cx - op.w / 2, axis);
            if (hi) hi.draw(cx - hi.w / 2, axis - op.up + tuck - hi.down);
            if (lo) lo.draw(cx - lo.w / 2, axis + op.down - tuck + lo.up);
          },
        };
      }
      if (n.k === 'paren' || n.k === 'sqrt') {
        const inner = rowBox(n.row, mul);
        const h = Math.max(inner.up + inner.down, lineH * mul);
        const grow = Math.max(1, h / (lineH * mul));
        if (n.k === 'paren') {
          const l = textBox('(', mul * grow);
          const r = textBox(')', mul * grow);
          return {
            w: l.w + inner.w + r.w, up: Math.max(inner.up, l.up), down: Math.max(inner.down, l.down),
            draw(x, axis) {
              const mid = axis + (inner.down - inner.up) / 2;
              l.draw(x, mid);
              inner.draw(x + l.w, axis);
              r.draw(x + l.w + inner.w, mid);
            },
          };
        }
        const sign = textBox(n.root || '√', mul * grow);
        const over = lineH * mul * 0.08;
        return {
          w: sign.w + inner.w + lineH * mul * 0.1, up: inner.up + over * 2, down: Math.max(inner.down, sign.down),
          draw(x, axis) {
            const mid = axis + (inner.down - inner.up) / 2;
            sign.draw(x, mid);
            inner.draw(x + sign.w, axis);
            const top = axis - inner.up - over;
            k.line([[x + sign.w * 0.82, top], [x + sign.w + inner.w + lineH * mul * 0.05, top]], { thin: true });
          },
        };
      }
      return textBox('', mul);
    };

    const box = rowBox(req.tree, 1);
    const left = p.x + lineH * 0.1;
    box.draw(left, p.y);
    return { k, right: left + box.w, cy: p.y };
  };

  // ---------------------------------------------------------------- figures (graphs and shapes)
  const buildFigure = (editor, req, id) => {
    const shape = editor.getShape(id);
    const sb = editor.getShapePageBounds(id);
    const k = kit(editor, shape.props);
    const removed = leaveEditing(editor, id);
    const f = req.figure;
    const { x0, x1, y0, y1 } = f.bounds;
    const [W, H] = f.size.map((v) => v * (shape.props.scale || 1));
    let kx = W / (x1 - x0 || 1);
    let ky = H / (y1 - y0 || 1);
    if (f.equal) kx = ky = Math.min(kx, ky);
    const left = sb.x + k.lineH * 0.3;
    const top = removed ? sb.y : sb.y + sb.h + k.lineH * 0.6;
    const pad = k.lineH * 0.6; // room for labels above the top edge
    const map = (x, y) => [left + (x - x0) * kx, top + pad + (y1 - y) * ky];

    for (const it of f.items) {
      if (it.kind === 'poly') {
        const pts = it.pts.map(([x, y]) => map(x, y));
        if (it.closed) pts.push(pts[0]);
        k.line(pts, { color: it.color, smooth: it.smooth, thin: it.thin });
        if (it.arrow) {
          const [ax, ay] = pts[pts.length - 1];
          const [bx, by] = pts[pts.length - 2];
          const ang = Math.atan2(ay - by, ax - bx);
          const s = k.lineH * 0.25;
          k.line([[ax - s * Math.cos(ang - 0.45), ay - s * Math.sin(ang - 0.45)], [ax, ay],
            [ax - s * Math.cos(ang + 0.45), ay - s * Math.sin(ang + 0.45)]], { color: it.color, thin: true });
        }
      } else if (it.kind === 'tick') {
        const [x, y] = map(it.x, it.y);
        const s = k.lineH * 0.12;
        k.line(it.dir === 'x' ? [[x, y - s], [x, y + s]] : [[x - s, y], [x + s, y]], { color: 'grey', thin: true });
      } else if (it.kind === 'ellipse') {
        const [ex, ey] = map(it.cx - it.rx, it.cy + it.ry);
        k.ellipse(ex, ey, it.rx * 2 * kx, it.ry * 2 * ky, { color: it.color });
      } else if (it.kind === 'dot') {
        const [x, y] = map(it.x, it.y);
        const r = k.lineH * 0.1;
        k.ellipse(x - r, y - r, r * 2, r * 2, { fill: 'fill', thin: true, color: it.color });
      } else if (it.kind === 'text') {
        const sid = k.text(it.text, it.scale || 0.6, { color: it.color });
        const b = k.bounds(sid);
        let [x, y] = map(it.x, it.y);
        x += it.dx || 0;
        y += it.dy || 0;
        const ax = it.align === 'left' ? x : it.align === 'right' ? x - b.w : x - b.w / 2;
        const ay = it.valign === 'top' ? y : it.valign === 'bottom' ? y - b.h : y - b.h / 2;
        k.moveTo(sid, ax, ay);
      }
    }
    if (k.created.length > 1) editor.groupShapes(k.created, { select: true });
    else editor.select(...k.created);
    return true;
  };

  const handle = (editor, req) => {
    const id = editor.getEditingShapeId();
    const shape = id && editor.getShape(id);
    if (!shape || shape.type !== 'text') return false;
    editor.markHistoryStoppingPoint('math typing');
    if (req.type === 'figure') return buildFigure(editor, req, id);
    const p = caretPoint(editor);
    if (!p) return false;
    let res;
    if (req.type === 'fraction' || req.type === 'bigop') res = buildStack(editor, req, id, p);
    else if (req.type === 'block') res = buildBlock(editor, req, id, p);
    else return false;
    const { k, right, cy } = res;
    if (k.created.length > 1) editor.groupShapes(k.created, { select: false });
    if (req.finish) {
      editor.selectNone();
      return true;
    }
    carryOn(k, right + k.lineH * 0.12, cy, req.after);
    return true;
  };

  // tldraw's editor. The anonymous board puts it on window.editor; signed-in files may not,
  // so otherwise it is found through React's internals on the canvas element.
  const isEditor = (v) => !!v && typeof v === 'object' && typeof v.createShape === 'function' &&
    typeof v.getEditingShapeId === 'function' && typeof v.getShapePageBounds === 'function';
  let found = null;
  const findEditor = () => {
    if (isEditor(window.editor)) return window.editor;
    if (isEditor(window.app)) return window.app;
    if (found && !found.isDisposed) return found;
    const start = document.activeElement?.closest?.('.tl-container') ? document.activeElement : document.querySelector('.tl-canvas, .tl-container');
    for (let el = start; el; el = el.parentElement) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      if (!key) continue;
      for (let f = el[key], i = 0; f && i < 400; f = f.return, i++) {
        for (const v of [f.memoizedProps?.editor, f.memoizedProps?.value, f.stateNode?.editor]) {
          if (isEditor(v)) { found = v; return v; }
        }
        // hooks: useState/useRef holding the editor
        for (let h = f.memoizedState, j = 0; h && typeof h === 'object' && j < 50; h = h.next, j++) {
          const v = h.memoizedState;
          if (isEditor(v)) { found = v; return v; }
          if (v && isEditor(v.current)) { found = v.current; return v.current; }
        }
      }
      break;
    }
    return null;
  };

  const onStack = (ev) => {
    let req;
    try { req = JSON.parse(ev.detail); } catch (_) { return; }
    let ok = false;
    let reason = '';
    try {
      const editor = findEditor();
      if (!editor) reason = "couldn't find tldraw's editor on this page";
      else ok = handle(editor, req);
      if (editor && !ok) reason = 'the caret is not in a plain text box';
    } catch (err) {
      reason = String(err && err.message || err);
      console.warn('[math typing] could not draw it', err);
    }
    document.dispatchEvent(new CustomEvent('mathtyping:stack-done', { detail: JSON.stringify({ ok, reason, nonce: req.nonce }) }));
  };
  window.__mathTypingPage = onStack;
  document.addEventListener('mathtyping:stack', onStack);
})();
