// 완성 미리보기: 케이스 + 회로 + 도안을 합친 최종 모습.
// 어느 위치에 어떤 색 빛이 나오는지, 전체 완성본이 어떨지를 보여준다.
import { config, work } from './state.js';
import { getLighting, drawAssembled } from './circuit.js';
import { getDesignMask } from './design.js';

const $ = id => document.getElementById(id);

let cv, ctx;
const DARK = 0.78; // 고정된 실내 어둡기 — 빛 색이 잘 보이는 정도
let pvOn = true;                       // 미리보기 스위치 (회로 상태와 별개로 껐다 켜 볼 수 있다)
let pv3d = false;                      // 입체로 보기
let pvYaw = -0.62, pvPitch = 0.40;     // 입체 회전 각도 — 끌어서 돌린다

function lerp(a, b, t) { return a + (b - a) * t; }

// 고휘도 LED는 우드락 안에서 산란이 강하다 — 켜진 개수만큼 전체가 고르게 밝아지는 바닥광.
// 1~2개면 위치에 따른 밝기 차이가 뚜렷하고, 8개쯤 달면 어두운 곳 없이 환해진다.
function paintAmbient(c2, litArr, alphaScale) {
  let sum = 0, r = 0, g = 0, b = 0, n = 0;
  for (const L of litArr) {
    const w = Math.min(1, L.b) * (L.face === 'back' ? 1 : 0.4); // 옆면 빛은 간접광이라 기여 절반 이하
    sum += w;
    r += L.rgb[0]; g += L.rgb[1]; b += L.rgb[2]; n++;
  }
  if (!n || sum <= 0) return;
  // 트레이싱지 산란: 하나만 켜져도 글자 전체가 어느 정도는 빛난다 (위치에 따라 밝기 차이만)
  const a = Math.min(0.55, 0.16 + 0.07 * sum) * alphaScale;
  c2.fillStyle = `rgba(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)},${a})`;
  c2.fillRect(0, 0, c2.canvas.width, c2.canvas.height);
}

// LED 하나의 빛 번짐 — 뒷면 가운데쯤 달면 앞판 세로를 거의 다 비추고,
// 위·아래로 치우치면 반대쪽 절반이 어두워지는 정도로 넉넉하게 퍼진다.
function paintGlow(c2, L, d, depth, RA, alphaScale) {
  const a = Math.min(1, L.b) * alphaScale;
  const [r, g, b] = L.rgb;
  const back = L.face === 'back';
  let cx = Math.max(0, Math.min(c2.canvas.width, L.fx * RA));
  let cy = Math.max(0, Math.min(c2.canvas.height, L.fy * RA));
  const rad = (back ? Math.max(depth * 1.35, d.bh * 1.05) : d.bw * 0.35) * RA;
  const grad = c2.createRadialGradient(cx, cy, 1, cx, cy, rad);
  if (back) {
    grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},${a * 0.6})`);
    grad.addColorStop(0.82, `rgba(${r},${g},${b},${a * 0.22})`);
  } else { // 옆·위아래 면에서 스며드는 은은한 빛
    grad.addColorStop(0, `rgba(${r},${g},${b},${a * 0.55})`);
    grad.addColorStop(0.55, `rgba(${r},${g},${b},${a * 0.25})`);
  }
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  c2.fillStyle = grad;
  c2.fillRect(0, 0, c2.canvas.width, c2.canvas.height);
  if (back) {
    // 깊이가 5cm 정도라 트레이싱지가 있어도 LED 바로 앞은 위치 티가 난다 — 밝은 핫스팟
    const hot = c2.createRadialGradient(cx, cy, 0, cx, cy, Math.max(2, depth * 0.55 * RA));
    hot.addColorStop(0, `rgba(255,255,255,${a * 0.65})`);
    hot.addColorStop(1, 'rgba(255,255,255,0)');
    c2.fillStyle = hot;
    c2.fillRect(0, 0, c2.canvas.width, c2.canvas.height);
  }
}

export function drawPreview() {
  if (!cv) return;
  const dark = DARK;
  const real = getLighting();
  const light = pvOn ? real : { lit: [], tested: real.tested, dims: real.dims }; // 스위치 끄면 소등
  const mask = getDesignMask();
  const d = light.dims;
  const depth = (d.sw || 4.5) + config.thickness;

  if (pv3d) { // 입체로 보기 — 끌어서 돌리면 완성품을 사방에서 볼 수 있다
    const W = cv.width = 760, H = cv.height = 420;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pvOn && light.lit.length ? '#101420' : '#eef1f6';
    ctx.fillRect(0, 0, W, H);
    const fc = document.createElement('canvas');
    fc.width = Math.round(d.bw * 24); fc.height = Math.round(d.bh * 24);
    drawLitFront(fc.getContext('2d'), 0, 0, fc.width, fc.height, light);
    drawAssembled(ctx, 10, 10, W - 20, H - 20, {
      lit: pvOn && light.lit.length > 0, walls: 'solid', frontCanvas: fc,
      yaw: pvYaw, pitch: pvPitch,
      label: '완성 모습 — 끌어서 돌려 보세요',
    });
    updatePreviewButtons();
    $('preview-msg').innerHTML = '';
    return;
  }
  updatePreviewButtons();

  const W = cv.width = 760, H = cv.height = 420;
  // 판 크기(A4·정사각형 등)에 맞춰 화면에 들어오게
  const S = Math.min(22, (W - 80) / d.bw, (H * 0.72 - 24) / d.bh);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const bgTop = [lerp(215, 12, dark), lerp(221, 14, dark), lerp(228, 20, dark)];
  const bgBot = [lerp(190, 6, dark), lerp(196, 8, dark), lerp(205, 12, dark)];
  g.addColorStop(0, `rgb(${bgTop.join(',')})`);
  g.addColorStop(1, `rgb(${bgBot.join(',')})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgb(${lerp(160, 18, dark)},${lerp(150, 15, dark)},${lerp(135, 12, dark)})`;
  ctx.fillRect(0, H * 0.72, W, H * 0.28);

  const pw = d.bw * S, ph = d.bh * S;
  const px = (W - pw) / 2, py = H * 0.72 - ph;

  ctx.save();
  ctx.fillStyle = `rgb(${lerp(70, 25, dark)},${lerp(72, 26, dark)},${lerp(78, 30, dark)})`;
  ctx.fillRect(px - 6, py + 4, pw + 12, ph + 2);
  ctx.fillStyle = `rgb(${lerp(38, 10, dark)},${lerp(39, 11, dark)},${lerp(44, 14, dark)})`;
  ctx.fillRect(px, py, pw, ph);

  if (light.lit.length && mask.anyCut) {
    const RA = 6;
    const lw = Math.round(d.bw * RA), lh = Math.round(d.bh * RA);
    const lc = document.createElement('canvas');
    lc.width = lw; lc.height = lh;
    const c2 = lc.getContext('2d');
    c2.globalCompositeOperation = 'lighter';
    const boost = 0.45 + 0.55 * dark;
    paintAmbient(c2, light.lit, boost);
    for (const L of light.lit) paintGlow(c2, L, d, depth, RA, boost);
    // 트레이싱지 확산: 저해상도 → 확대가 자연스러운 번짐이 된다
    c2.globalCompositeOperation = 'destination-in';
    c2.drawImage(mask.canvas, 0, 0, lw, lh);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(lc, px, py, pw, ph);
    ctx.globalCompositeOperation = 'source-over';
  } else if (mask.anyCut) {
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mask.canvas, px, py, pw, ph);
    ctx.restore();
  }
  ctx.restore();

  const msgs = [];
  if (!mask.anyCut) msgs.push('도안 탭에서 글자를 만들면 여기에서 완성 모습을 볼 수 있습니다.');
  if (!light.tested) msgs.push('회로 탭에서 점등 테스트를 하면 실제 밝기가 반영됩니다.');
  $('preview-msg').innerHTML = msgs.map(m => `<p class="hint">${m}</p>`).join('');
}

// 조립 순서 탭 등에서 재사용: 지정한 사각형에 "불 켜진 앞면"만 그린다
export function drawLitFront(tctx, px, py, pw, ph, litOverride) {
  const light = litOverride || getLighting();
  const mask = getDesignMask();
  const d = light.dims || getLighting().dims;
  const depth = (d.sw || 4.5) + config.thickness;
  tctx.fillStyle = '#101116';
  tctx.fillRect(px, py, pw, ph);
  if (!mask.anyCut) return;
  if (!light.lit.length) {
    tctx.save(); tctx.globalAlpha = 0.15;
    tctx.drawImage(mask.canvas, px, py, pw, ph);
    tctx.restore();
    return;
  }
  const RA = 6;
  const lw = Math.round(d.bw * RA), lh = Math.round(d.bh * RA);
  const lc = document.createElement('canvas');
  lc.width = lw; lc.height = lh;
  const c2 = lc.getContext('2d');
  c2.globalCompositeOperation = 'lighter';
  paintAmbient(c2, light.lit, 1);
  for (const L of light.lit) paintGlow(c2, L, d, depth, RA, 1);
  c2.globalCompositeOperation = 'destination-in';
  c2.drawImage(mask.canvas, 0, 0, lw, lh);
  tctx.imageSmoothingEnabled = true;
  tctx.globalCompositeOperation = 'screen';
  tctx.drawImage(lc, px, py, pw, ph);
  tctx.globalCompositeOperation = 'source-over';
}

function updatePreviewButtons() {
  $('pv-switch').textContent = pvOn ? '스위치 끄기' : '스위치 켜기';
  $('pv-3d').textContent = pv3d ? '정면 보기' : '입체로 보기';
}

export function initPreview() {
  cv = $('preview-canvas');
  ctx = cv.getContext('2d');
  document.addEventListener('work-loaded', drawPreview);

  $('pv-switch').addEventListener('click', () => { pvOn = !pvOn; drawPreview(); });
  $('pv-3d').addEventListener('click', () => { pv3d = !pv3d; drawPreview(); });

  // 입체 보기에서 끌면 회전 (마우스·터치 공통)
  let rot = null;
  cv.addEventListener('pointerdown', e => {
    if (!pv3d) return;
    rot = { x: e.clientX, y: e.clientY, yaw: pvYaw, pitch: pvPitch };
  });
  cv.addEventListener('pointermove', e => {
    if (!rot || !pv3d || !(e.buttons & 1 || e.pointerType === 'touch')) return;
    pvYaw = rot.yaw + (e.clientX - rot.x) * 0.008;
    pvPitch = Math.max(-1.3, Math.min(1.4, rot.pitch + (e.clientY - rot.y) * 0.008));
    drawPreview();
  });
  const end = () => { rot = null; };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
}
