// 완성 미리보기: 케이스 + 회로 + 도안을 합친 모습. 어두운 방 슬라이더로 주변 밝기 조절.
import { config, work } from './state.js';
import { getLighting } from './circuit.js';
import { getDesignMask } from './design.js';

const $ = id => document.getElementById(id);

let cv, ctx;

function lerp(a, b, t) { return a + (b - a) * t; }

export function drawPreview() {
  if (!cv) return;
  const dark = parseFloat($('dark-slider').value) / 100; // 0=낮 1=밤
  const light = getLighting();
  const mask = getDesignMask();
  const d = light.dims;
  const depth = (d.sw || 4.5) + config.thickness;

  const S = 22;
  const W = cv.width = 760, H = cv.height = 420;
  // 방 배경
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const bgTop = [lerp(215, 12, dark), lerp(221, 14, dark), lerp(228, 20, dark)];
  const bgBot = [lerp(190, 6, dark), lerp(196, 8, dark), lerp(205, 12, dark)];
  g.addColorStop(0, `rgb(${bgTop.join(',')})`);
  g.addColorStop(1, `rgb(${bgBot.join(',')})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 책상면
  ctx.fillStyle = `rgb(${lerp(160, 18, dark)},${lerp(150, 15, dark)},${lerp(135, 12, dark)})`;
  ctx.fillRect(0, H * 0.72, W, H * 0.28);

  const pw = d.bw * S, ph = d.bh * S;
  const px = (W - pw) / 2, py = H * 0.72 - ph;

  ctx.save();
  if (!light.holderStable && light.hasHolder) {
    // 넘어진 모습
    ctx.translate(px + pw / 2, H * 0.72);
    ctx.rotate(-1.35);
    ctx.translate(-(px + pw / 2), -H * 0.72 + 6);
  }

  // 케이스 옆면 살짝 (입체감)
  ctx.fillStyle = `rgb(${lerp(70, 25, dark)},${lerp(72, 26, dark)},${lerp(78, 30, dark)})`;
  ctx.fillRect(px - 6, py + 4, pw + 12, ph + 2);
  // 앞면 검은 종이
  ctx.fillStyle = `rgb(${lerp(38, 10, dark)},${lerp(39, 11, dark)},${lerp(44, 14, dark)})`;
  ctx.fillRect(px, py, pw, ph);

  // 빛 지도 (저해상도에 그려 확대 — 성능·번짐 효과)
  if (light.lit.length && mask.anyCut) {
    const RA = 6;
    const lw = Math.round(d.bw * RA), lh = Math.round(d.bh * RA);
    const lc = document.createElement('canvas');
    lc.width = lw; lc.height = lh;
    const c2 = lc.getContext('2d');
    c2.globalCompositeOperation = 'lighter';
    const boost = 0.45 + 0.55 * dark;
    for (const L of light.lit) {
      const a = Math.min(1, L.b) * boost;
      const [r, gg, b] = L.rgb;
      let cx = L.fx * RA, cy = L.fy * RA, rad;
      if (L.face === 'back') {
        rad = depth * 1.35 * RA; // 깊이가 얕으면 점이 도드라진다
      } else {
        rad = d.bw * 0.35 * RA;  // 옆·위아래에서 스며드는 은은한 빛
        cx = Math.max(0, Math.min(lw, cx)); cy = Math.max(0, Math.min(lh, cy));
      }
      const grad = c2.createRadialGradient(cx, cy, 1, cx, cy, rad);
      grad.addColorStop(0, `rgba(${r},${gg},${b},${L.face === 'back' ? a : a * 0.55})`);
      grad.addColorStop(0.55, `rgba(${r},${gg},${b},${a * 0.25})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      c2.fillStyle = grad;
      c2.fillRect(0, 0, lw, lh);
    }
    // 트레이싱지 확산 효과: 저해상도 → 확대가 자연스러운 블러가 된다
    // 도안 마스크로 잘라내기
    c2.globalCompositeOperation = 'destination-in';
    c2.drawImage(mask.canvas, 0, 0, lw, lh);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(lc, px, py, pw, ph);
    ctx.globalCompositeOperation = 'source-over';
  } else if (mask.anyCut) {
    // 불이 없을 때: 오려낸 자리만 흐릿하게 (트레이싱지 색)
    ctx.save();
    ctx.globalAlpha = lerp(0.5, 0.08, dark);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mask.canvas, px, py, pw, ph);
    ctx.restore();
  }
  ctx.restore();

  // 안내 문구
  const msgs = [];
  if (!mask.anyCut) msgs.push('도안 탭에서 글자를 만들면 여기에서 완성 모습을 볼 수 있습니다.');
  if (!light.tested) msgs.push('회로 탭에서 점등 테스트를 하면 실제 밝기가 반영됩니다.');
  if (light.hasHolder && !light.holderStable) msgs.push('플래카드가 넘어졌습니다… 홀더를 어디에 붙이면 잘 설 수 있을까요?');
  $('preview-msg').innerHTML = msgs.map(m => `<p class="hint">${m}</p>`).join('');
}

export function initPreview() {
  cv = $('preview-canvas');
  ctx = cv.getContext('2d');
  $('dark-slider').addEventListener('input', drawPreview);
  document.addEventListener('work-loaded', drawPreview);
}
