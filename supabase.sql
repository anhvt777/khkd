-- INSTALLER v3.2 (schema + RLS) — safe to run multiple times
create extension if not exists pgcrypto;

-- PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text check (role in ('member','manager','admin')) default 'member',
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_self_or_manager" on public.profiles;
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_manager" on public.profiles for select to authenticated using ( id = auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin')) );
create policy "profiles_update_self_or_admin" on public.profiles for update to authenticated using ( id = auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role = 'admin') ) with check ( id = auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role = 'admin') );

-- SPACES + MEMBERS
create table if not exists public.spaces ( id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz default now() );
alter table public.spaces enable row level security;

create table if not exists public.space_members (
  space_id uuid references public.spaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text check (role in ('viewer','member','manager','admin')) not null default 'member',
  created_at timestamptz default now(),
  primary key (space_id, user_id)
);
alter table public.space_members enable row level security;

drop policy if exists "spaces_read_members_or_admin" on public.spaces;
drop policy if exists "spaces_insert_manager" on public.spaces;
drop policy if exists "space_members_select_self_or_space_manager" on public.space_members;
drop policy if exists "space_members_insert_space_manager" on public.space_members;
drop policy if exists "space_members_delete_space_manager" on public.space_members;

create policy "spaces_read_members_or_admin" on public.spaces for select to authenticated using (
  exists (select 1 from public.space_members sm where sm.space_id = spaces.id and sm.user_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
);
create policy "spaces_insert_manager" on public.spaces for insert to authenticated with check ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin')) );

create policy "space_members_select_self_or_space_manager" on public.space_members for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.space_members sm2 where sm2.space_id = space_members.space_id and sm2.user_id = auth.uid() and sm2.role in ('manager','admin'))
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
);
create policy "space_members_insert_space_manager" on public.space_members for insert to authenticated with check (
  exists (select 1 from public.space_members sm2 where sm2.space_id = space_members.space_id and sm2.user_id = auth.uid() and sm2.role in ('manager','admin'))
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
);
create policy "space_members_delete_space_manager" on public.space_members for delete to authenticated using (
  exists (select 1 from public.space_members sm2 where sm2.space_id = space_members.space_id and sm2.user_id = auth.uid() and sm2.role in ('manager','admin'))
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
);

-- FOLDERS / LISTS
create table if not exists public.folders ( id uuid primary key default gen_random_uuid(), space_id uuid not null references public.spaces(id) on delete cascade, name text not null, created_at timestamptz default now() );
alter table public.folders enable row level security;
create table if not exists public.lists ( id uuid primary key default gen_random_uuid(), folder_id uuid not null references public.folders(id) on delete cascade, name text not null, created_at timestamptz default now() );
alter table public.lists enable row level security;

drop policy if exists "folders_read_members_or_admin" on public.folders;
drop policy if exists "folders_insert_manager" on public.folders;
drop policy if exists "lists_read_members_or_admin" on public.lists;
drop policy if exists "lists_insert_manager" on public.lists;

create policy "folders_read_members_or_admin" on public.folders for select to authenticated using (
  exists (select 1 from public.space_members sm where sm.space_id = folders.space_id and sm.user_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
);
create policy "folders_insert_manager" on public.folders for insert to authenticated with check (
  exists (select 1 from public.space_members sm where sm.space_id = folders.space_id and sm.user_id = auth.uid() and sm.role in ('manager','admin'))
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
);
create policy "lists_read_members_or_admin" on public.lists for select to authenticated using (
  exists (select 1 from public.folders f join public.space_members sm on sm.space_id = f.space_id where f.id = lists.folder_id and sm.user_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
);
create policy "lists_insert_manager" on public.lists for insert to authenticated with check (
  exists (select 1 from public.folders f join public.space_members sm on sm.space_id = f.space_id where f.id = lists.folder_id and sm.user_id = auth.uid() and sm.role in ('manager','admin'))
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
);

-- GOALS
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references public.lists(id) on delete cascade,
  name text not null,
  target_points int not null default 0,
  period_type text check (period_type in ('week','month')) not null,
  period_key text not null,
  created_at timestamptz default now()
);
alter table public.goals enable row level security;
drop policy if exists "goals_read_members_or_admin" on public.goals;
drop policy if exists "goals_insert_space_manager" on public.goals;
create policy "goals_read_members_or_admin" on public.goals for select to authenticated using (
  exists (select 1 from public.lists l join public.folders f on f.id=l.folder_id join public.space_members sm on sm.space_id=f.space_id where l.id = goals.list_id and sm.user_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
);
create policy "goals_insert_space_manager" on public.goals for insert to authenticated with check (
  exists (select 1 from public.lists l join public.folders f on f.id=l.folder_id join public.space_members sm on sm.space_id=f.space_id where l.id = goals.list_id and sm.user_id = auth.uid() and sm.role in ('manager','admin'))
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
);

-- TASKS
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references public.lists(id) on delete cascade,
  title text not null,
  assignee uuid references public.profiles(id) on delete set null,
  due_date date not null,
  status text check (status in ('todo','doing','done')) default 'todo',
  points int default 0,
  note text,
  repeat text check (repeat in ('none','daily','weekly','monthly')) default 'none',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  done_at timestamptz
);
alter table public.tasks enable row level security;
drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_select" on public.tasks for select to authenticated
using (
  assignee = auth.uid()
  or created_by = auth.uid()
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
  or exists (select 1 from public.lists l join public.folders f on f.id = l.folder_id join public.space_members sm on sm.space_id = f.space_id where l.id = tasks.list_id and sm.user_id = auth.uid())
);
create policy "tasks_insert" on public.tasks for insert to authenticated with check (
  created_by = auth.uid()
  and exists (select 1 from public.lists l join public.folders f on f.id=l.folder_id join public.space_members sm on sm.space_id=f.space_id where l.id = tasks.list_id and sm.user_id=auth.uid())
);
create policy "tasks_update" on public.tasks for update to authenticated
using (
  assignee = auth.uid()
  or created_by = auth.uid()
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
  or exists (select 1 from public.lists l join public.folders f on f.id=l.folder_id join public.space_members sm on sm.space_id=f.space_id where l.id = tasks.list_id and sm.user_id=auth.uid())
)
with check (
  assignee = auth.uid()
  or created_by = auth.uid()
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
  or exists (select 1 from public.lists l join public.folders f on f.id=l.folder_id join public.space_members sm on sm.space_id=f.space_id where l.id = tasks.list_id and sm.user_id=auth.uid())
);
create policy "tasks_delete" on public.tasks for delete to authenticated
using (
  assignee = auth.uid()
  or created_by = auth.uid()
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('manager','admin'))
  or exists (select 1 from public.lists l join public.folders f on f.id=l.folder_id join public.space_members sm on sm.space_id=f.space_id where l.id = tasks.list_id and sm.user_id=auth.uid())
);

-- Realtime publication (ignore if already added)
do $$ begin
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when others then
    null;
  end;
end $$;
