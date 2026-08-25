// 회로 탭: 케이스 안쪽을 펼친 그림 위에 전도성 테이프·LED·건전지 홀더를 배치한다.
// 전류가 닿는 데까지만 색이 차오르고, 오류의 위치를 짚어 주지 않는다.
import { config, work, addLog, touch, readOnly } from './state.js';
import { renderLogList } from './case3d.js';

const $ = id => document.getElementById(id);
const S = 16; // px per cm

// 매직 색칠 투과율
export const MAGIC = {
  none: { label: '칠하지 않음', f: 1.0, rgb: [255, 250, 230] },
  yellow: { label: '노랑', f: 0.75, rgb: [255, 230, 90] },
  green: { label: '초록', f: 0.60, rgb: [120, 255, 140] },
  red: { label: '빨강', f: 0.55, rgb: [255, 110, 110] },
  blue: { label: '파랑', f: 0.45, rgb: [110, 160, 255] },
  black: { label: '검정', f: 0.02, rgb: [80, 80, 80] },
};

let cv, ctx, tool = 'select';
let drawingTape = null;      // 그리는 중인 폴리라인 pts
let selected = null;         // {type:'led'|'tape'|'holder'|'wire', i, wi}
let dragOff = null;
let cursor = null;           // 현재 커서 위치(cm)
let solveResult = null;
let pulse = 0, pulseTimer = null;

function dims() {
  const p = work.caseTab.pieces;
  const n = v => { const x = parseFloat(v); return isFinite(x) && x > 0 ? x : null; };
  return {
    bw: n(p.back.w) || 25, bh: n(p.back.h) || 10,
    sw: n(p.side.w) || 4.5, sh: n(p.side.h) || 10,
    tw: n(p.topbot.w) || 24, td: n(p.topbot.h) || 4.5,
  };
}
// 캔버스 원점(펼친 그림에서 뒷면의 좌상단, cm)
function origin() { const d = dims(); return { ox: d.sw + 0.8, oy: d.td + 0.8 }; }
function toPx(p) { const { ox, oy } = origin(); return [(p.x + ox) * S, (p.y + oy) * S]; }
function toCm(e) {
  const r = cv.getBoundingClientRect(), { ox, oy } = origin();
  return { x: (e.clientX - r.left) * (cv.width / r.width) / S - ox, y: (e.clientY - r.top) * (cv.height / r.height) / S - oy };
}
const snap = v => Math.round(v * 2) / 2;

// 바깥 영역(뒷면 뒤)의 y 오프셋
function outsideY() { return dims().bh + 2.2; }

// LED 다리 접점 (긴 다리 = 양극)
function ledLegs(l) {
  const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][l.dir]; // 양극 방향
  return {
    a: { x: l.x + d[0], y: l.y + d[1] },   // 양극(긴 다리)
    k: { x: l.x - d[0], y: l.y - d[1] },   // 음극
  };
}

function distSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function distTape(p, tape) {
  let d = Infinity;
  for (let i = 0; i < tape.pts.length - 1; i++) d = Math.min(d, distSeg(p, tape.pts[i], tape.pts[i + 1]));
  return d;
}
function tapeLen(tape) {
  let L = 0;
  for (let i = 0; i < tape.pts.length - 1; i++) L += Math.hypot(tape.pts[i + 1].x - tape.pts[i].x, tape.pts[i + 1].y - tape.pts[i].y);
  return L;
}
function segSegClose(a1, a2, b1, b2, r) {
  // ponytail: 끝점·양끝 상호 거리 + 중점 검사로 근사(테이프 폭 0.5cm 격자 스냅이라 충분)
  const mids = t => ({ x: a1.x + (a2.x - a1.x) * t, y: a1.y + (a2.y - a1.y) * t });
  for (const t of [0, 0.25, 0.5, 0.75, 1]) if (distSeg(mids(t), b1, b2) < r) return true;
  const midb = t => ({ x: b1.x + (b2.x - b1.x) * t, y: b1.y + (b2.y - b1.y) * t });
  for (const t of [0.25, 0.5, 0.75]) if (distSeg(midb(t), a1, a2) < r) return true;
  return false;
}
function tapesTouch(t1, t2) {
  for (let i = 0; i < t1.pts.length - 1; i++)
    for (let j = 0; j < t2.pts.length - 1; j++)
      if (segSegClose(t1.pts[i], t1.pts[i + 1], t2.pts[j], t2.pts[j + 1], 0.55)) return true;
  return false;
}

// ---------- 회로 해석 ----------
function solve() {
  const C = work.circuit;
  const res = { comps: [], tapeComp: [], plus: -1, minus: -1, short: false, switchIn: false,
    noHolder: !C.holder, lit: {}, energizedPlus: new Set(), energizedMinus: new Set(), msgs: [] };
  // union-find로 테이프 연결 성분
  const parent = C.tapes.map((_, i) => i);
  const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
  for (let i = 0; i < C.tapes.length; i++)
    for (let j = i + 1; j < C.tapes.length; j++)
      if (tapesTouch(C.tapes[i], C.tapes[j])) parent[find(i)] = find(j);
  res.tapeComp = C.tapes.map((_, i) => find(i));

  const compOf = p => {
    for (let i = 0; i < C.tapes.length; i++) if (distTape(p, C.tapes[i]) < 0.6) return find(i);
    return -1;
  };
  if (C.holder) {
    if (!C.holder.switchOut) { res.switchIn = true; return res; }
    res.plus = compOf(C.holder.wires[0]);
    res.minus = compOf(C.holder.wires[1]);
  }
  if (res.plus >= 0 && res.plus === res.minus) { res.short = true; return res; }

  // LED 간선: 양극 성분 → 음극 성분
  const edges = C.leds.map((l, i) => {
    const legs = ledLegs(l);
    return { i, a: compOf(legs.a), k: compOf(legs.k) };
  });

  // 전류 도달 범위(+에서 순방향으로, −에서 역방향으로)
  const reach = (start, dirFwd) => {
    const seen = new Set();
    if (start < 0) return seen;
    const stack = [start];
    while (stack.length) {
      const c = stack.pop();
      if (seen.has(c)) continue;
      seen.add(c);
      for (const e of edges) {
        if (e.a < 0 || e.k < 0) continue;
        if (dirFwd && e.a === c && !seen.has(e.k)) stack.push(e.k);
        if (!dirFwd && e.k === c && !seen.has(e.a)) stack.push(e.a);
      }
    }
    return seen;
  };
  res.energizedPlus = reach(res.plus, true);
  res.energizedMinus = reach(res.minus, false);

  // +에서 −까지의 모든 단순 경로 탐색 (LED 수가 적어 부담 없음)
  const paths = [];
  if (res.plus >= 0 && res.minus >= 0) {
    const dfs = (c, usedLeds, pathLeds) => {
      if (c === res.minus) { paths.push([...pathLeds]); return; }
      if (paths.length > 200) return;
      for (const e of edges) {
        if (e.a === c && e.k >= 0 && !usedLeds.has(e.i)) {
          usedLeds.add(e.i); pathLeds.push(e.i);
          dfs(e.k, usedLeds, pathLeds);
          pathLeds.pop(); usedLeds.delete(e.i);
        }
      }
    };
    dfs(res.plus, new Set(), []);
  }
  const conducting = paths.filter(p => p.length * config.vf <= config.voltage + 0.05);
  const litSet = new Set(conducting.flat());
  const nBranch = Math.max(1, conducting.length);
  for (const i of litSet) {
    const cur = Math.min(20, config.imax / nBranch);
    res.lit[i] = (cur / 20) * (MAGIC[C.leds[i].color || 'none'] || MAGIC.none).f;
  }
  res.hasBlockedSeries = paths.some(p => p.length * config.vf > config.voltage + 0.05);
  return res;
}

// ---------- 그리기 ----------
function draw() {
  if (!ctx) return;
  const d = dims(), { ox, oy } = origin();
  const W = (d.sw * 2 + d.bw + 1.6) * S;
  const H = (d.td * 2 + d.bh + 2.2 + d.bh + 1.6 + 1.2) * S;
  if (cv.width !== Math.round(W) || cv.height !== Math.round(H)) { cv.width = Math.round(W); cv.height = Math.round(H); }
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save();
  ctx.translate(ox * S, oy * S);

  // 펼친 안쪽 면들
  const region = (x, y, w, h, label, c) => {
    ctx.fillStyle = c; ctx.fillRect(x * S, y * S, w * S, h * S);
    ctx.strokeStyle = '#b9c2cd'; ctx.strokeRect(x * S, y * S, w * S, h * S);
    ctx.fillStyle = '#9aa3ad'; ctx.font = '11px sans-serif';
    ctx.fillText(label, x * S + 4, y * S + 13);
  };
  region(0, 0, d.bw, d.bh, '뒷면 (안쪽)', '#fbf9f2');
  region(-d.sw, (d.bh - d.sh) / 2, d.sw, d.sh, '왼쪽 옆면', '#f0f5fa');
  region(d.bw, (d.bh - d.sh) / 2, d.sw, d.sh, '오른쪽 옆면', '#f0f5fa');
  region(0.5, -d.td, d.tw, d.td, '윗면', '#f5f0fa');
  region(0.5, d.bh, d.tw, d.td, '아랫면', '#f5f0fa');
  const oy2 = outsideY();
  region(0, oy2, d.bw, d.bh, '뒷면 바깥쪽 — 건전지 홀더는 여기에', '#eceff3');

  // 1cm 격자 (뒷면 안에만)
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.beginPath();
  for (let x = 1; x < d.bw; x++) { ctx.moveTo(x * S, 0); ctx.lineTo(x * S, d.bh * S); }
  for (let y = 1; y < d.bh; y++) { ctx.moveTo(0, y * S); ctx.lineTo(d.bw * S, y * S); }
  ctx.stroke();

  const C = work.circuit, R = solveResult;

  // 테이프
  C.tapes.forEach((t, i) => {
    const comp = R ? R.tapeComp[i] : -1;
    let col = '#9aa0aa';
    if (R && !R.short && !R.switchIn) {
      const inP = R.energizedPlus.has(comp), inM = R.energizedMinus.has(comp);
      if (inP && inM) col = `rgba(235,90,60,${0.75 + 0.25 * Math.sin(pulse)})`;
      else if (inP) col = '#e8a03c';
      else if (inM) col = '#5b8fd9';
    }
    if (R && R.short) col = `rgba(230,60,60,${0.55 + 0.45 * Math.sin(pulse * 2)})`;
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.5 * S; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    t.pts.forEach((p, j) => j ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S));
    ctx.stroke();
    if (selected && selected.type === 'tape' && selected.i === i) {
      ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      t.pts.forEach((p, j) => j ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S));
      ctx.stroke(); ctx.setLineDash([]);
    }
  });
  // 그리는 중인 테이프
  if (drawingTape) {
    ctx.strokeStyle = 'rgba(120,130,145,0.6)';
    ctx.lineWidth = 0.5 * S; ctx.lineCap = 'round';
    ctx.beginPath();
    drawingTape.forEach((p, j) => j ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S));
    if (cursor) ctx.lineTo(snap(cursor.x) * S, snap(cursor.y) * S);
    ctx.stroke();
  }

  // LED
  C.leds.forEach((l, i) => {
    const legs = ledLegs(l);
    const lit = R && R.lit[i] !== undefined ? R.lit[i] : 0;
    const mag = MAGIC[l.color || 'none'];
    // 다리
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#8d939c';
    ctx.beginPath(); ctx.moveTo(l.x * S, l.y * S); ctx.lineTo(legs.a.x * S, legs.a.y * S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(l.x * S, l.y * S); ctx.lineTo(legs.k.x * S, legs.k.y * S); ctx.stroke();
    // 긴 다리(+) 표시
    ctx.fillStyle = '#c0392b'; ctx.font = 'bold 11px sans-serif';
    ctx.fillText('+', legs.a.x * S + 4, legs.a.y * S + 4);
    // 빛 번짐
    if (lit > 0.03) {
      const g = ctx.createRadialGradient(l.x * S, l.y * S, 2, l.x * S, l.y * S, 1.6 * S * (0.5 + lit));
      g.addColorStop(0, `rgba(${mag.rgb[0]},${mag.rgb[1]},${mag.rgb[2]},${0.85 * lit})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(l.x * S, l.y * S, 1.6 * S * (0.5 + lit), 0, 7); ctx.fill();
    }
    // 머리
    ctx.beginPath(); ctx.arc(l.x * S, l.y * S, 0.35 * S, 0, 7);
    ctx.fillStyle = lit > 0.03
      ? `rgb(${mag.rgb[0]},${mag.rgb[1]},${mag.rgb[2]})`
      : (l.color && l.color !== 'none' ? `rgba(${mag.rgb[0]},${mag.rgb[1]},${mag.rgb[2]},0.45)` : '#e8e8e2');
    ctx.fill();
    ctx.strokeStyle = selected && selected.type === 'led' && selected.i === i ? '#2b6cb0' : '#767c85';
    ctx.lineWidth = selected && selected.type === 'led' && selected.i === i ? 2.5 : 1.5;
    ctx.stroke();
  });

  // 건전지 홀더
  if (C.holder) {
    const h = C.holder, hw = 5.5, hh = 2.5;
    ctx.fillStyle = '#3b4552';
    ctx.strokeStyle = selected && selected.type === 'holder' ? '#2b6cb0' : '#20272f';
    ctx.lineWidth = 2;
    roundRect(ctx, (h.x - hw / 2) * S, (h.y - hh / 2) * S, hw * S, hh * S, 5);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#cfd6de'; ctx.font = '11px sans-serif';
    ctx.fillText('AA × 2', (h.x - 0.9) * S, (h.y - 0.35) * S);
    // 스위치
    ctx.fillStyle = h.switchOut ? '#4cd964' : '#e23c3c';
    ctx.beginPath(); ctx.arc((h.x + 1.7) * S, (h.y + 0.5) * S, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#cfd6de';
    ctx.fillText(h.switchOut ? '스위치(바깥쪽 👍)' : '스위치(안쪽 ✗)', (h.x - 1.6) * S, (h.y + 0.75) * S);
    // 전선
    const wcol = ['#d64545', '#2f3640'];
    h.wires.forEach((wp, wi) => {
      ctx.strokeStyle = wcol[wi]; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo((h.x - 2 + wi * 4) * S, (h.y - hh / 2) * S);
      ctx.bezierCurveTo((h.x - 2 + wi * 4) * S, (wp.y + (h.y - wp.y) * 0.5) * S, wp.x * S, (wp.y + 1.5) * S, wp.x * S, wp.y * S);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(wp.x * S, wp.y * S, 5, 0, 7);
      ctx.fillStyle = wcol[wi]; ctx.fill();
      if (selected && selected.type === 'wire' && selected.wi === wi) { ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = wcol[wi]; ctx.font = 'bold 12px sans-serif';
      ctx.fillText(wi === 0 ? '+' : '−', wp.x * S + 7, wp.y * S - 6);
    });
  }
  ctx.restore();
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ---------- 결과 패널 ----------
function updatePanel() {
  const C = work.circuit, R = solveResult;
  const el = $('circuit-info');
  let html = '';
  const tapeUsed = C.tapes.reduce((a, t) => a + tapeLen(t), 0);
  if (config.showSupply) {
    const overL = C.leds.length > config.ledCount, overT = tapeUsed > 90;
    html += `<p class="supply">지급 재료 — LED ${config.ledCount}개 / 사용 ${C.leds.length}개 ${overL ? '⚠' : ''}<br>` +
      `테이프 90cm / 사용 ${Math.round(tapeUsed)}cm ${overT ? '⚠' : ''}</p>`;
  }
  if (!R) { el.innerHTML = html; return; }
  if (R.noHolder) html += '<p class="muted">건전지 홀더를 놓고 전선(+/−)을 테이프에 연결해 보세요.</p>';
  else if (R.switchIn) html += '<p class="warn">스위치가 케이스 안쪽을 향하고 있어 누를 수 없습니다.</p>';
  else if (R.short) html += '<p class="warn">⚠ 전지가 뜨거워집니다! (+)와 (−)가 어딘가에서 직접 만나고 있습니다.</p>';
  else if (C.tested) {
    const litN = Object.keys(R.lit).length;
    html += `<p class="measure">점등 결과 — LED ${C.leds.length}개 중 <b>${litN}개</b> 켜짐</p>`;
    if (config.askPredict && C.predictCount !== '') {
      const ok = parseInt(C.predictCount) === litN;
      html += `<p class="${ok ? 'ok' : 'warn'}">내 예측: ${C.predictCount}개 ${ok ? '●' : '●'}</p>`;
    }
    if (config.questionFeedback) {
      const unlit = C.leds.length - litN;
      if (unlit > 0) html += `<p class="hint">안 켜진 LED가 ${unlit}개 있습니다. 긴 다리(+)가 어느 줄에 붙어 있는지, 두 다리가 서로 다른 줄에 있는지 살펴볼까요?</p>`;
      if (R.hasBlockedSeries) html += `<p class="hint">LED를 거쳐 또 LED를 지나는 길이 있네요. LED 하나를 켜는 데 몇 V가 필요했는지 떠올려 보세요.</p>`;
      if (litN > 0 && litN === C.leds.length) html += `<p class="ok">모두 켜졌습니다. 빛이 고르게 퍼지는지는 [미리보기] 탭에서 확인해 보세요.</p>`;
      const blacks = C.leds.filter(l => l.color === 'black').length;
      if (blacks) html += `<p class="warn">검정으로 칠한 LED는 빛이 나오지 않습니다.</p>`;
    }
  } else html += '<p class="muted">배치를 마쳤으면 켜질 LED 개수를 예측하고 [스위치 눌러 점등!]을 눌러 보세요.</p>';
  el.innerHTML = html;
}

// ---------- 미리보기 탭에 넘겨줄 정보 ----------
export function getLighting() {
  const d = dims(), C = work.circuit;
  const R = solve();
  const out = { lit: [], tested: C.tested, holderStable: true, hasHolder: !!C.holder, dims: d };
  if (C.holder) {
    const h = C.holder, oy2 = outsideY();
    const relY = h.y - oy2; // 뒷면 바깥에서의 세로 위치
    out.holderStable = relY > d.bh * 0.5 && h.x > 2.5 && h.x < d.bw - 2.5;
  }
  for (const [iStr, b] of Object.entries(R.lit)) {
    const l = C.leds[+iStr];
    const mag = MAGIC[l.color || 'none'];
    let face = 'back', fx = l.x, fy = l.y;
    if (l.x < 0) { face = 'left'; fx = 0; fy = l.y; }
    else if (l.x > d.bw) { face = 'right'; fx = d.bw; fy = l.y; }
    else if (l.y < 0) { face = 'top'; fy = 0; }
    else if (l.y > d.bh) { face = 'bottom'; fy = d.bh; }
    out.lit.push({ face, fx, fy, b, rgb: mag.rgb });
  }
  return out;
}

// ---------- 입력 처리 ----------
function hitTest(p) {
  const C = work.circuit;
  if (C.holder) {
    for (let wi = 0; wi < 2; wi++)
      if (Math.hypot(p.x - C.holder.wires[wi].x, p.y - C.holder.wires[wi].y) < 0.7) return { type: 'wire', wi };
    if (Math.abs(p.x - C.holder.x) < 2.75 && Math.abs(p.y - C.holder.y) < 1.25) return { type: 'holder' };
  }
  for (let i = C.leds.length - 1; i >= 0; i--)
    if (Math.hypot(p.x - C.leds[i].x, p.y - C.leds[i].y) < 0.8) return { type: 'led', i };
  for (let i = C.tapes.length - 1; i >= 0; i--)
    if (distTape(p, C.tapes[i]) < 0.5) return { type: 'tape', i };
  return null;
}

function resolveAndDraw() {
  solveResult = solve();
  updatePanel();
  managePulse();
  draw();
}
function managePulse() {
  const need = solveResult && (solveResult.short ||
    (solveResult.energizedPlus.size && solveResult.energizedMinus.size));
  if (need && !pulseTimer) pulseTimer = setInterval(() => { pulse += 0.35; draw(); }, 90);
  if (!need && pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
}

export function initCircuit() {
  cv = $('circuit-canvas');
  ctx = cv.getContext('2d');
  cv.addEventListener('contextmenu', e => e.preventDefault());

  // 도구 버튼
  document.querySelectorAll('#circuit-tools button[data-tool]').forEach(b => {
    b.addEventListener('click', () => {
      tool = b.dataset.tool;
      drawingTape = null; selected = null;
      document.querySelectorAll('#circuit-tools button[data-tool]').forEach(x => x.classList.toggle('active', x === b));
      $('tape-hint').style.display = tool === 'tape' ? '' : 'none';
      resolveAndDraw();
    });
  });

  cv.addEventListener('pointerdown', e => {
    if (readOnly) return;
    const p = toCm(e);
    const C = work.circuit;
    if (tool === 'tape') {
      if (!drawingTape) drawingTape = [];
      drawingTape.push({ x: snap(p.x), y: snap(p.y) });
      draw();
      return;
    }
    if (tool === 'led') {
      if (C.leds.length >= config.ledCount && config.overLimit === 'block') return;
      C.leds.push({ x: snap(p.x), y: snap(p.y), dir: 0, color: 'none' });
      selected = { type: 'led', i: C.leds.length - 1 };
      C.tested = false; afterChange();
      return;
    }
    if (tool === 'holder') {
      const d = dims(), oy2 = outsideY();
      C.holder = C.holder || { switchOut: true, wires: [{ x: 3, y: d.bh - 2 }, { x: 6, y: d.bh - 2 }] };
      C.holder.x = Math.max(3, Math.min(d.bw - 3, snap(p.x)));
      C.holder.y = Math.max(oy2 + 1.5, Math.min(oy2 + d.bh - 1.5, snap(p.y) < oy2 + 1.5 ? oy2 + d.bh - 1.5 : snap(p.y)));
      selected = { type: 'holder' };
      C.tested = false; afterChange();
      return;
    }
    if (tool === 'erase') {
      const hit = hitTest(p);
      if (hit) {
        if (hit.type === 'led') C.leds.splice(hit.i, 1);
        else if (hit.type === 'tape') C.tapes.splice(hit.i, 1);
        else if (hit.type === 'holder' || hit.type === 'wire') C.holder = null;
        C.tested = false; afterChange();
      }
      return;
    }
    // select/move
    const hit = hitTest(p);
    selected = hit;
    updateSelPanel();
    if (hit) {
      cv.setPointerCapture(e.pointerId);
      if (hit.type === 'led') dragOff = { x: p.x - C.leds[hit.i].x, y: p.y - C.leds[hit.i].y };
      else if (hit.type === 'holder') dragOff = { x: p.x - C.holder.x, y: p.y - C.holder.y };
      else if (hit.type === 'wire') dragOff = { x: 0, y: 0 };
      else if (hit.type === 'tape') dragOff = { x: p.x, y: p.y, pts: C.tapes[hit.i].pts.map(q => ({ ...q })) };
    }
    draw();
  });

  cv.addEventListener('pointermove', e => {
    const p = toCm(e);
    cursor = p;
    if (drawingTape) { draw(); return; }
    if (!selected || !dragOff || readOnly) return;
    const C = work.circuit;
    if (selected.type === 'led') {
      C.leds[selected.i].x = snap(p.x - dragOff.x);
      C.leds[selected.i].y = snap(p.y - dragOff.y);
    } else if (selected.type === 'holder') {
      C.holder.x = snap(p.x - dragOff.x); C.holder.y = snap(p.y - dragOff.y);
    } else if (selected.type === 'wire') {
      C.holder.wires[selected.wi] = { x: snap(p.x), y: snap(p.y) };
    } else if (selected.type === 'tape') {
      const dx = snap(p.x - dragOff.x), dy = snap(p.y - dragOff.y);
      C.tapes[selected.i].pts = dragOff.pts.map(q => ({ x: q.x + dx, y: q.y + dy }));
    }
    C.tested = false;
    draw(); // 드래그 중에는 해석하지 않음
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
      else if (selected.type === 'tape') C.tapes.splice(selected.i, 1);
      else if (selected.type === 'holder' || selected.type === 'wire') C.holder = null;
      selected = null; C.tested = false; afterChange();
    }
    if (e.key.toLowerCase() === 'r' && selected && selected.type === 'led' && !readOnly) {
      work.circuit.leds[selected.i].dir = (work.circuit.leds[selected.i].dir + 1) % 4;
      work.circuit.tested = false; afterChange();
    }
  });
  $('btn-tape-done').addEventListener('click', finishTape);

  // 선택 속성 패널
  document.querySelectorAll('#magic-palette button').forEach(b => {
    b.addEventListener('click', () => {
      if (selected && selected.type === 'led' && !readOnly) {
        work.circuit.leds[selected.i].color = b.dataset.c;
        work.circuit.tested = false; afterChange();
      }
    });
  });
  $('btn-led-rot').addEventListener('click', () => {
    if (selected && selected.type === 'led' && !readOnly) {
      work.circuit.leds[selected.i].dir = (work.circuit.leds[selected.i].dir + 1) % 4;
      work.circuit.tested = false; afterChange();
    }
  });
  $('btn-switch-dir').addEventListener('click', () => {
    if (work.circuit.holder && !readOnly) {
      work.circuit.holder.switchOut = !work.circuit.holder.switchOut;
      work.circuit.tested = false; afterChange();
    }
  });

  $('in-predict-led').addEventListener('input', () => {
    work.circuit.predictCount = $('in-predict-led').value;
    touch(); updateTestButton();
  });
  $('btn-test').addEventListener('click', () => {
    work.circuit.tested = true;
    const R = solve();
    const litN = Object.keys(R.lit).length;
    addLog(`회로 — LED ${work.circuit.leds.length}개 배치 → ${litN}개 점등` +
      (R.short ? ' (합선!)' : '') + (R.switchIn ? ' (스위치 방향 확인)' : ''));
    renderLogList();
    touch();
    resolveAndDraw();
  });

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
  $('led-props').style.display = led ? '' : 'none';
  $('holder-props').style.display = (selected && (selected.type === 'holder' || selected.type === 'wire')) ? '' : 'none';
  if (led) {
    const c = work.circuit.leds[selected.i].color || 'none';
    document.querySelectorAll('#magic-palette button').forEach(b => b.classList.toggle('active', b.dataset.c === c));
  }
}

export function refreshCircuit() {
  $('in-predict-led').value = work.circuit.predictCount ?? '';
  $('circuit-predict-row').style.display = config.askPredict ? '' : 'none';
  updateTestButton();
  resolveAndDraw();
}
