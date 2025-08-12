-- Satsang (group chat) schema and RLS

-- Tables
create table if not exists public.satsang_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  title text,
  presenter_name text,
  description text,
  is_public boolean default true,
  created_at timestamptz default now()
);

-- Backfill/ensure nullable columns exist and defaults are handled
alter table public.satsang_rooms add column if not exists title text;
alter table public.satsang_rooms add column if not exists presenter_name text;
alter table public.satsang_rooms add column if not exists scheduled_at timestamptz;
alter table public.satsang_rooms add column if not exists scheduled_end_at timestamptz;
alter table public.satsang_rooms add column if not exists invite_url text;
-- Optional timezone name for display (IANA tz like 'Asia/Kolkata')
alter table public.satsang_rooms add column if not exists time_zone text;

update public.satsang_rooms set title = coalesce(title, name, 'Satsang') where title is null;
update public.satsang_rooms set presenter_name = coalesce(presenter_name, 'Host') where presenter_name is null;

alter table public.satsang_rooms alter column title set not null;
alter table public.satsang_rooms alter column presenter_name set not null;

create table if not exists public.satsang_members (
  room_id uuid not null references public.satsang_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'listener' check (role in ('listener','speaker','moderator','cohost','host')),
  joined_at timestamptz default now(),
  primary key (room_id, user_id)
);

create table if not exists public.satsang_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.satsang_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- Triggers to stamp owner_id/user_id and auto-add owner membership
create or replace function public.set_owner_id_from_auth()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.owner_id is null then new.owner_id := auth.uid(); end if;
  return new;
end;$$;

create or replace function public.set_user_id_from_auth()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.user_id is null then new.user_id := auth.uid(); end if;
  return new;
end;$$;

create or replace function public.add_owner_membership()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.satsang_members(room_id, user_id, role)
  values (new.id, new.owner_id, 'host')
  on conflict (room_id, user_id) do update set role = excluded.role;
  return new;
end;$$;

drop trigger if exists set_uid_satsang_rooms on public.satsang_rooms;
drop trigger if exists set_owner_uid on public.satsang_rooms;
create trigger set_owner_uid before insert on public.satsang_rooms for each row execute function public.set_owner_id_from_auth();

drop trigger if exists trg_add_owner_membership on public.satsang_rooms;
create trigger trg_add_owner_membership after insert on public.satsang_rooms for each row execute function public.add_owner_membership();

drop trigger if exists set_uid_satsang_members on public.satsang_members;
create trigger set_uid_satsang_members before insert on public.satsang_members for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_uid_satsang_messages on public.satsang_messages;
create trigger set_uid_satsang_messages before insert on public.satsang_messages for each row execute function public.set_user_id_from_auth();

-- Helper functions to avoid policy recursion
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.satsang_members sm
    where sm.room_id = p_room_id and sm.user_id = auth.uid()
  );
$$;

create or replace function public.can_join_room(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.satsang_rooms r
    where r.id = p_room_id and (r.is_public = true or r.owner_id = auth.uid())
  );
$$;

-- RLS
alter table public.satsang_rooms enable row level security;
alter table public.satsang_members enable row level security;
alter table public.satsang_messages enable row level security;

-- Rooms: visible if public or member; insert only by owner (owner_id = auth.uid())
drop policy if exists satsang_rooms_select on public.satsang_rooms;
drop policy if exists satsang_rooms_select on public.satsang_rooms;
create policy satsang_rooms_select on public.satsang_rooms for select using (
  is_public = true OR owner_id = auth.uid() OR public.is_room_member(id)
);

drop policy if exists satsang_rooms_insert on public.satsang_rooms;
drop policy if exists satsang_rooms_insert on public.satsang_rooms;
create policy satsang_rooms_insert on public.satsang_rooms
for insert
with check (auth.uid() = owner_id);

drop policy if exists satsang_rooms_update on public.satsang_rooms;
drop policy if exists satsang_rooms_update on public.satsang_rooms;
create policy satsang_rooms_update on public.satsang_rooms
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists satsang_rooms_delete on public.satsang_rooms;
create policy satsang_rooms_delete on public.satsang_rooms for delete using (owner_id = auth.uid());

-- Members: user manages own membership; can join public rooms
drop policy if exists satsang_members_select on public.satsang_members;
create policy satsang_members_select on public.satsang_members for select using (user_id = auth.uid());

drop policy if exists satsang_members_insert on public.satsang_members;
create policy satsang_members_insert on public.satsang_members for insert with check (
  user_id = auth.uid() and public.can_join_room(room_id)
);

drop policy if exists satsang_members_delete on public.satsang_members;
create policy satsang_members_delete on public.satsang_members for delete using (user_id = auth.uid());

drop policy if exists satsang_members_update on public.satsang_members;
create policy satsang_members_update on public.satsang_members for update
using (
  -- self can update own membership (raise hand, leave stage, etc.)
  user_id = auth.uid()
  or exists (
    select 1 from public.satsang_members mm
    where mm.room_id = room_id and mm.user_id = auth.uid() and mm.role in ('host','cohost','moderator')
  )
) with check (
  -- managers can update others in same room
  user_id = auth.uid()
  or exists (
    select 1 from public.satsang_members mm
    where mm.room_id = room_id and mm.user_id = auth.uid() and mm.role in ('host','cohost','moderator')
  )
);

-- Evolve existing tables if pre-existing with older role set
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='satsang_members' and column_name='role') then
    -- drop old check if present
    begin
      alter table public.satsang_members drop constraint if exists satsang_members_role_check;
    exception when others then null; end;
    alter table public.satsang_members add constraint satsang_members_role_check check (role in ('listener','speaker','moderator','cohost','host'));
    alter table public.satsang_members alter column role set default 'listener';
  end if;
end $$;

-- Add stage-related columns if missing
alter table public.satsang_members add column if not exists is_on_stage boolean default false;
alter table public.satsang_members add column if not exists is_muted boolean default false;
alter table public.satsang_members add column if not exists hand_raised_at timestamptz;
alter table public.satsang_members add column if not exists invited_to_stage_at timestamptz;
alter table public.satsang_members add column if not exists invited_by uuid references auth.users(id);

-- Messages: only members can read/write
drop policy if exists satsang_messages_select on public.satsang_messages;
create policy satsang_messages_select on public.satsang_messages for select using (
  exists (
    select 1 from public.satsang_members sm where sm.room_id = room_id and sm.user_id = auth.uid()
  )
);

drop policy if exists satsang_messages_insert on public.satsang_messages;
create policy satsang_messages_insert on public.satsang_messages for insert with check (
  exists (
    select 1 from public.satsang_members sm
    where sm.room_id = room_id
      and sm.user_id = auth.uid()
      and sm.role in ('speaker','moderator','cohost','host')
  )
);

-- Storage: bucket for Satsang recordings and RLS
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'satsang-recordings') then
    insert into storage.buckets (id, name, public) values ('satsang-recordings','satsang-recordings', false);
  end if;
end $$;

-- Drop existing storage policies if any
drop policy if exists satrec_select on storage.objects;
drop policy if exists satrec_insert on storage.objects;
drop policy if exists satrec_delete on storage.objects;

create policy satrec_select on storage.objects
for select using (
  bucket_id = 'satsang-recordings'
  and exists (
    select 1 from public.satsang_members sm
    where sm.room_id = (split_part(name, '/', 1))::uuid
      and sm.user_id = auth.uid()
  )
);

-- Aggregation helpers (security definer) for member counts and recording counts
create or replace function public.room_member_counts()
returns table(room_id uuid, speakers integer, listeners integer)
language sql
security definer
set search_path = public
as $$
  select
    room_id,
    sum(case when role <> 'listener' then 1 else 0 end)::int as speakers,
    sum(case when role = 'listener' then 1 else 0 end)::int as listeners
  from public.satsang_members
  group by room_id
$$;

create or replace function public.room_recording_counts()
returns table(room_id uuid, rec_count integer)
language sql
security definer
set search_path = public
as $$
  select
    (split_part(name, '/', 1))::uuid as room_id,
    count(*)::int as rec_count
  from storage.objects
  where bucket_id = 'satsang-recordings'
  group by 1
$$;

create policy satrec_insert on storage.objects
for insert with check (
  bucket_id = 'satsang-recordings'
  and exists (
    select 1 from public.satsang_members sm
    where sm.room_id = (split_part(name, '/', 1))::uuid
      and sm.user_id = auth.uid()
      and sm.role in ('host','cohost')
  )
);

create policy satrec_delete on storage.objects
for delete using (
  bucket_id = 'satsang-recordings'
  and exists (
    select 1 from public.satsang_members sm
    where sm.room_id = (split_part(name, '/', 1))::uuid
      and sm.user_id = auth.uid()
      and sm.role in ('host','cohost')
  )
);


