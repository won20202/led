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
