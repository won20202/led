// 도안 탭: 검은 앞면에 글자 2개 + 그림 1개. 오려낼 부분과 떨어져 나가는 안쪽 조각을 보여준다.
// 처리 방법(다리 만들기·재부착)은 알려주지 않는다 — 학생이 정한다.
import { config, work, touch, readOnly } from './state.js';

const $ = id => document.getElementById(id);
const S = 24;   // 표시용 px/cm
const RA = 8;   // 분석용 px/cm
const FONT = '"Noto Sans CJK KR","Noto Sans KR","Malgun Gothic",sans-serif';

let cv, ctx, selected = -1, dragOff = null;
let analysis = null; // {islands, perimeter, maskCanvas}

function elements() {
  const D = work.design;
  return [
    { kind: 'letter', obj: D.letters[0], name: '글자 1' },
    { kind: 'letter', obj: D.letters[1], name: '글자 2' },
    { kind: 'picto', obj: D.picto, name: '그림' },
  ];
}

// 요소 하나를 경로로 그린다 (mode: 'cut' = 흰색 채움)
function drawElement(c, scale, el) {
  const o = el.obj;
  if (el.kind === 'letter') {
    if (!o.text) return;
    c.save();
    c.font = `900 ${o.size * scale}px ${FONT}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    c.strokeStyle = '#fff';
    const extra = Math.max(0, (o.stroke - 0.55)) * scale; // 굵기 보정
    if (extra > 0) { c.lineWidth = extra; c.lineJoin = 'round'; c.strokeText(o.text, o.x * scale, o.y * scale); }
    c.fillText(o.text, o.x * scale, o.y * scale);
    c.restore();
  } else {
    if (o.shape === 'none') return;
    c.save();
    c.translate(o.x * scale, o.y * scale);
    const r = o.size * scale / 2;
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    c.lineWidth = (o.stroke || 0.7) * scale;
    const path = new Path2D();
    if (o.shape === 'heart') {
      path.moveTo(0, r * 0.35);
      path.bezierCurveTo(r * 1.3, -r * 0.7, r * 0.5, -r * 1.1, 0, -r * 0.35);
      path.bezierCurveTo(-r * 0.5, -r * 1.1, -r * 1.3, -r * 0.7, 0, r * 0.35);
      path.closePath();
      // 하트는 아래 꼭짓점 보정
      const p2 = new Path2D();
      p2.moveTo(-r * 0.98, -r * 0.28); p2.quadraticCurveTo(-r * 0.65, r * 0.45, 0, r);
      p2.quadraticCurveTo(r * 0.65, r * 0.45, r * 0.98, -r * 0.28);
      path.addPath(p2);
    } else if (o.shape === 'star') {
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? r * 0.42 : r;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        i ? path.lineTo(rr * Math.cos(a), rr * Math.sin(a)) : path.moveTo(rr * Math.cos(a), rr * Math.sin(a));
      }
      path.closePath();
    } else if (o.shape === 'circle') {
      path.arc(0, 0, r, 0, 7);
    } else if (o.shape === 'moon') {
      path.arc(0, 0, r, Math.PI * 0.35, Math.PI * 1.65);
      path.arc(r * 0.55, 0, r * 0.72, Math.PI * 1.5, Math.PI * 0.5, true);
      path.closePath();
    } else if (o.shape === 'arrow') {
      path.moveTo(-r, -r * 0.3); path.lineTo(r * 0.2, -r * 0.3); path.lineTo(r * 0.2, -r * 0.7);
      path.lineTo(r, 0); path.lineTo(r * 0.2, r * 0.7); path.lineTo(r * 0.2, r * 0.3);
      path.lineTo(-r, r * 0.3); path.closePath();
    }
    if (o.outline) { c.stroke(path); } else { c.fill(path); }
    c.restore();
  }
}

function bbox(el) {
  // 요소 대략 크기 (분석 래스터에서 실측)
  const o = el.obj;
  if (el.kind === 'letter') {
    if (!o.text) return null;
    return { x: o.x - o.size / 2, y: o.y - o.size / 2, w: o.size, h: o.size };
  }
  if (o.shape === 'none') return null;
  return { x: o.x - o.size / 2, y: o.y - o.size / 2, w: o.size, h: o.size };
}

// ---------- 래스터 분석: 안쪽 조각 + 잘라낼 둘레 ----------
function analyze() {
  const W = Math.round(config.frontW * RA), H = Math.round(config.frontH * RA);
  const oc = document.createElement('canvas');
  oc.width = W; oc.height = H;
  const c = oc.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  elements().forEach(el => drawElement(c, RA, el));
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
  let islandPx = 0;
  for (let i = 0; i < W * H; i++) if (!cut[i] && !seen[i]) { island[i] = 1; islandPx++; }
  // 섬 개수 세기
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
  // 둘레: 잘림/안잘림 경계 픽셀 변의 수
  let edges = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!cut[i]) continue;
    if (x === 0 || !cut[i - 1]) edges++;
    if (x === W - 1 || !cut[i + 1]) edges++;
    if (y === 0 || !cut[i - W]) edges++;
    if (y === H - 1 || !cut[i + W]) edges++;
  }
  // ponytail: 픽셀 경계 근사(대각선 과대집계 보정 0.8) — cm 단위 비교용으로는 충분
  const perimeter = Math.round(edges / RA * 0.8);

  // 요소 실측 bbox (경고용)
  const boxes = [];
  for (const el of elements()) {
    if ((el.kind === 'letter' && !el.obj.text) || (el.kind === 'picto' && el.obj.shape === 'none')) { boxes.push(null); continue; }
    const oc2 = document.createElement('canvas');
    oc2.width = W; oc2.height = H;
    const c2 = oc2.getContext('2d', { willReadFrequently: true });
    drawElement(c2, RA, el);
    const d2 = c2.getImageData(0, 0, W, H).data;
    let minX = W, maxX = 0, minY = H, maxY = 0, any = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d2[(y * W + x) * 4 + 3] > 60) {
        any = true;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    boxes.push(any ? { x: minX / RA, y: minY / RA, w: (maxX - minX) / RA, h: (maxY - minY) / RA } : null);
  }
  return { cut, island, W, H, islandCount, islandPx, perimeter, boxes };
}

// 미리보기 탭용: 최종 빛 통과 마스크 (안쪽 조각은 다시 붙인 상태로 가정)
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
  // 검은 앞면
  ctx.fillStyle = '#17181c'; ctx.fillRect(0, 0, W, H);
  // 작업 영역 점선
  const ax = (config.frontW - config.areaW) / 2, ay = (config.frontH - config.areaH) / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([6, 5]);
  ctx.strokeRect(ax * S, ay * S, config.areaW * S, config.areaH * S);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '11px sans-serif';
  ctx.fillText(`작업 영역 ${config.areaW}×${config.areaH}cm`, ax * S + 4, ay * S - 4);

  // 오려낼 부분 (흰색)
  elements().forEach(el => drawElement(ctx, S, el));

  // 안쪽 조각 빨간 표시
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
  // 선택 표시
  if (selected >= 0 && analysis && analysis.boxes[selected]) {
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
    html += `<p class="warn">🟥 오리면 떨어져 나가는 안쪽 조각이 ${a.islandCount}개 있습니다. 이 조각들을 어떻게 처리할지 포트폴리오에 적어 보세요.</p>`;
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
      if (b.w < config.pictoMin - 0.3 || b.w > config.pictoMax + 0.3)
        warns.push(`그림 크기가 조건(${config.pictoMin}~${config.pictoMax}cm)과 다릅니다.`);
    }
  });
  // 간격 검사
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const A = a.boxes[i], B = a.boxes[j];
    if (!A || !B) continue;
    const gx = Math.max(A.x - (B.x + B.w), B.x - (A.x + A.w));
    const gy = Math.max(A.y - (B.y + B.h), B.y - (A.y + A.h));
    if (Math.max(gx, gy) < 0.5) warns.push(`${names[i]}과(와) ${names[j]} 사이 간격이 0.5cm보다 좁습니다.`);
  }
  const D = work.design;
  if (D.letters.some(l => l.text && l.stroke < config.strokeMin))
    warns.push(`획 굵기가 ${config.strokeMin}cm보다 가늘면 오리기 어렵고 잘 찢어집니다.`);
  if (D.picto.shape !== 'none' && D.picto.outline && (D.picto.stroke || 0.7) < config.strokeMin)
    warns.push(`그림 선 굵기가 ${config.strokeMin}cm보다 가늡니다.`);
  warns.forEach(w => html += `<p class="warn">${w}</p>`);
  if (!warns.length && (D.letters[0].text || D.letters[1].text))
    html += `<p class="ok">조건 위반 없음. 빛이 어떻게 새어 나올지는 [미리보기] 탭에서 확인하세요.</p>`;
  el.innerHTML = html;
}

let analyzeTimer = null;
function refresh(immediate) {
  draw(); // 우선 즉시 그리고
  clearTimeout(analyzeTimer);
  analyzeTimer = setTimeout(() => {
    analysis = analyze();
    draw(); updatePanel();
  }, immediate ? 0 : 250);
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
  bind('d-p-shape', () => work.design.picto, 'shape');
  bind('d-p-size', () => work.design.picto, 'size', true);
  $('d-p-outline').addEventListener('change', () => {
    const p = work.design.picto;
    p.outline = $('d-p-outline').checked;
    p.stroke = p.stroke || 0.7;
    touch(); refresh(false);
  });

  // 캔버스 드래그로 이동
  cv.addEventListener('pointerdown', e => {
    if (readOnly) return;
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left - 10) / S, y = (e.clientY - r.top - 10) / S;
    selected = -1;
    const boxes = analysis ? analysis.boxes : [];
    for (let i = 2; i >= 0; i--) {
      const b = boxes[i];
      if (b && x > b.x - 0.3 && x < b.x + b.w + 0.3 && y > b.y - 0.3 && y < b.y + b.h + 0.3) { selected = i; break; }
    }
    if (selected >= 0) {
      const o = elements()[selected].obj;
      dragOff = { x: x - o.x, y: y - o.y };
      cv.setPointerCapture(e.pointerId);
    }
    draw();
  });
  cv.addEventListener('pointermove', e => {
    if (selected < 0 || !dragOff || readOnly) return;
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left - 10) / S, y = (e.clientY - r.top - 10) / S;
    const o = elements()[selected].obj;
    o.x = Math.round((x - dragOff.x) * 2) / 2;
    o.y = Math.round((y - dragOff.y) * 2) / 2;
    draw();
  });
  cv.addEventListener('pointerup', () => {
    if (dragOff) { dragOff = null; touch(); refresh(true); }
  });

  document.addEventListener('work-loaded', refreshDesign);
  refreshDesign();
}

export function refreshDesign() {
  const D = work.design;
  $('d-l1-text').value = D.letters[0].text || '';
  $('d-l2-text').value = D.letters[1].text || '';
  $('d-l1-size').value = D.letters[0].size;
  $('d-l2-size').value = D.letters[1].size;
  $('d-l1-stroke').value = D.letters[0].stroke;
  $('d-l2-stroke').value = D.letters[1].stroke;
  $('d-p-shape').value = D.picto.shape;
  $('d-p-size').value = D.picto.size;
  $('d-p-outline').checked = !!D.picto.outline;
  refresh(true);
}
