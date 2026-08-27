// 회로 탭: 설치할 면(뒷면 안쪽 / 옆면 둘레 띠)을 골라 평면에서 회로를 만들고,
// [입체로 보기]로 조립된 모습을 확인한다. 전지는 화면 아래 고정 — 전선(+,−) 끝만 끌어다 붙인다.
// 홀더를 "어디에 붙일지"는 조립 순서 탭에서 다룬다.
import { config, work, addLog, touch, readOnly } from './state.js';
import { renderLogList } from './case3d.js';

const $ = id => document.getElementById(id);

export const MAGIC = {
  none: { label: '칠하지 않음', f: 1.0, rgb: [255, 250, 230] },
  yellow: { label: '노랑', f: 0.75, rgb: [255, 230, 90] },
  green: { label: '초록', f: 0.60, rgb: [120, 255, 140] },
  red: { label: '빨강', f: 0.55, rgb: [255, 110, 110] },
  blue: { label: '파랑', f: 0.45, rgb: [110, 160, 255] },
  black: { label: '검정', f: 0.02, rgb: [80, 80, 80] },
};

let cv, ctx, tool = 'select';
let view = 'back';           // 'back' | 'band'
let view3d = false;
let Z = 16;
let drawingTape = null;
let selected = null;
let dragOff = null;
let cursor = null;
let solveResult = null;
let pulse = 0, pulseTimer = null;

function num(v) { const x = parseFloat(v); return isFinite(x) && x > 0 ? x : null; }
function dims() {
  const p = work.caseTab.pieces;
  return {
    bw: num(p.back.w) || 25, bh: num(p.back.h) || 10,
    sw: num(p.side.w) || 4.5, sh: num(p.side.h) || 10,
    tw: num(p.topbot.w) || 24, td: num(p.topbot.h) || 4.5,
  };
}
function bandLen(d) { return 2 * (d.tw + d.sh); }
function surfSize(surf) {
  const d = dims();
  return surf === 'back' ? { w: d.bw, h: d.bh } : { w: bandLen(d), h: d.td };
}
// 전지 블록 (면 아래 고정)
function battery() {
  const s = surfSize(view);
  return { x: 0.3, y: s.h + 1.0, w: 5.2, h: 1.7, tp: { x: 1.4, y: s.h + 1.0 }, tm: { x: 4.4, y: s.h + 1.0 } };
}

const MARGIN = 0.8;
function toCm(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (cv.width / r.width) / Z - MARGIN, y: (e.clientY - r.top) * (cv.height / r.height) / Z - MARGIN };
}
const snap = v => Math.round(v * 2) / 2;
function clampPt(p, surf) {
  const s = surfSize(surf);
  return { x: Math.min(Math.max(p.x, 0), s.w), y: Math.min(Math.max(p.y, 0), s.h) };
}
function clampPart(p, dir, surf) {
  const s = surfSize(surf);
  const vert = dir % 2 === 0;
  const ix = vert ? 0.4 : 1, iy = vert ? 1 : 0.4;
  return {
    x: Math.min(Math.max(p.x, ix), Math.max(ix, s.w - ix)),
    y: Math.min(Math.max(p.y, iy), Math.max(iy, s.h - iy)),
  };
}
function legs(o) {
  const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][o.dir || 0];
  return { a: { x: o.x + d[0], y: o.y + d[1] }, k: { x: o.x - d[0], y: o.y - d[1] } };
}
function distSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function distTape(p, tape, shift = 0) {
  let d = Infinity;
  for (let i = 0; i < tape.pts.length - 1; i++)
    d = Math.min(d, distSeg({ x: p.x - shift, y: p.y }, tape.pts[i], tape.pts[i + 1]));
  return d;
}
function tapeLen(tape) {
  let L = 0;
  for (let i = 0; i < tape.pts.length - 1; i++) L += Math.hypot(tape.pts[i + 1].x - tape.pts[i].x, tape.pts[i + 1].y - tape.pts[i].y);
  return L;
}
function segSegClose(a1, a2, b1, b2, r) {
  // ponytail: 표본점 근사 — 0.5cm 격자 스냅이라 충분
  const at = t => ({ x: a1.x + (a2.x - a1.x) * t, y: a1.y + (a2.y - a1.y) * t });
  for (const t of [0, 0.25, 0.5, 0.75, 1]) if (distSeg(at(t), b1, b2) < r) return true;
  const bt = t => ({ x: b1.x + (b2.x - b1.x) * t, y: b1.y + (b2.y - b1.y) * t });
  for (const t of [0.25, 0.5, 0.75]) if (distSeg(bt(t), a1, a2) < r) return true;
  return false;
}
function tapesTouch(t1, t2, wrapL) {
  const shifts = t1.surf === 'band' && wrapL ? [0, wrapL, -wrapL] : [0];
  for (const s of shifts)
    for (let i = 0; i < t1.pts.length - 1; i++)
      for (let j = 0; j < t2.pts.length - 1; j++) {
        const p1 = { x: t1.pts[i].x + s, y: t1.pts[i].y }, p2 = { x: t1.pts[i + 1].x + s, y: t1.pts[i + 1].y };
        if (segSegClose(p1, p2, t2.pts[j], t2.pts[j + 1], 0.55)) return true;
      }
  return false;
}
function normalize(C) {
  C.resistors = C.resistors || [];
  C.tapes.forEach(t => t.surf = t.surf || 'back');
  C.leds.forEach(l => l.surf = l.surf || 'back');
  C.resistors.forEach(r => r.surf = r.surf || 'back');
  if (!C.holder || !C.holder.wires) C.holder = { wires: [{ surf: 'dock' }, { surf: 'dock' }] };
  C.holder.wires.forEach(w => { if (w.surf !== 'back' && w.surf !== 'band') w.surf = 'dock'; });
}

// ---------- 회로 해석 (교육용 근사: I = (Vs − k·Vf) / (Rint + R저항합)) ----------
function solve() {
  const C = work.circuit;
  normalize(C);
  const d = dims(), wrapL = bandLen(d);
  const n = C.tapes.length;
  const P = n, M = n + 1;
  const parent = Array.from({ length: n + 2 }, (_, i) => i);
  const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a, b) => { parent[find(a)] = find(b); };

  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (C.tapes[i].surf === C.tapes[j].surf && tapesTouch(C.tapes[i], C.tapes[j], wrapL)) union(i, j);

  const res = { plus: -1, minus: -1, short: false, wiresOff: 0,
    lit: {}, tapeComp: C.tapes.map((_, i) => find(i)), energizedPlus: new Set(), energizedMinus: new Set(),
    hasBlockedSeries: false, dimSeries: false, noResistorLit: false, anyLit: false };

  const [wp, wm] = C.holder.wires;
  res.wiresOff = (wp.surf === 'dock' ? 1 : 0) + (wm.surf === 'dock' ? 1 : 0);

  const tapeNear = (p, surf) => {
    for (let i = 0; i < n; i++) {
      if (C.tapes[i].surf !== surf) continue;
      const shifts = surf === 'band' ? [0, wrapL, -wrapL] : [0];
      for (const s of shifts) if (distTape(p, C.tapes[i], s) < 0.6) return i;
    }
    return -1;
  };
  if (wp.surf !== 'dock') { const t = tapeNear(wp, wp.surf); if (t >= 0) union(P, t); }
  if (wm.surf !== 'dock') { const t = tapeNear(wm, wm.surf); if (t >= 0) union(M, t); }
  if (wp.surf !== 'dock' && wp.surf === wm.surf && Math.hypot(wp.x - wm.x, wp.y - wm.y) < 0.7) union(P, M);

  const nodeOf = (p, surf) => {
    const t = tapeNear(p, surf);
    if (t >= 0) return find(t);
    if (wp.surf === surf && Math.hypot(p.x - wp.x, p.y - wp.y) < 0.7) return find(P);
    if (wm.surf === surf && Math.hypot(p.x - wm.x, p.y - wm.y) < 0.7) return find(M);
    return -1;
  };

  const edges = [];
  C.leds.forEach((l, i) => {
    const g = legs(l);
    edges.push({ type: 'led', i, a: nodeOf(g.a, l.surf), k: nodeOf(g.k, l.surf) });
  });
  C.resistors.forEach((r, i) => {
    const g = legs(r);
    edges.push({ type: 'res', i, a: nodeOf(g.a, r.surf), k: nodeOf(g.k, r.surf) });
  });

  res.plus = find(P); res.minus = find(M);
  if (res.plus === res.minus) { res.short = true; return res; }

  const reach = (start, fwd) => {
    const seen = new Set();
    if (start < 0) return seen;
    const st = [start];
    while (st.length) {
      const c = st.pop();
      if (seen.has(c)) continue;
      seen.add(c);
      for (const e of edges) {
        if (e.a < 0 || e.k < 0) continue;
        if (e.type === 'res') {
          if (e.a === c) st.push(e.k);
          if (e.k === c) st.push(e.a);
        } else {
          if (fwd && e.a === c) st.push(e.k);
          if (!fwd && e.k === c) st.push(e.a);
        }
      }
    }
    return seen;
  };
  res.energizedPlus = reach(res.plus, true);
  res.energizedMinus = reach(res.minus, false);

  const paths = [];
  const dfs = (c, used, ledList, nRes) => {
    if (c === res.minus) { if (ledList.length) paths.push({ leds: [...ledList], nRes }); return; }
    if (paths.length > 300) return;
    for (const e of edges) {
      if (e.a < 0 || e.k < 0 || used.has(e.type + e.i)) continue;
      let next = null;
      if (e.type === 'led' && e.a === c) next = e.k;
      if (e.type === 'res') { if (e.a === c) next = e.k; else if (e.k === c) next = e.a; }
      if (next === null) continue;
      used.add(e.type + e.i);
      if (e.type === 'led') ledList.push(e.i);
      dfs(next, used, ledList, nRes + (e.type === 'res' ? 1 : 0));
      if (e.type === 'led') ledList.pop();
      used.delete(e.type + e.i);
    }
  };
  if (res.plus >= 0 && res.minus >= 0) dfs(res.plus, new Set(), [], 0);

  const conducting = [];
  for (const p of paths) {
    const k = p.leds.length;
    const I = (config.voltage - k * config.vf) / (config.rint + config.resistorOhm * p.nRes) * 1000;
    if (I <= 0.5) { if (k >= 2) res.hasBlockedSeries = true; continue; }
    if (k >= 2) res.dimSeries = true;
    conducting.push({ leds: p.leds, nRes: p.nRes, I: Math.min(I, 25) });
  }
  const total = conducting.reduce((a, p) => a + p.I, 0);
  const scale = total > config.imax ? config.imax / total : 1;
  for (const p of conducting) {
    const b = Math.min(1, p.I * scale / 20);
    for (const i of p.leds) {
      const f = (MAGIC[C.leds[i].color || 'none'] || MAGIC.none).f;
      res.lit[i] = Math.max(res.lit[i] || 0, b * f);
      if (p.nRes === 0) res.noResistorLit = true;
    }
  }
  res.anyLit = Object.keys(res.lit).length > 0;
  return res;
}

// ---------- 입체(조립된 모습) 그리기 — 조립 순서 탭에서도 재사용 ----------
function to3D(pt, surf, d) {
  if (surf === 'back') return { X: pt.x, Y: d.bh - pt.y, Z: 0.15 };
  const t1 = d.tw, t2 = d.tw + d.sh, t3 = 2 * d.tw + d.sh, L = bandLen(d);
  const u = ((pt.x % L) + L) % L, Zv = 0.3 + pt.y;
  if (u < t1) return { X: 0.5 + u, Y: d.bh - 0.15, Z: Zv };
  if (u < t2) return { X: d.bw - 0.15, Y: d.bh - (u - t1), Z: Zv };
  if (u < t3) return { X: 0.5 + (t3 - u), Y: 0.15, Z: Zv };
  return { X: 0.15, Y: u - t3, Z: Zv };
}
function makeProj(d, rx, ry, rw, rh) {
  const a = -0.62, b = 0.40;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const depth = d.td + 0.5;
  const S3 = Math.min(rw / (d.bw + depth + 3), rh / (d.bh + depth + 1.5));
  const cx = rx + rw / 2, cy = ry + rh / 2;
  return P => {
    const Xc = P.X - d.bw / 2, Yc = P.Y - d.bh / 2, Zc = P.Z - depth / 2;
    const x1 = Xc * ca + Zc * sa;
    const z1 = -Xc * sa + Zc * ca;
    const y2 = Yc * cb - z1 * sb;
    return [cx + x1 * S3, cy - y2 * S3];
  };
}
// opts: {lit, circuit=true, walls='solid'|'ghost'|'dashed'|'none', label}
export function drawAssembled(tctx, rx, ry, rw, rh, opts = {}) {
  const d = dims();
  const C = work.circuit;
  normalize(C);
  const R = solve();
  const pj = makeProj(d, rx, ry, rw, rh);
  const depth = d.td + 0.5;
  const walls = opts.walls || 'solid';
  const lit = !!opts.lit;

  const quad = (pts, fill, stroke, dashed) => {
    tctx.beginPath();
    pts.forEach((p, i) => { const s = pj(p); i ? tctx.lineTo(s[0], s[1]) : tctx.moveTo(s[0], s[1]); });
    tctx.closePath();
    if (dashed) tctx.setLineDash([5, 4]);
    if (fill) { tctx.fillStyle = fill; tctx.fill(); }
    if (stroke) { tctx.strokeStyle = stroke; tctx.lineWidth = 1.2; tctx.stroke(); }
    tctx.setLineDash([]);
  };
  const P3 = (X, Y, Z) => ({ X, Y, Z });
  const wallAlpha = walls === 'ghost' ? 0.22 : 0.55;
  const wallFill = c => walls === 'dashed' || walls === 'none' ? null : c;
  const line = walls === 'dashed' ? '#8a94a0' : '#7a8794';

  const bg = lit ? 'rgba(16,19,30,0.92)' : null;
  if (bg) { tctx.fillStyle = bg; tctx.fillRect(rx, ry, rw, rh); }

  // 뒷면
  quad([P3(0, 0, 0), P3(d.bw, 0, 0), P3(d.bw, d.bh, 0), P3(0, d.bh, 0)],
    wallFill(lit ? 'rgba(60,58,50,0.9)' : 'rgba(247,243,232,0.95)'), line, walls === 'dashed');
  if (walls !== 'none') {
    // 윗면·아랫면·좌·우 옆벽 (반투명 — 안쪽 회로가 비쳐 보임)
    const wallC = lit ? `rgba(70,74,86,${wallAlpha})` : `rgba(228,238,247,${wallAlpha})`;
    quad([P3(0.5, d.bh, 0), P3(0.5 + d.tw, d.bh, 0), P3(0.5 + d.tw, d.bh, depth), P3(0.5, d.bh, depth)], wallFill(wallC), line, walls === 'dashed');
    quad([P3(0.5, 0, 0), P3(0.5 + d.tw, 0, 0), P3(0.5 + d.tw, 0, depth), P3(0.5, 0, depth)], wallFill(wallC), line, walls === 'dashed');
    quad([P3(0, 0, 0), P3(0, d.bh, 0), P3(0, d.bh, depth), P3(0, 0, depth)], wallFill(wallC), line, walls === 'dashed');
    quad([P3(d.bw, 0, 0), P3(d.bw, d.bh, 0), P3(d.bw, d.bh, depth), P3(d.bw, 0, depth)], wallFill(wallC), line, walls === 'dashed');
    // 개구부(앞) 테두리
    quad([P3(0, 0, depth), P3(d.bw, 0, depth), P3(d.bw, d.bh, depth), P3(0, d.bh, depth)], null, '#a8b2bd', true);
  }

  if (opts.circuit !== false) {
    // 테이프
    C.tapes.forEach((t, i) => {
      const comp = R.tapeComp[i];
      let col = lit ? '#b8bec8' : '#9aa0aa';
      if (!R.short) {
        const inP = R.energizedPlus.has(comp), inM = R.energizedMinus.has(comp);
        if (inP && inM) col = '#eb5a3c';
        else if (inP) col = '#e8a03c';
        else if (inM) col = '#5b8fd9';
      } else col = '#e23c3c';
      tctx.strokeStyle = col;
      tctx.lineWidth = 3; tctx.lineCap = 'round'; tctx.lineJoin = 'round';
      tctx.beginPath();
      t.pts.forEach((p, j) => {
        // 띠의 모서리를 넘는 구간이 자연스럽게 꺾이도록 중간점을 보간해 그린다
        if (j === 0) { const s = pj(to3D(p, t.surf, d)); tctx.moveTo(s[0], s[1]); return; }
        const prev = t.pts[j - 1];
        const steps = t.surf === 'band' ? Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / 1.5)) : 1;
        for (let k = 1; k <= steps; k++) {
          const q = { x: prev.x + (p.x - prev.x) * k / steps, y: prev.y + (p.y - prev.y) * k / steps };
          const s = pj(to3D(q, t.surf, d));
          tctx.lineTo(s[0], s[1]);
        }
      });
      tctx.stroke();
    });
    // 저항
    C.resistors.forEach(r => {
      const s = pj(to3D(r, r.surf, d));
      tctx.fillStyle = '#c8a26a'; tctx.strokeStyle = '#8a6d3f';
      tctx.beginPath(); tctx.roundRect(s[0] - 8, s[1] - 4, 16, 8, 3); tctx.fill(); tctx.stroke();
    });
    // LED
    C.leds.forEach((l, i) => {
      const s = pj(to3D(l, l.surf, d));
      const b = lit && R.lit[i] !== undefined ? R.lit[i] : 0;
      const mag = MAGIC[l.color || 'none'];
      if (b > 0.02) {
        const halo = 8 + 26 * b;
        const g = tctx.createRadialGradient(s[0], s[1], 1, s[0], s[1], halo);
        g.addColorStop(0, `rgba(${mag.rgb[0]},${mag.rgb[1]},${mag.rgb[2]},${0.6 + 0.4 * b})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        tctx.fillStyle = g;
        tctx.beginPath(); tctx.arc(s[0], s[1], halo, 0, 7); tctx.fill();
      }
      tctx.beginPath(); tctx.arc(s[0], s[1], 4, 0, 7);
      tctx.fillStyle = b > 0.02 ? `rgb(${mag.rgb[0]},${mag.rgb[1]},${mag.rgb[2]})` : (lit ? '#5a606c' : '#d8d8d2');
      tctx.fill();
      tctx.strokeStyle = b > 0.02 ? '#fff' : '#767c85'; tctx.lineWidth = 1; tctx.stroke();
    });
  }
  if (opts.label) {
    tctx.fillStyle = lit ? '#c9d2dc' : '#7b8794'; tctx.font = '12px sans-serif';
    tctx.fillText(opts.label, rx + 10, ry + 18);
  }
}

// ---------- 평면 편집 화면 ----------
function draw() {
  if (!ctx) return;
  if (view3d) {
    const W = 680, H = 440;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f4f6f9'; ctx.fillRect(0, 0, W, H);
    drawAssembled(ctx, 10, 10, W - 20, H - 20, {
      lit: work.circuit.tested && solveResult && solveResult.anyLit,
      walls: 'solid',
      label: '조립된 모습 — 평면에서 붙인 회로가 이렇게 둘러집니다',
    });
    return;
  }
  const s = surfSize(view);
  const bat = battery();
  const W = Math.round((Math.max(s.w, bat.x + bat.w) + MARGIN * 2) * Z);
  const H = Math.round((bat.y + bat.h + MARGIN * 2 + 0.4) * Z);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(MARGIN * Z, MARGIN * Z);

  const C = work.circuit, R = solveResult;
  const litMode = C.tested && R && (R.anyLit || R.short);
  const d = dims();

  const region = (x, y, w, h, label, c) => {
    ctx.fillStyle = c; ctx.fillRect(x * Z, y * Z, w * Z, h * Z);
    ctx.strokeStyle = '#c2cad3'; ctx.strokeRect(x * Z, y * Z, w * Z, h * Z);
    ctx.fillStyle = '#98a1ab'; ctx.font = '11px sans-serif';
    ctx.fillText(label, x * Z + 5, y * Z + 14);
  };

  if (view === 'back') {
    region(0, 0, d.bw, d.bh, '뒷면 (안쪽)', '#fbf9f2');
  } else {
    const t1 = d.tw, t2 = d.tw + d.sh, t3 = 2 * d.tw + d.sh, L = bandLen(d);
    region(0, 0, L, d.td, '', '#f5f0fa');
    const div = x => { ctx.strokeStyle = '#b39cc9'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x * Z, 0); ctx.lineTo(x * Z, d.td * Z); ctx.stroke(); ctx.setLineDash([]); };
    div(t1); div(t2); div(t3);
    ctx.fillStyle = '#98a1ab'; ctx.font = '11px sans-serif';
    ctx.fillText('윗면', 5, 14); ctx.fillText('오른쪽 옆면', t1 * Z + 5, 14);
    ctx.fillText('아랫면', t2 * Z + 5, 14); ctx.fillText('왼쪽 옆면', t3 * Z + 5, 14);
    ctx.fillStyle = '#7b8794';
    ctx.fillText('◀ 양 끝은 조립하면 서로 만나 띠가 됩니다 ▶', (L / 2 - 6) * Z, (d.td + 0.55) * Z);
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.beginPath();
  for (let x = 1; x < s.w; x++) { ctx.moveTo(x * Z, 0); ctx.lineTo(x * Z, s.h * Z); }
  for (let y = 1; y < s.h; y++) { ctx.moveTo(0, y * Z); ctx.lineTo(s.w * Z, y * Z); }
  ctx.stroke();

  // 테이프
  C.tapes.forEach((t, i) => {
    if (t.surf !== view) return;
    const comp = R ? R.tapeComp[i] : -1;
    let col = '#9aa0aa';
    if (R && !R.short) {
      const inP = R.energizedPlus.has(comp), inM = R.energizedMinus.has(comp);
      if (inP && inM) col = `rgba(235,90,60,${0.75 + 0.25 * Math.sin(pulse)})`;
      else if (inP) col = '#e8a03c';
      else if (inM) col = '#5b8fd9';
    }
    if (R && R.short) col = `rgba(230,60,60,${0.55 + 0.45 * Math.sin(pulse * 2)})`;
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.5 * Z; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    t.pts.forEach((p, j) => j ? ctx.lineTo(p.x * Z, p.y * Z) : ctx.moveTo(p.x * Z, p.y * Z));
    ctx.stroke();
    if (selected && selected.type === 'tape' && selected.i === i) {
      ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      t.pts.forEach((p, j) => j ? ctx.lineTo(p.x * Z, p.y * Z) : ctx.moveTo(p.x * Z, p.y * Z));
      ctx.stroke(); ctx.setLineDash([]);
    }
  });
  if (drawingTape) {
    ctx.strokeStyle = 'rgba(120,130,145,0.6)';
    ctx.lineWidth = 0.5 * Z; ctx.lineCap = 'round';
    ctx.beginPath();
    drawingTape.forEach((p, j) => j ? ctx.lineTo(p.x * Z, p.y * Z) : ctx.moveTo(p.x * Z, p.y * Z));
    if (cursor) { const c2 = clampPt({ x: snap(cursor.x), y: snap(cursor.y) }, view); ctx.lineTo(c2.x * Z, c2.y * Z); }
    ctx.stroke();
  }

  // 전지 블록 + 전선
  drawBattery(bat, C);

  if (litMode) {
    ctx.fillStyle = 'rgba(14,17,28,0.55)';
    ctx.fillRect(-MARGIN * Z, -MARGIN * Z, W, H);
  }

  // 저항
  C.resistors.forEach((r, i) => {
    if (r.surf !== view) return;
    const g = legs(r);
    ctx.strokeStyle = '#8d939c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(g.a.x * Z, g.a.y * Z); ctx.lineTo(g.k.x * Z, g.k.y * Z); ctx.stroke();
    ctx.save();
    ctx.translate(r.x * Z, r.y * Z);
    ctx.rotate((r.dir % 2) ? 0 : Math.PI / 2);
    ctx.fillStyle = '#c8a26a';
    ctx.strokeStyle = selected && selected.type === 'res' && selected.i === i ? '#2b6cb0' : '#8a6d3f';
    ctx.beginPath(); ctx.roundRect(-0.55 * Z, -0.25 * Z, 1.1 * Z, 0.5 * Z, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5a4a2f'; ctx.font = `${Math.max(9, Z * 0.55)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(config.resistorOhm + 'Ω', 0, 0.13 * Z);
    ctx.restore();
    ctx.textAlign = 'left';
  });

  // LED
  C.leds.forEach((l, i) => {
    if (l.surf !== view) return;
    const g = legs(l);
    const lit = R && R.lit[i] !== undefined ? R.lit[i] : 0;
    const mag = MAGIC[l.color || 'none'];
    ctx.lineWidth = 2; ctx.strokeStyle = litMode ? '#b9bfc8' : '#8d939c';
    ctx.beginPath(); ctx.moveTo(l.x * Z, l.y * Z); ctx.lineTo(g.a.x * Z, g.a.y * Z); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(l.x * Z, l.y * Z); ctx.lineTo(g.k.x * Z, g.k.y * Z); ctx.stroke();
    ctx.fillStyle = '#d05a4e'; ctx.font = 'bold 11px sans-serif';
    ctx.fillText('+', g.a.x * Z + 4, g.a.y * Z + 4);
    if (lit > 0.02) {
      const [r1, g1, b1] = mag.rgb;
      const halo = (1.2 + 3.6 * lit) * Z;
      let gr = ctx.createRadialGradient(l.x * Z, l.y * Z, 1, l.x * Z, l.y * Z, halo);
      gr.addColorStop(0, `rgba(${r1},${g1},${b1},${0.55 + 0.45 * lit})`);
      gr.addColorStop(0.35, `rgba(${r1},${g1},${b1},${0.35 * lit})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(l.x * Z, l.y * Z, halo, 0, 7); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(l.x * Z, l.y * Z, 0.35 * Z, 0, 7);
    ctx.fillStyle = lit > 0.02
      ? `rgb(${Math.min(255, mag.rgb[0] + 60 * lit)},${Math.min(255, mag.rgb[1] + 60 * lit)},${Math.min(255, mag.rgb[2] + 60 * lit)})`
      : (l.color && l.color !== 'none' ? `rgba(${mag.rgb[0]},${mag.rgb[1]},${mag.rgb[2]},0.45)` : '#e8e8e2');
    ctx.fill();
    ctx.strokeStyle = selected && selected.type === 'led' && selected.i === i ? '#2b6cb0' : (lit > 0.02 ? '#fff' : '#767c85');
    ctx.lineWidth = selected && selected.type === 'led' && selected.i === i ? 2.5 : 1.5;
    ctx.stroke();
  });
  ctx.restore();
}

function drawBattery(bat, C) {
  ctx.fillStyle = '#3b4552'; ctx.strokeStyle = '#20272f'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(bat.x * Z, bat.y * Z, bat.w * Z, bat.h * Z, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#cfd6de'; ctx.font = '11px sans-serif';
  ctx.fillText('전지 AA × 2 (3V)', (bat.x + 1.1) * Z, (bat.y + 1.05) * Z);
  const wcol = ['#d64545', '#2f3640'];
  const terms = [bat.tp, bat.tm];
  C.holder.wires.forEach((w, wi) => {
    const t = terms[wi];
    ctx.strokeStyle = wcol[wi]; ctx.lineWidth = 3;
    if (w.surf === view) {
      ctx.beginPath();
      ctx.moveTo(t.x * Z, t.y * Z);
      ctx.bezierCurveTo(t.x * Z, (w.y + (t.y - w.y) * 0.5) * Z, w.x * Z, (w.y + 1.2) * Z, w.x * Z, w.y * Z);
      ctx.stroke();
      drawWireEnd(w, wi);
    } else if (w.surf === 'dock') {
      ctx.beginPath(); ctx.moveTo(t.x * Z, t.y * Z); ctx.lineTo(t.x * Z, (t.y - 0.7) * Z); ctx.stroke();
      ctx.beginPath(); ctx.arc(t.x * Z, (t.y - 0.7) * Z, 6, 0, 7);
      ctx.fillStyle = wcol[wi]; ctx.fill();
      if (selected && selected.type === 'wire' && selected.wi === wi) { ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = wcol[wi]; ctx.font = 'bold 12px sans-serif';
      ctx.fillText(wi === 0 ? '+' : '−', t.x * Z + 8, (t.y - 0.6) * Z);
    } else {
      // 다른 면에 연결됨
      ctx.beginPath(); ctx.moveTo(t.x * Z, t.y * Z); ctx.lineTo(t.x * Z, (t.y - 0.6) * Z); ctx.stroke();
      ctx.fillStyle = wcol[wi]; ctx.font = '10px sans-serif';
      ctx.fillText((wi === 0 ? '+' : '−') + ' ' + (w.surf === 'back' ? '뒷면에 연결됨' : '옆면 띠에 연결됨'), (t.x - 0.5) * Z, (t.y - 0.85) * Z);
    }
  });
}
function drawWireEnd(w, wi) {
  const wcol = ['#d64545', '#2f3640'];
  ctx.beginPath(); ctx.arc(w.x * Z, w.y * Z, 5, 0, 7);
  ctx.fillStyle = wcol[wi]; ctx.fill();
  if (selected && selected.type === 'wire' && selected.wi === wi) { ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = wcol[wi];
  ctx.fillText(wi === 0 ? '+' : '−', w.x * Z + 7, w.y * Z - 6);
}

// ---------- 결과 패널 ----------
function updatePanel() {
  const C = work.circuit, R = solveResult;
  const el = $('circuit-info');
  let html = '';
  const tapeUsed = C.tapes.reduce((a, t) => a + tapeLen(t), 0);
  if (config.showSupply) {
    const overL = C.leds.length > config.ledCount, overT = tapeUsed > 90;
    html += `<p class="supply">지급 재료 — LED ${config.ledCount}개 / 사용 ${C.leds.length}개 ${overL ? '<b class="warn">초과</b>' : ''}<br>` +
      `테이프 90cm / 사용 ${Math.round(tapeUsed)}cm ${overT ? '<b class="warn">초과</b>' : ''}</p>`;
  }
  if (!R) { el.innerHTML = html; return; }
  if (R.wiresOff === 2) html += '<p class="muted">전지의 빨간 선(+)과 검은 선(−) 끝을 끌어다 테이프나 LED 다리에 붙여 보세요.</p>';
  else if (R.wiresOff === 1) html += '<p class="muted">전선 한 가닥이 아직 전지에 꽂혀만 있어요. 마저 연결해 볼까요?</p>';
  else if (R.short) html += '<p class="warn">전지가 뜨거워집니다! (+)와 (−)가 어딘가에서 직접 만나고 있습니다.</p>';
  else if (C.tested) {
    const litN = Object.keys(R.lit).length;
    html += `<p class="measure">점등 결과 — LED ${C.leds.length}개 중 <b>${litN}개</b> 켜짐</p>`;
    if (config.askPredict && C.predictCount !== '') {
      const ok = parseInt(C.predictCount) === litN;
      html += `<p class="${ok ? 'ok' : 'warn'}">내 예측: ${C.predictCount}개</p>`;
    }
    if (config.questionFeedback) {
      const unlit = C.leds.length - litN;
      if (unlit > 0) html += `<p class="hint">안 켜진 LED가 ${unlit}개 있습니다. 긴 다리(+)가 어느 줄에 붙어 있는지, 두 다리가 서로 다른 줄에 있는지 살펴볼까요?</p>`;
      if (R.dimSeries) html += `<p class="hint">유난히 어둡게 켜진 LED가 보이나요? 전류가 LED를 몇 개나 거쳐 가는지 세어 보세요.</p>`;
      if (R.hasBlockedSeries) html += `<p class="hint">LED를 여러 개 거쳐 가는 길이 있네요. LED가 늘어날수록 각 LED가 받는 전압은 어떻게 될까요?</p>`;
      if (litN > 0 && litN === C.leds.length && !R.dimSeries) html += `<p class="ok">모두 켜졌습니다. [입체로 보기]와 [미리보기] 탭에서 완성 모습을 확인해 보세요.</p>`;
      const blacks = C.leds.filter(l => l.color === 'black').length;
      if (blacks) html += `<p class="warn">검정으로 칠한 LED는 빛이 나오지 않습니다.</p>`;
    }
    if (R.noResistorLit)
      html += `<p class="hint">지금 회로에는 저항이 없어서 LED에 전류가 그대로 흐릅니다. 실제 제작에서는 LED가 뜨거워져 수명이 빨리 닳거나 망가질 수 있어요. 저항을 함께 쓰면 전류를 알맞게 제한해 LED를 오래 쓸 수 있습니다.</p>`;
  } else html += '<p class="muted">배치를 마쳤으면 켜질 LED 개수를 예측하고 [스위치 눌러 점등]을 눌러 보세요.</p>';
  el.innerHTML = html;
}

// ---------- 미리보기 탭에 넘겨줄 정보 ----------
export function getLighting() {
  const d = dims(), C = work.circuit;
  const R = solve();
  const out = { lit: [], tested: C.tested, dims: d };
  const t1 = d.tw, t2 = d.tw + d.sh, t3 = 2 * d.tw + d.sh, L = bandLen(d);
  for (const [iStr, b] of Object.entries(R.lit)) {
    const l = C.leds[+iStr];
    const mag = MAGIC[l.color || 'none'];
    let face = 'back', fx = l.x, fy = l.y;
    if (l.surf === 'band') {
      const x = ((l.x % L) + L) % L;
      if (x < t1) { face = 'top'; fx = 0.5 + x; fy = 0; }
      else if (x < t2) { face = 'right'; fx = d.bw; fy = x - t1; }
      else if (x < t3) { face = 'bottom'; fx = 0.5 + (t3 - x); fy = d.bh; }
      else { face = 'left'; fx = 0; fy = L - x; }
    }
    out.lit.push({ face, fx, fy, b, rgb: mag.rgb });
  }
  return out;
}

// ---------- 입력 처리 ----------
function hitTest(p) {
  const C = work.circuit;
  const bat = battery();
  for (let wi = 0; wi < 2; wi++) {
    const w = C.holder.wires[wi];
    if (w.surf === view && Math.hypot(p.x - w.x, p.y - w.y) < 0.7) return { type: 'wire', wi };
    if (w.surf !== view) { // 도킹 상태 또는 다른 면 → 단자 근처에서 잡아온다
      const t = wi === 0 ? bat.tp : bat.tm;
      if (Math.hypot(p.x - t.x, p.y - (t.y - 0.7)) < 0.8) return { type: 'wire', wi };
    }
  }
  for (let i = C.leds.length - 1; i >= 0; i--)
    if (C.leds[i].surf === view && Math.hypot(p.x - C.leds[i].x, p.y - C.leds[i].y) < 0.8) return { type: 'led', i };
  for (let i = (C.resistors || []).length - 1; i >= 0; i--)
    if (C.resistors[i].surf === view && Math.hypot(p.x - C.resistors[i].x, p.y - C.resistors[i].y) < 0.8) return { type: 'res', i };
  for (let i = C.tapes.length - 1; i >= 0; i--)
    if (C.tapes[i].surf === view && distTape(p, C.tapes[i]) < 0.5) return { type: 'tape', i };
  return null;
}

function resolveAndDraw() {
  solveResult = solve();
  updatePanel();
  managePulse();
  draw();
}
function managePulse() {
  const need = !view3d && solveResult && (solveResult.short ||
    (solveResult.energizedPlus.size && solveResult.energizedMinus.size));
  if (need && !pulseTimer) pulseTimer = setInterval(() => { pulse += 0.35; draw(); }, 90);
  if (!need && pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
}
function setView(v) {
  view = v; drawingTape = null; selected = null;
  document.querySelectorAll('#surf-sel button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  updateSelPanel();
  resolveAndDraw();
}
function set3D(on) {
  view3d = on;
  $('btn-3d').classList.toggle('active', on);
  $('btn-3d').textContent = on ? '평면 편집으로 돌아가기' : '입체로 보기';
  drawingTape = null; selected = null;
  updateSelPanel();
  resolveAndDraw();
}

export function initCircuit() {
  cv = $('circuit-canvas');
  ctx = cv.getContext('2d');
  cv.addEventListener('contextmenu', e => e.preventDefault());

  document.querySelectorAll('#surf-sel button').forEach(b =>
    b.addEventListener('click', () => { if (view3d) set3D(false); setView(b.dataset.v); }));
  $('btn-3d').addEventListener('click', () => set3D(!view3d));

  $('zoom-in').addEventListener('click', () => { if (!view3d) { Z = Math.min(30, Z + 3); draw(); } });
  $('zoom-out').addEventListener('click', () => { if (!view3d) { Z = Math.max(8, Z - 3); draw(); } });
  cv.addEventListener('wheel', e => {
    if (view3d) return;
    e.preventDefault();
    Z = Math.max(8, Math.min(30, Z - Math.sign(e.deltaY) * 2));
    draw();
  }, { passive: false });

  const TOOL_FACTS = {
    select: '',
    tape: '전도성 테이프 — 은이 섞인 천이라 전기가 통해요. 겹치면 이어지고, 끊어지면 전류도 멈춰요.',
    led: 'LED — 긴 다리가 (+)극. 실제로는 다리를 "ㄴ"자로 눕혀야 테이프에 잘 붙어요.',
    res: '저항 — 전류를 알맞게 줄여 LED가 뜨거워지지 않게 지켜 줘요.',
    erase: '',
  };
  document.querySelectorAll('#circuit-tools button[data-tool]').forEach(b => {
    b.addEventListener('click', () => {
      tool = b.dataset.tool;
      drawingTape = null; selected = null;
      if (view3d) set3D(false);
      document.querySelectorAll('#circuit-tools button[data-tool]').forEach(x => x.classList.toggle('active', x === b));
      $('tape-hint').style.display = tool === 'tape' ? '' : 'none';
      $('tool-fact').textContent = TOOL_FACTS[tool] || '';
      updateSelPanel();
      resolveAndDraw();
    });
  });

  cv.addEventListener('pointerdown', e => {
    if (readOnly || view3d) return;
    const p = toCm(e);
    const C = work.circuit;
    normalize(C);
    if (tool === 'tape') {
      if (!drawingTape) drawingTape = [];
      drawingTape.push(clampPt({ x: snap(p.x), y: snap(p.y) }, view));
      draw();
      return;
    }
    if (tool === 'led') {
      if (C.leds.length >= config.ledCount && config.overLimit === 'block') return;
      C.leds.push({ ...clampPart({ x: snap(p.x), y: snap(p.y) }, 0, view), dir: 0, color: 'none', surf: view });
      selected = { type: 'led', i: C.leds.length - 1 };
      C.tested = false; afterChange();
      return;
    }
    if (tool === 'res') {
      C.resistors.push({ ...clampPart({ x: snap(p.x), y: snap(p.y) }, 0, view), dir: 0, surf: view });
      selected = { type: 'res', i: C.resistors.length - 1 };
      C.tested = false; afterChange();
      return;
    }
    if (tool === 'erase') {
      const hit = hitTest(p);
      if (hit) {
        if (hit.type === 'led') C.leds.splice(hit.i, 1);
        else if (hit.type === 'res') C.resistors.splice(hit.i, 1);
        else if (hit.type === 'tape') C.tapes.splice(hit.i, 1);
        else if (hit.type === 'wire') C.holder.wires[hit.wi] = { surf: 'dock' };
        C.tested = false; afterChange();
      }
      return;
    }
    const hit = hitTest(p);
    selected = hit;
    updateSelPanel();
    if (hit) {
      cv.setPointerCapture(e.pointerId);
      if (hit.type === 'led') dragOff = { x: p.x - C.leds[hit.i].x, y: p.y - C.leds[hit.i].y };
      else if (hit.type === 'res') dragOff = { x: p.x - C.resistors[hit.i].x, y: p.y - C.resistors[hit.i].y };
      else if (hit.type === 'wire') dragOff = { x: 0, y: 0 };
      else if (hit.type === 'tape') dragOff = { x: p.x, y: p.y, pts: C.tapes[hit.i].pts.map(q => ({ ...q })) };
    }
    draw();
  });

  cv.addEventListener('pointermove', e => {
    const p = toCm(e);
    cursor = p;
    if (view3d) return;
    if (drawingTape) { draw(); return; }
    if (!selected || !dragOff || readOnly) return;
    const C = work.circuit;
    if (selected.type === 'led') {
      const l = C.leds[selected.i];
      Object.assign(l, clampPart({ x: snap(p.x - dragOff.x), y: snap(p.y - dragOff.y) }, l.dir, view));
    } else if (selected.type === 'res') {
      const r = C.resistors[selected.i];
      Object.assign(r, clampPart({ x: snap(p.x - dragOff.x), y: snap(p.y - dragOff.y) }, r.dir, view));
    } else if (selected.type === 'wire') {
      const s = surfSize(view);
      if (p.y <= s.h + 0.4) // 면 위 → 이 면에 연결
        C.holder.wires[selected.wi] = { ...clampPt({ x: snap(p.x), y: snap(p.y) }, view), surf: view };
      else // 면 아래로 끌면 전지로 되돌아감
        C.holder.wires[selected.wi] = { surf: 'dock' };
    } else if (selected.type === 'tape') {
      const dx = snap(p.x - dragOff.x), dy = snap(p.y - dragOff.y);
      C.tapes[selected.i].pts = dragOff.pts.map(q => clampPt({ x: q.x + dx, y: q.y + dy }, view));
    }
    C.tested = false;
    draw();
  });

  cv.addEventListener('pointerup', () => {
    if (dragOff) { dragOff = null; afterChange(); }
  });
  cv.addEventListener('dblclick', () => finishTape());
  window.addEventListener('keydown', e => {
    if (!$('tab-circuit').classList.contains('active')) return;
    if (e.key === 'Enter') finishTape();
    if (e.key === 'Escape') { drawingTape = null; draw(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !readOnly &&
        document.activeElement.tagName !== 'INPUT') {
      const C = work.circuit;
      if (selected.type === 'led') C.leds.splice(selected.i, 1);
      else if (selected.type === 'res') C.resistors.splice(selected.i, 1);
      else if (selected.type === 'tape') C.tapes.splice(selected.i, 1);
      else if (selected.type === 'wire') C.holder.wires[selected.wi] = { surf: 'dock' };
      selected = null; C.tested = false; afterChange();
    }
    if (e.key.toLowerCase() === 'r' && selected && !readOnly) {
      const C = work.circuit;
      const o = selected.type === 'led' ? C.leds[selected.i] : selected.type === 'res' ? C.resistors[selected.i] : null;
      if (o) { o.dir = (o.dir + 1) % 4; Object.assign(o, clampPart(o, o.dir, o.surf)); C.tested = false; afterChange(); }
    }
  });
  $('btn-tape-done').addEventListener('click', finishTape);

  document.querySelectorAll('#magic-palette button').forEach(b => {
    b.addEventListener('click', () => {
      if (selected && selected.type === 'led' && !readOnly) {
        work.circuit.leds[selected.i].color = b.dataset.c;
        work.circuit.tested = false; afterChange();
      }
    });
  });
  $('btn-led-rot').addEventListener('click', () => {
    const C = work.circuit;
    const o = selected && (selected.type === 'led' ? C.leds[selected.i] : selected.type === 'res' ? C.resistors[selected.i] : null);
    if (o && !readOnly) { o.dir = (o.dir + 1) % 4; Object.assign(o, clampPart(o, o.dir, o.surf)); C.tested = false; afterChange(); }
  });

  $('in-predict-led').addEventListener('input', () => {
    work.circuit.predictCount = $('in-predict-led').value;
    touch(); updateTestButton();
  });
  $('btn-test').addEventListener('click', () => {
    work.circuit.tested = true;
    const R = solve();
    const litN = Object.keys(R.lit).length;
    addLog(`회로 — LED ${work.circuit.leds.length}개 배치 → ${litN}개 점등` + (R.short ? ' (합선!)' : ''));
    renderLogList();
    touch();
    resolveAndDraw();
  });

  document.addEventListener('work-loaded', refreshCircuit);
  refreshCircuit();
}

function finishTape() {
  if (drawingTape && drawingTape.length >= 2) {
    work.circuit.tapes.push({ pts: drawingTape, surf: view });
    work.circuit.tested = false;
    drawingTape = null;
    afterChange();
  } else { drawingTape = null; draw(); }
}

function afterChange() {
  touch();
  updateTestButton();
  updateSelPanel();
  resolveAndDraw();
}
function updateTestButton() {
  const ok = !config.askPredict || work.circuit.predictCount !== '';
  $('btn-test').disabled = readOnly || !ok;
  $('circuit-predict-hint').textContent = ok ? '' : '몇 개가 켜질지 먼저 예측해 보세요.';
}
function updateSelPanel() {
  const led = selected && selected.type === 'led';
  const rot = selected && (selected.type === 'led' || selected.type === 'res');
  $('led-props').style.display = rot ? '' : 'none';
  $('magic-wrap').style.display = led ? '' : 'none';
  if (led) {
    const c = work.circuit.leds[selected.i].color || 'none';
    document.querySelectorAll('#magic-palette button').forEach(b => b.classList.toggle('active', b.dataset.c === c));
  }
}

export function refreshCircuit() {
  normalize(work.circuit);
  $('in-predict-led').value = work.circuit.predictCount ?? '';
  $('circuit-predict-row').style.display = config.askPredict ? '' : 'none';
  $('tool-res').style.display = config.allowResistor ? '' : 'none';
  updateTestButton();
  resolveAndDraw();
}
