-- Setup do chat do focsecord.
-- Rodar uma vez no SQL Editor do projeto:
-- https://supabase.com/dashboard/project/whmhexqolhjfctnxfxpk/sql/new

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  author text not null check (char_length(btrim(author)) between 1 and 32),
  content text not null check (char_length(btrim(content)) between 1 and 500)
);

alter table public.messages enable row level security;

drop policy if exists "leitura publica" on public.messages;
create policy "leitura publica" on public.messages
  for select using (true);

drop policy if exists "envio publico" on public.messages;
create policy "envio publico" on public.messages
  for insert with check (true);

-- liga o realtime na tabela (sem duplicar se ja estiver ligado)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
