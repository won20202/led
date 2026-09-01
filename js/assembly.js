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
  { id: 'battery', label: '건전지 홀더 부착·전지 연결' },
  { id: 'finalcheck', label: '최종 점등 확인' },
  { id: 'backclose', label: '뒷면 조립' },
];
const SHUFFLED = ['front', 'battery', 'cut', 'backclose', 'lightcheck', 'glue5', 'dryfit', 'finalcheck', 'wire'];

const TIPS = {
  cut: '우드락은 스티로폼을 눌러 만든 판이라 가볍고 부드러워 커터칼로 쉽게 잘려요. 자를 대고 한 번에 깊게 긋지 말고 2~3번 나눠 그으면 단면이 깔끔합니다. 칼날은 몸 바깥쪽으로, 꼭 커팅 매트 위에서!',
  dryfit: '풀로 붙이기 전에 맞춰만 보는 단계예요. 지금 치수가 틀린 걸 발견하면 우드락을 다시 자를 기회가 있어요.',
  front: '오려낸 안쪽 조각(ㅇ, ㅁ의 속)은 버리지 말고 모아 두세요. 트레이싱지를 붙인 뒤 제자리에 다시 붙이면 글자가 또렷해져요.',
  wire: 'LED 다리를 양옆으로 벌려 "ㄴ"자로 눕혀 평평하게 만들어야 전도성 테이프에 잘 붙어요. 긴 다리가 (+)극입니다 — 헷갈리면 긴 다리에 매직으로 표시해 두세요.',
  lightcheck: '전선 피복은 와이어 스트리퍼의 0.6 구멍에 넣고 1cm쯤 돌려 벗겨요. 손톱이나 이로 벗기면 다치거나 전선이 끊어질 수 있어요.',
  glue5: '양면테이프나 목공풀로 붙이고, 안쪽 모서리를 스카치테이프로 한 번 더 보강하면 케이스가 튼튼해져요.',
  battery: '건전지는 홀더 안의 +/− 그림 방향대로 끼우세요. 거꾸로 끼우면 회로가 뜨거워지고 타는 냄새가 날 수 있어요!',
  finalcheck: '뒷면을 붙이기 전 마지막 점검이에요. 지금이라면 아직 손을 넣어 안쪽을 고칠 수 있어요.',
  backclose: '학번과 이름을 쓰고, 제출 전에 완성품 사진을 찍어 두는 것도 잊지 마세요.',
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
  const w = Math.max(520, Math.min(1400, maxByH, (host ? host.clientWidth : 960) - 400));
  if (cv.width !== w) { cv.width = w; cv.height = Math.round(w * 0.6); }
  ctx.fillStyle = '#f4f6f9';
  ctx.fillRect(0, 0, cv.width, cv.height);
}
function caption(text) {
  ctx.fillStyle = '#4a5561'; ctx.font = '13px sans-serif';
  ctx.fillText(text, 14, 22);
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
  caption('건전지 홀더를 붙일 위치를 클릭하세요 (뒷면 바깥쪽)');
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
    // 정상 진행 단계
    $('order-tip').innerHTML = TIPS[id] ? `<p class="hint">${TIPS[id]}</p>` : '';
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
export function refreshAssembly() {
  if (!work.assembly) work.assembly = { holderPos: null };
  curStep = -1; placing = false;
  render();
  idleCanvas();
}
