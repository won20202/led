// 케이스 탭: 조각 치수 입력 → 3D 조립. 겹침(빨강)·틈(노랑)을 보여주되 수치는 알려주지 않는다.
import * as THREE from '../vendor/three.module.min.js';
import { config, work, addLog, touch, readOnly } from './state.js';

let scene, camera, renderer, root, el3d;
let theta = 0.55, phi = 0.5, radius = 42; // 카메라 궤도
let foldT = 1;        // 0=펼침 1=접힘
let dirty = true;
let pivots = {};      // 접기 애니메이션용
let markerGroup, caseGroup;
let clipPlane = null, sectionOn = false;

const $ = id => document.getElementById(id);

function num(v) { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; }

function getPieces() {
  const p = work.caseTab.pieces;
  return {
    back: { w: num(p.back.w), h: num(p.back.h) },
    side: { w: num(p.side.w), h: num(p.side.h) },
    topbot: { w: num(p.topbot.w), h: num(p.topbot.h) },
  };
}

// 접힌 상태의 각 조각 AABB (해석적으로 계산)
function foldedBoxes(p, t) {
  const bw = p.back.w, bh = p.back.h, sw = p.side.w, sh = p.side.h, tw = p.topbot.w, td = p.topbot.h;
  return {
    back: [[-bw / 2, bw / 2], [-bh / 2, bh / 2], [0, t]],
    left: [[-bw / 2, -bw / 2 + t], [-sh / 2, sh / 2], [t, t + sw]],
    right: [[bw / 2 - t, bw / 2], [-sh / 2, sh / 2], [t, t + sw]],
    top: [[-bw / 2 + t, -bw / 2 + t + tw], [bh / 2 - t, bh / 2], [t, t + td]],
    bottom: [[-bw / 2 + t, -bw / 2 + t + tw], [-bh / 2, -bh / 2 + t], [t, t + td]],
  };
}

function boxIntersect(a, b) {
  const r = [];
  for (let i = 0; i < 3; i++) {
    const lo = Math.max(a[i][0], b[i][0]), hi = Math.min(a[i][1], b[i][1]);
    if (hi - lo < 0.02) return null; // 접촉면은 겹침이 아님
    r.push([lo, hi]);
  }
  return r;
}

export function initCase() {
  el3d = $('case-canvas');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.localClippingEnabled = true;
  el3d.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef1f5);
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dl = new THREE.DirectionalLight(0xffffff, 1.4);
  dl.position.set(18, 30, 25);
  scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xffffff, 0.5);
  dl2.position.set(-20, -10, -15);
  scene.add(dl2);

  const grid = new THREE.GridHelper(60, 12, 0xb8c2cc, 0xd5dde5);
  grid.position.y = -9;
  scene.add(grid);

  root = new THREE.Group();
  scene.add(root);
  caseGroup = new THREE.Group();
  markerGroup = new THREE.Group();
  root.add(caseGroup, markerGroup);
  clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

  // 궤도 조작 (드래그 회전, 휠 확대)
  let drag = false, px = 0, py = 0;
  const dom = renderer.domElement;
  dom.addEventListener('pointerdown', e => { drag = true; px = e.clientX; py = e.clientY; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener('pointermove', e => {
    if (!drag) return;
    theta -= (e.clientX - px) * 0.008;
    phi = Math.max(-1.3, Math.min(1.3, phi + (e.clientY - py) * 0.008));
    px = e.clientX; py = e.clientY; dirty = true;
  });
  dom.addEventListener('pointerup', () => { drag = false; });
  dom.addEventListener('wheel', e => {
    e.preventDefault();
    radius = Math.max(15, Math.min(120, radius + e.deltaY * 0.04));
    dirty = true;
  }, { passive: false });

  bindInputs();
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(loop);
  refreshFromWork();
}

function resize() {
  if (!el3d) return;
  const w = el3d.clientWidth || 600, h = el3d.clientHeight || 420;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}

function loop() {
  requestAnimationFrame(loop);
  if (!el3d.offsetParent) return; // 탭이 숨겨져 있으면 그리지 않음
  // 접기 슬라이더 목표값으로 부드럽게
  const target = parseFloat($('fold-slider').value) / 100;
  if (Math.abs(foldT - target) > 0.002) { foldT = foldT + (target - foldT) * 0.18; dirty = true; }
  else if (foldT !== target) { foldT = target; dirty = true; }
  if (!dirty) return;
  dirty = false;
  applyFold();
  camera.position.set(
    radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(theta));
  camera.lookAt(0, 0, 2);
  markerGroup.visible = foldT > 0.98;
  renderer.render(scene, camera);
  const az = Math.round(((theta * 180 / Math.PI) % 360 + 360) % 360);
  const elv = Math.round(phi * 180 / Math.PI);
  $('case-angle').textContent = `보는 각도 — 좌우 ${az > 180 ? az - 360 : az}° / 상하 ${elv}°`;
}

function applyFold() {
  const a = foldT * Math.PI / 2;
  if (pivots.left) pivots.left.rotation.y = a;
  if (pivots.right) pivots.right.rotation.y = -a;
  if (pivots.top) pivots.top.rotation.x = a;
  if (pivots.bottom) pivots.bottom.rotation.x = -a;
}

function slab(w, h, d, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.MeshLambertMaterial({ color, clippingPlanes: sectionOn ? [clipPlane] : [] });
  const mesh = new THREE.Mesh(g, m);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g),
    new THREE.LineBasicMaterial({ color: 0x7a8794 }));
  mesh.add(edges);
  return mesh;
}

function clearGroup(g) {
  while (g.children.length) {
    const c = g.children.pop();
    c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}

// 조립 실행: 씬 재구성 + 겹침/틈 마커 + 실측값
function assemble(logIt) {
  const p = getPieces();
  const t = config.thickness;
  clearGroup(caseGroup); clearGroup(markerGroup);
  pivots = {};
  const info = $('case-info');
  if (!p.back.w || !p.back.h || !p.side.w || !p.side.h || !p.topbot.w || !p.topbot.h) {
    info.innerHTML = '<p class="muted">여섯 값을 모두 입력한 뒤 [조립하기]를 누르세요.</p>';
    dirty = true;
    return;
  }
  const { back, side, topbot } = p;

  // 뒷면 (고정)
  const backMesh = slab(back.w, back.h, t, 0xf7f3e8);
  backMesh.position.set(0, 0, t / 2);
  caseGroup.add(backMesh);

  // 좌·우 옆면 (경첩: 뒷면 좌우 모서리)
  const mkSide = (sign) => {
    const pv = new THREE.Group();
    pv.position.set(sign * back.w / 2, 0, t);
    const m = slab(side.w, side.h, t, 0xe4eef7);
    m.position.set(sign * side.w / 2, 0, t / 2);
    pv.add(m);
    caseGroup.add(pv);
    return pv;
  };
  pivots.left = mkSide(-1);
  pivots.right = mkSide(1);

  // 위·아랫면 (경첩: 뒷면 위아래 모서리, 왼쪽 옆면 안쪽에 맞춰 배치)
  const xc = -back.w / 2 + t + topbot.w / 2;
  const mkTB = (sign) => {
    const pv = new THREE.Group();
    pv.position.set(xc, sign * back.h / 2, t);
    const m = slab(topbot.w, topbot.h, t, 0xeee6f7);
    m.position.set(0, sign * topbot.h / 2, t / 2);
    pv.add(m);
    caseGroup.add(pv);
    return pv;
  };
  pivots.top = mkTB(1);
  pivots.bottom = mkTB(-1);
  applyFold();

  // ---- 겹침 검출 (접힌 상태 기준) ----
  const boxes = foldedBoxes(p, t);
  const names = Object.keys(boxes);
  let overlapN = 0;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const ov = boxIntersect(boxes[names[i]], boxes[names[j]]);
      if (ov) {
        overlapN++;
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(ov[0][1] - ov[0][0] + 0.15, ov[1][1] - ov[1][0] + 0.15, ov[2][1] - ov[2][0] + 0.15),
          new THREE.MeshBasicMaterial({ color: 0xe23c3c, transparent: true, opacity: 0.85 }));
        m.position.set((ov[0][0] + ov[0][1]) / 2, (ov[1][0] + ov[1][1]) / 2, (ov[2][0] + ov[2][1]) / 2);
        markerGroup.add(m);
      }
    }
  }
  // ---- 틈 검출: 위·아랫면 오른쪽 끝 ↔ 오른쪽 옆면 안쪽 ----
  let gapN = 0;
  const tbRight = -back.w / 2 + t + topbot.w;
  const sideInner = back.w / 2 - t;
  const gap = sideInner - tbRight;
  if (gap > 0.05) {
    gapN = 2;
    for (const sign of [1, -1]) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(gap, config.thickness + 0.1, topbot.h + 0.1),
        new THREE.MeshBasicMaterial({ color: 0xf5c518, transparent: true, opacity: 0.55 }));
      m.position.set((tbRight + sideInner) / 2, sign * (back.h / 2 - t / 2), t + topbot.h / 2);
      markerGroup.add(m);
    }
  }

  // ---- 실측값 ----
  const xs = [], ys = [], zs = [];
  for (const n of names) { xs.push(...boxes[n][0]); ys.push(...boxes[n][1]); zs.push(...boxes[n][2]); }
  const W = Math.max(...xs) - Math.min(...xs);
  const H = Math.max(...ys) - Math.min(...ys);
  const D = Math.max(...zs) - Math.min(...zs);
  const f = v => (Math.round(v * 10) / 10).toFixed(1);

  let html = '';
  if (config.showMeasure)
    html += `<p class="measure">지금 만들어진 케이스<br><b>가로 ${f(W)} · 세로 ${f(H)} · 깊이 ${f(D)} cm</b></p>`;
  if (config.showTarget)
    html += `<p class="muted">완성 목표 — ${config.targetW} × ${config.targetH} × ${config.targetD} cm</p>`;
  if (overlapN) html += `<p class="warn"><span class="dot red"></span> 판이 겹쳐 튀어나온 곳이 ${overlapN}군데 있습니다. 어느 조각을 얼마나 줄여야 할까요?</p>`;
  if (gapN) html += `<p class="warn"><span class="dot yellow"></span> 판 사이가 벌어진 틈이 보입니다. 어느 조각이 짧은 걸까요?</p>`;
  // 정답 판정처럼 들리는 칭찬 문구는 쓰지 않는다 — 목표와의 비교·판단은 학생 몫
  if (!overlapN && !gapN) html += `<p class="hint">케이스를 돌려서 여러 방향에서 살펴보세요. 실측값이 여러분이 목표한 완성 크기와 같은가요? 포트폴리오의 전개도 치수와도 비교해 보세요.</p>`;

  // 예측 비교
  const pr = work.caseTab.predict;
  if (config.askPredict && num(pr.w) && num(pr.h) && num(pr.d)) {
    const cmp = (a, b) => Math.abs(a - b) < 0.05 ? '<span class="ok">●</span>' : '<span class="warn">●</span>';
    html += `<table class="predict-table"><tr><th></th><th>가로</th><th>세로</th><th>깊이</th></tr>` +
      `<tr><td>내 예측</td><td>${num(pr.w)}</td><td>${num(pr.h)}</td><td>${num(pr.d)}</td></tr>` +
      `<tr><td>실제</td><td>${f(W)} ${cmp(num(pr.w), W)}</td><td>${f(H)} ${cmp(num(pr.h), H)}</td><td>${f(D)} ${cmp(num(pr.d), D)}</td></tr></table>`;
  }
  info.innerHTML = html;

  if (logIt) {
    addLog(`뒷면 ${back.w}×${back.h}, 옆면 ${side.w}×${side.h}, 위아래 ${topbot.w}×${topbot.h} → 완성 ${f(W)}×${f(H)}×${f(D)}` +
      (overlapN ? ` (겹침 ${overlapN}곳)` : '') + (gapN ? ' (틈 있음)' : ''));
    renderLogList();
  }
  work.caseTab.assembled = true;
  touch();
  dirty = true;
}

export function renderLogList() {
  const el = $('case-log');
  if (!el) return;
  el.innerHTML = work.log.length
    ? work.log.slice(-12).map(l => `<div>${l}</div>`).join('')
    : '<div class="muted">조립할 때마다 기록이 쌓입니다. 포트폴리오 자기 평가에 활용하세요.</div>';
}

function bindInputs() {
  const map = [
    ['in-back-w', () => work.caseTab.pieces.back, 'w'], ['in-back-h', () => work.caseTab.pieces.back, 'h'],
    ['in-side-w', () => work.caseTab.pieces.side, 'w'], ['in-side-h', () => work.caseTab.pieces.side, 'h'],
    ['in-tb-w', () => work.caseTab.pieces.topbot, 'w'], ['in-tb-h', () => work.caseTab.pieces.topbot, 'h'],
    ['in-pre-w', () => work.caseTab.predict, 'w'], ['in-pre-h', () => work.caseTab.predict, 'h'],
    ['in-pre-d', () => work.caseTab.predict, 'd'],
  ];
  for (const [id, obj, key] of map) {
    $(id).addEventListener('input', () => {
      obj()[key] = $(id).value;
      touch();
      updateAssembleButton();
    });
  }
  $('btn-assemble').addEventListener('click', () => assemble(true));
  $('fold-slider').addEventListener('input', () => { dirty = true; });
  $('btn-section').addEventListener('click', () => {
    sectionOn = !sectionOn;
    $('btn-section').classList.toggle('active', sectionOn);
    caseGroup.traverse(o => { if (o.isMesh && o.material.isMeshLambertMaterial) o.material.clippingPlanes = sectionOn ? [clipPlane] : []; });
    dirty = true;
  });
  $('btn-layout').addEventListener('click', showLayout);
  $('layout-close').addEventListener('click', () => $('layout-modal').classList.add('hidden'));
  document.addEventListener('work-loaded', refreshFromWork);
}

function updateAssembleButton() {
  const p = work.caseTab.pieces, pr = work.caseTab.predict;
  const dimsOk = num(p.back.w) && num(p.back.h) && num(p.side.w) && num(p.side.h) && num(p.topbot.w) && num(p.topbot.h);
  const preOk = !config.askPredict || (num(pr.w) && num(pr.h) && num(pr.d));
  const btn = $('btn-assemble');
  btn.disabled = readOnly || !dimsOk || !preOk;
  $('predict-hint').textContent = dimsOk && !preOk
    ? '먼저 예측을 적어야 조립할 수 있습니다. 머릿속으로 계산해 보세요!' : '';
}

export function refreshFromWork() {
  const P = work.caseTab.pieces, pr = work.caseTab.predict;
  const set = (id, v) => { const e = $(id); if (e) e.value = v ?? ''; };
  set('in-back-w', P.back.w); set('in-back-h', P.back.h);
  set('in-side-w', P.side.w); set('in-side-h', P.side.h);
  set('in-tb-w', P.topbot.w); set('in-tb-h', P.topbot.h);
  set('in-pre-w', pr.w); set('in-pre-h', pr.h); set('in-pre-d', pr.d);
  $('predict-row').style.display = config.askPredict ? '' : 'none';
  updateAssembleButton();
  renderLogList();
  if (work.caseTab.assembled) assemble(false);
  else { clearGroup(caseGroup); clearGroup(markerGroup); $('case-info').innerHTML = '<p class="muted">치수를 입력하고 조립해 보세요.</p>'; dirty = true; }
}

// 재단 배치 뷰: 우드락 판에 조각을 선반식으로 배치해 본다
function showLayout() {
  const p = getPieces();
  const cv = $('layout-canvas'), ctx = cv.getContext('2d');
  const S = 14; // px per cm
  cv.width = config.boardW * S + 40; cv.height = config.boardH * S + 60;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = '#333'; ctx.strokeRect(20, 40, config.boardW * S, config.boardH * S);
  ctx.fillStyle = '#333'; ctx.font = '13px sans-serif';
  ctx.fillText(`우드락 판 ${config.boardW} × ${config.boardH} cm`, 20, 28);
  const rects = [];
  if (p.back.w) rects.push({ w: p.back.w, h: p.back.h, name: '뒷면', c: '#f7f3e8' });
  if (p.side.w) for (let i = 0; i < 2; i++) rects.push({ w: p.side.w, h: p.side.h, name: '옆면', c: '#e4eef7' });
  if (p.topbot.w) for (let i = 0; i < 2; i++) rects.push({ w: p.topbot.w, h: p.topbot.h, name: '위/아래', c: '#eee6f7' });
  // ponytail: 단순 선반 배치(회전 없음) — 실제 최적 배치는 학생이 종이에서 고민할 몫
  rects.sort((a, b) => b.h - a.h);
  let x = 0, y = 0, rowH = 0, failed = 0;
  for (const r of rects) {
    if (x + r.w > config.boardW) { x = 0; y += rowH + 0.5; rowH = 0; }
    if (y + r.h > config.boardH || r.w > config.boardW) { failed++; continue; }
    ctx.fillStyle = r.c;
    ctx.fillRect(20 + x * S, 40 + y * S, r.w * S, r.h * S);
    ctx.strokeStyle = '#7a8794';
    ctx.strokeRect(20 + x * S, 40 + y * S, r.w * S, r.h * S);
    ctx.fillStyle = '#333';
    ctx.fillText(`${r.name} ${r.w}×${r.h}`, 24 + x * S, 54 + y * S);
    x += r.w + 0.5; rowH = Math.max(rowH, r.h);
  }
  $('layout-msg').textContent = failed
    ? `⚠ 판에 들어가지 못한 조각이 ${failed}개 있습니다. 치수나 배치를 다시 생각해 보세요.`
    : (rects.length ? '모든 조각이 판 안에 들어갑니다.' : '먼저 케이스 치수를 입력하세요.');
  $('layout-modal').classList.remove('hidden');
}
