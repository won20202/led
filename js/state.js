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
  // 회로 모델: 백색 LED를 문턱 전압 + 동저항으로 근사 — 현실과 같은 결론이 나온다.
  // 1.5V→안 켜짐 / 3V 1개→정상(약 20mA) / 3V 직렬2→소등 / 4.5V 직렬2→희미 / 6V 직렬2→정상
  // 저항 없이 4.5V 이상 직결→과전류(수명 급감)→타버림. I = (Vs − k·Vth) / (Rint + k·Rd + R외부)
  vf: 2.2,      // LED 문턱 전압 Vth (V)
  ledRd: 30,    // LED 동저항 (Ω)
  rint: 10,     // 전지·테이프 내부저항 (Ω)
  iOver: 25,    // 이보다 크면 과전류 경고 (mA)
  iBurn: 50,    // 이보다 크면 LED가 타버림 (mA)
  advanced: false,     // 심화 모드: 저항 부품 + 실제 색 LED (기본은 백색 LED + 매직 색칠)
  resistorOhm: 220,
  frontW: 25, frontH: 10,   // 앞면 종이
  areaW: 23, areaH: 8,      // 도안 작업 영역
  strokeMin: 0.7,
  letterMin: 5, letterMax: 8, pictoMin: 4, pictoMax: 5,
  dLetters: 2,      // 도안 글자 수 (한 글자씩 배치)
  dDrawing: true,   // 그림 포함 여부
  dFree: false,     // 자유 모드: 글자 수·크기 조건 없음, 글자 추가 자유
  // 도움말의 재료·도구 카드 — 관리자에서 문구 수정 가능
  materials: [
    { n: '우드락', c: '#f0e3c0', f: ['스티로폼을 얇게 눌러 만든 판 — 가볍고 부드러워요', '커터칼로 쉽게 잘리지만, 열과 힘에는 약해요'], t: '자를 꽉 대고 한 번에 집중해서 그어야 단면이 깔끔!' },
    { n: 'LED (발광 다이오드)', c: '#fff3b0', f: ['전기를 빛으로 바꾸는 부품', '한쪽 방향으로만 전류가 흘러요 — 긴 다리가 (+), 짧은 다리가 (−)'], t: '긴 다리에 매직으로 표시한 뒤 180도로 펼쳐 눕혀요.' },
    { n: '전도성 테이프', c: '#d7dde6', f: ['은이 섞인 천 테이프 — 전기가 지나가는 길', '겹쳐 붙이면 이어지고, 끊어지면 전류도 멈춰요'], t: '(+)줄과 (−)줄이 서로 닿으면 합선! 거리를 두고 붙여요.' },
    { n: '트레이싱지', c: '#eef4f0', f: ['반투명 종이 — 빛을 부드럽게 퍼뜨려요(확산)', 'LED의 점 빛이 은은한 면 빛으로 바뀌어요'], t: '색 트레이싱지나 셀로판으로 바꾸면 색깔 빛!' },
    { n: '검은 도화지', c: '#c9cdd3', f: ['빛을 막아서 오려낸 글자만 빛나게 해요'], t: '칼을 세우고 한 번에 그어요 — 여러 번 덧그으면 지저분해요.' },
    { n: '건전지 + 홀더', c: '#d9e6d5', f: ['AA 2개를 직렬로 = 3V', '(+)(−) 방향대로 끼워야 해요 — 거꾸로 끼우면 뜨거워져요!'], t: '홀더는 완성품이 잘 서도록 아래쪽에 붙여요.' },
    { n: '커터칼', c: '#f3d9d3', f: ['칼날은 조금만 빼고, 항상 몸 바깥쪽으로', '칼이 지나갈 자리에 손을 두지 않아요'], t: '커팅 매트 위에서만 사용!' },
    { n: '와이어 스트리퍼', c: '#dcd6ea', f: ['전선의 피복(껍질)만 벗겨 주는 도구'], t: '전선 굵기에 맞는 구멍에 넣고 당기면 피복만 벗겨져요.' },
  ],
  orderTips: {},    // 조립 순서 팁 덮어쓰기 (비어 있으면 기본 문구)
  orderSafety: {},  // 조립 순서 안전 문구 덮어쓰기
  showSupply: true, showMeasure: true, askPredict: true, questionFeedback: true,
  overLimit: 'warn',        // 'warn' | 'block'
  // 학교 기본 정보 — 해마다 바꿔 쓴다
  grade: 2, banCount: 10, numCount: 35,
  banDigits: 2, numDigits: 2, // 학번 체계: 반·번호 자리수 (예: 20627 = 반 2자리 / 2527 = 반 1자리)
  excludedSids: '',   // 전출 등 명단 제외 학번 (쉼표 구분, 예: 20627, 20315)
  extraSids: '',      // 전입생 등 추가 학번 — 번호 범위 밖이어도 입장 허용
  roster: {},         // 명단(학적): { "20321": "재학" } — CSV 일괄 등록. 비어 있으면 검사 안 함
  groups: {},         // 섞인 반(그룹 수업) 명단: { "메이커반": ["10821","20321"] }
  // 입장 방식: none(코드 없음) | fixed(고정 코드) | daily(매일 바뀜) | session(수업 코드: 반·교시 지정)
  entryMode: 'none',
  classCode: '',            // fixed 모드에서 쓰는 고정 코드
  // 주간 시간표: 요일(1=월~5=금)별 교시 칸에 수업명. "7", "2-7"(학년-반)뿐 아니라
  // "메이커반", "동아리A"처럼 학년·반이 섞인 그룹 수업명도 된다.
  timetable: { 1: [], 2: [], 3: [], 4: [], 5: [] },
  // 특정 주만 시간표가 다를 때: { '2026-09-21'(그 주 월요일): {1:[..],..} }. 다음 주엔 자동으로 기본으로.
  weekOverrides: {},
  periods: [                // 교시 시간표 (session 모드용, 관리자가 수정)
    { start: '09:00', end: '09:45' }, { start: '09:55', end: '10:40' },
    { start: '10:50', end: '11:35' }, { start: '11:45', end: '12:30' },
    { start: '13:20', end: '14:05' }, { start: '14:15', end: '15:00' },
    { start: '15:10', end: '15:55' },
  ],
  adminPin: '2026',
  // 학교 공용 Supabase (publishable key — 브라우저 공개용으로 설계된 키라 코드에 넣어도 안전)
  supabaseUrl: 'https://gakrtbuicpruxjaqalec.supabase.co',
  supabaseKey: 'sb_publishable_Y6T-PsFY5WPq-w7dZ2IQMA_COG6dOYI',
  sheetUrl: '',             // Google Apps Script 웹 앱 URL — 설정하면 학생 활동·피드백이 시트에 기록됨
  faq: DEFAULT_FAQ,
};

const CONFIG_KEY = 'lps_config3'; // v3: 현실 물리 모델로 교체하며 키 갱신
const MISS_KEY = 'lps_faq_miss';

export let config = loadConfig();

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const c = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      // 옛 설정 이관: dailyCode/classCode → entryMode
      if (!c.entryMode) c.entryMode = c.dailyCode ? 'daily' : (c.classCode ? 'fixed' : 'none');
      // 옛 설정에 서버 주소가 비어 있으면 내장 기본 서버로 연결
      if (!c.supabaseUrl || !c.supabaseKey) {
        c.supabaseUrl = DEFAULT_CONFIG.supabaseUrl;
        c.supabaseKey = DEFAULT_CONFIG.supabaseKey;
      }
      return c;
    }
  } catch (e) { /* 손상된 설정은 무시하고 기본값 */ }
  return { ...DEFAULT_CONFIG };
}
export function saveConfig() {
  config._cfgAt = Date.now(); // 어느 설정이 더 최신인지 비교용 (파일·서버 배포와 충돌 방지)
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// ---- 수업 설정 파일 배포 (GitHub 저장소의 class-config.json) ----
// 서버 없이도 동작: 관리자가 내려받은 설정 파일을 저장소에 올려 두면
// 학생 앱이 시작할 때 읽어 적용한다. 로컬 설정이 더 최신이면 덮지 않는다.
export async function fileConfigPull() {
  try {
    const res = await fetch('class-config.json', { cache: 'no-store' });
    if (!res.ok) return false;
    const pub = await res.json();
    if (!pub || typeof pub !== 'object' || !Object.keys(pub).length) return false;
    delete pub.adminPin; // 공개 저장소에 PIN이 실렸어도 받지 않는다
    if ((pub._cfgAt || 0) <= (config._cfgAt || 0)) return false; // 내 설정이 더 최신
    Object.assign(config, pub);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch (e) { return false; }
}

// ---- 수업 설정 자동 배포 (Supabase 연결 시) ----
// 관리자가 [설정 저장]하면 설정이 서버에 올라가고, 학생 앱은 시작할 때 자동으로 받아온다.
// PIN과 서버 접속 정보는 배포에서 제외 (접속 정보는 기기별, PIN은 교사만).
const CONFIG_SYNC_EXCLUDE = ['supabaseUrl', 'supabaseKey', 'adminPin'];
export async function cloudPushConfig() {
  const c = sb();
  if (!c) return false;
  const pub = { ...config };
  CONFIG_SYNC_EXCLUDE.forEach(k => delete pub[k]);
  try {
    const res = await fetch(c.url, {
      method: 'POST',
      headers: { ...c.headers, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: 'config', ban: 0, num: 0, payload: pub, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch (e) { return false; }
}
export async function cloudPullConfig() {
  const c = sb();
  if (!c) return false;
  try {
    const res = await fetch(`${c.url}?id=eq.config&select=payload`, { headers: c.headers });
    if (!res.ok) return false;
    const rows = await res.json();
    if (!rows.length || !rows[0].payload) return false;
    const pub = { ...rows[0].payload };
    CONFIG_SYNC_EXCLUDE.forEach(k => delete pub[k]);
    if ((pub._cfgAt || 0) <= (config._cfgAt || 0)) return false; // 내 설정이 더 최신이면 유지
    Object.assign(config, pub);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch (e) { return false; }
}
// ---- 입장 코드: PIN+날짜(+반·교시)에서 모든 기기가 똑같이 계산 — 서버·재배포 없이 유효 ----
function dateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function codeOf(...parts) {
  const s = config.adminPin + '|' + parts.join('|');
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String(1000 + h % 9000);
}
// 일일 코드 (전체 공용, 그날 하루)
export function todayCode() { return codeOf('day', dateStr()); }

// ---- 주차별 시간표 ----
export function weekKeyOf(d = new Date()) {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); // 그 주 월요일
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}
export function timetableForWeek(wk) {
  const ov = config.weekOverrides && config.weekOverrides[wk];
  // 내용이 전부 빈 수정본(과거 버그로 생김)은 무시하고 기본 시간표를 쓴다
  const hasContent = ov && Object.values(ov).some(col => (col || []).some(t => t && String(t).trim()));
  return (hasContent ? ov : null) || config.timetable || { 1: [], 2: [], 3: [], 4: [], 5: [] };
}
// 어떤 요일 열에서 연속된 같은 수업명을 묶는다 → [{token, p1, p2}]
export function runsOf(col) {
  const runs = [];
  for (let p = 0; p < (config.periods || []).length; p++) {
    const token = String((col || [])[p] || '').trim();
    if (!token) continue;
    const last = runs[runs.length - 1];
    if (last && last.token === token && last.p2 === p - 1) last.p2 = p;
    else runs.push({ token, p1: p, p2: p });
  }
  return runs;
}
export function todayRuns() {
  const dow = new Date().getDay();
  if (dow < 1 || dow > 5) return [];
  return runsOf(timetableForWeek(weekKeyOf())[dow]);
}
// "20627, 20315" 같은 학번 목록에 포함되는지
export function sidInList(listStr, sid) {
  return String(listStr || '').split(',').map(s => s.trim()).filter(Boolean).includes(sid);
}
// 학번 ↔ 학년/반/번호 (자리수는 관리자 설정을 따른다)
export function sidLength() { return 1 + config.banDigits + config.numDigits; }
export function parseSid(sid) {
  const bd = config.banDigits, nd = config.numDigits;
  if (!new RegExp(`^\\d{${1 + bd + nd}}$`).test(sid)) return null;
  return { grade: +sid[0], ban: +sid.slice(1, 1 + bd), num: +sid.slice(1 + bd) };
}
export function makeSid(ban, num) {
  return `${config.grade}${String(ban).padStart(config.banDigits, '0')}${String(num).padStart(config.numDigits, '0')}`;
}
// 수업 코드: 수업명(반 번호·"학년-반"·그룹명) + 교시 범위 (p1, p2는 0부터)
export function classSessionCode(token, p1, p2) { return codeOf('ban', dateStr(), String(token).trim(), p1, p2); }
// 미실시자 개인 코드: 학번 그대로, 그날 하루
export function studentDayCode(sid) { return codeOf('stu', dateStr(), String(sid).trim()); }
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
function inWindow(p1, p2) {
  const per = config.periods || [];
  if (!per[p1] || !per[p2]) return false;
  const mins = new Date().getHours() * 60 + new Date().getMinutes();
  return mins >= toMin(per[p1].start) - 10 && mins <= toMin(per[p2].end) + 10;
}
// 수업명이 이 학생의 수업인지: "학년-반"/"반" 은 학번과 대조,
// 그룹 수업명은 등록된 그룹 명단과 대조 (명단이 없으면 코드만 맞으면 입장)
function tokenMatches(token, p, sid) {
  const t = String(token).trim();
  const m = t.match(/^(\d+)-(\d+)$/); // "2-7" = 학년-반
  if (m) return +m[1] === p.grade && +m[2] === p.ban;
  if (/^\d+$/.test(t)) return p.grade === config.grade && +t === p.ban;
  const members = (config.groups || {})[t];
  if (members && members.length) return members.map(s => String(s).trim()).includes(sid);
  return true;
}
// 학생 기기에서 수업 코드 검증 (p = 학번 해석 결과, sid = 학번 문자열)
// 1) 오늘 시간표의 수업들과 대조 — 그룹 수업까지 처리
// 2) 시간표에 없어도 자기 반 코드는 통과 (수동 발급 대비)
export function sessionCodeValid(code, p, sid) {
  if (!/^\d{4}$/.test(code)) return { ok: false };
  for (const r of todayRuns()) {
    if (classSessionCode(r.token, r.p1, r.p2) === code && inWindow(r.p1, r.p2))
      if (tokenMatches(r.token, p, sid)) return { ok: true, token: r.token };
  }
  const per = config.periods || [];
  const own = [String(p.ban), `${p.grade}-${p.ban}`];
  for (const token of own)
    for (let p1 = 0; p1 < per.length; p1++)
      for (let p2 = p1; p2 < per.length; p2++)
        if (classSessionCode(token, p1, p2) === code && inWindow(p1, p2))
          return { ok: true, token };
  return { ok: false };
}

// ---- 명단(학적) : { "20321": "재학" } — 비어 있으면 명단 검사 안 함 ----
export const BLOCKED_STATUS = ['전출', '유예', '휴학', '면제', '제적'];
export function rosterStatus(sid) {
  const r = config.roster || {};
  return r[sid] || null;
}
export function rosterActive() { return Object.keys(config.roster || {}).length > 0; }

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
      holders: [],
      predictCount: '', tested: false,
    },
    lab: { leds: [], resistors: [], tapes: [], holders: [], tested: false }, // 회로 실험실 (자유 실험)
    design: {
      letters: [
        { text: '', x: 5.5, y: 5, size: 6, stroke: 0.7 },
        { text: '', x: 13.5, y: 5, size: 6, stroke: 0.7 },
      ],
      drawing: { strokes: [] },
    },
    order: [],
    assembly: { holderPos: null }, // 조립 순서 탭에서 정하는 건전지 홀더 부착 위치
    activeTab: 'case',            // 지금 보고 있는 탭 — 교사 실시간 보드가 이 장면을 보여준다
    circuitMode: 'lab',           // 회로 탭 안에서 실험실/플래카드 중 어디인지
    log: [],
    updatedAt: 0,
  };
}

export let student = null;   // {ban, num}
export let work = blankWork();
export let readOnly = false; // 관리자가 학생 작업을 열람할 때

export function studentKey(s) { return `lps_work_${s.grade || config.grade}-${s.ban}-${s.num}`; }
export function studentId(s) { return `${s.grade || config.grade}-${s.ban}-${s.num}`; }

// work 객체는 교체하지 않고 내용만 바꾼다 (모듈들이 참조를 캡처하고 있음)
function replaceWork(w) {
  Object.keys(work).forEach(k => delete work[k]);
  Object.assign(work, blankWork(), w || {});
}

export async function login(ban, num, grade) {
  student = { grade: grade || config.grade, ban, num };
  const raw = localStorage.getItem(studentKey(student)) ||
    (student.grade === config.grade ? localStorage.getItem(`lps_work_${ban}-${num}`) : null); // 옛 키 호환
  let saved = null;
  if (raw) { try { saved = JSON.parse(raw); } catch (e) { /* ignore */ } }
  replaceWork(saved);
  // 서버 작업을 먼저 받아 합친 뒤에 화면이 열리게 한다.
  // (기다리지 않으면 새 기기의 빈 작업이 서버의 진짜 작업을 덮어쓸 수 있다)
  await cloudPull();
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
  sheetLog('설계 일지', line);
  touch();
}

// ---- Google Sheet 기록 (교사 분석용, 설정된 경우에만) ----
// Apps Script 웹 앱으로 12초 간격 묶음 전송. 실패해도 조용히 무시.
let sheetQueue = [], flushTimer = null;
export function sheetLog(event, detail) {
  if (readOnly || !student) return;
  // 다른 학년 학생은 반 탭이 겹치지 않게 "학년-반"으로 구분
  const banLabel = student.grade === config.grade ? student.ban : `${student.grade}-${student.ban}`;
  sheetLogFor(banLabel, student.num, event, detail, studentId(student));
}
// 관리자(교사 메모 등)용: 로그인 여부와 무관하게 기록
export function sheetLogFor(ban, num, event, detail, id) {
  if (!config.sheetUrl) return;
  sheetQueue.push({
    ts: new Date().toISOString(),
    ban, num,
    id: id || `${config.grade}-${ban}-${num}`,
    event, detail: String(detail || '').slice(0, 500),
  });
  if (!flushTimer) flushTimer = setTimeout(flushSheet, 12000);
}
export function sheetFlushNow() { clearTimeout(flushTimer); flushSheet(); }
function flushSheet() {
  flushTimer = null;
  if (!sheetQueue.length || !config.sheetUrl) return;
  const body = JSON.stringify(sheetQueue.splice(0));
  try {
    fetch(config.sheetUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body })
      .catch(() => { /* 네트워크 실패는 조용히 무시 */ });
  } catch (e) { /* ignore */ }
}
window.addEventListener('beforeunload', () => {
  if (sheetQueue.length && config.sheetUrl && navigator.sendBeacon)
    navigator.sendBeacon(config.sheetUrl, JSON.stringify(sheetQueue.splice(0)));
});

// ---- FAQ 못 찾은 검색어 ----
export function recordMiss(q) {
  try {
    const arr = JSON.parse(localStorage.getItem(MISS_KEY) || '[]');
    arr.push({ q, t: Date.now() });
    localStorage.setItem(MISS_KEY, JSON.stringify(arr.slice(-200)));
  } catch (e) { /* ignore */ }
  sheetLog('도움말 검색(답 없음)', q);
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
  const delay = Math.max(0, 5000 - (now - lastPush)); // 최소 5초 간격 — 교사 관찰이 준실시간이 되도록
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
  const res = await fetch(`${c.url}?select=id,ban,num,updated_at&ban=gte.1&order=ban,num`, { headers: c.headers });
  if (!res.ok) throw new Error('불러오기 실패 ' + res.status);
  return res.json();
}
// 한 반의 작업을 내용(payload)까지 — 실시간 보드용
export async function cloudListBan(ban) {
  const c = sb();
  if (!c) return [];
  const res = await fetch(`${c.url}?ban=eq.${ban}&select=id,ban,num,updated_at,payload&order=num`, { headers: c.headers });
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
export async function cloudDelete(id) {
  const c = sb();
  if (!c) return;
  const res = await fetch(`${c.url}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: c.headers });
  if (!res.ok) throw new Error('삭제 실패 ' + res.status);
}

// 페이지를 떠날 때 마지막 저장
window.addEventListener('beforeunload', () => {
  if (student && !readOnly) localStorage.setItem(studentKey(student), JSON.stringify(work));
});
