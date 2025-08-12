-- Retention policy: keep conversations/messages for 15 days

-- Ensure activity tracking column exists
alter table if exists public.conversations
  add column if not exists last_activity_at timestamptz not null default now();

create index if not exists conversations_last_activity_idx on public.conversations (last_activity_at);

-- Add expires_at columns as regular columns (not generated) to avoid immutability restrictions
alter table if exists public.conversations
  add column if not exists expires_at timestamptz;

alter table if exists public.messages
  add column if not exists expires_at timestamptz default (now() + interval '15 days');

-- message_feedback may not exist yet in some deployments; guard with DO block
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'message_feedback'
  ) then
    execute 'alter table public.message_feedback add column if not exists expires_at timestamptz default (now() + interval ''15 days'')';
  end if;
end $$;

create index if not exists messages_expires_idx on public.messages (expires_at);

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'message_feedback'
  ) then
    execute 'create index if not exists message_feedback_expires_idx on public.message_feedback (expires_at)';
  end if;
end $$;

create index if not exists conversations_expires_idx on public.conversations (expires_at);

-- Trigger to bump activity and recompute expires_at when new messages arrive
create or replace function public.set_conversation_activity()
returns trigger language plpgsql as $$
begin
  update public.conversations
     set last_activity_at = greatest(last_activity_at, now()),
         expires_at = greatest(last_activity_at, now()) + interval '15 days'
   where id = new.conversation_id;
  return new;
end; $$;

drop trigger if exists trg_messages_activity on public.messages;
create trigger trg_messages_activity
after insert on public.messages
for each row execute function public.set_conversation_activity();

-- Initialize expires_at for existing conversations
update public.conversations
   set expires_at = coalesce(expires_at, last_activity_at + interval '15 days');

-- Cleanup function using expires_at
create or replace function public.cleanup_expired_data()
returns void language plpgsql as $$
begin
  -- Delete feedback first (depends on messages)
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='message_feedback') then
    delete from public.message_feedback where expires_at < now();
  end if;
  -- Delete old messages
  delete from public.messages where expires_at < now();
  -- Delete expired conversations
  delete from public.conversations where expires_at < now();
end; $$;

-- Enable pg_cron and schedule nightly cleanup at 03:00 UTC
create extension if not exists pg_cron;
select cron.schedule('cleanup_expired_ramana_talks', '0 3 * * *', $$select public.cleanup_expired_data();$$);


