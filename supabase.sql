-- Supabase SQL Editor에 붙여넣고 실행하세요 (1회만).
-- 학생 작업 저장 테이블. 개인정보는 학번(반·번호)뿐입니다.

create table if not exists lps_works (
  id text primary key,          -- 예: "2-3-21" (학년-반-번호)
  ban int2 not null,
  num int2 not null,
  payload jsonb not null,
  updated_at timestamptz default now()
);

alter table lps_works enable row level security;

-- 수업용 단순 정책: anon 키로 읽기/쓰기 허용
-- (저장되는 내용이 설계 수치뿐이라 위험이 낮습니다.
--  더 잠그고 싶으면 수행평가 기간이 끝난 뒤 정책을 삭제하면 됩니다.)
create policy "lps_read" on lps_works for select using (true);
create policy "lps_insert" on lps_works for insert with check (true);
create policy "lps_update" on lps_works for update using (true);
