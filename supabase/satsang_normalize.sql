-- Normalize satsang_members roles and constraints; idempotent
begin;

-- 1) Drop ALL existing CHECK constraints first (name-agnostic)
do $$
declare c text;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.satsang_members'::regclass and contype = 'c'
  loop
    execute format('alter table public.satsang_members drop constraint %I', c);
  end loop;
end $$;

-- 2) Map legacy roles to new set while no CHECK is present
update public.satsang_members set role = 'host'     where role in ('owner');
update public.satsang_members set role = 'listener' where role in ('member');
update public.satsang_members
set role = 'listener'
where role is null or role not in ('listener','speaker','moderator','cohost','host');

-- 3) Ensure default going forward
alter table public.satsang_members alter column role set default 'listener';

-- 4) Recreate strict role CHECK
alter table public.satsang_members
  add constraint satsang_members_role_check
  check (role in ('listener','speaker','moderator','cohost','host'));

commit;

-- 5) Refresh PostgREST schema cache
notify pgrst, 'reload schema';


