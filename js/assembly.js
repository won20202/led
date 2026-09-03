// 조립 순서 탭: 카드를 배열하고, 배열한 카드를 "눌러서" 그 단계의 모습을 본다.
// 순서가 잘못되면 그 단계에서 무슨 일이 생기는지 보여주고, 그 뒤 단계는 볼 수 없다.
// 건전지 홀더를 어디에 붙일지도 여기서 정한다. 정답 순서는 알려주지 않는다.
import { config, work, addLog, touch, readOnly, sheetLog } from './state.js';
import { renderLogList } from './case3d.js';
import { drawAssembled, getLighting } from './circuit.js';
import { drawLitFront } from './preview.js';
import { getDesignMask } from './design.js';

const $ = id => document.getElementById(id);

const CARDS = [
  { id: 'cut', label: '우드락 재단' },
  { id: 'dryfit', label: '가조립 (붙이지 않고 치수 확인)' },
  { id: 'front', label: '앞면 가공 (글자 오리기·속지 붙이기)' },
  { id: 'wire', label: '회로 연결 (테이프·LED 붙이기)' },
  { id: 'lightcheck', label: '점등 확인' },
  { id: 'glue5', label: '5면 조립 (뒷면 제외)' },
  { id: 'battery', label: '건전지 홀더 부착·전선 연결' },
  { id: 'finalcheck', label: '최종 점등 확인' },
  { id: 'backclose', label: '뒷면 조립' },
];
const SHUFFLED = ['front', 'battery', 'cut', 'backclose', 'lightcheck', 'glue5', 'dryfit', 'finalcheck', 'wire'];

const TIPS = {
  cut: '우드락은 두께가 있어서 한 번에 꾹 눌러 자르면 단면이 뜯어져 지저분해져요. ' +
    '① 자를 꽉 눌러 고정하고, 칼은 눕히지 말고 세워서 ② 첫 번째는 힘을 빼고 가볍게 그어 길을 내고 ③ 같은 자리를 2~3번 나눠 그어 끝까지 자르세요. ' +
    '잘 안 들면 칼날이 무뎌진 거예요 — 선생님께 말씀드려 새 날로 바꾸세요.',
  dryfit: '풀로 붙이기 전에 맞춰만 보는 단계예요. 지금 치수가 틀린 걸 발견하면 우드락을 다시 자를 기회가 있어요.',
  front: '오려낸 안쪽 조각(ㅇ, ㅁ의 속)은 버리지 말고 모아 두세요. 트레이싱지를 붙인 뒤 제자리에 다시 붙이면 글자가 또렷해져요.',
  wire: '먼저 <b>긴 다리(+극)에 매직으로 색칠해 표시</b>하세요 — 다리를 벌리고 나면 어느 쪽이 길었는지 알 수 없어요! 그 다음 두 다리를 양옆으로 <b>180도로 활짝 펼쳐</b> 평평하게 눕혀야 전도성 테이프 위에 넓게 닿아 잘 붙습니다.',
  lightcheck: '전지를 잠시 대어 확인만 해요. 안 켜지는 LED가 있으면 긴 다리(+)가 (+)줄에 있는지, 다리가 테이프에 잘 눌려 있는지 확인하세요.',
  glue5: '양면테이프로 붙여요. 이형지(흰 종이)를 떼기 전에 먼저 맞대 보고 위치를 확인하세요 — 한 번 붙으면 떼어낼 때 우드락이 뜯어져요. 붙인 뒤 안쪽 모서리를 스카치테이프로 한 번 더 보강하면 케이스가 튼튼해져요.',
  battery: '<b>전선 피복 벗기기 (와이어 스트리퍼)</b><br>' +
    '① 전선 끝에서 손가락 한 마디(약 1cm)쯤 되는 지점을 스트리퍼 구멍에 물립니다. 구멍은 전선 굵기와 비슷해 보이는 것 중 살짝 커 보이는 구멍부터 시도하세요.<br>' +
    '② 손잡이를 꽉 쥔 채, 전선 잡은 손과 스트리퍼를 서로 반대쪽으로 당깁니다.<br>' +
    '③ 피복이 안 벗겨지고 미끄러지기만 하면 구멍이 큰 거예요 → 한 단계 작은 구멍으로. 구리 가닥이 끊기거나 전선이 뚝 끊어지면 구멍이 작은 거예요 → 한 단계 큰 구멍으로. 딱 맞는 구멍은 살짝만 당겨도 피복만 스르륵 벗겨집니다.<br>' +
    '④ 벗긴 자리에 끊어진 구리 가닥이 보이면 그 부분을 잘라내고 다시 벗기세요.<br>' +
    '⑤ 드러난 구리 가닥들을 손끝으로 비벼 꼬아 한 가닥처럼 만드세요 — 가닥이 삐져나와 옆 줄에 닿으면 합선이 돼요.',
  battery2: '<b>송곳으로 구멍 뚫어 전선 넣기</b><br>' +
    '① 구멍 위치 정하기: 홀더를 붙일 자리 바로 옆, 그리고 안쪽의 전도성 테이프 줄과 만나는 지점에 뚫어야 전선이 짧아도 닿아요. 빨간 전선용·검정 전선용 구멍 2개를 뚫는데, 두 구멍은 손가락 두 개 폭쯤 떨어뜨리세요 — 안에서 두 전선의 구리가 서로 닿으면 합선이에요.<br>' +
    '② 뚫는 법: 우드락 아래에 커팅 매트(또는 두꺼운 골판지)를 받치고, 송곳을 수직으로 세워 누르면서 천천히 돌려 뚫습니다.<br>' +
    '③ 구멍 크기: 전선이 살짝 빡빡하게 들어갈 정도면 충분해요. 너무 크게 뚫으면 전선이 헐렁거리고 그 틈으로 빛이 새요.<br>' +
    '④ 피복 벗긴 전선 끝을 바깥에서 안쪽으로 밀어 넣고, 안쪽에서 드러난 구리 부분을 해당 줄 테이프 위에 평평하게 눕힌 뒤, 그 위에 전도성 테이프 한 조각을 덧붙여 꾹 눌러 고정하세요. 빨간 전선은 (+)줄, 검정 전선은 (−)줄에!<br>' +
    '⑤ 홀더는 전선을 다 연결한 뒤 양면테이프로 뒷면 바깥에 붙여요. 이때 <b>스위치와 전지 뚜껑이 보이는 면이 바깥</b>을 향해야 해요 — 스위치 면을 우드락에 붙여 버리면 켤 수도, 전지를 갈 수도 없어요! 전지가 든 홀더는 무게가 있으니 어디에 붙여야 플래카드가 안 넘어질지도 생각해 보세요.',
  finalcheck: '뒷면을 붙이기 전 마지막 점검이에요. 지금이라면 아직 손을 넣어 안쪽을 고칠 수 있어요.',
  backclose: '학번과 이름을 쓰고, 제출 전에 완성품 사진을 찍어 두는 것도 잊지 마세요.',
};

// 단계별 안전 경고 — 크고 눈에 띄게 표시된다
const SAFETY = {
  cut: '⚠️ 커터칼 조심! 칼날은 항상 몸 바깥쪽으로, 자를 꼭 대고, 커팅 매트 위에서. 칼을 놓을 때는 날을 집어넣으세요. ⚠️ 우드락 아래에는 커팅 매트만! 설계 포트폴리오나 유인물을 깔고 자르면 종이까지 같이 잘려요.',
  front: '⚠️ 커터칼 정밀 작업! 종이를 돌려 가며 자르고, 칼이 나아가는 방향에 다른 손을 두지 마세요.',
  wire: '⚠️ LED 다리와 전선 끝은 뾰족해요 — 손바닥으로 쓸어 누르지 말고 손끝으로 다루세요.',
  battery: '⚠️ 송곳 조심! 뚫는 방향 반대편에 절대 손을 두지 마세요. ⚠️ 건전지 방향(+/−)을 꼭 확인 — 거꾸로 끼우거나 (+)(−)가 직접 만나면 뜨거워지고 불이 날 수 있어요!',
  lightcheck: '⚠️ 회로가 뜨겁거나 타는 냄새가 나면 바로 전지를 빼세요 — 어딘가 합선된 거예요.',
};

function card(id) { return CARDS.find(c => c.id === id); }
function dims() {
  const p = work.caseTab.pieces;
  const n = v => { const x = parseFloat(v); return isFinite(x) && x > 0 ? x : null; };
  return { bw: n(p.back.w) || 25, bh: n(p.back.h) || 10, sw: n(p.side.w) || 4.5, sh: n(p.side.h) || 10, tw: n(p.topbot.w) || 24, td: n(p.topbot.h) || 4.5 };
}

// 순서 검증: 처음으로 문제가 생기는 단계와 이유
function runSequence(seq) {
  const done = new Set();
  const notes = [];
  for (let i = 0; i < seq.length; i++) {
    const id = seq[i];
    switch (id) {
      case 'dryfit':
        if (!done.has('cut')) return { step: i, msg: '자르지 않은 우드락 판으로는 가조립을 해 볼 수 없습니다.', notes };
        break;
      case 'glue5':
        if (!done.has('cut')) return { step: i, msg: '아직 판을 재단하지 않아 붙일 조각이 없습니다.', notes };
        if (!done.has('front')) return { step: i, msg: '케이스를 세워 붙이고 나니, 평평하게 놓고 해야 할 앞면 칼질을 할 수가 없습니다.', notes };
        if (!done.has('wire')) return { step: i, msg: '케이스가 조립되어 버려 안쪽 면에 테이프를 반듯하게 붙일 공간이 없습니다.', notes };
        if (!done.has('dryfit')) notes.push('가조립을 건너뛰었네요. 치수가 틀렸다면 풀로 붙인 뒤에야 알게 됩니다.');
        break;
      case 'lightcheck':
        if (!done.has('wire')) return { step: i, msg: '회로가 아직 없는데 무엇을 점등해 볼까요?', notes };
        break;
      case 'battery':
        if (!done.has('wire')) return { step: i, msg: '전선을 연결할 회로가 아직 없습니다.', notes };
        break;
      case 'finalcheck':
        if (!done.has('battery')) return { step: i, msg: '전지가 연결되어 있지 않아 최종 점등을 확인할 수 없습니다.', notes };
        break;
      case 'backclose':
        if (!done.has('glue5')) return { step: i, msg: '옆면들이 세워져 있지 않은데 뒷면만 먼저 붙일 수 없습니다.', notes };
        if (!done.has('battery')) return { step: i, msg: '뒷면을 붙이고 나니 손이 들어가지 않아 전선을 연결할 수 없습니다.', notes };
        if (!done.has('finalcheck')) return { step: i, msg: '뒷면을 붙인 뒤에 불이 안 들어오면 다시 뜯어야 합니다. 무엇을 먼저 확인하면 좋을까요?', notes };
        break;
    }
    done.add(id);
  }
  return { ok: true, notes };
}

// ---------- 장면 그리기 ----------
let cv, ctx;
let curStep = -1;
let placing = false;
let lastFinalKey = '';

function clearCanvas() {
  // 시뮬레이션 화면이 가용 폭을 꽉 채우도록 자동 확대
  // 기기 화면(폭·높이)에 맞춰 최대한 크게 — 카드 목록(왼쪽 340px)을 뺀 나머지를 쓴다
  const host = cv.closest('.order-center') || cv.parentElement;
  const maxByH = Math.round(((window.innerHeight || 800) - 260) / 0.6);
  const w = Math.max(520, Math.min(1400, maxByH, (host ? host.clientWidth : 960) - 370));
  if (cv.width !== w) { cv.width = w; cv.height = Math.round(w * 0.6); }
  ctx.fillStyle = '#f4f6f9';
  ctx.fillRect(0, 0, cv.width, cv.height);
}
function caption(text) {
  // 캔버스 크기에 맞춰 캡션도 커진다 (노트북·큰 모니터에서 잘 보이게)
  const fs = Math.max(13, Math.round(cv.width * 0.017));
  ctx.fillStyle = '#4a5561'; ctx.font = `${fs}px sans-serif`;
  ctx.fillText(text, 14, fs + 10);
}

function sceneCut() {
  clearCanvas(); caption('우드락을 도면대로 재단합니다');
  const d = dims(), S = Math.min(14, (cv.width - 60) / (d.bw + d.sw * 2 + 3));
  const rect = (x, y, w, h, label) => {
    ctx.fillStyle = '#f7f3e8'; ctx.strokeStyle = '#a9946a';
    ctx.fillRect(x, y, w * S, h * S); ctx.strokeRect(x, y, w * S, h * S);
    ctx.fillStyle = '#7b8794'; ctx.font = '11px sans-serif';
    ctx.fillText(label, x + 4, y + 14);
  };
  rect(20, 45, d.bw, d.bh, `뒷면 ${d.bw}×${d.bh}`);
  rect(20, 55 + d.bh * S, d.tw, d.td, `위 ${d.tw}×${d.td}`);
  rect(20, 65 + (d.bh + d.td) * S, d.tw, d.td, `아래 ${d.tw}×${d.td}`);
  rect(30 + d.bw * S, 45, d.sw, d.sh, `옆 ${d.sw}×${d.sh}`);
  rect(40 + (d.bw + d.sw) * S, 45, d.sw, d.sh, `옆 ${d.sw}×${d.sh}`);
}
function sceneFront() {
  clearCanvas(); caption('앞면 검은 종이를 도안대로 오리고 트레이싱지를 붙입니다');
  const d = dims();
  const pw = Math.min(cv.width - 60, d.bw * 16), ph = pw * d.bh / d.bw;
  const px = (cv.width - pw) / 2, py = (cv.height - ph) / 2 + 10;
  ctx.fillStyle = '#17181c'; ctx.fillRect(px, py, pw, ph);
  const mask = getDesignMask();
  if (mask.anyCut) {
    ctx.save(); ctx.globalAlpha = 0.55;
    ctx.drawImage(mask.canvas, px, py, pw, ph);
    ctx.restore();
  } else {
    ctx.fillStyle = '#9aa3ad'; ctx.font = '12px sans-serif';
    ctx.fillText('(도안 탭에서 만든 글자가 여기 표시됩니다)', px + 20, py + ph / 2);
  }
}
function sceneCase(opts) {
  clearCanvas(); caption(opts.caption);
  drawAssembled(ctx, 10, 26, cv.width - 20, cv.height - 36, opts);
}
function scenePlace() {
  clearCanvas();
  caption('건전지 홀더를 붙일 위치를 클릭하세요 (뒷면 바깥쪽) — 이 근처에 송곳 구멍을 뚫어 전선을 안으로 넣어요');
  const d = dims();
  const S = Math.min((cv.width - 80) / d.bw, (cv.height - 90) / d.bh);
  const px = (cv.width - d.bw * S) / 2, py = 40;
  ctx.fillStyle = '#eceff3'; ctx.strokeStyle = '#b9c2cd';
  ctx.fillRect(px, py, d.bw * S, d.bh * S); ctx.strokeRect(px, py, d.bw * S, d.bh * S);
  ctx.fillStyle = '#98a1ab'; ctx.font = '11px sans-serif';
  ctx.fillText('뒷면 바깥쪽 (위)', px + 6, py + 14);
  ctx.fillText('바닥 쪽 (아래)', px + 6, py + d.bh * S - 6);
  const hp = work.assembly.holderPos;
  if (hp) {
    const hw = 5.5 * S, hh = 2.5 * S;
    const x = px + hp.x * S, y = py + hp.y * S;
    ctx.fillStyle = '#3b4552'; ctx.strokeStyle = '#20272f';
    ctx.beginPath(); ctx.roundRect(x - hw / 2, y - hh / 2, hw, hh, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#cfd6de'; ctx.font = `${Math.max(9, S * 0.8)}px sans-serif`;
    ctx.fillText('홀더', x - S, y + S * 0.3);
  }
  cv._place = { px, py, S, d };
  placing = true;
}
function sceneFinal() {
  clearCanvas();
  const d = dims();
  const hp = work.assembly.holderPos;
  const stable = hp && hp.y > d.bh * 0.55 && hp.x > 2.5 && hp.x < d.bw - 2.5;
  const light = getLighting();
  const pw = Math.min(cv.width - 120, d.bw * 15), ph = pw * d.bh / d.bw;
  const floorY = cv.height - 40;
  ctx.fillStyle = '#dcd2c2'; ctx.fillRect(0, floorY, cv.width, 40);
  ctx.save();
  if (stable) {
    caption('완성품을 세워 봅니다');
    drawLitFront(ctx, (cv.width - pw) / 2, floorY - ph, pw, ph, light);
  } else {
    caption('완성품을 세워 보니…');
    ctx.translate(cv.width / 2, floorY);
    ctx.rotate(-1.25);
    drawLitFront(ctx, -pw / 2, -ph + 8, pw, ph, light);
  }
  ctx.restore();
  return stable;
}

// ---------- 화면 구성 ----------
function validity() { return runSequence(work.order); }

function render() {
  const seq = work.order;
  const v = validity();
  const pool = SHUFFLED.filter(id => !seq.includes(id));
  $('order-pool').innerHTML = pool.map(id =>
    `<button class="order-card" data-id="${id}">${card(id).label}</button>`).join('') ||
    '<p class="muted">모든 카드를 배치했습니다. 카드를 눌러 각 단계를 확인해 보세요.</p>';
  $('order-seq').innerHTML = seq.length
    ? seq.map((id, i) => {
        const state = v.step === i ? 'fail' : (v.step !== undefined && i > v.step) ? 'blocked' : 'okstep';
        return `<div class="order-row">
          <button class="order-card placed ${state} ${curStep === i ? 'current' : ''}" data-i="${i}">
            <span class="num">${i + 1}</span> ${card(id).label}</button>
          <button class="order-x" data-i="${i}" title="빼기">✕</button></div>`;
      }).join('')
    : '<p class="muted">왼쪽 카드를 눌러 순서대로 배치하세요.<br>배치한 카드를 누르면 그 단계의 모습이 보입니다.</p>';
  $('order-pool').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    if (readOnly) return;
    work.order.push(b.dataset.id); touch();
    selectStep(work.order.length - 1);
  }));
  $('order-seq').querySelectorAll('.order-card').forEach(b => b.addEventListener('click', () =>
    selectStep(parseInt(b.dataset.i))));
  $('order-seq').querySelectorAll('.order-x').forEach(b => b.addEventListener('click', () => {
    if (readOnly) return;
    work.order.splice(parseInt(b.dataset.i), 1); touch();
    curStep = -1; placing = false;
    $('order-result').innerHTML = ''; $('order-tip').innerHTML = '';
    render(); idleCanvas();
  }));
  $('btn-order-prev').disabled = curStep <= 0;
  $('btn-order-next').disabled = curStep < 0 || curStep >= seq.length - 1;
}

function idleCanvas() {
  clearCanvas();
  caption('배치한 카드를 누르면 그 단계에서 무슨 일이 일어나는지 보입니다');
}

function selectStep(i) {
  const seq = work.order;
  if (i < 0 || i >= seq.length) return;
  curStep = i; placing = false;
  const v = validity();
  const id = seq[i];
  const out = $('order-result');
  out.innerHTML = '';
  $('order-tip').innerHTML = '';

  if (v.step !== undefined && i > v.step) {
    clearCanvas();
    caption('이 단계까지 갈 수 없습니다');
    out.innerHTML = `<p class="hint">${v.step + 1}번째 단계(${card(seq[v.step]).label})에서 막혀 그 다음으로 진행할 수 없어요. 그 카드를 눌러 이유를 확인해 보세요.</p>`;
  } else if (v.step === i) {
    clearCanvas();
    caption(`${i + 1}. ${card(id).label} — 여기서 문제가 생깁니다`);
    ctx.fillStyle = '#c0392b'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText('이 순서로는 진행할 수 없어요', 20, 60);
    out.innerHTML = `<p class="warn">${v.msg}</p><p class="hint">카드를 다시 배열해 보세요.</p>`;
  } else {
    // 정상 진행 단계 — 안전 경고(크게) + 팁 + (홀더 단계) 방법 애니메이션
    stopAnim();
    let tipHtml = SAFETY[id] ? `<p class="safety">${SAFETY[id]}</p>` : '';
    if (TIPS[id]) tipHtml += `<p class="hint">${TIPS[id]}</p>`;
    if (id === 'battery') {
      tipHtml += `<p class="hint">${TIPS.battery2}</p>
        <button class="anim-btn" data-anim="strip">▶ 피복 벗기는 법 (움직임으로 보기)</button>
        <button class="anim-btn" data-anim="awl">▶ 구멍 뚫고 전선 잇는 법</button>
        <div id="order-anim"></div>`;
    }
    $('order-tip').innerHTML = tipHtml;
    $('order-tip').querySelectorAll('.anim-btn').forEach(b =>
      b.addEventListener('click', () => playAnim(b.dataset.anim)));
    switch (id) {
      case 'cut': sceneCut(); break;
      case 'dryfit': sceneCase({ caption: '붙이지 않고 맞춰 보며 치수를 확인합니다', walls: 'dashed', circuit: false }); break;
      case 'front': sceneFront(); break;
      case 'wire': sceneCase({ caption: '펼친 판의 안쪽 면에 테이프와 LED를 붙입니다', walls: 'ghost', lit: false }); break;
      case 'lightcheck': sceneCase({ caption: '전지를 잠시 대어 점등을 확인합니다', walls: 'ghost', lit: true }); break;
      case 'glue5': sceneCase({ caption: '뒷면을 뺀 다섯 면을 조립합니다', walls: 'solid', lit: false }); break;
      case 'battery': scenePlace(); break;
      case 'finalcheck': sceneCase({ caption: '뒷면을 붙이기 전 마지막 점등 확인', walls: 'solid', lit: true }); break;
      case 'backclose': {
        if (seq.length === CARDS.length && v.ok) {
          const stable = sceneFinal();
          const key = JSON.stringify([seq, work.assembly.holderPos, stable]);
          if (key !== lastFinalKey) {
            lastFinalKey = key;
            if (stable) {
              out.innerHTML = `<p class="ok">끝까지 진행되었습니다! 실제 제작도 이 순서대로 해 보세요.</p>`;
              addLog('조립 순서 — 끝까지 진행됨, 완성품이 잘 섬');
            } else {
              out.innerHTML = `<p class="hint">플래카드가 넘어졌어요. 홀더가 받침 역할을 하려면 어디에 붙이는 게 좋을까요? (건전지 홀더 카드를 눌러 위치를 바꿔 보세요)</p>`;
              addLog('조립 순서 — 완성했지만 넘어짐 (홀더 위치)');
            }
            renderLogList();
          } else {
            out.innerHTML = stable
              ? `<p class="ok">끝까지 진행되었습니다!</p>`
              : `<p class="hint">플래카드가 넘어졌어요. 건전지 홀더 카드를 눌러 위치를 바꿔 보세요.</p>`;
          }
          v.notes.forEach(n => out.innerHTML += `<p class="hint">${n}</p>`);
        } else {
          sceneCase({ caption: '뒷면을 붙여 케이스를 닫습니다', walls: 'solid', lit: false });
        }
        break;
      }
    }
    if (id === 'glue5') v.notes.forEach(n => out.innerHTML += `<p class="hint">${n}</p>`);
    if (id === 'battery' && !work.assembly.holderPos)
      out.innerHTML = '<p class="muted">화면의 뒷면 그림에서 홀더를 붙일 곳을 클릭하세요.</p>';
  }
  render();
}

export function initAssembly() {
  cv = $('order-canvas');
  ctx = cv.getContext('2d');
  idleCanvas();

  cv.addEventListener('pointerdown', e => {
    if (!placing || readOnly) return;
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) * (cv.width / r.width);
    const y = (e.clientY - r.top) * (cv.height / r.height);
    const pl = cv._place;
    if (!pl) return;
    const cx = (x - pl.px) / pl.S, cy = (y - pl.py) / pl.S;
    if (cx < 0 || cx > pl.d.bw || cy < 0 || cy > pl.d.bh) return;
    work.assembly.holderPos = { x: Math.round(cx * 2) / 2, y: Math.round(cy * 2) / 2 };
    touch();
    sheetLog('조립 — 홀더 위치', `x=${work.assembly.holderPos.x}, y=${work.assembly.holderPos.y}`);
    scenePlace();
    $('order-result').innerHTML = '<p class="muted">위치를 정했습니다. 다른 곳을 클릭해 바꿀 수도 있어요. 다음 단계로 넘어가 보세요.</p>';
  });

  $('btn-order-prev').addEventListener('click', () => selectStep(curStep - 1));
  $('btn-order-next').addEventListener('click', () => selectStep(curStep + 1));
  $('btn-order-reset').addEventListener('click', () => {
    if (readOnly) return;
    work.order = []; touch();
    curStep = -1; placing = false;
    $('order-result').innerHTML = ''; $('order-tip').innerHTML = '';
    idleCanvas();
    render();
  });

  document.addEventListener('work-loaded', refreshAssembly);
  window.addEventListener('resize', () => {
    if ($('tab-order').classList.contains('active')) { if (curStep >= 0) selectStep(curStep); else idleCanvas(); }
  });
  render();
}
// ---- 방법 애니메이션 (피복 벗기기 / 송곳·전선 연결) ----
let animId = null, animKind = null;
function stopAnim() {
  if (animId) cancelAnimationFrame(animId);
  animId = null; animKind = null;
  const box = $('order-anim');
  if (box) box.innerHTML = '';
}
function playAnim(kind) {
  if (animKind === kind) { stopAnim(); return; } // 같은 버튼 다시 누르면 닫기
  stopAnim();
  animKind = kind;
  const box = $('order-anim');
  if (!box) return;
  box.innerHTML = '<canvas id="anim-cv" width="560" height="250"></canvas>';
  const c = document.getElementById('anim-cv').getContext('2d');
  const draw = kind === 'strip' ? drawStripAnim : drawAwlAnim;
  draw(c, 0); // 누르자마자 첫 장면부터
  const t0 = performance.now();
  const loop = now => {
    const t = ((now - t0) / 1000) % 7.5; // 7.5초 루프
    draw(c, t);
    animId = requestAnimationFrame(loop);
  };
  animId = requestAnimationFrame(loop);
}
function animCaption(c, text) {
  c.fillStyle = '#2b3540'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center';
  c.fillText(text, 280, 236);
}
// 피복 벗기기: 물리기 → 당겨서 벗기기 → 구리 꼬기
function drawStripAnim(c, t) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, 560, 250); c.fillStyle = '#fbfcfe'; c.fillRect(0, 0, 560, 250);
  const y = 110;
  const phase = t < 2.5 ? 0 : t < 5 ? 1 : 2;
  const p = phase === 0 ? t / 2.5 : phase === 1 ? (t - 2.5) / 2.5 : (t - 5) / 2.5;
  // 전선: 피복(빨강)은 x 40~370, 벗겨질 조각은 370~460
  c.lineCap = 'round';
  c.strokeStyle = '#d63c34'; c.lineWidth = 12;
  c.beginPath(); c.moveTo(40, y); c.lineTo(370, y); c.stroke();
  const slide = phase === 1 ? p * 120 : phase === 2 ? 120 : 0; // 벗겨진 조각 이동
  if (phase < 2) { // 피복 조각
    c.beginPath(); c.moveTo(370 + slide, y); c.lineTo(460 + slide, y); c.stroke();
  }
  if (phase >= 1) { // 드러난 구리 가닥
    c.strokeStyle = '#b9946a'; c.lineWidth = 2;
    const tw = phase === 2 ? p : 0; // 꼬임 정도
    for (let k = -1; k <= 1; k++) {
      c.beginPath();
      for (let x = 370; x <= 370 + Math.min(90, slide ? 90 : 0) + (phase === 2 ? 90 : 0); x += 4) {
        const spread = 5 * (1 - tw);
        c.lineTo(x, y + k * spread * Math.sin((x - 370) / 12 + k));
      }
      c.stroke();
    }
  }
  // 스트리퍼 (노란 손잡이 + 검정 턱)
  const jawX = 370, open = phase === 0 ? (1 - p) * 26 : 2;
  c.save();
  c.translate(jawX + (phase === 1 ? slide : 0), 0);
  c.strokeStyle = '#222'; c.lineWidth = 9; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, y - 8 - open); c.lineTo(34, y - 30 - open); c.stroke();
  c.beginPath(); c.moveTo(0, y + 8 + open); c.lineTo(34, y + 30 + open); c.stroke();
  c.strokeStyle = '#f2c214'; c.lineWidth = 13;
  c.beginPath(); c.moveTo(34, y - 30 - open); c.lineTo(88, y - 66 - open); c.stroke();
  c.beginPath(); c.moveTo(34, y + 30 + open); c.lineTo(88, y + 66 + open); c.stroke();
  c.restore();
  if (phase === 2) { // 손끝 비비기
    const fy = y + Math.sin(p * Math.PI * 6) * 5;
    c.fillStyle = '#f3c9a5';
    c.beginPath(); c.arc(430, fy - 12, 12, 0, 7); c.fill();
    c.beginPath(); c.arc(430, fy + 12, 12, 0, 7); c.fill();
  }
  animCaption(c, phase === 0 ? '① 끝에서 1cm쯤을 알맞은 구멍에 물려요 (살짝 커 보이는 구멍부터)'
    : phase === 1 ? '② 꽉 쥔 채 서로 반대쪽으로 당기면 피복만 쏙!'
    : '③ 드러난 구리 가닥을 손끝으로 비벼 꼬아 한 가닥으로');
}
// 송곳 구멍 → 전선 통과 → 테이프로 고정 (옆에서 본 단면)
function drawAwlAnim(c, t) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, 560, 250); c.fillStyle = '#fbfcfe'; c.fillRect(0, 0, 560, 250);
  const phase = t < 2.5 ? 0 : t < 5 ? 1 : 2;
  const p = phase === 0 ? t / 2.5 : phase === 1 ? (t - 2.5) / 2.5 : (t - 5) / 2.5;
  // 매트(아래) + 우드락 판(단면) — 위 = 바깥, 아래 = 케이스 안쪽
  c.fillStyle = '#3f7d4e'; c.fillRect(60, 190, 440, 16);
  c.fillStyle = '#f3efe4'; c.strokeStyle = '#c9c2ae';
  c.fillRect(80, 120, 400, 34); c.strokeRect(80, 120, 400, 34);
  c.fillStyle = '#98a1ab'; c.font = '12px sans-serif'; c.textAlign = 'left';
  c.fillText('바깥쪽', 84, 114); c.fillText('케이스 안쪽', 84, 178);
  // 안쪽 전도성 테이프 줄
  c.fillStyle = '#c3c9d2'; c.fillRect(200, 154, 160, 7);
  c.fillStyle = '#d64545'; c.font = 'bold 12px sans-serif'; c.fillText('(+)줄', 366, 164);
  const hx = 280; // 구멍 x
  if (phase === 0) { // 송곳이 돌면서 관통
    const depth = p * 60;
    c.save();
    c.translate(hx, 120 - 70 + depth * 0.6);
    c.rotate(Math.sin(t * 12) * 0.06); // 돌리는 느낌
    c.fillStyle = '#e85b9a'; c.beginPath(); c.roundRect(-9, -60, 18, 46, 8); c.fill();
    c.strokeStyle = '#9aa2ac'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(0, -14); c.lineTo(0, 56); c.stroke();
    c.restore();
    if (p > 0.5) { c.strokeStyle = '#8a6d3f'; c.lineWidth = 3; c.beginPath(); c.moveTo(hx, 120); c.lineTo(hx, 154); c.stroke(); }
  } else {
    // 구멍
    c.fillStyle = '#d8d2c2'; c.fillRect(hx - 3, 120, 6, 34);
  }
  if (phase === 1) { // 전선이 구멍으로 들어감
    const reach = p;
    c.strokeStyle = '#d63c34'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(hx - 120, 60); c.quadraticCurveTo(hx - 20, 60, hx, Math.min(120 + reach * 60, 152)); c.stroke();
    if (reach > 0.6) { // 안쪽으로 나온 구리
      c.strokeStyle = '#b9946a'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(hx, 152); c.lineTo(hx + (reach - 0.6) * 90, 157); c.stroke();
    }
  }
  if (phase === 2) { // 구리를 줄 위에 눕히고 테이프로 덮기
    c.strokeStyle = '#d63c34'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(hx - 120, 60); c.quadraticCurveTo(hx - 20, 60, hx, 152); c.stroke();
    c.strokeStyle = '#b9946a'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(hx, 152); c.lineTo(hx + 55, 157); c.stroke();
    // 덮는 테이프 조각이 내려와 꾹
    const drop = Math.min(1, p * 1.6);
    c.globalAlpha = 0.9;
    c.fillStyle = '#aeb6c2';
    c.fillRect(hx - 5, 130 + drop * 22, 70, 8);
    c.globalAlpha = 1;
  }
  animCaption(c, phase === 0 ? '① 매트를 받치고 송곳을 돌리며 뚫어요 — 반대편에 손 금지!'
    : phase === 1 ? '② 피복 벗긴 전선을 바깥에서 안쪽으로 통과'
    : '③ 구리를 (+)줄 위에 눕히고 전도성 테이프로 덮어 꾹 (검정 전선은 (−)줄에)');
}

export function refreshAssembly() {
  if (!work.assembly) work.assembly = { holderPos: null };
  curStep = -1; placing = false;
  render();
  idleCanvas();
}
