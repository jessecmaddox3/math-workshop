-- Optional cloud saves, schema v1. Apply to a NEW Supabase project.
-- No original personal tables or data are needed or migrated.
begin;

create table public.learning_profiles (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create table public.learning_saves (
  owner_id uuid not null default auth.uid(),
  profile_id uuid not null,
  game_id text not null check (game_id in ('colors','target','areamaze','morphology','subitize','blend','letters','path')),
  curriculum_id text not null check (char_length(curriculum_id) between 1 and 100),
  format_version integer not null check (format_version between 1 and 10000),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 1048576),
  revision bigint not null default 1 check (revision > 0),
  write_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, profile_id, game_id, curriculum_id),
  foreign key (owner_id, profile_id) references public.learning_profiles(owner_id, id) on delete cascade
);

alter table public.learning_profiles enable row level security;
alter table public.learning_saves enable row level security;
revoke all on public.learning_profiles, public.learning_saves from public, anon, authenticated;
grant select, insert, update, delete on public.learning_profiles, public.learning_saves to authenticated;

create policy own_learning_profiles on public.learning_profiles to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy own_learning_saves on public.learning_saves to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create function public.learning_save_revision() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if TG_OP = 'INSERT' then
    NEW.revision := 1;
  else
    if (NEW.owner_id, NEW.profile_id, NEW.game_id, NEW.curriculum_id)
      is distinct from (OLD.owner_id, OLD.profile_id, OLD.game_id, OLD.curriculum_id) then
      raise exception 'A learning save cannot change its owner or identity';
    end if;
    if NEW.write_id = OLD.write_id then
      raise exception 'Each new write needs a new write ID';
    end if;
    NEW.revision := OLD.revision + 1;
  end if;
  NEW.updated_at := clock_timestamp();
  return NEW;
end;
$$;
revoke all on function public.learning_save_revision() from public, anon, authenticated;
create trigger learning_save_revision before insert or update on public.learning_saves
  for each row execute function public.learning_save_revision();

create function public.learning_profile_identity() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if TG_OP = 'INSERT' then
    NEW.created_at := clock_timestamp();
  elsif (NEW.owner_id, NEW.id, NEW.created_at) is distinct from (OLD.owner_id, OLD.id, OLD.created_at) then
    raise exception 'A learning profile can only change its label';
  end if;
  return NEW;
end;
$$;
revoke all on function public.learning_profile_identity() from public, anon, authenticated;
create trigger learning_profile_identity before insert or update on public.learning_profiles
  for each row execute function public.learning_profile_identity();

commit;
