-- Profiles RLS (owner write, public read for basic fields)
alter table if exists public.profiles enable row level security;

drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles
  for select
  using (true);

drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert on public.profiles
  for insert
  with check (id = auth.uid());

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());
-- RLS policies (safe defaults)

-- Conversations: allow read/insert/update/delete when user_id is null (anonymous) or matches auth.uid()
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (
    user_id is null or auth.uid() = user_id
  );

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert with check (
    user_id is null or auth.uid() = user_id
  );

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update using (
    user_id is null or auth.uid() = user_id
  ) with check (
    user_id is null or auth.uid() = user_id
  );

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
  for delete using (
    user_id is null or auth.uid() = user_id
  );

-- Messages: allow read/insert for messages whose parent conversation is owned by auth.uid() or anonymous
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_id is null or c.user_id = auth.uid())
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_id is null or c.user_id = auth.uid())
    )
  );

-- Feedback: allow insert if message belongs to a conversation owned by auth.uid() or anonymous
drop policy if exists message_feedback_insert on public.message_feedback;
create policy message_feedback_insert on public.message_feedback
  for insert with check (
    exists (
      select 1 from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_id and (c.user_id is null or c.user_id = auth.uid())
    )
  );


