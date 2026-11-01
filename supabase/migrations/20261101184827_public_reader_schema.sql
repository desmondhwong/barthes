-- hx generated 261101-134616-001 — Barthes public reader metadata, author desmond.
-- Authoring content and browser reading state remain outside these tables.

create table public.owners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null,
  arena_user_id bigint unique,
  created_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  description text not null default '',
  home_page_slug text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index sites_owner_id_idx on public.sites(owner_id);

create table public.site_sources (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id),
  kind text not null check (kind in ('markdown', 'arena')),
  source_key text not null,
  source_ref text not null,
  label text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  unique (site_id, source_key),
  unique (id, site_id)
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id),
  source_id uuid not null,
  source_page_id text not null,
  slug text not null check (length(slug) > 0 and slug !~ '[/#?]'),
  title text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (source_id, site_id) references public.site_sources(id, site_id),
  unique (source_id, source_page_id),
  unique (site_id, slug),
  unique (id, site_id)
);

create table public.page_aliases (
  site_id uuid not null references public.sites(id),
  page_id uuid not null,
  path text not null check (path like '/%' and path !~ '[?#]'),
  primary key (site_id, path),
  foreign key (page_id, site_id) references public.pages(id, site_id)
);
create index page_aliases_page_id_idx on public.page_aliases(page_id, site_id);

alter table public.owners enable row level security;
alter table public.sites enable row level security;
alter table public.site_sources enable row level security;
alter table public.pages enable row level security;
alter table public.page_aliases enable row level security;

-- Owner metadata is operator-only. No owner SELECT policy or client grant exists.
revoke all on public.owners, public.sites, public.site_sources,
  public.pages, public.page_aliases from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.sites, public.site_sources, public.pages,
  public.page_aliases to anon, authenticated;

create policy public_sites_read on public.sites
  for select to anon, authenticated using (is_public);

create policy public_sources_read on public.site_sources
  for select to anon, authenticated using (
    is_public and exists (
      select 1 from public.sites s where s.id = site_sources.site_id and s.is_public
    )
  );

create policy public_pages_read on public.pages
  for select to anon, authenticated using (
    is_public and exists (
      select 1 from public.site_sources source
      where source.id = pages.source_id and source.site_id = pages.site_id
    )
  );

create policy public_aliases_read on public.page_aliases
  for select to anon, authenticated using (
    exists (
      select 1 from public.pages page
      where page.id = page_aliases.page_id and page.site_id = page_aliases.site_id
    )
  );

comment on table public.owners is 'Operator-maintained attribution identity; not application authentication. No client reads.';
comment on table public.pages is 'Optional URL mappings only; source adapters can render newly discovered pages without inserting a row.';
comment on table public.site_sources is 'Intentionally public source identifiers only. Never store tokens, local paths, or private configuration here.';
