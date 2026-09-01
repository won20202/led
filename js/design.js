// 도안 탭: 검은 앞면에 글자 2개 + 직접 그리는 그림. 오려낼 부분과 떨어져 나가는 안쪽 조각을 보여준다.
// 처리 방법(다리 만들기·재부착)은 알려주지 않는다 — 학생이 정한다.
import { config, work, touch, readOnly, sheetLog } from './state.js';

const $ = id => document.getElementById(id);
let S = 24;     // 표시용 px/cm — 화면 폭에 맞춰 자동 조정
const RA = 8;   // 분석용 px/cm
const FONT = '"Noto Sans CJK KR","Noto Sans KR","Malgun Gothic","Segoe UI Symbol",sans-serif';

let cv, ctx, mode = 'move';  // 'move' | 'draw' | 'erase'
let lastFeedbackKey = '';
let selected = -1, dragOff = null;
let drawingStroke = null;
let analysis = null;

function D() { return work.design; }
function drawing() { D().drawing = D().drawing || { strokes: [] }; return D().drawing; }

// 글자 목록 — 한 글자당 한 요소. 관리자 설정(글자 수·자유 모드)에 맞춰 길이를 정규화한다.
function newLetter() {
  return { text: '', x: config.frontW / 2, y: config.frontH / 2, size: 6, stroke: 0.7 };
}
// 글자 수에 맞춰 작업 영역을 나눠 균등 배치 (개수·설정이 바뀔 때 자동 정렬)
function autoLayout(arr) {
  const ax = (config.frontW - config.areaW) / 2;
  const cw = config.areaW / arr.length;
  const size = Math.max(2, Math.min(6, Math.floor((cw - 0.3) * 2) / 2)); // 칸에 맞는 크기
  arr.forEach((l, i) => {
    l.x = Math.round((ax + cw * (i + 0.5)) * 2) / 2;
    l.y = config.frontH / 2;
    l.size = size;
  });
}
function letters() {
  const d = D();
  d.letters = d.letters || [];
  const want = config.dFree ? Math.max(1, d.letters.length) : Math.max(1, config.dLetters || 2);
  while (d.letters.length < want) d.letters.push(newLetter());
  if (!config.dFree && d.letters.length > want) d.letters.length = want;
  // 관리자 설정(글자 수·자유 모드)이 바뀌었으면 겹치지 않게 다시 고르게 배치
  const key = `${config.dLetters}|${!!config.dFree}`;
  if (d.layoutKey !== key) { d.layoutKey = key; autoLayout(d.letters); }
  return d.letters;
}

function drawLetter(c, scale, o) {
  if (!o.text) return;
  c.save();
  // 중간 굵기 글꼴 + 외곽선 보정: 슬라이더 값이 대략 실제 획 굵기(cm)가 되도록.
  // 기본 글꼴 획 ≈ 0.06 × 글자크기 — 붙어 뭉개지지 않으면서 굵기를 조절할 수 있다.
  c.font = `500 ${o.size * scale}px ${FONT}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  const extra = Math.max(0, (o.stroke - 0.06 * o.size)) * scale;
  if (extra > 0.5) { c.lineWidth = extra; c.lineJoin = 'round'; c.strokeText(o.text, o.x * scale, o.y * scale); }
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
  letters().forEach(l => drawLetter(c, scale, l));
  if (config.dDrawing !== false) drawStrokes(c, scale, null);
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
  const raster = (fn) => {
    const o2 = document.createElement('canvas');
    o2.width = W; o2.height = H;
    const c2 = o2.getContext('2d', { willReadFrequently: true });
    fn(c2);
    return c2.getImageData(0, 0, W, H).data;
  };
  const measure = (d2) => {
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
  // 어떤 래스터의 "안쪽 섬" 개수 (획이 붙어 ㅇ·ㅁ 속이 사라졌는지 판단용)
  const islandsIn = (d2) => {
    const cut2 = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) cut2[i] = d2[i * 4 + 3] > 60 ? 1 : 0;
    const seen3 = new Uint8Array(W * H);
    const st = [];
    for (let x = 0; x < W; x++) { st.push(x, (H - 1) * W + x); }
    for (let y = 0; y < H; y++) { st.push(y * W, y * W + W - 1); }
    while (st.length) {
      const i = st.pop();
      if (i < 0 || i >= W * H || seen3[i] || cut2[i]) continue;
      seen3[i] = 1;
      const x = i % W;
      if (x > 0) st.push(i - 1);
      if (x < W - 1) st.push(i + 1);
      st.push(i - W, i + W);
    }
    let cnt = 0;
    const seen4 = new Uint8Array(W * H);
    for (let i0 = 0; i0 < W * H; i0++) {
      if (!cut2[i0] && !seen3[i0] && !seen4[i0]) {
        cnt++;
        const st2 = [i0];
        while (st2.length) {
          const i = st2.pop();
          if (i < 0 || i >= W * H || seen4[i] || cut2[i] || seen3[i]) continue;
          seen4[i] = 1;
          const x = i % W;
          if (x > 0) st2.push(i - 1);
          if (x < W - 1) st2.push(i + 1);
          st2.push(i - W, i + W);
        }
      }
    }
    return cnt;
  };

  const Ls = letters();
  const merged = Ls.map(() => false);
  Ls.forEach((o, li) => {
    if (!o.text) { boxes.push(null); return; }
    const cur = raster(c2 => drawLetter(c2, RA, o));
    boxes.push(measure(cur));
    // 가는 획(기본 글꼴)으로 그렸을 때보다 안쪽 공간이 줄었으면 획이 붙은 것
    const thin = raster(c2 => drawLetter(c2, RA, { ...o, stroke: 0 }));
    merged[li] = islandsIn(thin) > islandsIn(cur);
  });
  boxes.push(config.dDrawing !== false && drawing().strokes.length ? measure(raster(c2 => drawStrokes(c2, RA, null))) : null);
  return { cut, island, W, H, islandCount, perimeter, boxes, merged };
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
  // 작업 화면이 기기 화면(폭·높이)에 맞춰 최대한 크게
  const host = cv.closest('.panel-center');
  const avail = (host ? host.clientWidth : 700) - 50;
  const availH = (window.innerHeight || 800) - 220;
  S = Math.max(18, Math.min(Math.floor(avail / config.frontW), Math.floor(availH / config.frontH), 64));
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

  letters().forEach(l => drawLetter(ctx, S, l));
  if (config.dDrawing !== false) drawStrokes(ctx, S, drawingStroke);

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
  let html = ''; // 잘라낼 길이 등 수치 표시는 부담을 줄 수 있어 하지 않는다
  if (a.islandCount > 0)
    html += `<p class="warn"><span class="dot red"></span> 오리면 떨어져 나가는 안쪽 조각이 ${a.islandCount}개 있습니다. 이 조각들을 어떻게 처리할지 포트폴리오에 적어 보세요.</p>`;
  const warns = [];
  const ax = (config.frontW - config.areaW) / 2, ay = (config.frontH - config.areaH) / 2;
  const L = letters().length;
  const names = a.boxes.map((_, i) => i < L ? `글자 ${i + 1}` : '그림');
  const free = !!config.dFree; // 자유 모드: 크기·간격 조건 검사 없음
  a.boxes.forEach((b, i) => {
    if (!b) return;
    if (b.x < ax - 0.05 || b.y < ay - 0.05 || b.x + b.w > ax + config.areaW + 0.05 || b.y + b.h > ay + config.areaH + 0.05)
      warns.push(`${names[i]}이(가) 작업 영역을 벗어났습니다. 어디로 옮기면 좋을까요?`);
    if (free) return;
    if (i < L) {
      if (b.h < config.letterMin - 0.3 || b.h > config.letterMax + 0.3)
        warns.push(`${names[i]} 세로 크기가 조건(${config.letterMin}~${config.letterMax}cm)과 다릅니다.`);
    } else {
      const size = Math.max(b.w, b.h);
      if (size < config.pictoMin - 0.3 || size > config.pictoMax + 0.3)
        warns.push(`그림 크기가 조건(${config.pictoMin}~${config.pictoMax}cm)과 다릅니다.`);
    }
  });
  if (!free) for (let i = 0; i < a.boxes.length; i++) for (let j = i + 1; j < a.boxes.length; j++) {
    const A = a.boxes[i], B = a.boxes[j];
    if (!A || !B) continue;
    const gx = Math.max(A.x - (B.x + B.w), B.x - (A.x + A.w));
    const gy = Math.max(A.y - (B.y + B.h), B.y - (A.y + A.h));
    if (Math.max(gx, gy) < 0.5) warns.push(`${names[i]}과(와) ${names[j]} 사이 간격이 0.5cm보다 좁습니다.`);
  }
  if (letters().some(l => l.text && l.stroke < config.strokeMin))
    warns.push(`글자 획 굵기가 조건(${config.strokeMin}cm 이상)보다 가늘어요. 조건을 지키면서 글자를 또렷하게 만들려면, 굵기 대신 글자 크기를 키워 보는 건 어떨까요?`);
  if (config.dDrawing !== false && drawing().strokes.some(s => s.w < config.strokeMin))
    warns.push(`그림에 조건(${config.strokeMin}cm)보다 가는 선이 있어요. 붓 굵기를 키워 다시 그려 볼까요?`);
  // 획이 붙어 글자를 알아보기 힘든 경우 — 크기를 키우는 쪽으로 안내 (굵기만 줄이면 조건에 걸린다)
  a.merged.forEach((m, i) => {
    if (m) warns.push(`${names[i]}의 획이 서로 붙어 안쪽 공간이 좁아졌어요. 글자 크기를 키우면 같은 굵기여도 훨씬 또렷해집니다.`);
  });
  warns.forEach(w => html += `<p class="hint">${w}</p>`);
  if (!warns.length && letters().some(l => l.text))
    html += `<p class="ok">조건에 잘 맞습니다. 빛이 어떻게 새어 나올지는 [미리보기] 탭에서 확인하세요.</p>`;
  el.innerHTML = html;
  // 교사 분석용: 어떤 피드백이 떴는지 기록 (같은 내용 반복 기록 방지)
  const key = warns.join('|') + (a.islandCount ? `|섬${a.islandCount}` : '');
  if (key && key !== lastFeedbackKey) sheetLog('도안 피드백', warns.join(' / ') || `안쪽 조각 ${a.islandCount}개`);
  lastFeedbackKey = key;
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

  $('d-letter-add').addEventListener('click', () => {
    if (readOnly) return;
    const arr = letters();
    arr.push(newLetter());
    autoLayout(arr); // 추가하면 전체를 다시 고르게 배치
    touch(); renderLetterRows(); refresh(true);
  });

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
    for (let i = letters().length - 1; i >= 0; i--) {
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
  window.addEventListener('resize', () => {
    if ($('tab-design').classList.contains('active')) draw();
  });
  refreshDesign();
}

// 글자 입력칸: 설정된 글자 수(또는 자유 모드의 현재 개수)만큼 동적으로 만든다
function renderLetterRows() {
  const list = $('d-letter-list');
  const Ls = letters();
  const free = !!config.dFree;
  list.innerHTML = Ls.map((l, i) => `
    <label>글자 ${i + 1}${free && Ls.length > 1 ? ` <button class="dl-del small-btn" data-i="${i}" title="빼기">✕</button>` : ''}</label>
    <div class="d-row"><input class="dl-text" data-i="${i}" maxlength="1" placeholder="한 글자" value="${(l.text || '').replace(/"/g, '&quot;')}">
      크기 <input class="dl-size w4" data-i="${i}" type="number" step="0.5" min="2" max="10" value="${l.size}">cm</div>
    <div class="d-row">획 굵기 <input class="dl-stroke w8" data-i="${i}" type="range" min="0.4" max="1.5" step="0.05" value="${l.stroke}"></div>`).join('');
  const on = (cls, key, isNum) => list.querySelectorAll(cls).forEach(inp =>
    inp.addEventListener('input', () => {
      if (readOnly) return;
      letters()[+inp.dataset.i][key] = isNum ? parseFloat(inp.value) : inp.value;
      touch(); refresh(false);
    }));
  on('.dl-text', 'text'); on('.dl-size', 'size', true); on('.dl-stroke', 'stroke', true);
  list.querySelectorAll('.dl-del').forEach(b => b.addEventListener('click', () => {
    if (readOnly) return;
    letters().splice(+b.dataset.i, 1);
    touch(); renderLetterRows(); refresh(true);
  }));
  $('d-letter-add').classList.toggle('hidden', !free);
  $('d-drawing-sec').style.display = config.dDrawing !== false ? '' : 'none';
}

export function refreshDesign() {
  const d = work.design;
  d.drawing = d.drawing || { strokes: [] };
  renderLetterRows();
  refresh(true);
}
