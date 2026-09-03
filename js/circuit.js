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
function fOf() { return 1; } // 매직 색칠은 색만 바꾸고 밝기는 그대로 (실제로도 잘 빛난다)

// 매직 24색 — 투과율(f)은 색의 밝기에서 계산 (밝은 색일수록 빛이 잘 통과, 검정은 차단)
const MARKER_COLORS = [
  ['빨강', [228, 26, 28]], ['다홍', [240, 78, 35]], ['주황', [245, 130, 32]], ['귤색', [250, 166, 26]],
  ['노랑', [255, 222, 0]], ['연노랑', [255, 241, 153]], ['연두', [140, 199, 64]], ['초록', [0, 148, 68]],
  ['진초록', [0, 105, 82]], ['청록', [0, 151, 157]], ['하늘', [90, 196, 235]], ['파랑', [0, 104, 183]],
  ['남색', [40, 60, 134]], ['보라', [102, 45, 145]], ['연보라', [177, 156, 217]], ['자주', [158, 11, 66]],
  ['분홍', [244, 154, 193]], ['진분홍', [236, 0, 140]], ['살구', [251, 206, 177]], ['갈색', [121, 74, 25]],
  ['고동', [80, 47, 20]], ['회색', [128, 130, 133]], ['흰색', [242, 242, 238]], ['민트', [120, 220, 190]],
];
// 실제 매직 칠은 부분부분 비어 있어서 빛이 잘 나온다 — 색칠은 빛의 "색"만 바꾸고 밝기는 그대로.
// (검정은 팔레트에서 제외. 어두운 색은 멘트로만 안내)
export const MAGIC = { none: { label: '칠하지 않음', rgb: [255, 250, 230] } };
export const MAGIC_KEYS = ['none'];
MARKER_COLORS.forEach(([label, rgb], i) => {
  const key = 'm' + i;
  MAGIC[key] = { label, rgb, luma: 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] };
  MAGIC_KEYS.push(key);
});
// 옛 저장 데이터 호환 (예전 6색 키)
MAGIC.yellow = MAGIC.m4; MAGIC.green = MAGIC.m7; MAGIC.red = MAGIC.m0;
MAGIC.blue = MAGIC.m11; MAGIC.black = MAGIC.m20;

let cv, ctx, tool = 'none'; // 'none' = 기본(누르면 선택, 끌면 이동)
let mode = 'lab';          // 'lab' = 회로 실험실(빈 화면) | 'placard' = 플래카드 전개도
let view3d = false;
let Z = 15;
let zAuto = true;          // 화면 폭에 맞춰 자동 확대 (수동 줌을 쓰면 해제)
let zFitAll = false;       // 플래카드: false=뒷면이 크게(넘치면 스크롤), true=[화면 맞춤]=전체가 보이게
let v3Yaw = -0.62, v3Pitch = 0.40; // 입체 보기 회전 각도 — 끌어서 돌려본다

// 지금 편집 중인 회로 모델 (실험실 or 플래카드)
function am() { return mode === 'lab' ? (work.lab = work.lab || { leds: [], resistors: [], tapes: [], holder: null, tested: false }) : work.circuit; }
const LAB = { w: 42, h: 20 }; // 실험실 작업대 크기 (cm)
// 플래카드 테이프 식별색 — 극성이 아니라 "몇 번째 테이프인지" 구분용 (평면·입체 동일)
const TAPE_ID_COLORS = ['#e5484d', '#f59e0b', '#16a34a', '#2f81f7', '#9333ea', '#0d9488', '#d6409f', '#795548'];
let geomLab = false;          // solve/draw가 실험실 좌표(평면)로 동작 중인지
let drawingTape = null;
let pendingWire = null; // 전선 끝을 눌렀을 때: 끌면 전선 당기기, 그냥 떼면 테이프 시작
let selected = null;
let dragOff = null;
let cursor = null;
let solveResult = null;
let pulse = 0, pulseTimer = null;
let hoverLed = -1; // 과전류 경고 툴팁용

function num(v) { const x = parseFloat(v); return isFinite(x) && x > 0 ? x : null; }
function dims() {
  const p = work.caseTab.pieces;
  return {
    bw: num(p.back.w) || 25, bh: num(p.back.h) || 10,
    sw: num(p.side.w) || 4.5, sh: num(p.side.h) || 10,
    tw: num(p.topbot.w) || 24, td: num(p.topbot.h) || 4.5,
  };
}
// 전개도의 면들 — 실물 제작처럼 두 조각:
// 위에는 옆면 4개가 접는선으로 이어진 한 줄 띠 [왼쪽 옆면|윗면|오른쪽 옆면|아랫면],
// 아래에는 뒷면(회로 판)이 따로 있다. 조립하면 띠가 뒷면 둘레를 감싼다.
const NET_GAP = 1.5; // 띠와 뒷면 사이 간격 (cm)
function faces() {
  const d = dims();
  const sy0 = -NET_GAP - d.sw, sy1 = -NET_GAP; // 띠 높이 = 옆면 폭(케이스 깊이)
  // 윗면 구간을 뒷면과 같은 x에 정렬 — 세로로 맞춰 그린 테이프가 접었을 때도 만난다
  const off = (d.bw - d.tw) / 2;
  return {
    left: { x0: off - d.sh, y0: sy0, x1: off, y1: sy1, label: '왼쪽 옆면' },
    top: { x0: off, y0: sy0, x1: off + d.tw, y1: sy1, label: '윗면' },
    right: { x0: off + d.tw, y0: sy0, x1: off + d.tw + d.sh, y1: sy1, label: '오른쪽 옆면' },
    bottom: { x0: off + d.tw + d.sh, y0: sy0, x1: off + d.tw * 2 + d.sh, y1: sy1, label: '아랫면' },
    back: { x0: 0, y0: 0, x1: d.bw, y1: d.bh, label: '뒷면 (안쪽)' },
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
  return best || { x: 0, y: 0 }; // 좌표가 없는 비정상 이벤트 방어
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
  // 옆면 띠: 아래변이 뒷면 가장자리에 붙는 쪽(Z=0), 위변이 앞면 쪽(Z=깊이)
  const f = faces()[k];
  const u = q.x - f.x0;        // 띠 길이 방향
  const v = f.y1 - q.y;        // 깊이 방향 (아래변 0 → 위변 d.sw)
  if (k === 'left') return { X: 0.15, Y: u, Z: v };
  if (k === 'top') return { X: q.x, Y: d.bh - 0.15, Z: v }; // 윗면은 뒷면과 x 정렬됨
  if (k === 'right') return { X: d.bw - 0.15, Y: d.bh - u, Z: v };
  return { X: d.bw - (d.bw - d.tw) / 2 - u, Y: 0.15, Z: v }; // 아랫면
}
const d3 = (a, b) => Math.hypot(a.X - b.X, a.Y - b.Y, a.Z - b.Z);

// 건전지 홀더: 실제 홀더처럼 세로 몸체, 위쪽 좁은 면에 (+)(−) 단자.
// 여러 개 만들 수 있고 각자 전지 개수(전압)와 스위치를 가진다.
function rotV(px, py, dir) {
  const a = (dir || 0) * Math.PI / 2;
  return { x: px * Math.cos(a) - py * Math.sin(a), y: px * Math.sin(a) + py * Math.cos(a) };
}
const HOLDER_W = 4.4, HOLDER_H = 5.0; // 몸체 (dir 0 기준: 세로)
// 단자 간격을 넉넉히(2.8cm) — 두 단자에서 나가는 테이프가 나란히 가도 서로 닿지 않게
function holderGeom(h) {
  // 단자: 위쪽 좁은 면. 왼쪽 (−), 오른쪽 (+) — 실제 홀더·팅커캐드와 같은 배치
  const tP = rotV(1.4, -HOLDER_H / 2 - 0.25, h.dir);   // (+)
  const tM = rotV(-1.4, -HOLDER_H / 2 - 0.25, h.dir);  // (−)
  // 전선 기본(접힘) 위치 — 실물처럼 위로 비스듬히 뻗어 있어 끌 수 있다는 게 보인다
  const dP = rotV(2.6, -HOLDER_H / 2 - 2.2, h.dir);
  const dM = rotV(-2.6, -HOLDER_H / 2 - 2.2, h.dir);
  const sw = rotV(0, HOLDER_H / 2 - 0.75, h.dir);
  return {
    t: [{ x: h.x + tP.x, y: h.y + tP.y }, { x: h.x + tM.x, y: h.y + tM.y }], // [0]=+, [1]=−
    dock: [{ x: h.x + dP.x, y: h.y + dP.y }, { x: h.x + dM.x, y: h.y + dM.y }],
    sw: { x: h.x + sw.x, y: h.y + sw.y },
  };
}
// 테이프가 달라붙는 연결점들: LED·저항 다리, 홀더 단자, (끌어다 놓은) 전선 끝
function terminals(C) {
  const out = [];
  C.leds.forEach((l, i) => {
    const g = legs(l);
    out.push({ x: g.a.x, y: g.a.y, label: '+' }, { x: g.k.x, y: g.k.y, label: '−' });
  });
  (C.resistors || []).forEach(r => {
    const g = legs(r);
    out.push({ x: g.a.x, y: g.a.y }, { x: g.k.x, y: g.k.y });
  });
  (C.holders || []).forEach(h => {
    const g = holderGeom(h);
    // 테이프는 홀더의 전선 끝에 잇는다 (실물: 빨간(+)·검정(−) 전선을 테이프에 붙임)
    h.wires.forEach((w, wi) => {
      const end = w.dock ? g.dock[wi] : w;
      out.push({ x: end.x, y: end.y, label: wi === 0 ? '+' : '−', wire: { hi: C.holders.indexOf(h), wi } });
    });
  });
  return out;
}
// 연결점 근처면 그 점으로 스냅
function snapToTerminal(p, C) {
  let best = null, bd = 0.85;
  for (const t of terminals(C)) {
    const d = Math.hypot(p.x - t.x, p.y - t.y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

const MARGIN = 0.8;
function origin() {
  if (mode === 'lab') return { ox: MARGIN, oy: MARGIN };
  const d = dims();
  return { ox: MARGIN + d.sh - (d.bw - d.tw) / 2, oy: MARGIN + d.sw + NET_GAP };
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
  // 홀더는 여러 개 가능 — 옛 단일 holder 데이터를 배열로 이관
  if (!C.holders) C.holders = [];
  if (C.holder) {
    if (C.holder.x !== undefined) { C.holder.on = C.tested; C.holders.push(C.holder); }
    delete C.holder;
  }
  C.holders = C.holders.filter(h => h && h.x !== undefined);
  C.holders.forEach(h => {
    h.dir = h.dir || 0;
    h.cells = h.cells || 2;
    h.on = !!h.on;
    if (!h.wires) h.wires = [{ dock: true }, { dock: true }];
    h.wires.forEach(w => {
      if (w.surf === 'dock' || (w.x === undefined && !w.dock)) { w.dock = true; }
      delete w.surf;
    });
  });
}
// 스위치 상태 요약 (썸네일·다른 탭이 tested를 계속 쓰므로 동기화)
function syncTested(C) { C.tested = (C.holders || []).some(h => h.on); }
// 전원이 켜져 있는 동안에는 회로를 수정할 수 없다 (실제 작업 규칙과 동일)
function poweredOn() { return (am().holders || []).some(h => h.on); }

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
function solve(Cin, labGeom, forceOn) {
  const C = Cin || am();
  const lab = labGeom !== undefined ? labGeom : (mode === 'lab' && C === work.lab);
  const prevGeom = geomLab;
  geomLab = lab;
  try {
    return solveInner(C, lab, forceOn);
  } finally { geomLab = prevGeom; }
}
function solveInner(C, lab, forceOn) {
  normalize(C);
  const n = C.tapes.length;
  const H = C.holders.length;
  // 노드: 테이프 0..n-1, 홀더 hi의 (+)=n+2hi, (−)=n+2hi+1
  const term = (hi, pole) => n + hi * 2 + pole;
  const parent = Array.from({ length: n + 2 * H }, (_, i) => i);
  const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a, b) => { parent[find(a)] = find(b); };

  const samples = C.tapes.map(sampleTape3D);
  // 테이프끼리는 폭(0.5cm)만큼 겹쳐야 닿은 것 — 나란히 지나가는 두 줄은 안전
  const bridges = []; // 테이프끼리 닿은 지점 (실험실 합선 표시용)
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      let hitAt = null;
      for (const a of samples[i]) {
        for (const b of samples[j]) if (d3(a, b) < 0.5) { hitAt = a; break; }
        if (hitAt) break;
      }
      if (hitAt) {
        if (find(i) !== find(j)) bridges.push({ x: hitAt.X, y: hitAt.Y }); // lab에서는 X,Y가 화면 좌표
        union(i, j);
      }
    }

  const res = { short: false, on: C.tested, noHolder: H === 0, unconnected: 0, bridges,
    lit: {}, over: new Set(), burnt: new Set(), iOf: {},
    voltage: lab ? ((C.holders[0] && C.holders[0].cells) || 2) * 1.5 : config.voltage,
    tapeComp: C.tapes.map((_, i) => find(i)), energizedPlus: new Set(), energizedMinus: new Set(),
    netPlus: new Set(), netMinus: new Set(),
    hasBlockedSeries: false, dimSeries: false, noResistorLit: false, anyLit: false };
  if (!H) return res;

  // 가장 가까운 테이프에 붙는다 (스치듯 지나가는 다른 줄에 잘못 붙지 않게)
  const tapeNear3D = (p3) => {
    let best = -1, bd = 0.7;
    for (let i = 0; i < n; i++)
      for (const s of samples[i]) {
        const dd = d3(p3, s);
        if (dd < bd) { bd = dd; best = i; }
      }
    return best;
  };
  // 홀더 단자·전선 끝을 테이프와 연결 (단자에 테이프를 바로 붙여도 된다)
  const poles = []; // {hi, pole, p3} — 다리 직접 접촉 판정용
  C.holders.forEach((h, hi) => {
    const g = holderGeom(h);
    [0, 1].forEach(pole => {
      const w = h.wires[pole];
      const pts = [g.t[pole], (w && !w.dock) ? w : g.dock[pole]];
      pts.forEach(pt => {
        const p3 = to3Dp(pt);
        poles.push({ hi, pole, p3 });
        const t = tapeNear3D(p3);
        if (t >= 0) union(term(hi, pole), t);
      });
    });
  });
  // 전선 끝끼리·단자끼리 직접 닿는 경우
  for (let a = 0; a < poles.length; a++)
    for (let b = a + 1; b < poles.length; b++)
      if (d3(poles[a].p3, poles[b].p3) < 0.7)
        union(term(poles[a].hi, poles[a].pole), term(poles[b].hi, poles[b].pole));

  // 극성 표시용: (+)단자·(−)단자에 직접(테이프로만) 이어진 네트 — 스위치가 꺼져 있어도 색으로 보여준다
  for (let hi = 0; hi < H; hi++) {
    res.netPlus.add(find(term(hi, 0)));
    res.netMinus.add(find(term(hi, 1)));
  }

  const nodeOf = (p) => {
    const p3 = to3Dp(p);
    const t = tapeNear3D(p3);
    if (t >= 0) return find(t);
    for (const q of poles) if (d3(p3, q.p3) < 0.7) return find(term(q.hi, q.pole));
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

  // 홀더마다 독립적으로 해석 (자기 전압·자기 스위치) — 병렬 실험·비교 실험용
  // ponytail: 홀더를 직렬로 이어 전압을 더하는 구성은 다루지 않는다 (필요해지면 그때)
  for (let hi = 0; hi < H; hi++) {
    const h = C.holders[hi];
    const plus = find(term(hi, 0)), minus = find(term(hi, 1));
    if (plus === minus) { res.short = true; continue; } // 이 홀더가 합선
    const Vs = lab ? (h.cells || 2) * 1.5 : config.voltage;
    if (!h.on && !forceOn) continue; // 스위치 꺼짐 (조립 순서 장면 등에서는 forceOn으로 켜진 모습을 그린다)
    reach(plus, true).forEach(c => res.energizedPlus.add(c));
    reach(minus, false).forEach(c => res.energizedMinus.add(c));

    const paths = [];
    const dfs = (c, used, ledList, nRes) => {
      if (c === minus) { if (ledList.length) paths.push({ leds: [...ledList], nRes }); return; }
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
    dfs(plus, new Set(), [], 0);

    const conducting = [];
    for (const p of paths) {
      const k = p.leds.length;
      const sumVth = p.leds.reduce((a, i) => a + vthOf(C.leds[i]), 0);
      const I = (Vs - sumVth) / (config.rint + k * config.ledRd + config.resistorOhm * p.nRes) * 1000;
      if (I <= 0.2) { if (k >= 2) res.hasBlockedSeries = true; continue; }
      conducting.push({ leds: p.leds, nRes: p.nRes, I });
    }
    const total = conducting.reduce((a, p) => a + p.I, 0);
    const scale = total > config.imax ? config.imax / total : 1;
    for (const p of conducting) {
      const I = p.I * scale;
      for (const i of p.leds) {
        res.iOf[i] = Math.max(res.iOf[i] || 0, I); // LED별 전류(근사) — 경고 툴팁용
        if (I > config.iBurn) { res.burnt.add(i); continue; }
        if (I > config.iOver) res.over.add(i);
        if (p.leds.length >= 2 && I < 12) res.dimSeries = true;
        const b = Math.min(1.3, I / 20);
        res.lit[i] = Math.max(res.lit[i] || 0, b * fOf(C.leds[i]));
        if (p.nRes === 0) res.noResistorLit = true;
      }
    }
  }
  res.burnt.forEach(i => delete res.lit[i]);
  res.anyLit = Object.keys(res.lit).length > 0;
  res.anyOn = C.holders.some(h => h.on);
  return res;
}

// ---------- 입체(조립된 모습) 그리기 — 조립 순서 탭에서도 재사용 ----------
function makeProj(d, rx, ry, rw, rh, yaw, pitch) {
  const a = yaw === undefined ? -0.62 : yaw, b = pitch === undefined ? 0.40 : pitch;
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
  const R = solve(work.circuit, false, !!opts.lit); // 조립 장면에서는 스위치가 꺼져 있어도 켜진 모습
  const litSet = opts.lit ? R.lit : {};
  const pj = makeProj(d, rx, ry, rw, rh, opts.yaw, opts.pitch);
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
  // 완성 미리보기용: 앞면(트레이싱지 면)에 도안 화면을 그대로 입힌다 — 회전해도 따라간다
  if (opts.frontCanvas) {
    const s0 = pj(P3(0, d.bh, depth)), s1 = pj(P3(d.bw, d.bh, depth)), s2 = pj(P3(0, 0, depth));
    const fw = opts.frontCanvas.width, fh = opts.frontCanvas.height;
    tctx.save();
    tctx.setTransform((s1[0] - s0[0]) / fw, (s1[1] - s0[1]) / fw,
      (s2[0] - s0[0]) / fh, (s2[1] - s0[1]) / fh, s0[0], s0[1]);
    tctx.drawImage(opts.frontCanvas, 0, 0);
    tctx.restore();
  }
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
      // 은색 테이프 + 전개도와 같은 식별선 — 평면의 그 줄이 입체에서 어디로 둘러지는지 색으로 따라간다
      tctx.lineCap = 'round'; tctx.lineJoin = 'round';
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
      tctx.strokeStyle = lit ? '#8f96a2' : '#c3c9d2'; tctx.lineWidth = 4;
      tctx.stroke();
      tctx.strokeStyle = TAPE_ID_COLORS[i % TAPE_ID_COLORS.length]; tctx.lineWidth = 1.6;
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
    // 입체는 항상 화면에 맞게 (확대 상태와 무관) — 기기 화면의 폭·높이 중 여유만큼 크게
    const host3 = cv.closest('.panel-center');
    const maxByH = Math.round(((window.innerHeight || 800) - 170) / 0.65);
    const W = Math.max(360, Math.min(1600, maxByH, (host3 ? host3.clientWidth : 700) - 30));
    const H = Math.round(W * 0.65);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f4f6f9'; ctx.fillRect(0, 0, W, H);
    drawAssembled(ctx, 10, 10, W - 20, H - 20, {
      lit: am().tested,
      walls: 'solid',
      label: '조립된 모습 — 끌어서 돌려 보세요. 어느 면에 무엇이 붙는지 보여요',
      yaw: v3Yaw, pitch: v3Pitch,
    });
    return;
  }
  geomLab = mode === 'lab';
  // 작업 화면이 가운데 영역을 꽉 채우도록 자동 확대
  if (zAuto) {
    const host = cv.closest('.panel-center');
    const avail = (host ? host.clientWidth : 760) - 40;
    // 플래카드 기본은 뒷면이 크게 보이는 배율 (띠 전체는 가로 스크롤) — [화면 맞춤]을 누르면 전체가 보이게
    // 기기 화면(노트북·크롬북·모니터)에 맞춰 폭·높이 중 여유 있는 만큼 최대로 키운다
    const cmW = (mode === 'lab' ? LAB.w
      : zFitAll ? d.sh * 2 + d.tw * 2
      : d.bw + d.sh) + MARGIN * 2;
    const cmH = (mode === 'lab' ? LAB.h : d.sw + NET_GAP + d.bh + 0.4) + MARGIN * 2;
    const availH = (window.innerHeight || 800) - 170;
    Z = Math.max(8, Math.min(Math.floor(avail / cmW), Math.floor(availH / cmH), 44));
  }
  const { ox, oy } = origin();
  const W = mode === 'lab'
    ? Math.round((LAB.w + MARGIN * 2) * Z)
    : Math.round((d.sh * 2 + d.tw * 2 + MARGIN * 2) * Z);
  const H = mode === 'lab'
    ? Math.round((LAB.h + MARGIN * 2) * Z)
    : Math.round((d.sw + NET_GAP + d.bh + MARGIN * 2 + 0.4) * Z);
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
    // 전개도 면들 — 옆면 띠(위) + 뒷면(아래) 두 조각
    const F = faces();
    for (const k of Object.keys(F)) {
      const f = F[k];
      ctx.fillStyle = k === 'back' ? '#fbf9f2' : '#f3f0fa';
      ctx.fillRect(f.x0 * Z, f.y0 * Z, (f.x1 - f.x0) * Z, (f.y1 - f.y0) * Z);
      ctx.fillStyle = '#98a1ab'; ctx.font = '11px sans-serif';
      ctx.fillText(f.label, f.x0 * Z + 5, f.y0 * Z + 14);
    }
    // 조각 외곽선 (실선) — 띠 전체와 뒷면
    ctx.strokeStyle = '#c2cad3';
    ctx.strokeRect(F.left.x0 * Z, F.left.y0 * Z, (F.bottom.x1 - F.left.x0) * Z, (F.left.y1 - F.left.y0) * Z);
    ctx.strokeRect(0, 0, d.bw * Z, d.bh * Z);
    // 띠 안의 접는 선 (점선) — 여기서 꺾어 뒷면 둘레를 감싼다
    ctx.strokeStyle = '#b8a9d9'; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    [F.top.x0, F.right.x0, F.bottom.x0].forEach(x => {
      ctx.moveTo(x * Z, F.left.y0 * Z); ctx.lineTo(x * Z, F.left.y1 * Z);
    });
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
    // 실물처럼 은색 테이프. 플래카드에서는 가는 식별선을 얹어
    // 평면의 어느 줄이 입체에서 어떻게 둘러지는지 같은 색으로 따라갈 수 있다.
    ctx.strokeStyle = '#c3c9d2';
    ctx.lineWidth = 0.5 * Z; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    t.pts.forEach((p, j) => j ? ctx.lineTo(p.x * Z, p.y * Z) : ctx.moveTo(p.x * Z, p.y * Z));
    ctx.stroke();
    if (mode === 'placard') {
      ctx.strokeStyle = TAPE_ID_COLORS[i % TAPE_ID_COLORS.length];
      ctx.lineWidth = Math.max(1.5, 0.09 * Z);
      ctx.stroke();
    }
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
    if (cursor) {
      const sn = tool === 'tape' ? snapToTerminal(cursor, C) : null;
      const c2 = sn || clampNet({ x: snap(cursor.x), y: snap(cursor.y) });
      ctx.lineTo(c2.x * Z, c2.y * Z);
    }
    ctx.stroke();
  }

  C.holders.forEach((h, hi) => drawHolder(h, hi));

  // 실험실에서 합선이면 테이프가 서로 닿은 지점을 표시 — 학생이 스스로 찾게 (수행용 전개도에서는 표시 안 함)
  if (mode === 'lab' && R && R.short && C.tested) {
    (R.bridges || []).forEach(b => {
      ctx.beginPath(); ctx.arc(b.x * Z, b.y * Z, 8, 0, 7);
      ctx.fillStyle = 'rgba(230,60,60,0.25)'; ctx.fill();
      ctx.strokeStyle = '#e23c3c'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x * Z, b.y * Z, 2.5, 0, 7);
      ctx.fillStyle = '#e23c3c'; ctx.fill();
    });
  }

  // 연결점 표시 — 테이프 도구일 때 뚜렷하게, 커서가 가까우면 크게
  if (!litMode || tool === 'tape') {
    const sn = tool === 'tape' && cursor ? snapToTerminal(cursor, C) : null;
    terminals(C).forEach(t => {
      const near = sn && sn.x === t.x && sn.y === t.y;
      ctx.beginPath(); ctx.arc(t.x * Z, t.y * Z, near ? 6 : (tool === 'tape' ? 4 : 2.5), 0, 7);
      ctx.fillStyle = near ? '#4a6cf0' : 'rgba(74,108,240,0.28)';
      ctx.fill();
      if (tool === 'tape') { ctx.strokeStyle = '#4a6cf0'; ctx.lineWidth = 1; ctx.stroke(); }
    });
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
      // 화면을 어둡게 하지 않고도 불이 확 살아 보이게: 흰 심 + 색 번짐 이중 광원
      const [r1, g1, b1] = mag.rgb;
      const halo = (1.5 + 4 * lit) * Z;
      let gr = ctx.createRadialGradient(l.x * Z, l.y * Z, 1, l.x * Z, l.y * Z, halo);
      gr.addColorStop(0, `rgba(255,255,255,${0.9 * Math.min(1, lit)})`);
      gr.addColorStop(0.15, `rgba(${r1},${g1},${b1},${0.75 * Math.min(1, lit) + 0.15})`);
      gr.addColorStop(0.45, `rgba(${r1},${g1},${b1},${0.35 * lit})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
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

  // 과전류 LED에 경고 배지(!) — 마우스를 올리면 전류 수치 설명이 뜬다
  if (C.tested && R) {
    C.leds.forEach((l, i) => {
      if (!(R.over.has(i) || R.burnt.has(i))) return;
      const bx = (l.x + 0.6) * Z, by = (l.y - 0.6) * Z;
      ctx.beginPath(); ctx.arc(bx, by, 8, 0, 7);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#c0392b'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', bx, by + 0.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    });
    // 툴팁
    if (hoverLed >= 0 && C.leds[hoverLed] && (R.over.has(hoverLed) || R.burnt.has(hoverLed))) {
      const l = C.leds[hoverLed];
      const I = Math.round(R.iOf[hoverLed] || 0);
      const lines = R.burnt.has(hoverLed)
        ? [`전류가 약 ${I}mA나 흘러 LED가 타버렸어요.`, `권장 최대는 20mA — 저항을 넣거나 전압을 낮춰 보세요.`]
        : [`이 LED에 흐르는 전류는 약 ${I}mA — 권장 최대 20mA.`, `실제라면 뜨거워지고 수명이 짧아져요.`];
      ctx.font = '12px sans-serif';
      const w = Math.max(...lines.map(t => ctx.measureText(t).width)) + 20;
      const hgt = 18 * lines.length + 12;
      let tx = l.x * Z - w / 2, ty = (l.y - 1.2) * Z - hgt;
      tx = Math.max(4 - origin().ox * Z, tx);
      if (ty < -origin().oy * Z + 4) ty = (l.y + 1.2) * Z;
      ctx.fillStyle = 'rgba(45,55,70,0.95)';
      ctx.beginPath(); ctx.roundRect(tx, ty, w, hgt, 8); ctx.fill();
      ctx.fillStyle = '#fff';
      lines.forEach((t, li) => ctx.fillText(t, tx + 10, ty + 18 + li * 18));
    }
  }

  ctx.restore();
}

function drawHolder(h, hi) {
  const g = holderGeom(h);
  const wcol = ['#d64545', '#2f3640'];
  const isSel = selected && selected.type === 'holder' && selected.i === hi;
  // 전선 (몸체보다 먼저) — 실물처럼 빨간(+)·검정(−) 전선이 항상 달려 있고, 끝을 끌어 테이프에 붙인다
  h.wires.forEach((w, wi) => {
    const t = g.t[wi];
    const end = w.dock ? g.dock[wi] : w;
    ctx.strokeStyle = wcol[wi]; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(t.x * Z, t.y * Z);
    const mx = (t.x + end.x) / 2, my = (t.y + end.y) / 2 - (w.dock ? 0.3 : 1);
    ctx.quadraticCurveTo(mx * Z, my * Z, end.x * Z, end.y * Z);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(end.x * Z, end.y * Z, 5, 0, 7);
    ctx.fillStyle = wcol[wi]; ctx.fill();
    if (selected && selected.type === 'wire' && selected.hi === hi && selected.wi === wi) { ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = 2; ctx.stroke(); }
  });
  // 몸체 (세로형, 방향대로 회전) — 전지 두 칸이 나란히 보이는 실제 홀더 모양
  ctx.save();
  ctx.translate(h.x * Z, h.y * Z);
  ctx.rotate((h.dir || 0) * Math.PI / 2);
  const hw = HOLDER_W, hh = HOLDER_H;
  ctx.fillStyle = '#2f3844';
  ctx.strokeStyle = isSel ? '#2b6cb0' : '#1c232c';
  ctx.lineWidth = isSel ? 2.5 : 2;
  ctx.beginPath(); ctx.roundRect(-hw / 2 * Z, -hh / 2 * Z, hw * Z, hh * Z, 6); ctx.fill(); ctx.stroke();
  // 단자 (위쪽 좁은 면: 왼쪽 −, 오른쪽 +)
  [[-1.4, '#2f3640'], [1.4, '#d64545']].forEach(([tx, col]) => {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect((tx - 0.22) * Z, (-hh / 2 - 0.45) * Z, 0.44 * Z, 0.5 * Z, 2); ctx.fill();
  });
  // 전지 칸
  const cells = h.cells || 2;
  const cw = Math.min(1.25, (hw - 0.6) / Math.min(cells, 2));
  for (let ci = 0; ci < Math.min(cells, 2); ci++) {
    const cx = (ci - (Math.min(cells, 2) - 1) / 2) * (cw + 0.15);
    ctx.fillStyle = '#2e8f8f';
    ctx.beginPath(); ctx.roundRect((cx - cw / 2) * Z, (-hh / 2 + 0.5) * Z, cw * Z, (hh - 1.7) * Z, 5); ctx.fill();
    ctx.fillStyle = '#57c6c0';
    ctx.beginPath(); ctx.roundRect((cx - cw / 2) * Z, (-hh / 2 + 0.5) * Z, cw * Z, 1.1 * Z, 5); ctx.fill();
  }
  // 스위치 (아래쪽)
  ctx.beginPath(); ctx.arc(0, (hh / 2 - 0.75) * Z, 0.55 * Z, 0, 7);
  ctx.fillStyle = h.on ? '#37c26e' : '#828b96'; ctx.fill();
  ctx.strokeStyle = '#1c232c'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
  // 글자 (회전 없이)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d0d6de'; ctx.font = `${Math.max(9, Z * 0.5)}px sans-serif`;
  ctx.fillText(`AA×${cells} ${(cells * 1.5).toFixed(1)}V`, h.x * Z, (h.y + rotV(0, -hh / 2 + 2.6, h.dir).y * 0) * Z + 4); // 중앙쯤
  // 단자 라벨
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#2f3640';
  ctx.fillText('−', g.t[1].x * Z, (g.t[1].y - 0.45) * Z);
  ctx.fillStyle = '#d64545';
  ctx.fillText('+', g.t[0].x * Z, (g.t[0].y - 0.45) * Z);
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(9, Z * 0.45)}px sans-serif`;
  ctx.fillText(h.on ? 'ON' : 'OFF', g.sw.x * Z, g.sw.y * Z + Z * 0.16);
  ctx.textAlign = 'left';
}

// ---------- 결과 패널 ----------
function updatePanel() {
  const C = am(), R = solveResult;
  const el = $('circuit-info');
  let html = '';
  if (!R) { el.innerHTML = html; return; }
  if (mode === 'lab' && C.holders.length)
    html += `<p class="supply">전지 — ${C.holders.map(h => `AA×${h.cells || 2} (${((h.cells || 2) * 1.5).toFixed(1)}V)`).join(' · ')}</p>`;
  if (mode === 'placard' && C.leds.length > config.ledCount)
    html += `<p class="hint">실제로 지급되는 LED는 ${config.ledCount}개예요. 배치를 참고로 실험하는 건 자유!</p>`;
  if (R.noHolder) html += '<p class="muted">건전지 홀더를 놓고, 홀더의 <b style="color:#d64545">빨간(+)</b>·<b>검정(−)</b> 전선 끝을 끌어 테이프에 붙여 보세요. 전선 끝에서 테이프를 시작해도 돼요.' +
    (mode === 'placard' ? '<br>옆면 띠와 뒷면은 따로 붙입니다 — 테이프 끝을 서로 만나는 가장자리에 대면 조립할 때 이어져요.' : '') + '</p>';
  else if (R.short) html += '<p class="warn">전지가 뜨거워집니다! (+)와 (−)가 직접 만나는 합선이에요. 전도성 테이프는 겹치거나 교차하면 서로 닿아요 — 두 줄이 만나지 않게 떨어뜨리거나 돌아가게 붙여 보세요.' +
    (mode === 'lab' ? ' <b>빨간 동그라미</b>가 테이프끼리 닿은 지점이에요.' : '') + '</p>';
  else if (C.tested) {
    const litN = Object.keys(R.lit).length;
    html += `<p class="measure">점등 결과 — LED ${C.leds.length}개 중 <b>${litN}개</b> 켜짐</p>`;
    html += `<p class="muted small">전원이 켜져 있는 동안에는 수정할 수 없어요. 고치려면 스위치를 꺼 주세요.</p>`;
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
      const darks = C.leds.filter(l => {
        const m = MAGIC[l.color || 'none'];
        return m && m.luma !== undefined && m.luma < 90; // 고동·남색·갈색 등 어두운 색
      }).length;
      if (darks) html += `<p class="hint">어두운 색으로 칠한 LED는 실제로는 빛이 조금 어둡게 보일 수 있어요.</p>`;
    }
    if (mode === 'placard' && R.noResistorLit && !R.over.size && !R.burnt.size)
      html += `<p class="hint">지금 회로에는 저항이 없어서 LED에 전류가 그대로 흐릅니다. 실제 제작에서는 LED가 뜨거워져 수명이 빨리 닳을 수 있어요. 저항을 함께 쓰면 전류를 알맞게 제한해 LED를 오래 쓸 수 있습니다.</p>`;
  } else html += mode === 'placard'
    ? '<p class="muted">스위치가 꺼져 있어요. 몇 개가 켜질지 예측을 적고 스위치를 켜 보세요.</p>'
    : '<p class="muted">스위치가 꺼져 있어요. 홀더의 스위치를 눌러 보세요.</p>';
  if (!R.noHolder && mode === 'placard')
    html += '<p class="muted small">테이프 위 가는 색선은 몇 번째 줄인지 구분하는 표시예요 — [입체로 보기]에서 같은 색을 따라가면 그 줄이 어떻게 둘러지는지 보여요.</p>';
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
    // 접었을 때의 3D 위치로 앞판 기준 좌표를 구한다 — 옆면 LED는 그 가장자리에서 빛이 스며든다
    const k = faceOf(l) || 'back';
    const p3 = to3Dp(l);
    const fx = Math.max(0, Math.min(d.bw, p3.X));
    const fy = Math.max(0, Math.min(d.bh, d.bh - p3.Y));
    out.lit.push({ face: k, fx, fy, b: Math.min(1, b), rgb: mag.rgb });
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
  return Math.abs(lx) < HOLDER_W / 2 + 0.3 && Math.abs(ly) < HOLDER_H / 2 + 0.3;
}
function hitTest(p) {
  const C = am();
  for (let hi = C.holders.length - 1; hi >= 0; hi--) {
    const h = C.holders[hi];
    const g = holderGeom(h);
    if (Math.hypot(p.x - g.sw.x, p.y - g.sw.y) < 0.8) return { type: 'switch', hi };
    for (let wi = 0; wi < 2; wi++) {
      const w = h.wires[wi];
      const end = w.dock ? g.dock[wi] : w; // 접혀 있는 전선도 끝을 잡아 끌 수 있다
      if (Math.hypot(p.x - end.x, p.y - end.y) < 0.7) return { type: 'wire', hi, wi };
    }
  }
  for (let i = C.leds.length - 1; i >= 0; i--)
    if (Math.hypot(p.x - C.leds[i].x, p.y - C.leds[i].y) < 0.8) return { type: 'led', i };
  for (let i = (C.resistors || []).length - 1; i >= 0; i--)
    if (Math.hypot(p.x - C.resistors[i].x, p.y - C.resistors[i].y) < 0.8) return { type: 'res', i };
  for (let hi = C.holders.length - 1; hi >= 0; hi--)
    if (inHolderBody(p, C.holders[hi])) return { type: 'holder', i: hi };
  for (let i = C.tapes.length - 1; i >= 0; i--)
    if (distTape2D(p, C.tapes[i]) < 0.5) return { type: 'tape', i };
  return null;
}

// ---- 부품에 붙은 테이프 끝점이 부품을 따라오게 ----
function partTerminals(sel) {
  const C = am();
  if (!sel) return null;
  if (sel.type === 'led' || sel.type === 'res') {
    const o = sel.type === 'led' ? C.leds[sel.i] : C.resistors[sel.i];
    if (!o) return null;
    const g = legs(o);
    return { a: g.a, k: g.k };
  }
  if (sel.type === 'holder') {
    const h = C.holders[sel.i];
    if (!h) return null;
    const g = holderGeom(h);
    return { p: g.t[0], m: g.t[1] };
  }
  return null;
}
function captureAttach(sel) {
  const terms = partTerminals(sel);
  if (!terms) return [];
  const C = am(), out = [];
  C.tapes.forEach((t, ti) => {
    [0, t.pts.length - 1].forEach(pi => {
      const p = t.pts[pi];
      for (const [role, tp] of Object.entries(terms)) {
        if (Math.hypot(p.x - tp.x, p.y - tp.y) < 0.6) { out.push({ ti, pi, role }); return; }
      }
    });
  });
  return out;
}
function applyAttach(sel, list) {
  if (!list || !list.length) return;
  const terms = partTerminals(sel);
  if (!terms) return;
  const C = am();
  list.forEach(a => {
    const t = C.tapes[a.ti], tp = terms[a.role];
    if (t && tp && t.pts[a.pi] !== undefined) t.pts[a.pi] = { x: tp.x, y: tp.y };
  });
}

function rotateSelected() {
  const C = am();
  const o = selected && (
    selected.type === 'led' ? C.leds[selected.i] :
    selected.type === 'res' ? C.resistors[selected.i] :
    selected.type === 'holder' ? C.holders[selected.i] : null);
  if (o && !readOnly) {
    pushUndo();
    const attach = captureAttach(selected); // 회전 전 연결 상태 기억
    o.dir = ((o.dir || 0) + 1) % 4;
    if (selected.type !== 'holder') Object.assign(o, clampPart(o, o.dir));
    applyAttach(selected, attach);          // 붙어 있던 테이프 끝이 따라온다
    C.tested = false; afterChange();
  }
}

// 스위치: hi를 주면 그 홀더만, 없으면 전체 켜기/끄기 (버튼)
function toggleSwitch(hi) {
  const C = am();
  if (readOnly) return;
  if (!C.holders.length) {
    $('circuit-info').innerHTML = '<p class="hint">먼저 건전지 홀더를 놓아 주세요. 스위치는 홀더에 달려 있어요.</p>';
    return;
  }
  const turningOn = hi !== undefined ? !C.holders[hi].on : !C.holders.some(h => h.on);
  if (turningOn && mode === 'placard' && config.askPredict && C.predictCount === '') {
    $('circuit-predict-hint').textContent = '몇 개가 켜질지 먼저 예측해 보세요.';
    return;
  }
  if (hi !== undefined) C.holders[hi].on = !C.holders[hi].on;
  else C.holders.forEach(h => h.on = turningOn);
  syncTested(C);
  if (turningOn) { selected = null; drawingTape = null; } // 켜는 순간 편집 상태 정리
  if (turningOn) {
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
      sheetLog('실험실 점등', summary);
    }
  }
  touch();
  updateSwitchButton();
  updateFloatProps();
  resolveAndDraw();
}
function updateSwitchButton() {
  $('btn-test').textContent = am().tested ? '스위치 끄기' : '스위치 켜기';
  $('btn-test').classList.toggle('on', am().tested);
  const ok = mode === 'lab' || !config.askPredict || am().predictCount !== '';
  $('btn-test').disabled = readOnly || (!am().tested && !ok);
  // 전원이 켜져 있으면 편집 도구 잠금
  const locked = readOnly || poweredOn();
  document.querySelectorAll('#circuit-tools button[data-tool]').forEach(b => b.disabled = locked);
  $('btn-circuit-reset').disabled = locked;
  if (locked) $('btn-undo').disabled = true; else updateUndoBtn();
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
  updateFloatProps();
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
  updateFloatProps();
  resolveAndDraw();
}

export function initCircuit() {
  cv = $('circuit-canvas');
  ctx = cv.getContext('2d');
  cv.addEventListener('contextmenu', e => e.preventDefault());

  $('btn-3d').addEventListener('click', () => set3D(!view3d));
  $('zoom-in').addEventListener('click', () => { if (!view3d) { zAuto = false; Z = Math.min(30, Z + 3); draw(); } });
  $('zoom-out').addEventListener('click', () => { if (!view3d) { zAuto = false; Z = Math.max(8, Z - 3); draw(); } });
  $('zoom-fit').addEventListener('click', () => {
    if (view3d) return;
    // 누를 때마다 [전체 보기] ↔ [크게 보기] 전환
    zAuto = true; zFitAll = !zFitAll;
    $('zoom-fit').textContent = zFitAll ? '크게 보기' : '전체 보기';
    draw();
  });
  // 휠 스크롤(터치패드 두 손가락 밀기)은 화면 이동, Ctrl+휠(터치패드 오므리기)은 확대 — 브라우저 표준 관례
  const hostEl = () => cv.closest('.panel-center');
  const zoomAt = (zNew, cx, cy) => {
    zNew = Math.max(8, Math.min(30, zNew));
    if (zNew === Z) return;
    const host = hostEl();
    const k = zNew / Z;
    zAuto = false; Z = zNew;
    draw();
    if (host) { // 손가락/커서 위치를 중심으로 확대되게 스크롤 보정
      host.scrollLeft = (host.scrollLeft + cx) * k - cx;
      host.scrollTop = (host.scrollTop + cy) * k - cy;
    }
  };
  // 컴퓨터: 휠 = 확대(커서 위치 중심) / 크롬북: 두 손가락 벌리기 = 확대 (터치패드 핀치도 휠로 들어온다)
  cv.addEventListener('wheel', e => {
    if (view3d) return;
    e.preventDefault();
    const r = hostEl().getBoundingClientRect();
    zoomAt(Z - Math.sign(e.deltaY) * 2, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // 터치스크린: 두 손가락 오므리기/벌리기 = 확대·축소, 두 손가락 끌기 = 화면 이동,
  // 기본 도구 상태에서 빈 곳을 한 손가락(또는 마우스)으로 끌면 화면 이동
  const activeTouches = new Map();
  let pinchState = null, panState = null, rotState = null;
  cv.addEventListener('pointerdown', e => {
    // 입체 보기: 끌면 회전 (마우스·터치 공통)
    if (view3d) {
      rotState = { x: e.clientX, y: e.clientY, yaw: v3Yaw, pitch: v3Pitch };
      return;
    }
    if (e.pointerType === 'touch') {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.size === 2) {
        const [a, b] = [...activeTouches.values()];
        pinchState = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: Z, lastC: null };
        dragOff = null; drawingTape = null; panState = null;
        e.stopImmediatePropagation();
        draw();
        return;
      }
    }
    if (tool === 'none' && !view3d && !poweredOn()) {
      const p = toCm(e);
      if (!hitTest(p)) {
        const host = hostEl();
        panState = { sx: e.clientX, sy: e.clientY, sl: host.scrollLeft, st: host.scrollTop };
      }
    }
  });
  cv.addEventListener('pointermove', e => {
    if (rotState && view3d && (e.buttons & 1 || e.pointerType === 'touch')) {
      v3Yaw = rotState.yaw + (e.clientX - rotState.x) * 0.008;
      v3Pitch = Math.max(-1.3, Math.min(1.4, rotState.pitch + (e.clientY - rotState.y) * 0.008));
      draw();
      e.stopImmediatePropagation();
      return;
    }
    if (e.pointerType === 'touch' && activeTouches.has(e.pointerId))
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchState && activeTouches.size === 2) {
      const [a, b] = [...activeTouches.values()];
      const host = hostEl(), r = host.getBoundingClientRect();
      const c = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
      zoomAt(Math.round(pinchState.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinchState.d0), c.x, c.y);
      if (pinchState.lastC) {
        host.scrollLeft -= c.x - pinchState.lastC.x;
        host.scrollTop -= c.y - pinchState.lastC.y;
      }
      pinchState.lastC = c;
      e.stopImmediatePropagation();
      return;
    }
    if (panState && (e.buttons & 1 || e.pointerType === 'touch')) {
      const host = hostEl();
      host.scrollLeft = panState.sl - (e.clientX - panState.sx);
      host.scrollTop = panState.st - (e.clientY - panState.sy);
      e.stopImmediatePropagation();
    }
  });
  const endTouch = e => {
    activeTouches.delete(e.pointerId);
    if (activeTouches.size < 2) pinchState = null;
    panState = null; rotState = null;
  };
  cv.addEventListener('pointerup', endTouch);
  cv.addEventListener('pointercancel', endTouch);
  window.addEventListener('resize', () => {
    if ($('tab-circuit').classList.contains('active')) draw();
  });

  const TOOL_FACTS = {
    none: '',
    tape: '전도성 테이프 — 전기가 지나는 길. 파란 연결점을 누르면 바로 이어져요.',
    led: 'LED — 긴 다리가 (+)극. 빈 곳을 눌러 놓으세요.',
    res: '저항 — 전류를 알맞게 줄여 LED를 지켜 줘요.',
    holder: '건전지 홀더 — 빨간(+)·검정(−) 전선 끝을 끌어 테이프에 붙이세요. 누를 때마다 하나씩 생겨요.',
  };
  function setTool(t) {
    tool = t;
    drawingTape = null;
    if (view3d && t !== 'none') set3D(false);
    document.querySelectorAll('#circuit-tools button[data-tool]').forEach(x =>
      x.classList.toggle('active', x.dataset.tool === t));
    $('tape-hint').style.display = t === 'tape' ? '' : 'none';
    $('btn-tape-done').style.display = t === 'tape' ? '' : 'none';
    $('tool-fact').textContent = TOOL_FACTS[t] || '';
    updateFloatProps();
    resolveAndDraw();
  }
  document.querySelectorAll('#circuit-tools button[data-tool]').forEach(b => {
    b.addEventListener('click', () => {
      selected = null;
      setTool(tool === b.dataset.tool ? 'none' : b.dataset.tool); // 다시 누르면 해제
    });
  });

  cv.addEventListener('pointerdown', e => {
    if (readOnly || view3d) return;
    geomLab = mode === 'lab';
    const p = toCm(e);
    const C = am();
    normalize(C);
    // 스위치는 어떤 도구에서든 동작
    const pre = hitTest(p);
    if (pre && pre.type === 'switch') { toggleSwitch(pre.hi); return; }
    // 전원이 켜져 있으면 수정 금지 — 스위치를 꺼야 다시 작업할 수 있다
    if (poweredOn()) return;

    if (tool === 'tape') {
      let sn = snapToTerminal(p, C);
      // 그리는 중이 아닐 때 부품 몸체를 누르면, 도구를 유지한 채 선택·이동 (연결점은 예외)
      // 스냅점보다 부품 중심에 더 가까우면 '몸통을 잡은 것' — 이동 의도로 본다
      if (!drawingTape && sn && pre && (pre.type === 'led' || pre.type === 'res')) {
        const o = (pre.type === 'led' ? C.leds : C.resistors)[pre.i];
        if (o && Math.hypot(p.x - o.x, p.y - o.y) < Math.hypot(p.x - sn.x, p.y - sn.y)) sn = null;
      }
      // (기존 테이프도 같은 규칙 — 누르면 선택되어 옮기거나 지울 수 있다.
      //  분기선을 긋고 싶으면 빈 곳에서 시작해 테이프 위에서 끝내면 된다)
      // 홀더 전선 끝을 눌렀을 때는 아직 결정하지 않는다 — 끌면 전선 당기기, 그냥 떼면 여기서 테이프 시작
      if (!drawingTape && sn && sn.wire) {
        pendingWire = { sn, start: p };
        return;
      }
      if (!drawingTape && !sn && pre && ['led', 'res', 'holder', 'wire', 'tape'].includes(pre.type)) {
        selected = pre;
        updateFloatProps();
        beginDrag(p, e);
        draw();
        return;
      }
      // 연결점(LED 다리·홀더 단자 등) 근처면 정확히 그 점에 스냅.
      // 그리는 중에 연결점이나 기존 테이프 위를 클릭하면 한 번 클릭으로 바로 연결·완료된다.
      const pt = sn ? { x: sn.x, y: sn.y } : clampNet({ x: snap(p.x), y: snap(p.y) });
      const onTape = !sn && drawingTape && drawingTape.length >= 1 &&
        C.tapes.some(t => distTape2D(pt, t) < 0.4);
      if (!drawingTape) drawingTape = [];
      drawingTape.push(pt);
      if ((sn || onTape) && drawingTape.length >= 2) { finishTape(); return; }
      draw();
      return;
    }
    // 배치 도구: 빈 곳이면 놓고, 부품 위면 그 부품을 선택 (놓은 뒤엔 바로 이동·옵션 가능)
    if ((tool === 'led' || tool === 'res' || tool === 'holder') && !pre) {
      pushUndo();
      // 실험실은 홀더 단자가 좌우라 LED도 가로 방향이 자연스럽다 (플래카드는 가로 두 줄 사이 세로)
      const defDir = mode === 'lab' ? 1 : 0;
      if (tool === 'led') {
        if (C.leds.length >= config.ledCount && config.overLimit === 'block') return;
        C.leds.push({ ...clampPart({ x: snap(p.x), y: snap(p.y) }, defDir), dir: defDir, color: 'none' });
        selected = { type: 'led', i: C.leds.length - 1 };
      } else if (tool === 'res') {
        C.resistors.push({ ...clampPart({ x: snap(p.x), y: snap(p.y) }, defDir), dir: defDir });
        selected = { type: 'res', i: C.resistors.length - 1 };
      } else {
        C.holders.push({
          ...clampNet({ x: snap(p.x), y: snap(p.y) }),
          dir: 0, cells: 2, on: false,
          wires: [{ dock: true }, { dock: true }],
        });
        selected = { type: 'holder', i: C.holders.length - 1 };
      }
      C.tested = false; syncTested(C);
      // 도구는 그대로 유지 — 계속 눌러서 여러 개 추가. (기존 부품을 누르면 선택 모드로 전환)
      afterChange();
      return;
    }
    // 기본: 누르면 선택, 누른 채 끌면 이동
    const hit = pre;
    selected = hit && ['led', 'res', 'tape', 'wire', 'holder'].includes(hit.type) ? hit : null;
    if ((tool === 'led' || tool === 'res' || tool === 'holder') && selected) setTool('none');
    updateFloatProps();
    if (selected) beginDrag(p, e);
    draw();
  });

  // 선택된 부품의 드래그 준비 (붙어 있는 테이프 끝점도 함께 기억)
  function beginDrag(p, e) {
    const C = am();
    cv.setPointerCapture(e.pointerId);
    pushUndo(); // 드래그 시작 전 상태 저장
    if (selected.type === 'led') dragOff = { x: p.x - C.leds[selected.i].x, y: p.y - C.leds[selected.i].y, attach: captureAttach(selected) };
    else if (selected.type === 'res') dragOff = { x: p.x - C.resistors[selected.i].x, y: p.y - C.resistors[selected.i].y, attach: captureAttach(selected) };
    else if (selected.type === 'holder') dragOff = { x: p.x - C.holders[selected.i].x, y: p.y - C.holders[selected.i].y, attach: captureAttach(selected) };
    else if (selected.type === 'wire') dragOff = { x: 0, y: 0 };
    else if (selected.type === 'tape') dragOff = { x: p.x, y: p.y, pts: C.tapes[selected.i].pts.map(q => ({ ...q })) };
  }

  cv.addEventListener('pointermove', e => {
    geomLab = mode === 'lab';
    const p = toCm(e);
    cursor = p;
    if (view3d) return;
    // 과전류 경고 배지 위 호버 → 전류 설명 툴팁
    if (am().tested && solveResult) {
      let hl = -1;
      am().leds.forEach((l, i) => {
        if ((solveResult.over.has(i) || solveResult.burnt.has(i)) &&
            Math.hypot(p.x - l.x, p.y - l.y) < 1.1) hl = i;
      });
      if (hl !== hoverLed) { hoverLed = hl; draw(); }
    } else if (hoverLed !== -1) { hoverLed = -1; }
    // 전선 끝을 누른 채 끌기 시작하면 전선 당기기로 전환
    if (pendingWire && Math.hypot(p.x - pendingWire.start.x, p.y - pendingWire.start.y) > 0.4) {
      pushUndo();
      selected = { type: 'wire', hi: pendingWire.sn.wire.hi, wi: pendingWire.sn.wire.wi };
      dragOff = { x: 0, y: 0 };
      pendingWire = null;
      updateFloatProps();
    }
    if (drawingTape) { draw(); return; }
    if (!selected || !dragOff || readOnly) return;
    const C = am();
    if (selected.type === 'led') {
      const l = C.leds[selected.i];
      Object.assign(l, clampPart({ x: snap(p.x - dragOff.x), y: snap(p.y - dragOff.y) }, l.dir));
      applyAttach(selected, dragOff.attach); // 연결된 테이프 끝이 다리를 따라온다
    } else if (selected.type === 'res') {
      const r = C.resistors[selected.i];
      Object.assign(r, clampPart({ x: snap(p.x - dragOff.x), y: snap(p.y - dragOff.y) }, r.dir));
      applyAttach(selected, dragOff.attach);
    } else if (selected.type === 'holder') {
      Object.assign(C.holders[selected.i], clampNet({ x: snap(p.x - dragOff.x), y: snap(p.y - dragOff.y) }));
      applyAttach(selected, dragOff.attach);
    } else if (selected.type === 'wire') {
      const h = C.holders[selected.hi];
      // 홀더 몸체 위로 가져가면 전지에 도로 꽂힌다
      if (h && inHolderBody(p, h))
        h.wires[selected.wi] = { dock: true };
      else if (h)
        h.wires[selected.wi] = { ...clampNet({ x: snap(p.x), y: snap(p.y) }) };
    } else if (selected.type === 'tape') {
      const dx = snap(p.x - dragOff.x), dy = snap(p.y - dragOff.y);
      C.tapes[selected.i].pts = dragOff.pts.map(q => clampNet({ x: q.x + dx, y: q.y + dy }));
    }
    positionFloat(); // 옵션 카드가 부품을 따라간다
    draw();
  });

  cv.addEventListener('pointerup', () => {
    // 전선 끝을 눌렀다 그냥 뗐다 → 그 자리에서 테이프 시작
    if (pendingWire) {
      drawingTape = [{ x: pendingWire.sn.x, y: pendingWire.sn.y }];
      pendingWire = null;
      draw();
      return;
    }
    if (dragOff) { dragOff = null; afterChange(); }
  });
  cv.addEventListener('dblclick', () => finishTape());
  window.addEventListener('keydown', e => {
    if (!$('tab-circuit').classList.contains('active')) return;
    if (poweredOn()) return; // 전원이 켜져 있으면 편집 키 잠금
    if (e.key === 'Enter') finishTape();
    if (e.key === 'Escape') { drawingTape = null; draw(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !readOnly &&
        document.activeElement.tagName !== 'INPUT') {
      const C = am();
      pushUndo();
      if (selected.type === 'led') C.leds.splice(selected.i, 1);
      else if (selected.type === 'res') C.resistors.splice(selected.i, 1);
      else if (selected.type === 'tape') C.tapes.splice(selected.i, 1);
      else if (selected.type === 'wire') C.holders[selected.hi].wires[selected.wi] = { dock: true };
      else if (selected.type === 'holder') C.holders.splice(selected.i, 1);
      selected = null; syncTested(C); afterChange();
    }
    if (e.key.toLowerCase() === 'r') rotateSelected();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
  });
  $('btn-tape-done').addEventListener('click', finishTape);

  $('in-predict-led').addEventListener('input', () => {
    am().predictCount = $('in-predict-led').value;
    touch(); updateSwitchButton();
  });
  $('btn-test').addEventListener('click', () => toggleSwitch());
  $('btn-undo').addEventListener('click', doUndo);
  document.querySelectorAll('#circ-mode button').forEach(b =>
    b.addEventListener('click', () => setCircuitMode(b.dataset.cm)));
  $('btn-circuit-reset').addEventListener('click', () => {
    if (readOnly) return;
    if (!confirm('회로를 처음 상태로 되돌릴까요? (실행 취소로 복구할 수 있어요)')) return;
    pushUndo();
    const C = am();
    C.tapes = []; C.leds = []; C.resistors = []; C.holders = []; C.tested = false;
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
    drawingTape = null;
    afterChange();
  } else { drawingTape = null; draw(); }
}

function afterChange() {
  // 플래카드(수행)에서는 배치를 바꾸면 스위치가 꺼진다 — 예측을 다시 하고 켜야 함
  if (mode === 'placard') am().holders.forEach(h => h.on = false);
  syncTested(am());
  touch();
  updateSwitchButton();
  updateUndoBtn();
  updateFloatProps();
  resolveAndDraw();
}

// ---------- 선택한 부품 옆에 뜨는 옵션 카드 ----------
function selObjPos() {
  const C = am();
  if (!selected) return null;
  if (selected.type === 'led') return C.leds[selected.i];
  if (selected.type === 'res') return C.resistors[selected.i];
  if (selected.type === 'holder') return C.holders[selected.i];
  if (selected.type === 'wire') {
    const h = C.holders[selected.hi];
    return h && !h.wires[selected.wi].dock ? h.wires[selected.wi] : h;
  }
  if (selected.type === 'tape') {
    const t = C.tapes[selected.i];
    return t ? t.pts[Math.floor(t.pts.length / 2)] : null;
  }
  return null;
}
function positionFloat() {
  const el = $('float-props');
  if (el.classList.contains('hidden')) return;
  const o = selObjPos();
  if (!o) return;
  const { ox, oy } = origin();
  const scale = cv.clientWidth ? cv.clientWidth / cv.width : 1;
  const px = (o.x + ox) * Z * scale, py = (o.y + oy) * Z * scale;
  let left = px - el.offsetWidth / 2;
  let top = py - el.offsetHeight - 16;
  left = Math.max(4, Math.min(left, cv.clientWidth - el.offsetWidth - 4));
  if (top < 4) top = py + 34; // 위가 좁으면 아래에
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}
function deleteSelected() {
  const C = am();
  if (!selected || readOnly) return;
  pushUndo();
  if (selected.type === 'led') C.leds.splice(selected.i, 1);
  else if (selected.type === 'res') C.resistors.splice(selected.i, 1);
  else if (selected.type === 'tape') C.tapes.splice(selected.i, 1);
  else if (selected.type === 'wire') C.holders[selected.hi].wires[selected.wi] = { dock: true };
  else if (selected.type === 'holder') C.holders.splice(selected.i, 1);
  selected = null;
  afterChange();
}
const TRASH_ICON = `<svg width="13" height="14" viewBox="0 0 13 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M1 3.5h11M4.5 3.5V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M2.5 3.5l.6 8.5a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.5M5 6v4M8 6v4"/></svg>`;
const ROT_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7a5 5 0 1 1-1.5-3.6M12 1v3h-3"/></svg>`;
function updateFloatProps() {
  const el = $('float-props');
  const C = am();
  const o = selected && selObjPos();
  if (!o || view3d || readOnly || drawingTape || poweredOn()) { el.classList.add('hidden'); return; }
  let html = '';
  if (selected.type === 'led') {
    const l = C.leds[selected.i];
    html += `<button class="fp fp-rot" title="회전 (R)">${ROT_ICON}</button>`;
    if (config.advanced) {
      html += `<span class="fp-sep"></span>` + Object.entries(KINDS).map(([k, v]) =>
        `<button class="fp fp-kind ${(l.kind || 'white') === k ? 'on' : ''}" data-k="${k}">${v.label}</button>`).join('');
    }
    if ((l.kind || 'white') === 'white') {
      html += `<span class="fp-sep"></span><span class="fp-label">색칠</span><span class="fp-colors">` +
        MAGIC_KEYS.map(c => {
          const v = MAGIC[c];
          return `<button class="fp fp-color ${(l.color || 'none') === c ? 'on' : ''}" data-c="${c}"
            style="background:rgb(${v.rgb.join(',')})" title="${v.label}"></button>`;
        }).join('') + `</span>`;
    }
    html += `<span class="fp-sep"></span><button class="fp fp-del" title="삭제 (Delete)">${TRASH_ICON}</button>`;
  } else if (selected.type === 'res') {
    html += `<button class="fp fp-rot" title="회전 (R)">${ROT_ICON}</button><button class="fp fp-del" title="삭제 (Delete)">${TRASH_ICON}</button>`;
  } else if (selected.type === 'holder') {
    const h = C.holders[selected.i];
    html += `<button class="fp fp-rot" title="회전 (R)">${ROT_ICON}</button>`;
    if (mode === 'lab') {
      html += `<span class="fp-sep"></span><span class="fp-label">전지</span>` + [1, 2, 3, 4].map(nn =>
        `<button class="fp fp-cell ${(h.cells || 2) === nn ? 'on' : ''}" data-n="${nn}">${nn}개<small>${(nn * 1.5).toFixed(1)}V</small></button>`).join('');
    }
    html += `<span class="fp-sep"></span><button class="fp fp-del" title="삭제 (Delete)">${TRASH_ICON}</button>`;
  } else {
    html += `<button class="fp fp-del" title="삭제 (Delete)">${TRASH_ICON}</button>`;
  }
  el.innerHTML = html;
  el.classList.remove('hidden');
  const rot = el.querySelector('.fp-rot');
  if (rot) rot.addEventListener('click', rotateSelected);
  const del = el.querySelector('.fp-del');
  if (del) del.addEventListener('click', deleteSelected);
  el.querySelectorAll('.fp-color').forEach(b => b.addEventListener('click', () => {
    pushUndo(); C.leds[selected.i].color = b.dataset.c; afterChange();
  }));
  el.querySelectorAll('.fp-kind').forEach(b => b.addEventListener('click', () => {
    pushUndo();
    const l = C.leds[selected.i];
    l.kind = b.dataset.k;
    if (l.kind !== 'white') l.color = 'none';
    afterChange();
  }));
  el.querySelectorAll('.fp-cell').forEach(b => b.addEventListener('click', () => {
    pushUndo(); C.holders[selected.i].cells = +b.dataset.n; afterChange();
  }));
  positionFloat();
}

export function refreshCircuit() {
  normalize(work.circuit);
  normalize(work.lab = work.lab || { leds: [], resistors: [], tapes: [], holders: [], tested: false });
  // 플래카드에 작업물이 있으면 이어서, 없으면 실험실부터 (회로 원리를 먼저 익히도록)
  const P = work.circuit;
  const hasPlacard = P.tapes.length || P.leds.length || P.holders.length;
  $('in-predict-led').value = work.circuit.predictCount ?? '';
  $('tool-res').style.display = config.advanced ? '' : 'none';
  $('guide-adv').style.display = config.advanced ? '' : 'none';
  setCircuitMode(hasPlacard ? 'placard' : 'lab');
}
