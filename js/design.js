// 도안 탭: 검은 앞면에 글자 2개 + 직접 그리는 그림. 오려낼 부분과 떨어져 나가는 안쪽 조각을 보여준다.
// 처리 방법(다리 만들기·재부착)은 알려주지 않는다 — 학생이 정한다.
import { config, work, touch, readOnly } from './state.js';

const $ = id => document.getElementById(id);
const S = 24;   // 표시용 px/cm
const RA = 8;   // 분석용 px/cm
const FONT = '"Noto Sans CJK KR","Noto Sans KR","Malgun Gothic","Segoe UI Symbol",sans-serif';

let cv, ctx, mode = 'move';  // 'move' | 'draw' | 'erase'
let selected = -1, dragOff = null;
let drawingStroke = null;
let analysis = null;

function D() { return work.design; }
function drawing() { D().drawing = D().drawing || { strokes: [] }; return D().drawing; }

function drawLetter(c, scale, o) {
  if (!o.text) return;
  c.save();
  c.font = `900 ${o.size * scale}px ${FONT}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  const extra = Math.max(0, (o.stroke - 0.55)) * scale;
  if (extra > 0) { c.lineWidth = extra; c.lineJoin = 'round'; c.strokeText(o.text, o.x * scale, o.y * scale); }
  c.fillText(o.text, o.x * scale, o.y * scale);
  c.restore();
}
function drawStrokes(c, scale, extra) {
  c.save();
  c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const s of drawing().strokes) {
    c.lineWidth = s.w * scale;
    c.beginPath();
    s.pts.forEach((p, i) => i ? c.lineTo(p.x * scale, p.y * scale) : c.moveTo(p.x * scale, p.y * scale));
    if (s.pts.length === 1) { c.lineTo(s.pts[0].x * scale + 0.01, s.pts[0].y * scale); }
    c.stroke();
  }
  if (extra) { // 그리는 중인 획
    c.lineWidth = extra.w * scale;
    c.beginPath();
    extra.pts.forEach((p, i) => i ? c.lineTo(p.x * scale, p.y * scale) : c.moveTo(p.x * scale, p.y * scale));
    c.stroke();
  }
  c.restore();
}
function drawAll(c, scale) {
  drawLetter(c, scale, D().letters[0]);
  drawLetter(c, scale, D().letters[1]);
  drawStrokes(c, scale, null);
}

// ---------- 래스터 분석: 안쪽 조각 + 잘라낼 둘레 + 요소 실측 크기 ----------
function analyze() {
  const W = Math.round(config.frontW * RA), H = Math.round(config.frontH * RA);
  const oc = document.createElement('canvas');
  oc.width = W; oc.height = H;
  const c = oc.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  drawAll(c, RA);
  const img = c.getImageData(0, 0, W, H);
  const cut = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) cut[i] = img.data[i * 4] > 128 ? 1 : 0;

  // 바깥 배경에서 flood fill → 남는 배경 = 안쪽 조각(섬)
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (i < 0 || i >= W * H || seen[i] || cut[i]) continue;
    seen[i] = 1;
    const x = i % W;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    stack.push(i - W, i + W);
  }
  const island = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (!cut[i] && !seen[i]) island[i] = 1;
  let islandCount = 0;
  const seen2 = new Uint8Array(W * H);
  for (let i0 = 0; i0 < W * H; i0++) {
    if (island[i0] && !seen2[i0]) {
      islandCount++;
      const st = [i0];
      while (st.length) {
        const i = st.pop();
        if (i < 0 || i >= W * H || seen2[i] || !island[i]) continue;
        seen2[i] = 1;
        const x = i % W;
        if (x > 0) st.push(i - 1);
        if (x < W - 1) st.push(i + 1);
        st.push(i - W, i + W);
      }
    }
  }
  let edges = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!cut[i]) continue;
    if (x === 0 || !cut[i - 1]) edges++;
    if (x === W - 1 || !cut[i + 1]) edges++;
    if (y === 0 || !cut[i - W]) edges++;
    if (y === H - 1 || !cut[i + W]) edges++;
  }
  // ponytail: 픽셀 경계 근사(대각선 보정 0.8) — cm 비교용으로 충분
  const perimeter = Math.round(edges / RA * 0.8);

  // 요소별 실측 bbox: 글자 2개 + 그림(획 전체)
  const boxes = [];
  const measure = (fn) => {
    const o2 = document.createElement('canvas');
    o2.width = W; o2.height = H;
    const c2 = o2.getContext('2d', { willReadFrequently: true });
    fn(c2);
    const d2 = c2.getImageData(0, 0, W, H).data;
    let minX = W, maxX = 0, minY = H, maxY = 0, any = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d2[(y * W + x) * 4 + 3] > 60) {
        any = true;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return any ? { x: minX / RA, y: minY / RA, w: (maxX - minX) / RA, h: (maxY - minY) / RA } : null;
  };
  boxes.push(D().letters[0].text ? measure(c2 => drawLetter(c2, RA, D().letters[0])) : null);
  boxes.push(D().letters[1].text ? measure(c2 => drawLetter(c2, RA, D().letters[1])) : null);
  boxes.push(drawing().strokes.length ? measure(c2 => drawStrokes(c2, RA, null)) : null);
  return { cut, island, W, H, islandCount, perimeter, boxes };
}

// 미리보기 탭용: 빛 통과 마스크 (안쪽 조각은 다시 붙인 상태로 가정)
export function getDesignMask() {
  const a = analysis || analyze();
  const oc = document.createElement('canvas');
  oc.width = a.W; oc.height = a.H;
  const c = oc.getContext('2d');
  const img = c.createImageData(a.W, a.H);
  let anyCut = false;
  for (let i = 0; i < a.W * a.H; i++) {
    const open = a.cut[i] && !a.island[i];
    if (a.cut[i]) anyCut = true;
    img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = open ? 255 : 0;
  }
  c.putImageData(img, 0, 0);
  return { canvas: oc, W: a.W, H: a.H, RA, anyCut };
}

// ---------- 표시 ----------
function draw() {
  const W = config.frontW * S, H = config.frontH * S;
  cv.width = W + 20; cv.height = H + 20;
  ctx.fillStyle = '#dfe4ea'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.save();
  ctx.translate(10, 10);
  ctx.fillStyle = '#17181c'; ctx.fillRect(0, 0, W, H);
  const ax = (config.frontW - config.areaW) / 2, ay = (config.frontH - config.areaH) / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([6, 5]);
  ctx.strokeRect(ax * S, ay * S, config.areaW * S, config.areaH * S);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '11px sans-serif';
  ctx.fillText(`작업 영역 ${config.areaW}×${config.areaH}cm`, ax * S + 4, ay * S - 4);

  drawLetter(ctx, S, D().letters[0]);
  drawLetter(ctx, S, D().letters[1]);
  drawStrokes(ctx, S, drawingStroke);

  if (analysis) {
    const a = analysis;
    const oc = document.createElement('canvas');
    oc.width = a.W; oc.height = a.H;
    const c2 = oc.getContext('2d');
    const img = c2.createImageData(a.W, a.H);
    for (let i = 0; i < a.W * a.H; i++) {
      if (a.island[i]) { img.data[i * 4] = 226; img.data[i * 4 + 1] = 60; img.data[i * 4 + 2] = 60; img.data[i * 4 + 3] = 230; }
    }
    c2.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(oc, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
  }
  if (mode === 'move' && selected >= 0 && analysis && analysis.boxes[selected]) {
    const b = analysis.boxes[selected];
    ctx.strokeStyle = '#4ea1f7'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x * S - 3, b.y * S - 3, b.w * S + 6, b.h * S + 6);
  }
  ctx.restore();
}

function updatePanel() {
  const a = analysis, el = $('design-info');
  if (!a) { el.innerHTML = ''; return; }
  let html = `<p class="measure">현재 도안 — 잘라낼 길이 약 <b>${a.perimeter}cm</b></p>`;
  if (a.islandCount > 0)
    html += `<p class="warn"><span class="dot red"></span> 오리면 떨어져 나가는 안쪽 조각이 ${a.islandCount}개 있습니다. 이 조각들을 어떻게 처리할지 포트폴리오에 적어 보세요.</p>`;
  const warns = [];
  const ax = (config.frontW - config.areaW) / 2, ay = (config.frontH - config.areaH) / 2;
  const names = ['글자 1', '글자 2', '그림'];
  a.boxes.forEach((b, i) => {
    if (!b) return;
    if (b.x < ax - 0.05 || b.y < ay - 0.05 || b.x + b.w > ax + config.areaW + 0.05 || b.y + b.h > ay + config.areaH + 0.05)
      warns.push(`${names[i]}이(가) 작업 영역을 벗어났습니다. 어디로 옮기면 좋을까요?`);
    if (i < 2) {
      if (b.h < config.letterMin - 0.3 || b.h > config.letterMax + 0.3)
        warns.push(`${names[i]} 세로 크기가 조건(${config.letterMin}~${config.letterMax}cm)과 다릅니다.`);
    } else {
      const size = Math.max(b.w, b.h);
      if (size < config.pictoMin - 0.3 || size > config.pictoMax + 0.3)
        warns.push(`그림 크기가 조건(${config.pictoMin}~${config.pictoMax}cm)과 다릅니다.`);
    }
  });
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const A = a.boxes[i], B = a.boxes[j];
    if (!A || !B) continue;
    const gx = Math.max(A.x - (B.x + B.w), B.x - (A.x + A.w));
    const gy = Math.max(A.y - (B.y + B.h), B.y - (A.y + A.h));
    if (Math.max(gx, gy) < 0.5) warns.push(`${names[i]}과(와) ${names[j]} 사이 간격이 0.5cm보다 좁습니다.`);
  }
  if (D().letters.some(l => l.text && l.stroke < config.strokeMin))
    warns.push(`글자 획 굵기가 ${config.strokeMin}cm보다 가늘면 오리기 어렵고 잘 찢어집니다.`);
  if (drawing().strokes.some(s => s.w < config.strokeMin))
    warns.push(`그림 선 굵기가 ${config.strokeMin}cm보다 가는 획이 있습니다.`);
  warns.forEach(w => html += `<p class="warn">${w}</p>`);
  if (!warns.length && (D().letters[0].text || D().letters[1].text))
    html += `<p class="ok">조건 위반 없음. 빛이 어떻게 새어 나올지는 [미리보기] 탭에서 확인하세요.</p>`;
  el.innerHTML = html;
}

let analyzeTimer = null;
function refresh(immediate) {
  draw();
  clearTimeout(analyzeTimer);
  analyzeTimer = setTimeout(() => {
    analysis = analyze();
    draw(); updatePanel();
  }, immediate ? 0 : 250);
}

function setMode(m) {
  mode = m; selected = -1; drawingStroke = null;
  document.querySelectorAll('#design-modes button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
  cv.style.cursor = m === 'draw' ? 'crosshair' : 'default';
  draw();
}

export function initDesign() {
  cv = $('design-canvas');
  ctx = cv.getContext('2d');

  const bind = (id, obj, key, isNum) => {
    $(id).addEventListener('input', () => {
      const v = $(id).value;
      obj()[key] = isNum ? parseFloat(v) : v;
      touch(); refresh(false);
    });
  };
  bind('d-l1-text', () => work.design.letters[0], 'text');
  bind('d-l2-text', () => work.design.letters[1], 'text');
  bind('d-l1-size', () => work.design.letters[0], 'size', true);
  bind('d-l2-size', () => work.design.letters[1], 'size', true);
  bind('d-l1-stroke', () => work.design.letters[0], 'stroke', true);
  bind('d-l2-stroke', () => work.design.letters[1], 'stroke', true);

  document.querySelectorAll('#design-modes button').forEach(b =>
    b.addEventListener('click', () => setMode(b.dataset.m)));
  $('d-undo').addEventListener('click', () => {
    if (readOnly) return;
    drawing().strokes.pop(); touch(); refresh(true);
  });
  $('d-clear').addEventListener('click', () => {
    if (readOnly) return;
    drawing().strokes = []; touch(); refresh(true);
  });

  const pos = e => {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (cv.width / r.width) / S - 10 / S, y: (e.clientY - r.top) * (cv.height / r.height) / S - 10 / S };
  };
  cv.addEventListener('pointerdown', e => {
    if (readOnly) return;
    const p = pos(e);
    if (mode === 'draw') {
      drawingStroke = { pts: [p], w: parseFloat($('d-brush').value) };
      cv.setPointerCapture(e.pointerId);
      draw();
      return;
    }
    if (mode === 'erase') {
      // 획 단위 지우기: 클릭 지점에 가까운 획 삭제
      const strokes = drawing().strokes;
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i];
        const near = s.pts.some(q => Math.hypot(q.x - p.x, q.y - p.y) < Math.max(0.6, s.w));
        if (near) { strokes.splice(i, 1); touch(); refresh(true); return; }
      }
      return;
    }
    // move: 글자만 드래그 (그림은 그린 자리에 남음)
    selected = -1;
    const boxes = analysis ? analysis.boxes : [];
    for (let i = 1; i >= 0; i--) {
      const b = boxes[i];
      if (b && p.x > b.x - 0.3 && p.x < b.x + b.w + 0.3 && p.y > b.y - 0.3 && p.y < b.y + b.h + 0.3) { selected = i; break; }
    }
    if (selected >= 0) {
      const o = work.design.letters[selected];
      dragOff = { x: p.x - o.x, y: p.y - o.y };
      cv.setPointerCapture(e.pointerId);
    }
    draw();
  });
  cv.addEventListener('pointermove', e => {
    if (readOnly) return;
    const p = pos(e);
    if (mode === 'draw' && drawingStroke) {
      const last = drawingStroke.pts[drawingStroke.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 0.15) { drawingStroke.pts.push(p); draw(); }
      return;
    }
    if (selected < 0 || !dragOff) return;
    const o = work.design.letters[selected];
    o.x = Math.round((p.x - dragOff.x) * 2) / 2;
    o.y = Math.round((p.y - dragOff.y) * 2) / 2;
    draw();
  });
  cv.addEventListener('pointerup', () => {
    if (drawingStroke) {
      if (drawingStroke.pts.length > 1) drawing().strokes.push(drawingStroke);
      drawingStroke = null;
      touch(); refresh(true);
    }
    if (dragOff) { dragOff = null; touch(); refresh(true); }
  });

  document.addEventListener('work-loaded', refreshDesign);
  refreshDesign();
}

export function refreshDesign() {
  const d = work.design;
  d.drawing = d.drawing || { strokes: [] };
  $('d-l1-text').value = d.letters[0].text || '';
  $('d-l2-text').value = d.letters[1].text || '';
  $('d-l1-size').value = d.letters[0].size;
  $('d-l2-size').value = d.letters[1].size;
  $('d-l1-stroke').value = d.letters[0].stroke;
  $('d-l2-stroke').value = d.letters[1].stroke;
  refresh(true);
}
