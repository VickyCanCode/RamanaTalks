-- Auth-first setup: triggers to stamp user_id, strict RLS, and NOT NULL constraints

-- 1) Stamp user_id automatically from JWT (auth.uid())
create or replace function public.set_user_id_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_uid_conversations on public.conversations;
create trigger set_uid_conversations
before insert on public.conversations
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_uid_messages on public.messages;
create trigger set_uid_messages
before insert on public.messages
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_uid_message_feedback on public.message_feedback;
create trigger set_uid_message_feedback
before insert on public.message_feedback
for each row execute function public.set_user_id_from_auth();

-- 2) Clean up anonymous legacy rows so NOT NULL can be enforced safely
delete from public.message_feedback mf
using public.messages m, public.conversations c
where mf.message_id = m.id and m.conversation_id = c.id
  and (mf.user_id is null or m.user_id is null or c.user_id is null);

delete from public.messages m
using public.conversations c
where m.conversation_id = c.id and (m.user_id is null or c.user_id is null);

delete from public.conversations where user_id is null;

-- 3) Enforce NOT NULL on user_id now that data is clean
alter table public.conversations alter column user_id set not null;
alter table public.messages alter column user_id set not null;
alter table public.message_feedback alter column user_id set not null;

-- 4) Strict RLS policies (owner-only)
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_feedback enable row level security;

-- Drop any permissive/legacy policies by known names
drop policy if exists conversations_select on public.conversations;
drop policy if exists conversations_insert on public.conversations;
drop policy if exists conversations_update on public.conversations;
drop policy if exists conversations_delete on public.conversations;

drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;

drop policy if exists message_feedback_insert on public.message_feedback;

-- Conversations: user can only read/write own rows
create policy conversations_select_own on public.conversations
  for select using (auth.uid() = user_id);

create policy conversations_insert_owner on public.conversations
  for insert with check (auth.uid() = user_id or user_id is null);

create policy conversations_update_own on public.conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy conversations_delete_own on public.conversations
  for delete using (auth.uid() = user_id);

-- Messages: allowed only when parent conversation is owned by user
create policy messages_select_own on public.messages
  for select using (
    exists (
      select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy messages_insert_owner on public.messages
  for insert with check (
    exists (
      select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy messages_update_own on public.messages
  for update using (
    exists (
      select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy messages_delete_own on public.messages
  for delete using (
    exists (
      select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- Feedback: allowed only for messages in user's conversations
create policy message_feedback_select_own on public.message_feedback
  for select using (
    exists (
      select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.id = message_id and c.user_id = auth.uid()
    )
  );

create policy message_feedback_insert_owner on public.message_feedback
  for insert with check (
    exists (
      select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.id = message_id and c.user_id = auth.uid()
    )
  );

create policy message_feedback_update_own on public.message_feedback
  for update using (
    exists (
      select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.id = message_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.id = message_id and c.user_id = auth.uid()
    )
  );

create policy message_feedback_delete_own on public.message_feedback
  for delete using (
    exists (
      select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.id = message_id and c.user_id = auth.uid()
    )
  );


