-- Leaderboard for the "Devine le mouvement" painting game.
-- No auth: anyone may submit a score and read the board. Run this in the
-- Supabase SQL editor (migrations here are applied manually, like 009).

create table if not exists leaderboard (
  id bigserial primary key,
  pseudo text not null,
  score integer not null,
  best_streak integer not null,
  paintings_seen integer not null,
  created_at timestamptz default now()
);

create index if not exists leaderboard_score_idx on leaderboard (score desc);
create index if not exists leaderboard_created_at_idx on leaderboard (created_at);

alter table leaderboard enable row level security;

create policy "Public read" on leaderboard
  for select using (true);

create policy "Public insert" on leaderboard
  for insert with check (true);
