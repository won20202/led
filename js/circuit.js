// 회로 탭: 케이스를 펼친 전개도(뒷면 + 네 옆면) 위에 회로를 만들고,
// [입체로 보기]로 조립된 모습을 확인한다. 연결 여부는 "접었을 때의 실제 거리"로 판단하므로
// 테이프가 접히는 모서리를 넘어가도, 면과 면이 만나는 곳에서도 자연스럽게 이어진다.
// 스위치를 켜야 불이 들어온다. 배치를 바꾸면 스위치는 다시 꺼진다.
import { config, work, addLog, touch, readOnly, sheetLog } from './state.js';
import { renderLogList } from './case3d.js';

const $ = id => document.getElementById(id);

// 실제 색 LED (심화 모드) — 색마다 문턱 전압이 다르다. 빨강·노랑·초록은 3V 직결 시
// 과전류가 되어 "색 LED는 저항이 필요하다"를 스스로 발견하게 된다.
export const KINDS = {
  white: { label: '백색', vth: null, rgb: [255, 250, 230] }, // vth null = 설정값(config.vf) 사용
  red: { label: '빨강', vth: 1.8, rgb: [255, 95, 95] },
  yellow: { label: '노랑', vth: 1.9, rgb: [255, 220, 80] },
  green: { label: '초록', vth: 2.0, rgb: [90, 230, 120] },
  blue: { label: '파랑', vth: 2.6, rgb: [95, 155, 255] },
};
function vthOf(l) { const k = KINDS[l.kind || 'white']; return k.vth ?? config.vf; }
function rgbOf(l) {
  if ((l.kind || 'white') !== 'white') return KINDS[l.kind].rgb;
  return (MAGIC[l.color || 'none'] || MAGIC.none).rgb;
}
function fOf(l) {
  if ((l.kind || 'white') !== 'white') return 1; // 매직 색칠은 백색 LED에만
  return (MAGIC[l.color || 'none'] || MAGIC.none).f;
}

export const MAGIC = {
  none: { label: '칠하지 않음', f: 1.0, rgb: [255, 250, 230] },
  yellow: { label: '노랑', f: 0.75, rgb: [255, 230, 90] },
  green: { label: '초록', f: 0.60, rgb: [120, 255, 140] },
  red: { label: '빨강', f: 0.55, rgb: [255, 110, 110] },
  blue: { label: '파랑', f: 0.45, rgb: [110, 160, 255] },
  black: { label: '검정', f: 0.02, rgb: [80, 80, 80] },
};

let cv, ctx, tool = 'select';
let mode = 'lab';          // 'lab' = 회로 실험실(빈 화면) | 'placard' = 플래카드 전개도
let view3d = false;
let Z = 15;

// 지금 편집 중인 회로 모델 (실험실 or 플래카드)
function am() { return mode === 'lab' ? (work.lab = work.lab || { leds: [], resistors: [], tapes: [], holder: null, tested: false }) : work.circuit; }
const LAB = { w: 42, h: 20 }; // 실험실 작업대 크기 (cm)
let geomLab = false;          // solve/draw가 실험실 좌표(평면)로 동작 중인지
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
  if (geomLab) {
    return (p.x >= -0.01 && p.x <= LAB.w + 0.01 && p.y >= -0.01 && p.y <= LAB.h + 0.01) ? 'bench' : null;
  }
  const F = faces();
  for (const k of Object.keys(F)) {
    const f = F[k];
    if (p.x >= f.x0 - 0.01 && p.x <= f.x1 + 0.01 && p.y >= f.y0 - 0.01 && p.y <= f.y1 + 0.01) return k;
  }
  return null;
}
// 전개도(또는 실험실 작업대) 밖으로 나가지 않게
function clampNet(p) {
  if (geomLab)
    return { x: Math.min(Math.max(p.x, 0), LAB.w), y: Math.min(Math.max(p.y, 0), LAB.h) };
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
  const f = geomLab ? { x0: 0, y0: 0, x1: LAB.w, y1: LAB.h } : faces()[k];
  const vert = (dir || 0) % 2 === 0;
  const ix = vert ? 0.4 : 1, iy = vert ? 1 : 0.4;
  return {
    x: Math.min(Math.max(q.x, f.x0 + ix), Math.max(f.x0 + ix, f.x1 - ix)),
    y: Math.min(Math.max(q.y, f.y0 + iy), Math.max(f.y0 + iy, f.y1 - iy)),
  };
}
// 전개도 좌표 → 접었을 때의 3D 좌표 (실험실은 평면 그대로)
function to3Dp(p) {
  if (geomLab) return { X: p.x, Y: p.y, Z: 0 };
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

// 건전지 홀더: 학생이 직접 놓고 돌리는 부품. 단자·스위치 위치는 몸체 기준 회전.
function rotV(px, py, dir) {
  const a = (dir || 0) * Math.PI / 2;
  return { x: px * Math.cos(a) - py * Math.sin(a), y: px * Math.sin(a) + py * Math.cos(a) };
}
function holderGeom(h) {
  const t0 = rotV(-1.5, -1.25, h.dir), t1 = rotV(1.5, -1.25, h.dir);
  const sw = rotV(1.9, 0.45, h.dir);
  const d0 = rotV(-1.5, -1.95, h.dir), d1 = rotV(1.5, -1.95, h.dir); // 도킹된 전선 끝 위치
  return {
    t: [{ x: h.x + t0.x, y: h.y + t0.y }, { x: h.x + t1.x, y: h.y + t1.y }],
    dock: [{ x: h.x + d0.x, y: h.y + d0.y }, { x: h.x + d1.x, y: h.y + d1.y }],
    sw: { x: h.x + sw.x, y: h.y + sw.y },
  };
}

const MARGIN = 0.8;
function origin() {
  if (mode === 'lab') return { ox: MARGIN, oy: MARGIN };
  const d = dims();
  return { ox: MARGIN + d.sw, oy: MARGIN + d.td };
}
function toCm(e) {
  const r = cv.getBoundingClientRect();
  const { ox, oy } = origin();
  return {
    x: (e.clientX - r.left) * (cv.width / r.width) / Z - ox,
    y: (e.clientY - r.top) * (cv.height / r.height) / Z - oy,
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
  // 홀더는 학생이 놓는 부품 — 위치가 없는 옛 데이터는 미배치 상태로
  if (C.holder && C.holder.x === undefined) C.holder = null;
  if (C.holder) {
    C.holder.dir = C.holder.dir || 0;
    if (!C.holder.wires) C.holder.wires = [{ dock: true }, { dock: true }];
    C.holder.wires.forEach(w => {
      if (w.surf === 'dock' || (w.x === undefined && !w.dock)) { w.dock = true; }
      delete w.surf;
    });
  }
}

// ---------- 실행 취소 ----------
let undoStack = [];
function pushUndo() {
  undoStack.push(JSON.stringify(am()));
  if (undoStack.length > 40) undoStack.shift();
  updateUndoBtn();
}
function doUndo() {
  if (!undoStack.length || readOnly) return;
  const s = undoStack.pop();
  const C = am();
  Object.keys(C).forEach(k => delete C[k]);
  Object.assign(C, JSON.parse(s));
  drawingTape = null; selected = null;
  afterChange();
}
function updateUndoBtn() {
  const b = $('btn-undo');
  if (b) b.disabled = readOnly || !undoStack.length;
}

// ---------- 회로 해석 ----------
// 백색 LED = 문턱 전압 Vth + 동저항 Rd 근사. I = (Vs − k·Vth) / (Rint + k·Rd + R외부)
// → 1.5V 안 켜짐 / 3V 1개 정상 / 3V 직렬2 소등 / 6V 직렬2 정상 / 고전압 직결 과전류·소손. 현실과 같은 결론.
function solve(Cin, labGeom) {
  const C = Cin || am();
  const lab = labGeom !== undefined ? labGeom : (mode === 'lab' && C === work.lab);
  const prevGeom = geomLab;
  geomLab = lab;
  try {
    return solveInner(C, lab);
  } finally { geomLab = prevGeom; }
}
function solveInner(C, lab) {
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

  const Vs = lab ? ((C.holder && C.holder.cells) || 2) * 1.5 : config.voltage;
  const res = { plus: -1, minus: -1, short: false, wiresOff: 0, on: C.tested, noHolder: !C.holder,
    lit: {}, over: new Set(), burnt: new Set(), voltage: Vs,
    tapeComp: C.tapes.map((_, i) => find(i)), energizedPlus: new Set(), energizedMinus: new Set(),
    hasBlockedSeries: false, dimSeries: false, noResistorLit: false, anyLit: false };
  if (!C.holder) return res;

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
    const sumVth = p.leds.reduce((a, i) => a + vthOf(C.leds[i]), 0); // 색 LED는 문턱 전압이 다르다
    const I = (Vs - sumVth) / (config.rint + k * config.ledRd + config.resistorOhm * p.nRes) * 1000;
    if (I <= 0.2) { if (k >= 2) res.hasBlockedSeries = true; continue; }
    conducting.push({ leds: p.leds, nRes: p.nRes, I });
  }
  const total = conducting.reduce((a, p) => a + p.I, 0);
  const scale = total > config.imax ? config.imax / total : 1;
  for (const p of conducting) {
    const I = p.I * scale;
    for (const i of p.leds) {
      if (I > config.iBurn) { res.burnt.add(i); continue; } // 과전류로 소손 — 현실에서도 이렇게 된다
      if (I > config.iOver) res.over.add(i);
      if (p.leds.length >= 2 && I < 12) res.dimSeries = true;
      const b = Math.min(1.3, I / 20); // 과전류면 정격보다 더 밝게 보인다
      res.lit[i] = Math.max(res.lit[i] || 0, b * fOf(C.leds[i]));
      if (p.nRes === 0) res.noResistorLit = true;
    }
  }
  res.burnt.forEach(i => delete res.lit[i]); // 타버린 LED는 켜지지 않는다
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
  const C = work.circuit; // 항상 플래카드 회로를 그린다
  normalize(C);
  const R = solve(work.circuit, false);
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
      const mag = { rgb: rgbOf(l) };
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
      lit: am().tested,
      walls: 'solid',
      label: '조립된 모습 — 전개도에 붙인 회로가 이렇게 둘러집니다',
    });
    return;
  }
  geomLab = mode === 'lab';
  const { ox, oy } = origin();
  const W = mode === 'lab'
    ? Math.round((LAB.w + MARGIN * 2) * Z)
    : Math.round((d.sw * 2 + d.bw + MARGIN * 2) * Z);
  const H = mode === 'lab'
    ? Math.round((LAB.h + MARGIN * 2) * Z)
    : Math.round((d.td * 2 + d.bh + MARGIN * 2 + 0.4) * Z);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(ox * Z, oy * Z);

  const C = am(), R = solveResult;
  const litMode = C.tested && R && (R.anyLit || R.short);

  if (mode === 'lab') {
    // 실험실 작업대
    ctx.fillStyle = '#fbfcfe';
    ctx.fillRect(0, 0, LAB.w * Z, LAB.h * Z);
    ctx.strokeStyle = '#c2cad3';
    ctx.strokeRect(0, 0, LAB.w * Z, LAB.h * Z);
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.beginPath();
    for (let x = 1; x < LAB.w; x++) { ctx.moveTo(x * Z, 0); ctx.lineTo(x * Z, LAB.h * Z); }
    for (let y = 1; y < LAB.h; y++) { ctx.moveTo(0, y * Z); ctx.lineTo(LAB.w * Z, y * Z); }
    ctx.stroke();
    ctx.fillStyle = '#98a1ab'; ctx.font = '11px sans-serif';
    ctx.fillText('회로 실험실 — 전지·LED·테이프를 자유롭게 연결해 보세요', 6, 15);
  } else {
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
  }

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

  if (C.holder) drawHolder(C.holder, C);

  if (litMode) {
    ctx.fillStyle = 'rgba(14,17,28,0.55)';
    ctx.fillRect(-ox * Z, -oy * Z, W, H);
    if (C.holder) drawHolder(C.holder, C); // 스위치는 어두워져도 보이게
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
    const burnt = R && R.burnt && R.burnt.has(i) && C.tested;
    const mag = { rgb: rgbOf(l) };
    ctx.lineWidth = 2; ctx.strokeStyle = litMode ? '#b9bfc8' : '#8d939c';
    ctx.beginPath(); ctx.moveTo(l.x * Z, l.y * Z); ctx.lineTo(g.a.x * Z, g.a.y * Z); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(l.x * Z, l.y * Z); ctx.lineTo(g.k.x * Z, g.k.y * Z); ctx.stroke();
    ctx.fillStyle = '#d05a4e'; ctx.font = 'bold 11px sans-serif';
    ctx.fillText('+', g.a.x * Z + 4, g.a.y * Z + 4);
    if (burnt) {
      // 타버린 LED — 검게 그을리고 금이 간 모습
      ctx.beginPath(); ctx.arc(l.x * Z, l.y * Z, 0.38 * Z, 0, 7);
      ctx.fillStyle = '#4a4038'; ctx.fill();
      ctx.strokeStyle = '#2b2320'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = '#1a1512'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo((l.x - 0.25) * Z, (l.y - 0.2) * Z); ctx.lineTo((l.x + 0.1) * Z, (l.y + 0.05) * Z);
      ctx.lineTo((l.x - 0.05) * Z, (l.y + 0.25) * Z);
      ctx.stroke();
      return;
    }
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
      : (((l.kind && l.kind !== 'white') || (l.color && l.color !== 'none'))
        ? `rgba(${mag.rgb[0]},${mag.rgb[1]},${mag.rgb[2]},0.45)` : '#e8e8e2');
    ctx.fill();
    ctx.strokeStyle = selected && selected.type === 'led' && selected.i === i ? '#2b6cb0' : (lit > 0.02 ? '#fff' : '#767c85');
    ctx.lineWidth = selected && selected.type === 'led' && selected.i === i ? 2.5 : 1.5;
    ctx.stroke();
  });

  // 선택된 부품 옆에 회전 버튼 (LED·저항·건전지 홀더)
  const selObj = selected && (
    selected.type === 'led' ? C.leds[selected.i] :
    selected.type === 'res' ? C.resistors[selected.i] :
    selected.type === 'holder' ? C.holder : null);
  if (selObj) {
    const off = selected.type === 'holder' ? 3.4 : 1.1;
    const bx = (selObj.x + off) * Z, by = (selObj.y - off) * Z;
    ctx.beginPath(); ctx.arc(bx, by, 11, 0, 7);
    ctx.fillStyle = '#4a6cf0'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('↻', bx, by + 4.5);
    ctx.textAlign = 'left';
    cv._rotBtn = { x: selObj.x + off, y: selObj.y - off };
  } else cv._rotBtn = null;

  ctx.restore();
}

function drawHolder(h, C) {
  const g = holderGeom(h);
  const wcol = ['#d64545', '#2f3640'];
  // 전선 (몸체보다 먼저 — 몸체 아래에서 나오는 느낌)
  C.holder.wires.forEach((w, wi) => {
    const t = g.t[wi];
    ctx.strokeStyle = wcol[wi]; ctx.lineWidth = 3;
    if (!w.dock) {
      ctx.beginPath();
      ctx.moveTo(t.x * Z, t.y * Z);
      const mx = (t.x + w.x) / 2, my = (t.y + w.y) / 2 - 1;
      ctx.quadraticCurveTo(mx * Z, my * Z, w.x * Z, w.y * Z);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(w.x * Z, w.y * Z, 5, 0, 7);
      ctx.fillStyle = wcol[wi]; ctx.fill();
      if (selected && selected.type === 'wire' && selected.wi === wi) { ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = wcol[wi];
      ctx.fillText(wi === 0 ? '+' : '−', w.x * Z + 7, w.y * Z - 6);
    } else {
      const dpt = g.dock[wi];
      ctx.beginPath(); ctx.moveTo(t.x * Z, t.y * Z); ctx.lineTo(dpt.x * Z, dpt.y * Z); ctx.stroke();
      ctx.beginPath(); ctx.arc(dpt.x * Z, dpt.y * Z, 6, 0, 7);
      ctx.fillStyle = wcol[wi]; ctx.fill();
      if (selected && selected.type === 'wire' && selected.wi === wi) { ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = wcol[wi]; ctx.font = 'bold 12px sans-serif';
      ctx.fillText(wi === 0 ? '+' : '−', dpt.x * Z + 8, dpt.y * Z);
    }
  });
  // 몸체 (방향대로 회전)
  ctx.save();
  ctx.translate(h.x * Z, h.y * Z);
  ctx.rotate((h.dir || 0) * Math.PI / 2);
  ctx.fillStyle = '#3b4552';
  ctx.strokeStyle = selected && selected.type === 'holder' ? '#2b6cb0' : '#20272f';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-2.75 * Z, -1.25 * Z, 5.5 * Z, 2.5 * Z, 5); ctx.fill(); ctx.stroke();
  // 스위치 (몸체 위)
  ctx.beginPath(); ctx.arc(1.9 * Z, 0.45 * Z, 0.6 * Z, 0, 7);
  ctx.fillStyle = C.tested ? '#37c26e' : '#828b96'; ctx.fill();
  ctx.strokeStyle = '#20272f'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
  // 글자는 회전 없이
  ctx.fillStyle = '#cfd6de'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  const cells = mode === 'lab' ? (h.cells || 2) : 2;
  ctx.fillText(`AA×${cells} · ${(cells * 1.5).toFixed(1)}V`, h.x * Z, (h.y - 0.25) * Z);
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(9, Z * 0.5)}px sans-serif`;
  ctx.fillText(C.tested ? 'ON' : 'OFF', g.sw.x * Z, g.sw.y * Z + Z * 0.18);
  ctx.textAlign = 'left';
}

// ---------- 결과 패널 ----------
function updatePanel() {
  const C = am(), R = solveResult;
  const el = $('circuit-info');
  let html = '';
  if (!R) { el.innerHTML = html; return; }
  if (mode === 'lab' && C.holder)
    html += `<p class="supply">지금 전지 — AA × ${(C.holder.cells || 2)}개 = <b>${R.voltage.toFixed(1)}V</b></p>`;
  if (mode === 'placard' && C.leds.length > config.ledCount)
    html += `<p class="hint">실제로 지급되는 LED는 ${config.ledCount}개예요. 배치를 참고로 실험하는 건 자유!</p>`;
  if (R.noHolder) html += '<p class="muted">건전지 홀더를 놓고, 빨간 선(+)·검은 선(−)을 회로에 연결해 보세요.</p>';
  else if (R.wiresOff === 2) html += '<p class="muted">전지의 빨간 선(+)과 검은 선(−) 끝을 끌어다 테이프나 LED 다리에 붙여 보세요.</p>';
  else if (R.wiresOff === 1) html += '<p class="muted">전선 한 가닥이 아직 전지에 꽂혀만 있어요. 마저 연결해 볼까요?</p>';
  else if (R.short) html += '<p class="warn">전지가 뜨거워집니다! (+)와 (−)가 어딘가에서 직접 만나고 있습니다.</p>';
  else if (C.tested) {
    const litN = Object.keys(R.lit).length;
    html += `<p class="measure">점등 결과 — LED ${C.leds.length}개 중 <b>${litN}개</b> 켜짐</p>`;
    if (mode === 'placard' && config.askPredict && C.predictCount !== '') {
      const ok = parseInt(C.predictCount) === litN;
      html += `<p class="${ok ? 'ok' : 'warn'}">내 예측: ${C.predictCount}개</p>`;
    }
    if (R.burnt.size)
      html += `<p class="warn">전류가 너무 커서 LED ${R.burnt.size}개가 타버렸어요! 실제로도 저항 없이 높은 전압을 직접 연결하면 이렇게 됩니다. 전지 개수를 줄이거나 저항을 넣어 보세요.</p>`;
    else if (R.over.size)
      html += `<p class="warn">LED에 정격(20mA)보다 큰 전류가 흐르고 있어요. 실제라면 매우 뜨거워지고 수명이 크게 짧아집니다. 저항을 넣거나 전압을 낮춰 볼까요?</p>`;
    if (config.questionFeedback) {
      const unlit = C.leds.length - litN - R.burnt.size;
      if (unlit > 0) html += `<p class="hint">안 켜진 LED가 ${unlit}개 있습니다. 긴 다리(+)가 어느 줄에 붙어 있는지, 두 다리가 서로 다른 줄에 있는지, 전압이 충분한지 살펴볼까요?</p>`;
      if (R.dimSeries) html += `<p class="hint">유난히 어둡게 켜진 LED가 보이나요? 전류가 LED를 몇 개나 거쳐 가는지, 전지의 전압이 얼마인지 생각해 보세요.</p>`;
      if (R.hasBlockedSeries) html += `<p class="hint">LED를 여러 개 거쳐 가는 길이 있네요. LED가 늘어날수록 각 LED가 나눠 받는 전압은 어떻게 될까요?</p>`;
      if (litN > 0 && litN === C.leds.length && !R.dimSeries && !R.over.size)
        html += mode === 'placard'
          ? `<p class="ok">모두 켜졌습니다. [입체로 보기]와 [미리보기] 탭에서 완성 모습을 확인해 보세요.</p>`
          : `<p class="ok">모두 안정적으로 켜졌습니다. 이 연결 방법을 플래카드에도 써 볼까요?</p>`;
      const blacks = C.leds.filter(l => l.color === 'black').length;
      if (blacks) html += `<p class="warn">검정으로 칠한 LED는 빛이 나오지 않습니다.</p>`;
    }
    if (mode === 'placard' && R.noResistorLit && !R.over.size && !R.burnt.size)
      html += `<p class="hint">지금 회로에는 저항이 없어서 LED에 전류가 그대로 흐릅니다. 실제 제작에서는 LED가 뜨거워져 수명이 빨리 닳을 수 있어요. 저항을 함께 쓰면 전류를 알맞게 제한해 LED를 오래 쓸 수 있습니다.</p>`;
  } else html += mode === 'placard'
    ? '<p class="muted">스위치가 꺼져 있어요. 몇 개가 켜질지 예측을 적고 스위치를 켜 보세요.</p>'
    : '<p class="muted">스위치가 꺼져 있어요. 홀더의 스위치를 눌러 보세요.</p>';
  el.innerHTML = html;
}

// ---------- 미리보기 탭에 넘겨줄 정보 (항상 플래카드 회로) ----------
export function getLighting() {
  const d = dims(), C = work.circuit;
  const R = solve(work.circuit, false);
  const litSet = C.tested ? R.lit : {};
  const out = { lit: [], tested: C.tested, dims: d };
  const prevGeom = geomLab;
  geomLab = false; // 플래카드 전개도 기준으로 면을 판정
  for (const [iStr, b] of Object.entries(litSet)) {
    const l = C.leds[+iStr];
    const mag = { rgb: rgbOf(l) };
    const k = faceOf(l) || 'back';
    let face = 'back', fx = l.x, fy = l.y;
    if (k === 'top') { face = 'top'; fy = 0; }
    else if (k === 'bottom') { face = 'bottom'; fy = d.bh; }
    else if (k === 'left') { face = 'left'; fx = 0; }
    else if (k === 'right') { face = 'right'; fx = d.bw; }
    out.lit.push({ face, fx, fy, b: Math.min(1, b), rgb: mag.rgb });
  }
  geomLab = prevGeom;
  return out;
}

// ---------- 입력 처리 ----------
function inHolderBody(p, h) {
  const a = -(h.dir || 0) * Math.PI / 2;
  const dx = p.x - h.x, dy = p.y - h.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) < 2.9 && Math.abs(ly) < 1.4;
}
function hitTest(p) {
  const C = am();
  // 회전 버튼
  if (cv._rotBtn && Math.hypot(p.x - cv._rotBtn.x, p.y - cv._rotBtn.y) < 0.85) return { type: 'rotate' };
  if (C.holder) {
    const g = holderGeom(C.holder);
    if (Math.hypot(p.x - g.sw.x, p.y - g.sw.y) < 0.85) return { type: 'switch' };
    for (let wi = 0; wi < 2; wi++) {
      const w = C.holder.wires[wi];
      if (!w.dock && Math.hypot(p.x - w.x, p.y - w.y) < 0.7) return { type: 'wire', wi };
      if (w.dock && Math.hypot(p.x - g.dock[wi].x, p.y - g.dock[wi].y) < 0.8) return { type: 'wire', wi };
    }
  }
  for (let i = C.leds.length - 1; i >= 0; i--)
    if (Math.hypot(p.x - C.leds[i].x, p.y - C.leds[i].y) < 0.8) return { type: 'led', i };
  for (let i = (C.resistors || []).length - 1; i >= 0; i--)
    if (Math.hypot(p.x - C.resistors[i].x, p.y - C.resistors[i].y) < 0.8) return { type: 'res', i };
  if (C.holder && inHolderBody(p, C.holder)) return { type: 'holder' };
  for (let i = C.tapes.length - 1; i >= 0; i--)
    if (distTape2D(p, C.tapes[i]) < 0.5) return { type: 'tape', i };
  return null;
}

function rotateSelected() {
  const C = am();
  const o = selected && (
    selected.type === 'led' ? C.leds[selected.i] :
    selected.type === 'res' ? C.resistors[selected.i] :
    selected.type === 'holder' ? C.holder : null);
  if (o && !readOnly) {
    pushUndo();
    o.dir = ((o.dir || 0) + 1) % 4;
    if (selected.type !== 'holder') Object.assign(o, clampPart(o, o.dir));
    C.tested = false; afterChange();
  }
}

function toggleSwitch() {
  const C = am();
  if (readOnly) return;
  if (!C.holder) {
    $('circuit-info').innerHTML = '<p class="hint">먼저 건전지 홀더를 놓아 주세요. 스위치는 홀더에 달려 있어요.</p>';
    return;
  }
  if (!C.tested) {
    // 예측 먼저는 플래카드(수행)에서만 — 실험실은 자유롭게 켜 본다
    if (mode === 'placard' && config.askPredict && C.predictCount === '') {
      $('circuit-predict-hint').textContent = '몇 개가 켜질지 먼저 예측해 보세요.';
      return;
    }
    C.tested = true;
    const R = solve();
    const litN = Object.keys(R.lit).length;
    const summary = `LED ${C.leds.length}개 중 ${litN}개 켜짐` +
      (R.short ? ', 합선' : '') + (R.dimSeries ? ', 직렬로 어두움' : '') + (R.hasBlockedSeries ? ', 전압 부족 소등' : '') +
      (R.over.size ? ', 과전류' : '') + (R.burnt.size ? `, ${R.burnt.size}개 소손` : '');
    if (mode === 'placard') {
      addLog(`회로 — ${summary}` + (config.askPredict ? ` (예측 ${C.predictCount}개)` : ''));
      sheetLog('회로 점등', summary + (config.askPredict ? `, 예측 ${C.predictCount}개` : ''));
      renderLogList();
    } else {
      sheetLog('실험실 점등', `${R.voltage.toFixed(1)}V, ${summary}`);
    }
  } else {
    C.tested = false;
  }
  touch();
  updateSwitchButton();
  resolveAndDraw();
}
function updateSwitchButton() {
  $('btn-test').textContent = am().tested ? '스위치 끄기' : '스위치 켜기';
  $('btn-test').classList.toggle('on', am().tested);
  const ok = mode === 'lab' || !config.askPredict || am().predictCount !== '';
  $('btn-test').disabled = readOnly || (!am().tested && !ok);
  $('circuit-predict-hint').textContent = ok ? '' : '몇 개가 켜질지 먼저 예측해 보세요.';
}

// 실험실 ↔ 플래카드 전환
function setCircuitMode(m) {
  mode = m;
  if (!readOnly) { work.circuitMode = m; touch(); } // 교사 보드용
  drawingTape = null; selected = null; dragOff = null;
  undoStack = []; updateUndoBtn();
  if (view3d) { view3d = false; $('btn-3d').classList.remove('active'); $('btn-3d').textContent = '입체로 보기'; }
  document.querySelectorAll('#circ-mode button').forEach(b => b.classList.toggle('active', b.dataset.cm === m));
  $('btn-3d').style.display = m === 'placard' ? '' : 'none';
  $('circuit-predict-row').style.display = (m === 'placard' && config.askPredict) ? '' : 'none';
  $('lab-guide').style.display = m === 'lab' ? '' : 'none';
  $('net-hint').style.display = m === 'placard' ? '' : 'none';
  updateSelPanel();
  updateSwitchButton();
  resolveAndDraw();
}

function resolveAndDraw() {
  solveResult = solve();
  updatePanel();
  managePulse();
  draw();
}
function managePulse() {
  const need = !view3d && solveResult && am().tested && (solveResult.short ||
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
    holder: '건전지 홀더 — AA 2개(3V)가 들어가요. +/− 전선을 회로에 연결하고, 홀더의 스위치를 켜야 전류가 흘러요.',
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
    geomLab = mode === 'lab';
    const p = toCm(e);
    const C = am();
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
      pushUndo();
      C.leds.push({ ...clampPart({ x: snap(p.x), y: snap(p.y) }, 0), dir: 0, color: 'none' });
      selected = { type: 'led', i: C.leds.length - 1 };
      C.tested = false; afterChange();
      return;
    }
    if (tool === 'res') {
      pushUndo();
      C.resistors.push({ ...clampPart({ x: snap(p.x), y: snap(p.y) }, 0), dir: 0 });
      selected = { type: 'res', i: C.resistors.length - 1 };
      C.tested = false; afterChange();
      return;
    }
    if (tool === 'holder') {
      pushUndo();
      C.holder = C.holder || { dir: 0, cells: 2, wires: [{ dock: true }, { dock: true }] };
      Object.assign(C.holder, clampNet({ x: snap(p.x), y: snap(p.y) }));
      selected = { type: 'holder' };
      C.tested = false; afterChange();
      return;
    }
    if (tool === 'erase') {
      const hit = hitTest(p);
      if (hit) {
        pushUndo();
        if (hit.type === 'led') C.leds.splice(hit.i, 1);
        else if (hit.type === 'res') C.resistors.splice(hit.i, 1);
        else if (hit.type === 'tape') C.tapes.splice(hit.i, 1);
        else if (hit.type === 'wire') C.holder.wires[hit.wi] = { dock: true };
        else if (hit.type === 'holder') C.holder = null;
        C.tested = false; afterChange();
      }
      return;
    }
    const hit = pre;
    selected = hit && ['led', 'res', 'tape', 'wire', 'holder'].includes(hit.type) ? hit : null;
    updateSelPanel();
    if (selected) {
      cv.setPointerCapture(e.pointerId);
      pushUndo(); // 드래그 시작 전 상태 저장
      if (selected.type === 'led') dragOff = { x: p.x - C.leds[selected.i].x, y: p.y - C.leds[selected.i].y };
      else if (selected.type === 'res') dragOff = { x: p.x - C.resistors[selected.i].x, y: p.y - C.resistors[selected.i].y };
      else if (selected.type === 'holder') dragOff = { x: p.x - C.holder.x, y: p.y - C.holder.y };
      else if (selected.type === 'wire') dragOff = { x: 0, y: 0 };
      else if (selected.type === 'tape') dragOff = { x: p.x, y: p.y, pts: C.tapes[selected.i].pts.map(q => ({ ...q })) };
    }
    draw();
  });

  cv.addEventListener('pointermove', e => {
    geomLab = mode === 'lab';
    const p = toCm(e);
    cursor = p;
    if (view3d) return;
    if (drawingTape) { draw(); return; }
    if (!selected || !dragOff || readOnly) return;
    const C = am();
    if (selected.type === 'led') {
      const l = C.leds[selected.i];
      Object.assign(l, clampPart({ x: snap(p.x - dragOff.x), y: snap(p.y - dragOff.y) }, l.dir));
    } else if (selected.type === 'res') {
      const r = C.resistors[selected.i];
      Object.assign(r, clampPart({ x: snap(p.x - dragOff.x), y: snap(p.y - dragOff.y) }, r.dir));
    } else if (selected.type === 'holder') {
      Object.assign(C.holder, clampNet({ x: snap(p.x - dragOff.x), y: snap(p.y - dragOff.y) }));
    } else if (selected.type === 'wire') {
      // 홀더 몸체 위로 가져가면 전지에 도로 꽂힌다
      if (C.holder && inHolderBody(p, C.holder))
        C.holder.wires[selected.wi] = { dock: true };
      else
        C.holder.wires[selected.wi] = { ...clampNet({ x: snap(p.x), y: snap(p.y) }) };
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
      const C = am();
      pushUndo();
      if (selected.type === 'led') C.leds.splice(selected.i, 1);
      else if (selected.type === 'res') C.resistors.splice(selected.i, 1);
      else if (selected.type === 'tape') C.tapes.splice(selected.i, 1);
      else if (selected.type === 'wire') C.holder.wires[selected.wi] = { dock: true };
      else if (selected.type === 'holder') C.holder = null;
      selected = null; C.tested = false; afterChange();
    }
    if (e.key.toLowerCase() === 'r') rotateSelected();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
  });
  $('btn-tape-done').addEventListener('click', finishTape);

  document.querySelectorAll('#magic-palette button').forEach(b => {
    b.addEventListener('click', () => {
      if (selected && selected.type === 'led' && !readOnly) {
        pushUndo();
        am().leds[selected.i].color = b.dataset.c;
        am().tested = false; afterChange();
      }
    });
  });
  $('btn-led-rot').addEventListener('click', rotateSelected);

  $('in-predict-led').addEventListener('input', () => {
    am().predictCount = $('in-predict-led').value;
    touch(); updateSwitchButton();
  });
  $('btn-test').addEventListener('click', toggleSwitch);
  $('btn-undo').addEventListener('click', doUndo);
  document.querySelectorAll('#circ-mode button').forEach(b =>
    b.addEventListener('click', () => setCircuitMode(b.dataset.cm)));
  // LED 종류 선택 (심화 모드)
  document.querySelectorAll('#led-kind button').forEach(b =>
    b.addEventListener('click', () => {
      if (!selected || selected.type !== 'led' || readOnly) return;
      pushUndo();
      const l = am().leds[selected.i];
      l.kind = b.dataset.k;
      if (l.kind !== 'white') l.color = 'none'; // 매직 색칠은 백색 전용
      am().tested = false;
      afterChange();
    }));
  // 전지 개수 선택 (실험실에서 홀더 선택 시)
  document.querySelectorAll('#holder-cells button').forEach(b =>
    b.addEventListener('click', () => {
      const C = am();
      if (!C.holder || readOnly) return;
      pushUndo();
      C.holder.cells = +b.dataset.n;
      C.tested = false;
      afterChange();
    }));
  $('btn-circuit-reset').addEventListener('click', () => {
    if (readOnly) return;
    if (!confirm('회로를 처음 상태로 되돌릴까요? (실행 취소로 복구할 수 있어요)')) return;
    pushUndo();
    const C = am();
    C.tapes = []; C.leds = []; C.resistors = []; C.holder = null; C.tested = false;
    selected = null; drawingTape = null;
    afterChange();
  });

  document.addEventListener('work-loaded', refreshCircuit);
  refreshCircuit();
}

function finishTape() {
  if (drawingTape && drawingTape.length >= 2) {
    pushUndo();
    am().tapes.push({ pts: drawingTape });
    am().tested = false;
    drawingTape = null;
    afterChange();
  } else { drawingTape = null; draw(); }
}

function afterChange() {
  touch();
  updateSwitchButton();
  updateUndoBtn();
  updateSelPanel();
  resolveAndDraw();
}
function updateSelPanel() {
  const led = selected && selected.type === 'led';
  const rot = selected && (selected.type === 'led' || selected.type === 'res' || selected.type === 'holder');
  $('led-props').style.display = rot ? '' : 'none';
  // LED 종류(심화)와 매직 색칠(백색 전용)
  const kind = led ? (am().leds[selected.i].kind || 'white') : 'white';
  $('led-kind').style.display = led && config.advanced ? '' : 'none';
  if (led && config.advanced)
    document.querySelectorAll('#led-kind button').forEach(b => b.classList.toggle('active', b.dataset.k === kind));
  $('magic-wrap').style.display = led && kind === 'white' ? '' : 'none';
  // 실험실에서 홀더를 선택하면 전지 개수(전압) 선택 표시
  const holderSel = selected && selected.type === 'holder' && mode === 'lab' && am().holder;
  $('holder-cells').style.display = holderSel ? '' : 'none';
  if (holderSel) {
    const n = am().holder.cells || 2;
    document.querySelectorAll('#holder-cells button').forEach(b => b.classList.toggle('active', +b.dataset.n === n));
  }
  if (led) {
    const c = am().leds[selected.i].color || 'none';
    document.querySelectorAll('#magic-palette button').forEach(b => b.classList.toggle('active', b.dataset.c === c));
  }
}

export function refreshCircuit() {
  normalize(work.circuit);
  normalize(work.lab = work.lab || { leds: [], resistors: [], tapes: [], holder: null, tested: false });
  // 플래카드에 작업물이 있으면 이어서, 없으면 실험실부터 (회로 원리를 먼저 익히도록)
  const P = work.circuit;
  const hasPlacard = P.tapes.length || P.leds.length || P.holder;
  $('in-predict-led').value = work.circuit.predictCount ?? '';
  $('tool-res').style.display = config.advanced ? '' : 'none';
  $('guide-adv').style.display = config.advanced ? '' : 'none';
  setCircuitMode(hasPlacard ? 'placard' : 'lab');
}
