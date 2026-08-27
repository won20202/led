// 관리자 모드: 로그인 화면의 [관리자] 버튼 또는 URL ?admin=1 → PIN 입력.
import { config, saveConfig, exportConfigCode, importConfigCode, getMisses, clearMisses,
         cloudList, cloudListBan, cloudGet, cloudDelete, setReadOnlyWork, DEFAULT_CONFIG, DEFAULT_RUBRIC,
         sheetLogFor, sheetFlushNow, todayCode, classSessionCode, studentDayCode } from './state.js';

const $ = id => document.getElementById(id);

const FIELDS = [
  ['grade', '학년', 'number'],
  ['banCount', '반 수', 'number'],
  ['numCount', '한 반의 최대 번호', 'number'],
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
  ['classCode', '고정 코드 (입장 방식이 "고정 코드"일 때)', 'text'],
  ['adminPin', '관리자 PIN', 'text'],
  ['supabaseUrl', 'Supabase URL (비우면 이 기기에만 저장)', 'text'],
  ['supabaseKey', 'Supabase anon key', 'text'],
  ['sheetUrl', 'Google Sheet 기록 URL (Apps Script 배포 주소, README 참고)', 'text'],
];

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

function renderSettings() {
  const codeBanner =
    config.entryMode === 'daily'
      ? `<p class="measure">오늘의 입장 코드: <b style="font-size:20px">${todayCode()}</b> — 자정에 자동으로 바뀝니다. (모든 기기에서 같은 코드가 계산되므로 재배포 불필요)</p>`
      : config.entryMode === 'session'
        ? `<p class="measure">입장 방식이 "수업 코드"입니다 — 아래 [입장 코드] 섹션에서 반·교시를 골라 코드를 만드세요.</p>`
        : '';
  $('adm-settings').innerHTML = codeBanner +
  `<label class="adm-row"><span>입장 방식</span>
     <select data-k="entryMode">
       <option value="none" ${config.entryMode === 'none' ? 'selected' : ''}>코드 없음</option>
       <option value="fixed" ${config.entryMode === 'fixed' ? 'selected' : ''}>고정 코드</option>
       <option value="daily" ${config.entryMode === 'daily' ? 'selected' : ''}>매일 바뀌는 코드</option>
       <option value="session" ${config.entryMode === 'session' ? 'selected' : ''}>수업 코드 (반·교시 지정, 권장)</option>
     </select></label>` +
  FIELDS.map(([k, label, type]) => {
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
  collectPeriods();
  saveConfig();
}

// ---- 입장 코드 (수업 코드·미실시자·시간표) ----
function periodRow(p, i) {
  return `<div class="tool-row ec-p-row"><span>${i + 1}교시</span>
    <input type="time" class="ec-ps" value="${p.start}"> ~ <input type="time" class="ec-pe" value="${p.end}">
    <button class="ec-p-del small-btn">✕</button></div>`;
}
function collectPeriods() {
  const rows = [...document.querySelectorAll('#adm-entry .ec-p-row')];
  if (rows.length)
    config.periods = rows.map(r => ({
      start: r.querySelector('.ec-ps').value || '09:00',
      end: r.querySelector('.ec-pe').value || '09:45',
    }));
}
function renderEntry() {
  const per = config.periods || [];
  const banOpts = Array.from({ length: config.banCount }, (_, i) => `<option value="${i + 1}">${i + 1}반</option>`).join('');
  const perOpts = per.map((p, i) => `<option value="${i}">${i + 1}교시 (${p.start}~${p.end})</option>`).join('');
  $('adm-entry').innerHTML = `
    <h4>수업 코드 만들기</h4>
    <p class="muted small">반과 교시를 고르면 오늘의 수업 코드가 나옵니다. 그 반 학생만, 그 교시 시간(앞뒤 10분 여유)에만 입장할 수 있고 날마다 바뀝니다. 수업이 변경되면 여기서 다시 골라 새 코드를 칠판에 적어 주면 됩니다.</p>
    <div class="tool-row">
      <select id="ec-ban">${banOpts}</select>
      <select id="ec-p1">${perOpts}</select> ~ <select id="ec-p2">${perOpts}</select>
    </div>
    <p class="measure">수업 코드: <b id="ec-code" style="font-size:22px"></b> <span class="muted small">(오늘 · 선택한 반 · 선택한 교시에만 유효)</span></p>
    <h4>미실시자 개인 코드 (결석·보충용)</h4>
    <p class="muted small">학번을 "반-번호" 형식으로 쉼표로 나눠 적으세요. 그 학생만 쓸 수 있는 오늘 하루짜리 코드가 나옵니다 (교시 무관 — 보충 시간에 사용).</p>
    <div class="tool-row"><input id="ec-stu" placeholder="예: 3-21, 5-7" style="flex:1"><button id="ec-stu-btn">코드 만들기</button></div>
    <div id="ec-stu-list"></div>
    <h4>교시 시간표</h4>
    <div id="ec-periods">${per.map(periodRow).join('')}</div>
    <button id="ec-p-add" class="small-btn">+ 교시 추가</button>
    <p class="muted small">시간표를 바꿨으면 [설정 저장]을 누르고, 설정 코드로 다른 기기에도 배포하세요.</p>`;
  const upd = () => {
    let p1 = +$('ec-p1').value, p2 = +$('ec-p2').value;
    if (p2 < p1) { p2 = p1; $('ec-p2').value = String(p1); }
    $('ec-code').textContent = classSessionCode(+$('ec-ban').value, p1, p2);
  };
  ['ec-ban', 'ec-p1', 'ec-p2'].forEach(id => $(id).addEventListener('change', upd));
  upd();
  $('ec-stu-btn').addEventListener('click', () => {
    const list = $('ec-stu').value.split(',').map(s => s.trim()).filter(Boolean);
    $('ec-stu-list').innerHTML = list.map(s => {
      const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) return `<div class="warn">"${esc(s)}"은(는) 형식이 아니에요 (예: 3-21)</div>`;
      return `<div class="adm-work-row">${m[1]}반 ${m[2]}번 → <b>${studentDayCode(+m[1], +m[2])}</b> <span class="muted small">오늘만 유효</span></div>`;
    }).join('') || '<p class="muted">학번을 입력하세요.</p>';
  });
  $('ec-p-add').addEventListener('click', () => {
    collectPeriods();
    config.periods.push({ start: '16:00', end: '16:45' });
    renderEntry();
  });
  $('adm-entry').querySelectorAll('.ec-p-del').forEach((b, i) => b.addEventListener('click', () => {
    collectPeriods(); config.periods.splice(i, 1); renderEntry();
  }));
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
    const openBans = new Set([...document.querySelectorAll('.adm-ban[open]')].map(d => d.dataset.ban));
    const byBan = {};
    cloudRows.forEach(r => { (byBan[r.ban] = byBan[r.ban] || []).push(r); });
    html += cloudRows.length
      ? Object.keys(byBan).sort((a, b) => a - b).map(ban =>
          `<details class="adm-ban" data-ban="${ban}" ${openBans.has(String(ban)) ? 'open' : ''}>
             <summary>${ban}반 실시간 보드 (${byBan[ban].length}명)</summary>
             <div class="board-grid" data-ban="${ban}"><p class="muted">불러오는 중…</p></div>
           </details>`).join('')
      : '<p class="muted">아직 저장된 학생 작업이 없습니다.</p>';
  } catch (e) {
    html += `<p class="warn">서버에서 불러오지 못했습니다: ${esc(e.message)}</p>`;
  }
  el.innerHTML = html;
  bindWorkButtons();
  // 펼친 반의 보드를 채운다 (payload는 펼쳤을 때만 받아옴 — 300명 규모 대비)
  el.querySelectorAll('.adm-ban').forEach(det => {
    const load = () => { if (det.open) loadBanBoard(det.dataset.ban); };
    det.addEventListener('toggle', load);
    load();
  });
}

// 학생 작업 요약 칩 (실시간 보드용)
function summarize(w) {
  const chips = [];
  const on = (label, ok) => chips.push(`<span class="chip ${ok ? 'on' : ''}">${label}</span>`);
  on('케이스', w.caseTab && w.caseTab.assembled);
  const leds = (w.circuit && w.circuit.leds || []).length;
  on(leds ? `LED ${leds}` : 'LED', leds > 0);
  on('점등', w.circuit && w.circuit.tested);
  on('도안', w.design && ((w.design.letters || []).some(l => l.text) || (w.design.drawing && w.design.drawing.strokes.length)));
  on('조립순서', (w.order || []).length === 9);
  return chips.join('');
}

// 오늘의 출결 표시 (이 기기 저장 + 구글 시트 기록)
function attKey() { return 'lps_att_' + new Date().toISOString().slice(0, 10); }
function getAtt() { try { return JSON.parse(localStorage.getItem(attKey()) || '{}'); } catch (e) { return {}; } }

async function loadBanBoard(ban) {
  const grid = document.querySelector(`.board-grid[data-ban="${ban}"]`);
  if (!grid) return;
  try {
    const rows = await cloudListBan(ban);
    const byNum = {};
    rows.forEach(r => byNum[r.num] = r);
    const att = getAtt();
    grid.innerHTML = Array.from({ length: config.numCount }, (_, i) => i + 1).map(num => {
      const r = byNum[num];
      const a = att[`${ban}-${num}`];
      const attHtml = a ? `<div class="att-badge">${esc(a)}</div>` : '';
      if (!r) return `
        <div class="stu-card off">
          <div class="stu-head"><b>${num}번</b><span class="muted small">미접속</span></div>
          ${attHtml}
          <div class="stu-btns"><button class="w-att" data-bn="${ban}:${num}">출결</button></div>
        </div>`;
      return `
        <div class="stu-card">
          <div class="stu-head"><b>${num}번</b>
            <span class="muted small">${new Date(r.updated_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></div>
          ${attHtml}
          <div class="stu-chips">${summarize(r.payload || {})}</div>
          <div class="stu-btns">
            <button class="w-open" data-id="cloud:${r.id}">보기</button>
            <button class="w-note" data-bn="${ban}:${num}">메모</button>
            <button class="w-att" data-bn="${ban}:${num}">출결</button>
            <button class="w-del" data-id="cloud:${r.id}">삭제</button>
          </div>
        </div>`;
    }).join('');
    bindGridButtons(grid);
  } catch (e) {
    grid.innerHTML = `<p class="warn">불러오기 실패: ${esc(e.message)}</p>`;
  }
}
function bindAttButtons(scope) {
  scope.querySelectorAll('.w-att').forEach(b => b.addEventListener('click', () => {
    const [ban, num] = b.dataset.bn.split(':').map(Number);
    const cur = getAtt()[`${ban}-${num}`] || '';
    const text = prompt(`${ban}반 ${num}번 출결 (예: 결석-무단, 지각, 조퇴-병원 / 지우려면 빈칸)`, cur);
    if (text === null) return;
    const a = getAtt();
    if (text.trim()) a[`${ban}-${num}`] = text.trim();
    else delete a[`${ban}-${num}`];
    localStorage.setItem(attKey(), JSON.stringify(a));
    if (text.trim() && config.sheetUrl) { sheetLogFor(ban, num, '출결', text.trim()); sheetFlushNow(); }
    loadBanBoard(String(ban));
  }));
}
function bindGridButtons(scope) {
  bindOpenButtons(scope);
  bindNoteButtons(scope);
  bindAttButtons(scope);
  bindDelButtons(scope);
}
function bindWorkButtons() {
  const s = $('adm-works');
  bindOpenButtons(s); bindNoteButtons(s); bindDelButtons(s);
}
function bindOpenButtons(scope) {
  scope.querySelectorAll('.w-open').forEach(b => b.addEventListener('click', async () => {
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
}
// 교사 메모 → 구글 시트에 기록
function bindNoteButtons(scope) {
  scope.querySelectorAll('.w-note').forEach(b => b.addEventListener('click', () => {
    if (!config.sheetUrl) { alert('먼저 수업 설정에 Google Sheet 기록 URL을 넣어 주세요.'); return; }
    const [ban, num] = b.dataset.bn.split(':').map(Number);
    const text = prompt(`${ban}반 ${num}번 학생에 대한 메모 (시트에 기록됩니다)`);
    if (text && text.trim()) {
      sheetLogFor(ban, num, '교사 메모', text.trim());
      sheetFlushNow();
      alert('기록했습니다.');
    }
  }));
}
// 학생 작업 초기화 (잘못 로그인한 학번 정리, 재작업 등)
function bindDelButtons(scope) {
  scope.querySelectorAll('.w-del').forEach(b => b.addEventListener('click', async () => {
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

// 구글 시트 연동용 Apps Script — 학기마다 새 시트에 붙여 쓸 수 있게 관리자 화면에서 제공
const APPS_SCRIPT = `function doPost(e) {
  var rows = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  rows.forEach(function (r) {
    var name = (r.ban || r.ban === 0) ? r.ban + '반' : '기타';
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(['시각', '번호', '학번', '이벤트', '내용']);
    sh.appendRow([new Date(r.ts), r.num || '', r.id, r.event, r.detail]);
  });
  return ContentService.createTextOutput('ok');
}`;

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
    renderSettings(); renderEntry(); renderRubric(); renderFaqEditor(); renderMisses(); renderWorks();
    $('adm-gas').value = APPS_SCRIPT;
    clearInterval(worksTimer);
    worksTimer = setInterval(() => {
      if (!$('admin-modal').classList.contains('hidden')) renderWorks();
    }, 20000);
  });
  $('adm-pin').addEventListener('keydown', e => { if (e.key === 'Enter') $('adm-pin-btn').click(); });

  $('adm-save').addEventListener('click', () => {
    collectSettings(); collectRubric(); collectFaq();
    saveConfig();
    renderSettings(); renderEntry(); // 코드 배너·시간표 갱신
    alert('저장되었습니다. 학생 화면은 새로고침하면 반영됩니다.');
  });
  $('adm-gas-copy').addEventListener('click', () => {
    $('adm-gas').select();
    if (navigator.clipboard) navigator.clipboard.writeText(APPS_SCRIPT).catch(() => {});
    alert('복사했습니다. 새 구글 시트 → 확장 프로그램 → Apps Script에 붙여넣고, 웹 앱으로 배포(액세스: 모든 사용자)한 뒤 그 URL을 수업 설정의 [Google Sheet 기록 URL]에 넣으세요.');
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
