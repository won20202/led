// 회로 탭: 케이스를 펼친 전개도(뒷면 + 네 옆면) 위에 회로를 만들고,
// [입체로 보기]로 조립된 모습을 확인한다. 연결 여부는 "접었을 때의 실제 거리"로 판단하므로
// 테이프가 접히는 모서리를 넘어가도, 면과 면이 만나는 곳에서도 자연스럽게 이어진다.
// 스위치를 켜야 불이 들어온다. 배치를 바꾸면 스위치는 다시 꺼진다.
import { config, work, addLog, touch, readOnly, sheetLog } from './state.js';
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
let view3d = false;
let Z = 15;
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
// 전개도의 면들 (뒷면 기준 좌표계, 십자 모양)
function faces() {
  const d = dims();
  const cy0 = (d.bh - d.sh) / 2;
  return {
    back: { x0: 0, y0: 0, x1: d.bw, y1: d.bh, label: '뒷면 (안쪽)' },
    top: { x0: 0.5, y0: -d.td, x1: 0.5 + d.tw, y1: 0, label: '윗면' },
    bottom: { x0: 0.5, y0: d.bh, x1: 0.5 + d.tw, y1: d.bh + d.td, label: '아랫면' },
    left: { x0: -d.sw, y0: cy0, x1: 0, y1: cy0 + d.sh, label: '왼쪽 옆면' },
    right: { x0: d.bw, y0: cy0, x1: d.bw + d.sw, y1: cy0 + d.sh, label: '오른쪽 옆면' },
  };
}
function faceOf(p) {
  const F = faces();
  for (const k of Object.keys(F)) {
    const f = F[k];
    if (p.x >= f.x0 - 0.01 && p.x <= f.x1 + 0.01 && p.y >= f.y0 - 0.01 && p.y <= f.y1 + 0.01) return k;
  }
  return null;
}
// 전개도 밖으로 나가지 않게: 가장 가까운 면 안으로 넣는다
function clampNet(p) {
  if (faceOf(p)) return { x: p.x, y: p.y };
  const F = faces();
  let best = null, bd = Infinity;
  for (const k of Object.keys(F)) {
    const f = F[k];
    const q = { x: Math.min(Math.max(p.x, f.x0), f.x1), y: Math.min(Math.max(p.y, f.y0), f.y1) };
    const dd = Math.hypot(q.x - p.x, q.y - p.y);
    if (dd < bd) { bd = dd; best = q; }
  }
  return best;
}
// 부품(다리 포함)이 한 면 안에 들어오게
function clampPart(p, dir) {
  const q = clampNet(p);
  const k = faceOf(q) || 'back';
  const f = faces()[k];
  const vert = (dir || 0) % 2 === 0;
  const ix = vert ? 0.4 : 1, iy = vert ? 1 : 0.4;
  return {
    x: Math.min(Math.max(q.x, f.x0 + ix), Math.max(f.x0 + ix, f.x1 - ix)),
    y: Math.min(Math.max(q.y, f.y0 + iy), Math.max(f.y0 + iy, f.y1 - iy)),
  };
}
// 전개도 좌표 → 접었을 때의 3D 좌표
function to3Dp(p) {
  const d = dims();
  const q = clampNet(p);
  const k = faceOf(q) || 'back';
  if (k === 'back') return { X: q.x, Y: d.bh - q.y, Z: 0.15 };
  if (k === 'top') return { X: q.x, Y: d.bh - 0.15, Z: -q.y };
  if (k === 'bottom') return { X: q.x, Y: 0.15, Z: q.y - d.bh };
  if (k === 'left') return { X: 0.15, Y: d.bh - q.y, Z: -q.x };
  return { X: d.bw - 0.15, Y: d.bh - q.y, Z: q.x - d.bw };
}
const d3 = (a, b) => Math.hypot(a.X - b.X, a.Y - b.Y, a.Z - b.Z);

// 전지 블록 (전개도 아래 고정)
function battery() {
  const d = dims();
  const y = d.bh + d.td + 0.9;
  return { x: 0.5 - d.sw, y, w: 5.6, h: 1.8,
    tp: { x: 0.5 - d.sw + 1.3, y }, tm: { x: 0.5 - d.sw + 4.3, y },
    sw: { x: 0.5 - d.sw + 5.6 + 1.6, y: y + 0.9 } }; // 스위치 원 중심
}

const MARGIN = 0.8;
function toCm(e) {
  const r = cv.getBoundingClientRect();
  const d = dims();
  return {
    x: (e.clientX - r.left) * (cv.width / r.width) / Z - MARGIN - d.sw,
    y: (e.clientY - r.top) * (cv.height / r.height) / Z - MARGIN - d.td,
  };
}
const snap = v => Math.round(v * 2) / 2;

function legs(o) {
  const dd = [[0, -1], [1, 0], [0, 1], [-1, 0]][o.dir || 0];
  return { a: { x: o.x + dd[0], y: o.y + dd[1] }, k: { x: o.x - dd[0], y: o.y - dd[1] } };
}
function tapeLen(tape) {
  let L = 0;
  for (let i = 0; i < tape.pts.length - 1; i++) L += Math.hypot(tape.pts[i + 1].x - tape.pts[i].x, tape.pts[i + 1].y - tape.pts[i].y);
  return L;
}
function distSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function distTape2D(p, tape) {
  let dd = Infinity;
  for (let i = 0; i < tape.pts.length - 1; i++) dd = Math.min(dd, distSeg(p, tape.pts[i], tape.pts[i + 1]));
  return dd;
}
// 테이프를 0.5cm 간격의 3D 점들로 샘플링 — 연결 판정용
function sampleTape3D(tape) {
  const out = [];
  for (let i = 0; i < tape.pts.length - 1; i++) {
    const a = tape.pts[i], b = tape.pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5));
    for (let k = 0; k <= n; k++)
      out.push(to3Dp({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }));
  }
  return out;
}

// 옛 데이터 보정 (뒷면/띠 분리 시절 → 전개도 좌표)
function normalize(C) {
  C.resistors = C.resistors || [];
  const d = dims();
  const t1 = d.tw, t2 = d.tw + d.sh, t3 = 2 * d.tw + d.sh, L = 2 * (d.tw + d.sh);
  const conv = o => {
    if (o.surf === 'band' && o.x !== undefined) {
      const u = ((o.x % L) + L) % L, v = o.y;
      if (u < t1) { o.x = 0.5 + u; o.y = -v; }
      else if (u < t2) { o.x = d.bw + v; o.y = (d.bh - d.sh) / 2 + (u - t1); }
      else if (u < t3) { o.x = 0.5 + (t3 - u); o.y = d.bh + v; }
      else { o.x = -v; o.y = (d.bh - d.sh) / 2 + (L - u); }
    }
    delete o.surf;
  };
  C.tapes.forEach(t => { if (t.surf === 'band') t.pts.forEach(p => conv({ ...p, surf: 'band' })); delete t.surf; });
  C.leds.forEach(conv);
  C.resistors.forEach(conv);
  if (!C.holder || !C.holder.wires) C.holder = { wires: [{ dock: true }, { dock: true }] };
  C.holder.wires.forEach(w => {
    if (w.surf === 'dock' || (w.x === undefined && !w.dock)) { w.dock = true; }
    delete w.surf;
  });
}

// ---------- 회로 해석 (교육용 근사: I = (Vs − k·Vf) / (Rint + R저항합)) ----------
function solve() {
  const C = work.circuit;
  normalize(C);
  const n = C.tapes.length;
  const P = n, M = n + 1;
  const parent = Array.from({ length: n + 2 }, (_, i) => i);
  const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a, b) => { parent[find(a)] = find(b); };

  const samples = C.tapes.map(sampleTape3D);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      let hit = false;
      for (const a of samples[i]) {
        for (const b of samples[j]) if (d3(a, b) < 0.65) { hit = true; break; }
        if (hit) break;
      }
      if (hit) union(i, j);
    }

  const res = { plus: -1, minus: -1, short: false, wiresOff: 0, on: C.tested,
    lit: {}, tapeComp: C.tapes.map((_, i) => find(i)), energizedPlus: new Set(), energizedMinus: new Set(),
    hasBlockedSeries: false, dimSeries: false, noResistorLit: false, anyLit: false };

  const [wp, wm] = C.holder.wires;
  res.wiresOff = (wp.dock ? 1 : 0) + (wm.dock ? 1 : 0);

  const tapeNear3D = (p3) => {
    for (let i = 0; i < n; i++)
      for (const s of samples[i]) if (d3(p3, s) < 0.7) return i;
    return -1;
  };
  const wp3 = wp.dock ? null : to3Dp(wp);
  const wm3 = wm.dock ? null : to3Dp(wm);
  if (wp3) { const t = tapeNear3D(wp3); if (t >= 0) union(P, t); }
  if (wm3) { const t = tapeNear3D(wm3); if (t >= 0) union(M, t); }
  if (wp3 && wm3 && d3(wp3, wm3) < 0.7) union(P, M);

  const nodeOf = (p) => {
    const p3 = to3Dp(p);
    const t = tapeNear3D(p3);
    if (t >= 0) return find(t);
    if (wp3 && d3(p3, wp3) < 0.7) return find(P);
    if (wm3 && d3(p3, wm3) < 0.7) return find(M);
    return -1;
  };

  const edges = [];
  C.leds.forEach((l, i) => {
    const g = legs(l);
    edges.push({ type: 'led', i, a: nodeOf(g.a), k: nodeOf(g.k) });
  });
  C.resistors.forEach((r, i) => {
    const g = legs(r);
    edges.push({ type: 'res', i, a: nodeOf(g.a), k: nodeOf(g.k) });
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
  // 스위치가 꺼져 있으면 불은 켜지지 않는다 (연결 상태 판정만 유지)
  if (!C.tested) { res.wouldLit = res.lit; res.lit = {}; res.anyLit = false; }
  return res;
}

// ---------- 입체(조립된 모습) 그리기 — 조립 순서 탭에서도 재사용 ----------
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
export function drawAssembled(tctx, rx, ry, rw, rh, opts = {}) {
  const d = dims();
  const C = work.circuit;
  normalize(C);
  const R = solve();
  const litSet = opts.lit ? (C.tested ? R.lit : (R.wouldLit || {})) : {};
  const pj = makeProj(d, rx, ry, rw, rh);
  const depth = d.td + 0.5;
  const walls = opts.walls || 'solid';
  const lit = !!opts.lit && Object.keys(litSet).length > 0;

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

  if (lit) { tctx.fillStyle = 'rgba(16,19,30,0.92)'; tctx.fillRect(rx, ry, rw, rh); }

  quad([P3(0, 0, 0), P3(d.bw, 0, 0), P3(d.bw, d.bh, 0), P3(0, d.bh, 0)],
    wallFill(lit ? 'rgba(60,58,50,0.9)' : 'rgba(247,243,232,0.95)'), line, walls === 'dashed');
  if (walls !== 'none') {
    const wallC = lit ? `rgba(70,74,86,${wallAlpha})` : `rgba(228,238,247,${wallAlpha})`;
    quad([P3(0.5, d.bh, 0), P3(0.5 + d.tw, d.bh, 0), P3(0.5 + d.tw, d.bh, depth), P3(0.5, d.bh, depth)], wallFill(wallC), line, walls === 'dashed');
    quad([P3(0.5, 0, 0), P3(0.5 + d.tw, 0, 0), P3(0.5 + d.tw, 0, depth), P3(0.5, 0, depth)], wallFill(wallC), line, walls === 'dashed');
    quad([P3(0, 0, 0), P3(0, d.bh, 0), P3(0, d.bh, depth), P3(0, 0, depth)], wallFill(wallC), line, walls === 'dashed');
    quad([P3(d.bw, 0, 0), P3(d.bw, d.bh, 0), P3(d.bw, d.bh, depth), P3(d.bw, 0, depth)], wallFill(wallC), line, walls === 'dashed');
    quad([P3(0, 0, depth), P3(d.bw, 0, depth), P3(d.bw, d.bh, depth), P3(0, d.bh, depth)], null, '#a8b2bd', true);
  }

  if (opts.circuit !== false) {
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
        if (j === 0) { const s = pj(to3Dp(p)); tctx.moveTo(s[0], s[1]); return; }
        const prev = t.pts[j - 1];
        const steps = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / 1.2));
        for (let k = 1; k <= steps; k++) {
          const q = { x: prev.x + (p.x - prev.x) * k / steps, y: prev.y + (p.y - prev.y) * k / steps };
          const s = pj(to3Dp(q));
          tctx.lineTo(s[0], s[1]);
        }
      });
      tctx.stroke();
    });
    C.resistors.forEach(r => {
      const s = pj(to3Dp(r));
      tctx.fillStyle = '#c8a26a'; tctx.strokeStyle = '#8a6d3f';
      tctx.beginPath(); tctx.roundRect(s[0] - 8, s[1] - 4, 16, 8, 3); tctx.fill(); tctx.stroke();
    });
    C.leds.forEach((l, i) => {
      const s = pj(to3Dp(l));
      const b = litSet[i] !== undefined ? litSet[i] : 0;
      const mag = MAGIC[l.color || 'none'];
      if (lit && b > 0.02) {
        const halo = 8 + 26 * b;
        const g = tctx.createRadialGradient(s[0], s[1], 1, s[0], s[1], halo);
        g.addColorStop(0, `rgba(${mag.rgb[0]},${mag.rgb[1]},${mag.rgb[2]},${0.6 + 0.4 * b})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        tctx.fillStyle = g;
        tctx.beginPath(); tctx.arc(s[0], s[1], halo, 0, 7); tctx.fill();
      }
      tctx.beginPath(); tctx.arc(s[0], s[1], 4, 0, 7);
      tctx.fillStyle = lit && b > 0.02 ? `rgb(${mag.rgb[0]},${mag.rgb[1]},${mag.rgb[2]})` : (lit ? '#5a606c' : '#d8d8d2');
      tctx.fill();
      tctx.strokeStyle = lit && b > 0.02 ? '#fff' : '#767c85'; tctx.lineWidth = 1; tctx.stroke();
    });
  }
  if (opts.label) {
    tctx.fillStyle = lit ? '#c9d2dc' : '#7b8794'; tctx.font = '12px sans-serif';
    tctx.fillText(opts.label, rx + 10, ry + 18);
  }
}

// ---------- 평면(전개도) 편집 화면 ----------
function draw() {
  if (!ctx) return;
  const d = dims();
  if (view3d) {
    const W = 680, H = 440;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f4f6f9'; ctx.fillRect(0, 0, W, H);
    drawAssembled(ctx, 10, 10, W - 20, H - 20, {
      lit: work.circuit.tested,
      walls: 'solid',
      label: '조립된 모습 — 전개도에 붙인 회로가 이렇게 둘러집니다',
    });
    return;
  }
  const bat = battery();
  const W = Math.round((d.sw * 2 + d.bw + MARGIN * 2) * Z);
  const H = Math.round((d.td + bat.y + bat.h + MARGIN * 2 + 0.5) * Z);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate((MARGIN + d.sw) * Z, (MARGIN + d.td) * Z);

  const C = work.circuit, R = solveResult;
  const litMode = C.tested && R && (R.anyLit || R.short);

  // 전개도 면들
  const F = faces();
  for (const k of Object.keys(F)) {
    const f = F[k];
    ctx.fillStyle = k === 'back' ? '#fbf9f2' : '#f3f0fa';
    ctx.fillRect(f.x0 * Z, f.y0 * Z, (f.x1 - f.x0) * Z, (f.y1 - f.y0) * Z);
    ctx.strokeStyle = '#c2cad3';
    ctx.strokeRect(f.x0 * Z, f.y0 * Z, (f.x1 - f.x0) * Z, (f.y1 - f.y0) * Z);
    ctx.fillStyle = '#98a1ab'; ctx.font = '11px sans-serif';
    ctx.fillText(f.label, f.x0 * Z + 5, f.y0 * Z + 14);
  }
  // 접는 선 표시
  ctx.strokeStyle = '#b8a9d9'; ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, d.bh * Z);
  ctx.moveTo(d.bw * Z, 0); ctx.lineTo(d.bw * Z, d.bh * Z);
  ctx.moveTo(0.5 * Z, 0); ctx.lineTo((0.5 + d.tw) * Z, 0);
  ctx.moveTo(0.5 * Z, d.bh * Z); ctx.lineTo((0.5 + d.tw) * Z, d.bh * Z);
  ctx.stroke(); ctx.setLineDash([]);

  // 1cm 격자 (뒷면)
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.beginPath();
  for (let x = 1; x < d.bw; x++) { ctx.moveTo(x * Z, 0); ctx.lineTo(x * Z, d.bh * Z); }
  for (let y = 1; y < d.bh; y++) { ctx.moveTo(0, y * Z); ctx.lineTo(d.bw * Z, y * Z); }
  ctx.stroke();

  // 테이프
  C.tapes.forEach((t, i) => {
    const comp = R ? R.tapeComp[i] : -1;
    let col = '#9aa0aa';
    if (R && !R.short) {
      const inP = R.energizedPlus.has(comp), inM = R.energizedMinus.has(comp);
      if (inP && inM) col = C.tested ? `rgba(235,90,60,${0.75 + 0.25 * Math.sin(pulse)})` : '#c9825f';
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
    if (cursor) { const c2 = clampNet({ x: snap(cursor.x), y: snap(cursor.y) }); ctx.lineTo(c2.x * Z, c2.y * Z); }
    ctx.stroke();
  }

  drawBattery(bat, C);

  if (litMode) {
    ctx.fillStyle = 'rgba(14,17,28,0.55)';
    ctx.fillRect(-(MARGIN + d.sw) * Z, -(MARGIN + d.td) * Z, W, H);
    drawBattery(bat, C); // 스위치는 어두워져도 보이게
  }

  // 저항
  C.resistors.forEach((r, i) => {
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

  // 선택된 LED·저항 옆에 회전 버튼
  const selObj = selected && (selected.type === 'led' ? C.leds[selected.i] : selected.type === 'res' ? C.resistors[selected.i] : null);
  if (selObj) {
    const bx = (selObj.x + 1.1) * Z, by = (selObj.y - 1.1) * Z;
    ctx.beginPath(); ctx.arc(bx, by, 11, 0, 7);
    ctx.fillStyle = '#4a6cf0'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('↻', bx, by + 4.5);
    ctx.textAlign = 'left';
    cv._rotBtn = { x: selObj.x + 1.1, y: selObj.y - 1.1 };
  } else cv._rotBtn = null;

  ctx.restore();
}

function drawBattery(bat, C) {
  ctx.fillStyle = '#3b4552'; ctx.strokeStyle = '#20272f'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(bat.x * Z, bat.y * Z, bat.w * Z, bat.h * Z, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#cfd6de'; ctx.font = '11px sans-serif';
  ctx.fillText('전지 AA × 2 (3V)', (bat.x + 1.2) * Z, (bat.y + 1.1) * Z);
  // 스위치 (전지 오른쪽)
  const on = C.tested;
  ctx.beginPath(); ctx.arc(bat.sw.x * Z, bat.sw.y * Z, 0.75 * Z, 0, 7);
  ctx.fillStyle = on ? '#37c26e' : '#828b96'; ctx.fill();
  ctx.strokeStyle = '#20272f'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(10, Z * 0.6)}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(on ? 'ON' : 'OFF', bat.sw.x * Z, bat.sw.y * Z + Z * 0.22);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#5a6474'; ctx.font = '11px sans-serif';
  ctx.fillText('스위치', (bat.sw.x - 0.8) * Z, (bat.y - 0.25) * Z);

  const wcol = ['#d64545', '#2f3640'];
  const terms = [bat.tp, bat.tm];
  C.holder.wires.forEach((w, wi) => {
    const t = terms[wi];
    ctx.strokeStyle = wcol[wi]; ctx.lineWidth = 3;
    if (!w.dock) {
      ctx.beginPath();
      ctx.moveTo(t.x * Z, t.y * Z);
      ctx.bezierCurveTo(t.x * Z, (w.y + (t.y - w.y) * 0.5) * Z, w.x * Z, (w.y + 1.2) * Z, w.x * Z, w.y * Z);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(w.x * Z, w.y * Z, 5, 0, 7);
      ctx.fillStyle = wcol[wi]; ctx.fill();
      if (selected && selected.type === 'wire' && selected.wi === wi) { ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = wcol[wi];
      ctx.fillText(wi === 0 ? '+' : '−', w.x * Z + 7, w.y * Z - 6);
    } else {
      ctx.beginPath(); ctx.moveTo(t.x * Z, t.y * Z); ctx.lineTo(t.x * Z, (t.y - 0.7) * Z); ctx.stroke();
      ctx.beginPath(); ctx.arc(t.x * Z, (t.y - 0.7) * Z, 6, 0, 7);
      ctx.fillStyle = wcol[wi]; ctx.fill();
      if (selected && selected.type === 'wire' && selected.wi === wi) { ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = wcol[wi]; ctx.font = 'bold 12px sans-serif';
      ctx.fillText(wi === 0 ? '+' : '−', t.x * Z + 8, (t.y - 0.6) * Z);
    }
  });
}

// ---------- 결과 패널 ----------
function updatePanel() {
  const C = work.circuit, R = solveResult;
  const el = $('circuit-info');
  let html = '';
  if (!R) { el.innerHTML = html; return; }
  if (C.leds.length > config.ledCount)
    html += `<p class="hint">실제로 지급되는 LED는 ${config.ledCount}개예요. 배치를 참고로 실험하는 건 자유!</p>`;
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
  } else html += '<p class="muted">스위치가 꺼져 있어요. 몇 개가 켜질지 예측을 적고 스위치를 켜 보세요.</p>';
  el.innerHTML = html;
}

// ---------- 미리보기 탭에 넘겨줄 정보 ----------
export function getLighting() {
  const d = dims(), C = work.circuit;
  const R = solve();
  const litSet = C.tested ? R.lit : {};
  const out = { lit: [], tested: C.tested, dims: d };
  for (const [iStr, b] of Object.entries(litSet)) {
    const l = C.leds[+iStr];
    const mag = MAGIC[l.color || 'none'];
    const k = faceOf(l) || 'back';
    let face = 'back', fx = l.x, fy = l.y;
    if (k === 'top') { face = 'top'; fy = 0; }
    else if (k === 'bottom') { face = 'bottom'; fy = d.bh; }
    else if (k === 'left') { face = 'left'; fx = 0; }
    else if (k === 'right') { face = 'right'; fx = d.bw; }
    out.lit.push({ face, fx, fy, b, rgb: mag.rgb });
  }
  return out;
}

// ---------- 입력 처리 ----------
function hitTest(p) {
  const C = work.circuit;
  const bat = battery();
  // 회전 버튼
  if (cv._rotBtn && Math.hypot(p.x - cv._rotBtn.x, p.y - cv._rotBtn.y) < 0.85) return { type: 'rotate' };
  // 스위치
  if (Math.hypot(p.x - bat.sw.x, p.y - bat.sw.y) < 1.0) return { type: 'switch' };
  for (let wi = 0; wi < 2; wi++) {
    const w = C.holder.wires[wi];
    if (!w.dock && Math.hypot(p.x - w.x, p.y - w.y) < 0.7) return { type: 'wire', wi };
    if (w.dock) {
      const t = wi === 0 ? bat.tp : bat.tm;
      if (Math.hypot(p.x - t.x, p.y - (t.y - 0.7)) < 0.8) return { type: 'wire', wi };
    }
  }
  for (let i = C.leds.length - 1; i >= 0; i--)
    if (Math.hypot(p.x - C.leds[i].x, p.y - C.leds[i].y) < 0.8) return { type: 'led', i };
  for (let i = (C.resistors || []).length - 1; i >= 0; i--)
    if (Math.hypot(p.x - C.resistors[i].x, p.y - C.resistors[i].y) < 0.8) return { type: 'res', i };
  for (let i = C.tapes.length - 1; i >= 0; i--)
    if (distTape2D(p, C.tapes[i]) < 0.5) return { type: 'tape', i };
  return null;
}

function rotateSelected() {
  const C = work.circuit;
  const o = selected && (selected.type === 'led' ? C.leds[selected.i] : selected.type === 'res' ? C.resistors[selected.i] : null);
  if (o && !readOnly) { o.dir = (o.dir + 1) % 4; Object.assign(o, clampPart(o, o.dir)); C.tested = false; afterChange(); }
}

function toggleSwitch() {
  const C = work.circuit;
  if (readOnly) return;
  if (!C.tested) {
    if (config.askPredict && C.predictCount === '') {
      $('circuit-predict-hint').textContent = '몇 개가 켜질지 먼저 예측해 보세요.';
      return;
    }
    C.tested = true;
    const R = solve();
    const litN = Object.keys(R.lit).length;
    addLog(`회로 — LED ${C.leds.length}개 배치 → ${litN}개 점등` + (R.short ? ' (합선!)' : ''));
    sheetLog('회로 점등', `LED ${C.leds.length}개 중 ${litN}개 켜짐` +
      (R.short ? ', 합선' : '') + (R.dimSeries ? ', 직렬로 어두움' : '') + (R.hasBlockedSeries ? ', 직렬 과다로 소등' : '') +
      (config.askPredict ? `, 예측 ${C.predictCount}개` : ''));
    renderLogList();
  } else {
    C.tested = false;
  }
  touch();
  updateSwitchButton();
  resolveAndDraw();
}
function updateSwitchButton() {
  $('btn-test').textContent = work.circuit.tested ? '스위치 끄기' : '스위치 켜기';
  $('btn-test').classList.toggle('on', work.circuit.tested);
  const ok = !config.askPredict || work.circuit.predictCount !== '';
  $('btn-test').disabled = readOnly || (!work.circuit.tested && !ok);
  $('circuit-predict-hint').textContent = ok ? '' : '몇 개가 켜질지 먼저 예측해 보세요.';
}

function resolveAndDraw() {
  solveResult = solve();
  updatePanel();
  managePulse();
  draw();
}
function managePulse() {
  const need = !view3d && solveResult && work.circuit.tested && (solveResult.short ||
    (solveResult.energizedPlus.size && solveResult.energizedMinus.size));
  if (need && !pulseTimer) pulseTimer = setInterval(() => { pulse += 0.35; draw(); }, 90);
  if (!need && pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
}
function set3D(on) {
  view3d = on;
  $('btn-3d').classList.toggle('active', on);
  $('btn-3d').textContent = on ? '평면(전개도)으로 돌아가기' : '입체로 보기';
  drawingTape = null; selected = null;
  updateSelPanel();
  resolveAndDraw();
}

export function initCircuit() {
  cv = $('circuit-canvas');
  ctx = cv.getContext('2d');
  cv.addEventListener('contextmenu', e => e.preventDefault());

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
    tape: '전도성 테이프 — 은이 섞인 천이라 전기가 통해요. 겹치면 이어지고, 끊어지면 전류도 멈춰요. 접는 선을 넘어 이어 붙여도 돼요.',
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
    // 스위치·회전 버튼은 어떤 도구에서든 동작
    const pre = hitTest(p);
    if (pre && pre.type === 'switch') { toggleSwitch(); return; }
    if (pre && pre.type === 'rotate' && tool === 'select') { rotateSelected(); return; }

    if (tool === 'tape') {
      if (!drawingTape) drawingTape = [];
      drawingTape.push(clampNet({ x: snap(p.x), y: snap(p.y) }));
      draw();
      return;
    }
    if (tool === 'led') {
      if (C.leds.length >= config.ledCount && config.overLimit === 'block') return;
      C.leds.push({ ...clampPart({ x: snap(p.x), y: snap(p.y) }, 0), dir: 0, color: 'none' });
      selected = { type: 'led', i: C.leds.length - 1 };
      C.tested = false; afterChange();
      return;
    }
    if (tool === 'res') {
      C.resistors.push({ ...clampPart({ x: snap(p.x), y: snap(p.y) }, 0), dir: 0 });
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
        else if (hit.type === 'wire') C.holder.wires[hit.wi] = { dock: true };
        C.tested = false; afterChange();
      }
      return;
    }
    const hit = pre;
    selected = hit && ['led', 'res', 'tape', 'wire'].includes(hit.type) ? hit : null;
    updateSelPanel();
    if (selected) {
      cv.setPointerCapture(e.pointerId);
      if (selected.type === 'led') dragOff = { x: p.x - C.leds[selected.i].x, y: p.y - C.leds[selected.i].y };
      else if (selected.type === 'res') dragOff = { x: p.x - C.resistors[selected.i].x, y: p.y - C.resistors[selected.i].y };
      else if (selected.type === 'wire') dragOff = { x: 0, y: 0 };
      else if (selected.type === 'tape') dragOff = { x: p.x, y: p.y, pts: C.tapes[selected.i].pts.map(q => ({ ...q })) };
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
      Object.assign(l, clampPart({ x: snap(p.x - dragOff.x), y: snap(p.y - dragOff.y) }, l.dir));
    } else if (selected.type === 'res') {
      const r = C.resistors[selected.i];
      Object.assign(r, clampPart({ x: snap(p.x - dragOff.x), y: snap(p.y - dragOff.y) }, r.dir));
    } else if (selected.type === 'wire') {
      const d = dims();
      if (p.y <= d.bh + d.td + 0.4)
        C.holder.wires[selected.wi] = { ...clampNet({ x: snap(p.x), y: snap(p.y) }) };
      else
        C.holder.wires[selected.wi] = { dock: true };
    } else if (selected.type === 'tape') {
      const dx = snap(p.x - dragOff.x), dy = snap(p.y - dragOff.y);
      C.tapes[selected.i].pts = dragOff.pts.map(q => clampNet({ x: q.x + dx, y: q.y + dy }));
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
      else if (selected.type === 'wire') C.holder.wires[selected.wi] = { dock: true };
      selected = null; C.tested = false; afterChange();
    }
    if (e.key.toLowerCase() === 'r') rotateSelected();
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
  $('btn-led-rot').addEventListener('click', rotateSelected);

  $('in-predict-led').addEventListener('input', () => {
    work.circuit.predictCount = $('in-predict-led').value;
    touch(); updateSwitchButton();
  });
  $('btn-test').addEventListener('click', toggleSwitch);

  document.addEventListener('work-loaded', refreshCircuit);
  refreshCircuit();
}

function finishTape() {
  if (drawingTape && drawingTape.length >= 2) {
    work.circuit.tapes.push({ pts: drawingTape });
    work.circuit.tested = false;
    drawingTape = null;
    afterChange();
  } else { drawingTape = null; draw(); }
}

function afterChange() {
  touch();
  updateSwitchButton();
  updateSelPanel();
  resolveAndDraw();
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
  updateSwitchButton();
  resolveAndDraw();
}
