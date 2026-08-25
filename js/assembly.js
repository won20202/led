// 조립 순서 탭: 작업 카드를 배열하고 실행해 본다. 순서가 틀리면 그 결과가 나온다. 정답은 알려주지 않는다.
import { work, addLog, touch, readOnly } from './state.js';
import { renderLogList } from './case3d.js';

const $ = id => document.getElementById(id);

const CARDS = [
  { id: 'cut', label: '우드락 재단' },
  { id: 'dryfit', label: '가조립 (붙이지 않고 치수 확인)' },
  { id: 'front', label: '앞면 가공 (글자 오리기·속지 붙이기)' },
  { id: 'wire', label: '회로 연결 (테이프·LED 붙이기)' },
  { id: 'lightcheck', label: '점등 확인' },
  { id: 'glue5', label: '5면 조립 (뒷면 제외)' },
  { id: 'battery', label: '전지 연결 (홀더 부착)' },
  { id: 'finalcheck', label: '최종 점등 확인' },
  { id: 'backclose', label: '뒷면 조립' },
];
// 화면에는 항상 같은 뒤섞인 순서로 보여준다 (정답 순서 노출 방지)
const SHUFFLED = ['front', 'battery', 'cut', 'backclose', 'lightcheck', 'glue5', 'dryfit', 'finalcheck', 'wire'];

function card(id) { return CARDS.find(c => c.id === id); }

function runSequence(seq) {
  // 각 단계를 순서대로 실행. 실패하면 {step, msg}. 끝까지 가면 {ok, notes}
  const done = new Set();
  const notes = [];
  for (let i = 0; i < seq.length; i++) {
    const id = seq[i];
    switch (id) {
      case 'dryfit':
        if (!done.has('cut')) return { step: i, msg: '자르지 않은 우드락 판으로는 가조립을 해 볼 수 없습니다.' };
        break;
      case 'glue5':
        if (!done.has('cut')) return { step: i, msg: '아직 판을 재단하지 않아 붙일 조각이 없습니다.' };
        if (!done.has('front')) return { step: i, msg: '케이스를 세워 붙이고 나니, 평평하게 놓고 해야 할 앞면 칼질을 할 수가 없습니다.' };
        if (!done.has('wire')) return { step: i, msg: '케이스가 조립되어 버려 안쪽 면에 테이프를 반듯하게 붙일 공간이 없습니다.' };
        if (!done.has('dryfit')) notes.push('가조립을 건너뛰었네요. 치수가 틀렸다면 풀로 붙인 뒤에야 알게 됩니다.');
        break;
      case 'lightcheck':
        if (!done.has('wire')) return { step: i, msg: '회로가 아직 없는데 무엇을 점등해 볼까요?' };
        break;
      case 'battery':
        if (!done.has('wire')) return { step: i, msg: '전선을 연결할 회로가 아직 없습니다.' };
        break;
      case 'finalcheck':
        if (!done.has('battery')) return { step: i, msg: '전지가 연결되어 있지 않아 최종 점등을 확인할 수 없습니다.' };
        break;
      case 'backclose':
        if (!done.has('glue5')) return { step: i, msg: '옆면들이 세워져 있지 않은데 뒷면만 먼저 붙일 수 없습니다.' };
        if (!done.has('battery')) return { step: i, msg: '뒷면을 붙이고 나니 손이 들어가지 않아 전선을 연결할 수 없습니다.' };
        if (!done.has('finalcheck')) return { step: i, msg: '뒷면을 붙인 뒤에 불이 안 들어오면 다시 뜯어야 합니다. 무엇을 먼저 확인하면 좋을까요?' };
        break;
    }
    done.add(id);
  }
  return { ok: true, notes };
}

function render() {
  const seq = work.order;
  const pool = SHUFFLED.filter(id => !seq.includes(id));
  $('order-pool').innerHTML = pool.map(id =>
    `<button class="order-card" data-id="${id}">${card(id).label}</button>`).join('') ||
    '<p class="muted">모든 카드를 배치했습니다.</p>';
  $('order-seq').innerHTML = seq.length
    ? seq.map((id, i) => `<button class="order-card placed" data-i="${i}"><span class="num">${i + 1}</span> ${card(id).label} ✕</button>`).join('')
    : '<p class="muted">왼쪽 카드를 눌러 순서대로 배치하세요.</p>';
  $('order-pool').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    if (readOnly) return;
    work.order.push(b.dataset.id); touch(); render();
  }));
  $('order-seq').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    if (readOnly) return;
    work.order.splice(parseInt(b.dataset.i), 1); touch(); render();
  }));
  $('btn-order-run').disabled = seq.length !== CARDS.length;
}

let running = false;
function play() {
  if (running) return;
  running = true;
  const seq = work.order;
  const result = runSequence(seq);
  const out = $('order-result');
  out.innerHTML = '';
  let i = 0;
  const timer = setInterval(() => {
    if (i < seq.length && !(result.step !== undefined && i > result.step)) {
      const fail = result.step === i;
      out.innerHTML += `<div class="${fail ? 'order-fail' : 'order-step'}">${i + 1}. ${card(seq[i]).label} ${fail ? '→ 🛑' : '→ ✓'}</div>`;
      if (fail) {
        out.innerHTML += `<p class="warn">${result.msg}</p><p class="hint">카드를 다시 배열하고 실행해 보세요.</p>`;
        clearInterval(timer); running = false;
        addLog(`조립 순서 — ${i + 1}번째 단계에서 중단`); renderLogList();
        return;
      }
      i++;
    } else {
      clearInterval(timer); running = false;
      if (result.ok) {
        out.innerHTML += `<p class="ok">끝까지 진행되었습니다! 실제 제작도 이 순서대로 해 보세요.</p>`;
        result.notes.forEach(n => out.innerHTML += `<p class="hint">${n}</p>`);
        addLog('조립 순서 — 끝까지 진행됨 ✓'); renderLogList();
      }
    }
  }, 450);
}

export function initAssembly() {
  $('btn-order-run').addEventListener('click', play);
  $('btn-order-reset').addEventListener('click', () => {
    if (readOnly) return;
    work.order = []; touch(); $('order-result').innerHTML = ''; render();
  });
  document.addEventListener('work-loaded', render);
  render();
}
export function refreshAssembly() { render(); }
