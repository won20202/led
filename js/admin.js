// 관리자 모드: 로그인 화면의 [관리자] 버튼 또는 URL ?admin=1 → PIN 입력.
import { config, saveConfig, exportConfigCode, importConfigCode, getMisses, clearMisses,
         cloudList, cloudGet, cloudDelete, setReadOnlyWork, DEFAULT_CONFIG, DEFAULT_RUBRIC,
         sheetLogFor, sheetFlushNow } from './state.js';

const $ = id => document.getElementById(id);

const FIELDS = [
  ['thickness', '재료(우드락) 두께 (cm)', 'number'],
  ['targetW', '완성 목표 가로 (cm)', 'number'],
  ['targetH', '완성 목표 세로 (cm)', 'number'],
  ['targetD', '완성 목표 깊이 (cm)', 'number'],
  ['showTarget', '완성 목표 치수를 학생 화면에 표시', 'checkbox'],
  ['ledCount', 'LED 지급 개수', 'number'],
  ['allowResistor', '저항 부품 사용 (회로 탭에 저항 도구 표시)', 'checkbox'],
  ['resistorOhm', '저항값 (Ω)', 'number'],
  ['voltage', '전원 전압 (V)', 'number'],
  ['vf', 'LED 점등 문턱 전압 (V) — 직렬 소등 기준', 'number'],
  ['rint', '내부 저항 (Ω) — 밝기 계산용', 'number'],
  ['imax', '전지 최대 공급 전류 (mA)', 'number'],
  ['frontW', '앞면 종이 가로 (cm)', 'number'],
  ['frontH', '앞면 종이 세로 (cm)', 'number'],
  ['areaW', '도안 작업 영역 가로 (cm)', 'number'],
  ['areaH', '도안 작업 영역 세로 (cm)', 'number'],
  ['strokeMin', '획 굵기 하한 (cm)', 'number'],
  ['letterMin', '글자 세로 최소 (cm)', 'number'],
  ['letterMax', '글자 세로 최대 (cm)', 'number'],
  ['pictoMin', '그림 크기 최소 (cm)', 'number'],
  ['pictoMax', '그림 크기 최대 (cm)', 'number'],
  ['boardW', '우드락 판 가로 (cm)', 'number'],
  ['boardH', '우드락 판 세로 (cm)', 'number'],
  ['showMeasure', '실측값 표시', 'checkbox'],
  ['askPredict', '예측 먼저 (조립·점등 전 예측 입력)', 'checkbox'],
  ['questionFeedback', '질문형 피드백 표시', 'checkbox'],
  ['classCode', '반 입장 코드 (비우면 검사 안 함)', 'text'],
  ['adminPin', '관리자 PIN', 'text'],
  ['supabaseUrl', 'Supabase URL (비우면 이 기기에만 저장)', 'text'],
  ['supabaseKey', 'Supabase anon key', 'text'],
  ['sheetUrl', 'Google Sheet 기록 URL (Apps Script 배포 주소, README 참고)', 'text'],
];

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

function renderSettings() {
  $('adm-settings').innerHTML = FIELDS.map(([k, label, type]) => {
    if (type === 'checkbox')
      return `<label class="adm-row"><span>${label}</span><input type="checkbox" data-k="${k}" ${config[k] ? 'checked' : ''}></label>`;
    return `<label class="adm-row"><span>${label}</span><input type="${type}" data-k="${k}" value="${esc(config[k] ?? '')}" step="any"></label>`;
  }).join('') +
  `<label class="adm-row"><span>초과 시 동작</span>
     <select data-k="overLimit">
       <option value="warn" ${config.overLimit === 'warn' ? 'selected' : ''}>경고만 (권장)</option>
       <option value="block" ${config.overLimit === 'block' ? 'selected' : ''}>차단</option>
     </select></label>`;
}

function collectSettings() {
  $('adm-settings').querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') config[k] = el.checked;
    else if (el.type === 'number') config[k] = parseFloat(el.value) || DEFAULT_CONFIG[k];
    else config[k] = el.value;
  });
  saveConfig();
}

// ---- 평가 기준(배점표) 편집 ----
function renderRubric() {
  const rub = config.rubric && config.rubric.length ? config.rubric : JSON.parse(JSON.stringify(DEFAULT_RUBRIC));
  config.rubric = rub;
  $('adm-rubric').innerHTML = rub.map((area, ai) => `
    <div class="adm-area" data-ai="${ai}">
      <div class="adm-area-head">
        <input class="ra-name" value="${esc(area.name)}" placeholder="평가 영역 이름 (예: 설계 포트폴리오)">
        <button class="ra-del">영역 삭제</button>
      </div>
      <textarea class="ra-note" rows="2" placeholder="평가 준거 조건 설명 (선택)">${esc(area.note || '')}</textarea>
      <table class="adm-table">
        <tr><th>평가 준거 (수준별)</th><th style="width:70px">배점</th><th style="width:46px"></th></tr>
        ${area.levels.map((lv, li) => `
          <tr data-li="${li}">
            <td><input class="ra-desc" value="${esc(lv.d)}" placeholder="예: 4가지 조건을 모두 충족함"></td>
            <td><input class="ra-pts" type="number" step="1" value="${lv.p}"></td>
            <td><button class="ra-lvdel">✕</button></td>
          </tr>`).join('')}
      </table>
      <button class="ra-lvadd small-btn">+ 수준 추가</button>
    </div>`).join('');

  const total = rub.reduce((a, r) => a + (r.levels[0] ? r.levels[0].p : 0), 0);
  $('adm-rubric').innerHTML += `<p class="muted small">영역 최고점 합계: ${total}점</p>`;

  $('adm-rubric').querySelectorAll('.adm-area').forEach(div => {
    const ai = +div.dataset.ai;
    div.querySelector('.ra-del').addEventListener('click', () => {
      collectRubric(); config.rubric.splice(ai, 1); renderRubric();
    });
    div.querySelector('.ra-lvadd').addEventListener('click', () => {
      collectRubric(); config.rubric[ai].levels.push({ d: '', p: 0 }); renderRubric();
    });
    div.querySelectorAll('.ra-lvdel').forEach((b, li) =>
      b.addEventListener('click', () => {
        collectRubric(); config.rubric[ai].levels.splice(li, 1); renderRubric();
      }));
  });
}
function collectRubric() {
  const out = [];
  $('adm-rubric').querySelectorAll('.adm-area').forEach(div => {
    const levels = [];
    div.querySelectorAll('tr[data-li]').forEach(tr => {
      const d = tr.querySelector('.ra-desc').value.trim();
      const p = parseFloat(tr.querySelector('.ra-pts').value) || 0;
      if (d) levels.push({ d, p });
    });
    const name = div.querySelector('.ra-name').value.trim();
    if (name) out.push({ name, note: div.querySelector('.ra-note').value.trim(), levels });
  });
  config.rubric = out;
}

// ---- FAQ 편집 ----
function renderFaqEditor() {
  $('adm-faq').innerHTML = config.faq.map((f, i) =>
    `<div class="adm-faq-item" data-i="${i}">
       <input class="fq" value="${esc(f.q)}" placeholder="질문">
       <input class="fk" value="${esc(f.k || '')}" placeholder="검색 키워드 (띄어쓰기로 구분)">
       <textarea class="fa" rows="2" placeholder="답변">${esc(f.a)}</textarea>
       <div><select class="ft">
         ${['all', 'case', 'circuit', 'design', 'order', 'preview'].map(t =>
           `<option value="${t}" ${f.tab === t ? 'selected' : ''}>${{ all: '공통', case: '케이스', circuit: '회로', design: '도안', order: '조립순서', preview: '미리보기' }[t]}</option>`).join('')}
       </select> <button class="fdel">삭제</button></div>
     </div>`).join('');
  $('adm-faq').querySelectorAll('.fdel').forEach((b, i) =>
    b.addEventListener('click', () => { config.faq.splice(i, 1); saveConfig(); renderFaqEditor(); }));
}
function collectFaq() {
  const items = [];
  $('adm-faq').querySelectorAll('.adm-faq-item').forEach(div => {
    const q = div.querySelector('.fq').value.trim();
    const a = div.querySelector('.fa').value.trim();
    if (q && a) items.push({ q, k: div.querySelector('.fk').value.trim(), a, tab: div.querySelector('.ft').value });
  });
  config.faq = items;
  saveConfig();
}

function renderMisses() {
  const m = getMisses();
  $('adm-miss').innerHTML = m.length
    ? m.slice(-40).reverse().map(x => `<div>· ${esc(x.q)}</div>`).join('')
    : '<p class="muted">학생이 검색했지만 답을 못 찾은 검색어가 여기에 쌓입니다.</p>';
}

function localWorks() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const m = k && k.match(/^lps_work_(\d+)-(\d+)$/);
    if (m) {
      try {
        const w = JSON.parse(localStorage.getItem(k));
        out.push({ ban: +m[1], num: +m[2], updated: w.updatedAt, w });
      } catch (e) { /* ignore */ }
    }
  }
  return out.sort((a, b) => a.ban - b.ban || a.num - b.num);
}

let cloudRows = [];
async function renderWorks() {
  const el = $('adm-works');
  if (!el) return;
  let html = '<h4>이 기기에 저장된 작업</h4>';
  const loc = localWorks();
  html += loc.length
    ? loc.map(r => `<div class="adm-work-row">${r.ban}반 ${r.num}번 <span class="muted">${r.updated ? new Date(r.updated).toLocaleString('ko-KR') : ''}</span>
        <button class="w-open" data-id="local:${r.ban}-${r.num}">보기</button>
        <button class="w-note" data-bn="${r.ban}:${r.num}">메모</button>
        <button class="w-del" data-id="local:${r.ban}-${r.num}">삭제</button></div>`).join('')
    : '<p class="muted">없음</p>';
  html += '<h4>서버(Supabase)에 모인 작업</h4>';
  if (!config.supabaseUrl) {
    html += '<p class="muted">Supabase가 설정되지 않았습니다. 설정하면 모든 학생의 작업이 여기에 모이고 20초마다 자동 갱신됩니다.</p>';
    el.innerHTML = html; bindWorkButtons(); return;
  }
  try {
    cloudRows = await cloudList();
    // 반별로 묶어서 보여준다 (10개 반 × 30명 규모)
    const byBan = {};
    cloudRows.forEach(r => { (byBan[r.ban] = byBan[r.ban] || []).push(r); });
    html += cloudRows.length
      ? Object.keys(byBan).sort((a, b) => a - b).map(ban =>
          `<details class="adm-ban"><summary>${ban}반 (${byBan[ban].length}명)</summary>
           <table class="adm-table"><tr><th>학번</th><th>마지막 저장</th><th style="width:150px"></th></tr>` +
          byBan[ban].map(r => `<tr><td>${r.ban}반 ${r.num}번</td><td>${new Date(r.updated_at).toLocaleString('ko-KR')}</td>
            <td><button class="w-open" data-id="cloud:${r.id}">보기</button>
                <button class="w-note" data-bn="${r.ban}:${r.num}">메모</button>
                <button class="w-del" data-id="cloud:${r.id}">삭제</button></td></tr>`).join('') +
          '</table></details>').join('')
      : '<p class="muted">아직 저장된 학생 작업이 없습니다.</p>';
  } catch (e) {
    html += `<p class="warn">서버에서 불러오지 못했습니다: ${esc(e.message)}</p>`;
  }
  el.innerHTML = html;
  bindWorkButtons();
}
function bindWorkButtons() {
  $('adm-works').querySelectorAll('.w-open').forEach(b => b.addEventListener('click', async () => {
    const kind = b.dataset.id.split(':')[0];
    const id = b.dataset.id.split(':').slice(1).join(':');
    let w = null;
    if (kind === 'local') {
      try { w = JSON.parse(localStorage.getItem('lps_work_' + id)); } catch (e) { /* ignore */ }
    } else {
      b.textContent = '…';
      try { w = await cloudGet(id); } catch (e) { alert('불러오기 실패: ' + e.message); }
      b.textContent = '보기';
    }
    if (!w) { alert('데이터가 없습니다.'); return; }
    openReadOnly(w, id, kind === 'cloud' ? id : null);
  }));
  // 교사 메모 → 구글 시트에 기록
  $('adm-works').querySelectorAll('.w-note').forEach(b => b.addEventListener('click', () => {
    if (!config.sheetUrl) { alert('먼저 수업 설정에 Google Sheet 기록 URL을 넣어 주세요.'); return; }
    const [ban, num] = b.dataset.bn.split(':').map(Number);
    const text = prompt(`${ban}반 ${num}번 학생에 대한 메모 (시트에 기록됩니다)`);
    if (text && text.trim()) {
      sheetLogFor(ban, num, '교사 메모', text.trim());
      sheetFlushNow();
      alert('기록했습니다.');
    }
  }));
  // 학생 작업 초기화 (잘못 로그인한 학번 정리, 재작업 등)
  $('adm-works').querySelectorAll('.w-del').forEach(b => b.addEventListener('click', async () => {
    const kind = b.dataset.id.split(':')[0];
    const id = b.dataset.id.split(':').slice(1).join(':');
    if (!confirm(`${id} 작업을 삭제(초기화)할까요? 되돌릴 수 없습니다.`)) return;
    if (kind === 'local') localStorage.removeItem('lps_work_' + id);
    else {
      try { await cloudDelete(id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
    }
    renderWorks();
  }));
}

// 학생 목록 CSV (엑셀용 BOM 포함)
async function exportCsv() {
  const rows = [['저장 위치', '반', '번호', '학번', '마지막 저장']];
  localWorks().forEach(r => rows.push(['이 기기', r.ban, r.num, `2-${r.ban}-${r.num}`,
    r.updated ? new Date(r.updated).toLocaleString('ko-KR') : '']));
  if (config.supabaseUrl) {
    try {
      (await cloudList()).forEach(r => rows.push(['서버', r.ban, r.num, r.id,
        new Date(r.updated_at).toLocaleString('ko-KR')]));
    } catch (e) { /* 서버 실패해도 로컬만 내보냄 */ }
  }
  const csv = '﻿' + rows.map(r => r.join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = '학생작업목록.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

let liveTimer = null, worksTimer = null;
function openReadOnly(w, label, cloudId) {
  setReadOnlyWork(w, label);
  $('admin-modal').classList.add('hidden');
  $('login-modal').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('readonly-banner').classList.remove('hidden');
  $('readonly-banner').textContent = `관리자 열람 중 — ${label}` +
    (cloudId ? ' (실시간 갱신)' : '') + ' · 편집 불가 · 나가려면 새로고침';
  $('student-badge').textContent = label;
  document.dispatchEvent(new CustomEvent('work-loaded'));
  window.dispatchEvent(new Event('resize'));
  // 서버 작업이면 주기적으로 다시 받아와 실시간처럼 보여준다
  clearInterval(liveTimer);
  if (cloudId) {
    liveTimer = setInterval(async () => {
      try {
        const w2 = await cloudGet(cloudId);
        if (w2) {
          setReadOnlyWork(w2, label);
          document.dispatchEvent(new CustomEvent('work-loaded'));
        }
      } catch (e) { /* 다음 주기에 재시도 */ }
    }, 15000);
  }
}

export function openAdmin() {
  $('admin-modal').classList.remove('hidden');
  $('adm-pin-gate').classList.remove('hidden');
  $('adm-content').classList.add('hidden');
  $('adm-pin').value = '';
  $('adm-pin-err').textContent = '';
  $('adm-pin').focus();
}

export function initAdmin() {
  $('adm-pin-btn').addEventListener('click', () => {
    if ($('adm-pin').value !== config.adminPin) { $('adm-pin-err').textContent = 'PIN이 다릅니다.'; return; }
    $('adm-pin-gate').classList.add('hidden');
    $('adm-content').classList.remove('hidden');
    renderSettings(); renderRubric(); renderFaqEditor(); renderMisses(); renderWorks();
    clearInterval(worksTimer);
    worksTimer = setInterval(() => {
      if (!$('admin-modal').classList.contains('hidden')) renderWorks();
    }, 20000);
  });
  $('adm-pin').addEventListener('keydown', e => { if (e.key === 'Enter') $('adm-pin-btn').click(); });

  $('adm-save').addEventListener('click', () => {
    collectSettings(); collectRubric(); collectFaq();
    saveConfig();
    alert('저장되었습니다. 학생 화면은 새로고침하면 반영됩니다.');
  });
  $('adm-rubric-add').addEventListener('click', () => {
    collectRubric();
    config.rubric.push({ name: '', note: '', levels: [{ d: '', p: 0 }] });
    renderRubric();
  });
  $('adm-faq-add').addEventListener('click', () => {
    collectFaq();
    config.faq.push({ q: '', k: '', a: '', tab: 'all' });
    renderFaqEditor();
  });
  $('adm-export').addEventListener('click', () => {
    collectSettings(); collectRubric(); collectFaq();
    $('adm-code').value = exportConfigCode();
    $('adm-code').select();
    if (navigator.clipboard) navigator.clipboard.writeText($('adm-code').value).catch(() => {});
  });
  $('adm-import').addEventListener('click', () => {
    try {
      importConfigCode($('adm-code').value);
      alert('설정을 불러왔습니다.');
      renderSettings(); renderRubric(); renderFaqEditor();
    } catch (e) { alert('설정 코드가 올바르지 않습니다.'); }
  });
  $('adm-miss-clear').addEventListener('click', () => { clearMisses(); renderMisses(); });
  $('adm-close').addEventListener('click', () => {
    $('admin-modal').classList.add('hidden');
    clearInterval(worksTimer);
  });
  $('adm-works-reload').addEventListener('click', renderWorks);
  $('adm-csv').addEventListener('click', exportCsv);
  $('adm-sheet-test').addEventListener('click', () => {
    collectSettings();
    if (!config.sheetUrl) { alert('수업 설정에 Google Sheet 기록 URL을 먼저 넣고 [설정 저장]을 눌러 주세요.'); return; }
    sheetLogFor(0, 0, '테스트', '관리자 모드에서 보낸 테스트 기록입니다');
    sheetFlushNow();
    alert('테스트 기록을 보냈습니다. 잠시 후 구글 시트에 "0반" 탭이 생겼는지 확인하세요.');
  });
  $('adm-wipe-local').addEventListener('click', () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('lps_work_')) keys.push(k);
    }
    if (!keys.length) { alert('이 기기에 저장된 학생 작업이 없습니다.'); return; }
    if (!confirm(`이 기기에 저장된 학생 작업 ${keys.length}건을 모두 지울까요?\n(서버에 저장된 작업은 지워지지 않습니다. 학기 말·기기 정리용)`)) return;
    keys.forEach(k => localStorage.removeItem(k));
    renderWorks();
  });

  const params = new URLSearchParams(location.search);
  if (params.get('admin') === '1') openAdmin();
}
