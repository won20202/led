// 앱 진입점: 로그인(반·번호) → 탭 화면
import { config, login, student, onCloudStatus } from './state.js';
import { initCase, refreshFromWork } from './case3d.js';
import { initCircuit, refreshCircuit } from './circuit.js';
import { initDesign, refreshDesign } from './design.js';
import { initAssembly, refreshAssembly } from './assembly.js';
import { initPreview, drawPreview } from './preview.js';
import { initFaq } from './faq.js';
import { initAdmin, openAdmin } from './admin.js';

const $ = id => document.getElementById(id);

function setupLogin() {
  const banSel = $('login-ban'), numSel = $('login-num');
  banSel.innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}반</option>`).join('');
  numSel.innerHTML = Array.from({ length: 35 }, (_, i) => `<option value="${i + 1}">${i + 1}번</option>`).join('');
  $('login-code-row').style.display = config.classCode ? '' : 'none';

  try {
    const last = JSON.parse(localStorage.getItem('lps_last') || 'null');
    if (last) { banSel.value = last.ban; numSel.value = last.num; }
  } catch (e) { /* ignore */ }

  $('login-admin').addEventListener('click', openAdmin);

  $('login-btn').addEventListener('click', () => {
    if (config.classCode && $('login-code').value.trim() !== config.classCode) {
      $('login-err').textContent = '반 코드가 다릅니다. 선생님께 확인하세요.';
      return;
    }
    const ban = parseInt(banSel.value), num = parseInt(numSel.value);
    localStorage.setItem('lps_last', JSON.stringify({ ban, num }));
    login(ban, num);
    $('student-badge').textContent = `2학년 ${ban}반 ${num}번`;
    $('login-modal').classList.add('hidden');
    $('app').classList.remove('hidden');
    document.dispatchEvent(new CustomEvent('work-loaded'));
    switchTab('case');
  });
}

const refreshers = {
  case: refreshFromWork,
  circuit: refreshCircuit,
  design: refreshDesign,
  order: refreshAssembly,
  preview: drawPreview,
};

export function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  window.dispatchEvent(new Event('resize'));
  const fn = refreshers[name];
  if (fn) fn();
}

document.querySelectorAll('.tab-btn').forEach(b =>
  b.addEventListener('click', () => switchTab(b.dataset.tab)));

onCloudStatus(s => {
  const el = $('cloud-dot');
  el.className = 'cloud-dot ' + s;
  el.title = s === 'ok' ? '서버에 저장되고 있습니다'
    : s === 'error' ? '서버 연결 안 됨 — 이 기기에만 저장됩니다'
    : '이 기기에만 저장됩니다';
});

// 개발·수업 중 문제 진단용 (학생 화면에는 영향 없음)
import * as state from './state.js';
window.__lps = state;

setupLogin();
initCase();
initCircuit();
initDesign();
initAssembly();
initPreview();
initFaq();
initAdmin();
