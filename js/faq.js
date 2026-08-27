// 도움말: AI가 아니라 교사가 작성한 FAQ. 검색 + 탭별 필터. 못 찾은 검색어는 수집한다.
import { config, recordMiss } from './state.js';

const $ = id => document.getElementById(id);

function renderList(items, note) {
  const el = $('faq-list');
  if (!items.length) {
    el.innerHTML = `<p class="muted">${note || '검색 결과가 없습니다. 선생님께 직접 질문해 주세요. (질문은 기록되어 다음 FAQ에 추가됩니다)'}</p>`;
    return;
  }
  el.innerHTML = items.map((f, i) =>
    `<details class="faq-item"><summary>${f.q}</summary><p>${f.a}</p></details>`).join('');
}

function search(q) {
  q = q.trim();
  if (!q) { renderList(config.faq); return; }
  const words = q.toLowerCase().split(/\s+/);
  const hits = config.faq.filter(f => {
    const hay = (f.q + ' ' + (f.k || '') + ' ' + f.a).toLowerCase();
    return words.some(w => hay.includes(w));
  });
  if (!hits.length) recordMiss(q);
  renderList(hits);
}

// 재료·도구 카드 — 짧고 한눈에 들어오게 (특성 2~3개 + 팁 1개)
const MATERIALS = [
  { n: '우드락', c: '#f0e3c0', f: ['스티로폼을 얇게 눌러 만든 판 — 가볍고 부드러워요', '커터칼로 쉽게 잘리지만, 열과 힘에는 약해요'], t: '자를 대고 2~3번 나눠 그으면 단면이 깔끔!' },
  { n: 'LED (발광 다이오드)', c: '#fff3b0', f: ['전기를 빛으로 바꾸는 부품', '한쪽 방향으로만 전류가 흘러요 — 긴 다리가 (+), 짧은 다리가 (−)'], t: '다리를 "ㄴ"자로 벌려 눕히면 테이프에 잘 붙어요.' },
  { n: '전도성 테이프', c: '#d7dde6', f: ['은이 섞인 천 테이프 — 전기가 지나가는 길', '겹쳐 붙이면 이어지고, 끊어지면 전류도 멈춰요'], t: '(+)줄과 (−)줄이 서로 닿으면 합선! 거리를 두고 붙여요.' },
  { n: '트레이싱지', c: '#eef4f0', f: ['반투명 종이 — 빛을 부드럽게 퍼뜨려요(확산)', 'LED의 점 빛이 은은한 면 빛으로 바뀌어요'], t: '색 트레이싱지나 셀로판으로 바꾸면 색깔 빛!' },
  { n: '검은 도화지', c: '#c9cdd3', f: ['빛을 막아서 오려낸 글자만 빛나게 해요'], t: '칼질은 얕게 여러 번 — 종이가 밀리지 않아요.' },
  { n: '건전지 + 홀더', c: '#d9e6d5', f: ['AA 2개를 직렬로 = 3V', '(+)(−) 방향대로 끼워야 해요 — 거꾸로 끼우면 뜨거워져요!'], t: '홀더는 완성품이 잘 서도록 아래쪽에 붙여요.' },
  { n: '커터칼', c: '#f3d9d3', f: ['칼날은 조금만 빼고, 항상 몸 바깥쪽으로', '칼이 지나갈 자리에 손을 두지 않아요'], t: '커팅 매트 위에서만 사용!' },
  { n: '와이어 스트리퍼', c: '#dcd6ea', f: ['전선의 피복(껍질)만 벗겨 주는 도구'], t: '0.6 구멍에 전선을 넣고 1cm쯤 벗겨서 연결해요.' },
];

function renderMaterials() {
  $('faq-materials').innerHTML = MATERIALS.map(m => `
    <div class="mat-card">
      <div class="mat-name"><span class="mat-chip" style="background:${m.c}"></span>${m.n}</div>
      ${m.f.map(x => `<p>· ${x}</p>`).join('')}
      <p class="mat-tip">팁 — ${m.t}</p>
    </div>`).join('');
}

// 평가 기준(관리자가 편집한 배점표)을 표로 렌더링
function renderRubric() {
  const rub = config.rubric || [];
  const box = $('faq-rubric-box');
  if (!rub.length) { box.style.display = 'none'; return; }
  box.style.display = '';
  $('faq-rubric').innerHTML = rub.map(area => `
    <h4>${area.name}${area.levels[0] ? ` (${area.levels[0].p}점)` : ''}</h4>
    ${area.note ? `<p class="small muted">${area.note}</p>` : ''}
    <table class="rubric-table">
      ${area.levels.map(lv => `<tr><td>${lv.d}</td><td class="pts">${lv.p}점</td></tr>`).join('')}
    </table>`).join('');
}

export function openFaq(tab) {
  $('faq-modal').classList.remove('hidden');
  $('faq-search').value = '';
  renderRubric();
  renderMaterials();
  if (tab && tab !== 'all') {
    const hits = config.faq.filter(f => f.tab === tab || f.tab === 'all');
    renderList(hits);
  } else renderList(config.faq);
}

export function initFaq() {
  $('faq-search').addEventListener('input', e => search(e.target.value));
  $('faq-close').addEventListener('click', () => $('faq-modal').classList.add('hidden'));
  document.querySelectorAll('.faq-btn').forEach(b =>
    b.addEventListener('click', () => openFaq(b.dataset.faqtab)));
}
