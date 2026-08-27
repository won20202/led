// 전역 상태: 관리자 설정 + 학생 작업 데이터. localStorage 저장, 선택적으로 Supabase 동기화.

export const DEFAULT_FAQ = [
  { q: '완성 크기가 얼마인가요?', k: '완성 크기 규격 치수', a: '완성 크기는 가로 25cm × 세로 10cm × 깊이 5cm입니다. 우드락 두께는 0.5cm입니다. 조각별 재단 치수는 여러분이 두께를 반영해서 직접 계산해야 합니다.', tab: 'case' },
  { q: '재료는 무엇을 얼마나 받나요?', k: '재료 지급 수량 준비물', a: '1인당: 검은 도화지(앞면) A4 1장, 트레이싱지(속지) A4 1장, 우드락(두께 0.5cm) 1/4장, 백색 LED 8개, 전도성 직물 테이프 약 90cm, AA 2구 스위치 내장 건전지 홀더 1개, AA 건전지 2개. 커터칼·커팅매트·자는 모둠당 지급.', tab: 'all' },
  { q: '도안 조건이 무엇인가요?', k: '도안 조건 글자 그림 크기 굵기', a: '작업 영역 23×8cm(앞면 가장자리 1cm 제외) 안에 글자 2개(각 가로 7~8cm, 세로 5~8cm)와 그림 1개(4~5cm)를 간격 0.5cm 이상 두고 배치합니다. 모든 획·선 굵기는 0.7cm 이상이어야 합니다.', tab: 'design' },
  { q: '배점이 어떻게 되나요?', k: '배점 점수 채점 기준', a: '제조 기술 내용 이해도 25점 + 설계 포트폴리오 35점 + 제작 실습 40점 = 100점. 포트폴리오 4조건(①도안 ②전개도 두께 반영 ③등각투상도 ④회로도 극성)을 모두 충족하면 35점, 하나 빠질 때마다 5점씩 내려갑니다.', tab: 'all' },
  { q: '확인 단계는 어떻게 통과하나요?', k: '확인 단계 검사 통과', a: '확인① 전개도·등각투상도(치수·척도·두께 반영) → 재단 도면 승인. 확인② 도안·회로도(조건·극성) → 앞면 재료 지급. 확인③ 가공·점등(빛이 고르게) → 우드락 지급. 확인④ 조립·마감. 재확인 횟수는 감점하지 않으니 틀려도 다시 도전하세요.', tab: 'all' },
  { q: '등각투상도는 어떻게 그리나요?', k: '등각투상도 척도 그리기', a: '척도 1:2, 모눈 1칸=1cm로 그리고 각 면의 치수를 반드시 기입합니다. 가로·세로·깊이 세 방향 모서리가 120°를 이루도록 그립니다. 케이스 탭의 3D 화면을 돌려 보며 참고하되, 도면은 반드시 손으로 그려야 합니다.', tab: 'case' },
  { q: 'LED가 안 켜져요', k: 'LED 안켜짐 점등 불량 고장', a: '순서대로 확인해 보세요. ① 긴 다리(+)가 (+)줄에 붙어 있나요? ② 두 다리가 서로 다른 줄에 붙어 있나요? ③ 테이프가 중간에 끊기지 않았나요? ④ (+)줄과 (−)줄이 서로 닿지 않았나요? ⑤ 전지의 빨간 선(+)과 검은 선(−)이 회로에 제대로 붙어 있나요?', tab: 'circuit' },
  { q: 'LED를 직렬로 연결하면 안 되나요?', k: '직렬 병렬 연결 방법 밝기', a: '직렬로 이으면 전지의 전압이 LED들에 나뉘어 밝기가 눈에 띄게 어두워지고, 개수가 더 많아지면 아예 켜지지 않습니다. 병렬로 이으면 각 LED가 전압을 온전히 받습니다. 회로 탭에서 직접 실험해 보세요.', tab: 'circuit' },
  { q: 'ㅇ, ㅁ처럼 안쪽이 떨어지는 글자는 어떻게 하나요?', k: '안쪽 조각 글자 오리기 떨어짐', a: '잘라낸 안쪽 조각을 버리지 말고 보관했다가, 트레이싱지를 붙인 뒤 그 위에 다시 붙이는 방법이 있습니다. 포트폴리오에 자신이 정한 처리 방법을 반드시 적어야 합니다.', tab: 'design' },
  { q: '색깔 빛을 내고 싶어요', k: '색 빨강 파랑 컬러 색깔', a: '방법 1: LED 머리에 유성 매직으로 칠하기(진하게 칠할수록 어두워지고, 검정은 빛이 거의 안 나옵니다). 방법 2: 속지를 색 트레이싱지나 색 셀로판으로 바꾸기(회로는 그대로). 빨강·노랑·초록 색 LED를 쓰려면 LED마다 220Ω 저항이 필요해서 이번 실습에서는 백색을 권장합니다.', tab: 'circuit' },
  { q: '제출은 언제까지인가요?', k: '제출 기한 마감', a: '5블록(마지막 시간)에 완성품과 설계 포트폴리오를 함께 제출합니다. 완성품은 학번·이름이 보이도록 촬영한 뒤 가져갈 수 있습니다. 기간 내 미제출 시 최하점의 차하점이 부여되니 꼭 기한을 지키세요.', tab: 'all' },
  { q: 'LED의 긴 다리와 짧은 다리는 뭐가 다른가요?', k: 'LED 다리 극성 긴다리 짧은다리 애노드', a: 'LED는 한쪽 방향으로만 전류가 흐르는 부품이라 다리 길이로 방향을 표시해요. 긴 다리가 (+)극, 짧은 다리가 (−)극입니다. 실제 제작에서는 다리를 양옆으로 벌려 "ㄴ"자로 눕혀 평평하게 만들어야 전도성 테이프에 잘 붙습니다. 헷갈리지 않게 긴 다리에 매직으로 표시해 두세요.', tab: 'circuit' },
  { q: '우드락은 어떤 재료인가요?', k: '우드락 재료 특성 자르기 재단', a: '스티로폼(발포 폴리스티렌)을 얇게 눌러 만든 판이에요. 가볍고 부드러워 커터칼로 쉽게 잘리지만, 열에 약하고 세게 누르면 자국이 남아요. 자를 때는 금속 자를 대고 한 번에 깊게 긋지 말고 2~3번 나눠 그으면 단면이 깔끔합니다.', tab: 'case' },
  { q: '커터칼을 안전하게 쓰려면?', k: '커터칼 칼 안전 주의', a: '칼날은 조금만 빼고, 항상 몸 바깥쪽으로 긋습니다. 칼이 지나갈 자리에 반대쪽 손을 두지 않아요. 꼭 커팅 매트 위에서 사용하고, 다 쓰면 칼날을 넣어 둡니다.', tab: 'all' },
  { q: '전선 피복은 어떻게 벗기나요?', k: '와이어 스트리퍼 전선 피복 벗기기', a: '와이어 스트리퍼의 0.6 구멍에 전선을 넣고 1cm쯤 돌려 당기면 피복만 벗겨집니다. 손톱이나 이로 벗기면 다치거나 안쪽 구리선이 끊어질 수 있어요.', tab: 'circuit' },
  { q: '건전지를 끼울 때 주의할 점은?', k: '건전지 방향 홀더 과열 타는냄새', a: '홀더 안의 (+)(−) 그림 방향대로 끼워야 해요. 거꾸로 끼우면 회로가 뜨거워지고 타는 냄새가 나거나 부품이 망가질 수 있습니다. 이상한 냄새가 나면 바로 전지를 빼고 선생님께 알리세요.', tab: 'circuit' },
  { q: 'AI를 써도 되나요?', k: 'AI 인공지능 챗봇 사용', a: '본 수행평가에서는 생성형 인공지능(AI) 도구를 사용하지 않습니다. 이 시뮬레이터는 계산이나 정답을 대신해 주지 않으며, 여러분이 정한 값의 결과만 보여줍니다.', tab: 'all' },
];

// 평가 기준: 영역 수·조건 수·배점 간격 모두 해마다 바뀔 수 있으므로 전부 편집 가능한 데이터로 둔다.
export const DEFAULT_RUBRIC = [
  {
    name: '제조 기술 내용 이해도', note: '',
    levels: [
      { d: '제시된 4문항을 모두 바르게 해결함', p: 25 },
      { d: '제시된 4문항 중 3문항을 바르게 해결함', p: 20 },
      { d: '제시된 4문항 중 2문항을 바르게 해결함', p: 15 },
      { d: '제시된 4문항 중 1문항을 바르게 해결함', p: 10 },
      { d: '제시된 4문항을 1문항도 바르게 해결하지 못함', p: 5 },
    ],
  },
  {
    name: '설계 포트폴리오',
    note: '조건: ① 도안을 제작 조건(구성·크기·획 굵기)에 맞게 작성 ② 전개도의 조각별 재단 치수에 재료 두께 반영 ③ 등각투상도에 완성된 모습과 전체 치수·척도 표기 ④ 회로도에 전원·발광 소자의 연결과 극성 표시',
    levels: [
      { d: '4가지 조건을 모두 충족하여 작성함', p: 35 },
      { d: '3가지 조건을 충족하여 작성함', p: 30 },
      { d: '2가지 조건을 충족하여 작성함', p: 25 },
      { d: '1가지 조건을 충족하여 작성함', p: 20 },
      { d: '조건을 1가지도 충족하지 못함', p: 15 },
    ],
  },
  {
    name: '제작 실습',
    note: '조건: ① 도안과 도면대로 제작 ② 발광 소자가 모두 점등되고 빛이 고르게 나타남 ③ 케이스가 견고하게 조립되어 형태 유지 ④ 절단면과 접합부가 깔끔하게 마무리됨',
    levels: [
      { d: '4가지 조건을 모두 충족하여 제작함', p: 40 },
      { d: '3가지 조건을 충족하여 제작함', p: 35 },
      { d: '2가지 조건을 충족하여 제작함', p: 30 },
      { d: '1가지 조건을 충족하여 제작함', p: 25 },
      { d: '조건을 1가지도 충족하지 못함', p: 20 },
    ],
  },
];

export const DEFAULT_CONFIG = {
  rubric: DEFAULT_RUBRIC,
  thickness: 0.5,           // 재료(우드락) 두께 cm
  targetW: 25, targetH: 10, targetD: 5,
  showTarget: false,        // 완성 목표 치수 화면 표시 (기본 숨김)
  boardW: 45, boardH: 30,   // 우드락 판 (600×900 판을 4등분 = 450×300mm)
  ledCount: 8, voltage: 3.0, imax: 200,
  // ponytail: 교육용 근사 회로 모델 — vf는 점등 문턱 전압, rint는 전지·테이프 내부저항.
  // 직렬 2개 = 어둡게, 3개 이상 = 소등이 되도록 잡은 값. 실제 백색 LED 물리와는 다름.
  vf: 1.2, rint: 90,
  allowResistor: false, resistorOhm: 220,
  frontW: 25, frontH: 10,   // 앞면 종이
  areaW: 23, areaH: 8,      // 도안 작업 영역
  strokeMin: 0.7,
  letterMin: 5, letterMax: 8, pictoMin: 4, pictoMax: 5,
  showSupply: true, showMeasure: true, askPredict: true, questionFeedback: true,
  overLimit: 'warn',        // 'warn' | 'block'
  classCode: '',            // 빈 값이면 반 코드 검사 안 함
  adminPin: '2026',
  supabaseUrl: '', supabaseKey: '',
  faq: DEFAULT_FAQ,
};

const CONFIG_KEY = 'lps_config2'; // v2: 회로 모델 파라미터 변경으로 키 교체
const MISS_KEY = 'lps_faq_miss';

export let config = loadConfig();

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) { /* 손상된 설정은 무시하고 기본값 */ }
  return { ...DEFAULT_CONFIG };
}
export function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}
export function exportConfigCode() {
  return btoa(unescape(encodeURIComponent(JSON.stringify(config))));
}
export function importConfigCode(code) {
  const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  config = { ...DEFAULT_CONFIG, ...obj };
  saveConfig();
}

// ---- 학생 작업 상태 ----
export function blankWork() {
  return {
    caseTab: {
      pieces: { back: { w: '', h: '' }, side: { w: '', h: '' }, topbot: { w: '', h: '' } },
      predict: { w: '', h: '', d: '' },
      assembled: false,
    },
    circuit: {
      leds: [], resistors: [], tapes: [],
      holder: { wires: [{ surf: 'dock' }, { surf: 'dock' }] }, // 전선 끝 2개, dock = 아직 전지에 꽂혀 있음
      predictCount: '', tested: false,
    },
    design: {
      letters: [
        { text: '', x: 5.5, y: 5, size: 6, stroke: 0.7 },
        { text: '', x: 13.5, y: 5, size: 6, stroke: 0.7 },
      ],
      drawing: { strokes: [] },
    },
    order: [],
    assembly: { holderPos: null }, // 조립 순서 탭에서 정하는 건전지 홀더 부착 위치
    log: [],
    updatedAt: 0,
  };
}

export let student = null;   // {ban, num}
export let work = blankWork();
export let readOnly = false; // 관리자가 학생 작업을 열람할 때

export function studentKey(s) { return `lps_work_${s.ban}-${s.num}`; }
export function studentId(s) { return `2-${s.ban}-${s.num}`; }

// work 객체는 교체하지 않고 내용만 바꾼다 (모듈들이 참조를 캡처하고 있음)
function replaceWork(w) {
  Object.keys(work).forEach(k => delete work[k]);
  Object.assign(work, blankWork(), w || {});
}

export function login(ban, num) {
  student = { ban, num };
  const raw = localStorage.getItem(studentKey(student));
  let saved = null;
  if (raw) { try { saved = JSON.parse(raw); } catch (e) { /* ignore */ } }
  replaceWork(saved);
  cloudPull();
}

export function setReadOnlyWork(w, label) {
  readOnly = true;
  replaceWork(w);
  student = { ban: 0, num: 0, label };
}

let saveTimer = null;
export function touch() {
  if (readOnly || !student) return;
  work.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(studentKey(student), JSON.stringify(work));
    cloudPush();
  }, 500);
}

export function addLog(line) {
  if (readOnly) return;
  work.log.push(`${work.log.length + 1}차 · ${line}`);
  if (work.log.length > 60) work.log.shift();
  touch();
}

// ---- FAQ 못 찾은 검색어 ----
export function recordMiss(q) {
  try {
    const arr = JSON.parse(localStorage.getItem(MISS_KEY) || '[]');
    arr.push({ q, t: Date.now() });
    localStorage.setItem(MISS_KEY, JSON.stringify(arr.slice(-200)));
  } catch (e) { /* ignore */ }
}
export function getMisses() {
  try { return JSON.parse(localStorage.getItem(MISS_KEY) || '[]'); } catch (e) { return []; }
}
export function clearMisses() { localStorage.removeItem(MISS_KEY); }

// ---- Supabase 동기화 (설정된 경우에만, 실패해도 조용히 localStorage로 계속) ----
function sb() {
  if (!config.supabaseUrl || !config.supabaseKey) return null;
  return {
    url: config.supabaseUrl.replace(/\/$/, '') + '/rest/v1/lps_works',
    headers: {
      apikey: config.supabaseKey,
      Authorization: 'Bearer ' + config.supabaseKey,
      'Content-Type': 'application/json',
    },
  };
}
export let cloudStatus = 'off'; // off | ok | error
const statusListeners = [];
export function onCloudStatus(fn) { statusListeners.push(fn); }
function setCloud(s) { cloudStatus = s; statusListeners.forEach(fn => fn(s)); }

let pushTimer = null, lastPush = 0;
export function cloudPush() {
  const c = sb();
  if (!c || !student || readOnly) return;
  const now = Date.now();
  const delay = Math.max(0, 15000 - (now - lastPush)); // 최소 15초 간격
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    lastPush = Date.now();
    try {
      const res = await fetch(c.url + '?on_conflict=id', {
        method: 'POST',
        headers: { ...c.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          id: studentId(student), ban: student.ban, num: student.num,
          payload: work, updated_at: new Date().toISOString(),
        }),
      });
      setCloud(res.ok ? 'ok' : 'error');
    } catch (e) { setCloud('error'); }
  }, delay);
}

async function cloudPull() {
  const c = sb();
  if (!c || !student) return;
  try {
    const res = await fetch(`${c.url}?id=eq.${studentId(student)}&select=payload,updated_at`, { headers: c.headers });
    if (!res.ok) { setCloud('error'); return; }
    setCloud('ok');
    const rows = await res.json();
    if (rows.length && rows[0].payload && (rows[0].payload.updatedAt || 0) > (work.updatedAt || 0)) {
      Object.assign(work, rows[0].payload);
      document.dispatchEvent(new CustomEvent('work-loaded'));
    }
  } catch (e) { setCloud('error'); }
}

export async function cloudList() {
  const c = sb();
  if (!c) return null;
  const res = await fetch(`${c.url}?select=id,ban,num,updated_at&order=ban,num`, { headers: c.headers });
  if (!res.ok) throw new Error('불러오기 실패 ' + res.status);
  return res.json();
}
export async function cloudGet(id) {
  const c = sb();
  const res = await fetch(`${c.url}?id=eq.${encodeURIComponent(id)}&select=payload`, { headers: c.headers });
  if (!res.ok) throw new Error('불러오기 실패 ' + res.status);
  const rows = await res.json();
  return rows[0] ? rows[0].payload : null;
}

// 페이지를 떠날 때 마지막 저장
window.addEventListener('beforeunload', () => {
  if (student && !readOnly) localStorage.setItem(studentKey(student), JSON.stringify(work));
});
