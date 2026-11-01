-- hx generated 261101-135200-001 — transactional allow/deny integration test.
-- Run through an operator SQL connection after the two migrations.
-- Fixtures and any unexpectedly permitted writes are rolled back.
begin;

insert into public.sites (owner_id, slug, title, home_page_slug, is_public)
select id, 'policy-private-site', 'Private fixture', 'private', false
from public.owners where slug = 'desmond';

insert into public.site_sources (site_id, kind, source_key, source_ref, label, is_public)
select id, 'markdown', 'policy-private-site-source', 'fixture', 'Private site source', true
from public.sites where slug = 'policy-private-site';

insert into public.site_sources (site_id, kind, source_key, source_ref, label, is_public)
select id, 'markdown', 'policy-private-source', 'fixture', 'Private source', false
from public.sites where slug = 'hlc';

insert into public.pages (site_id, source_id, source_page_id, slug, title, is_public)
select site_id, id, 'policy-private-ancestor', 'policy-private-ancestor', 'Private ancestor', true
from public.site_sources where source_key in ('policy-private-site-source', 'policy-private-source');

insert into public.pages (site_id, source_id, source_page_id, slug, title, is_public)
select site_id, id, 'policy-private-page', 'policy-private-page', 'Private page', false
from public.site_sources where source_key = 'hlc-markdown';

insert into public.page_aliases (site_id, page_id, path)
select site_id, id, '/policy-' || id::text from public.pages where source_page_id like 'policy-%';

set local role anon;

do $tests$
declare
  statement text;
  denied boolean;
  visible_count integer;
begin
  select count(*) into visible_count from public.sites;
  if visible_count <> 2 then raise exception 'Public sites read expected 2, got %', visible_count; end if;
  select count(*) into visible_count from public.site_sources;
  if visible_count <> 2 then raise exception 'Source visibility leaked a private ancestor'; end if;
  select count(*) into visible_count from public.pages;
  if visible_count <> 36 then raise exception 'Page visibility leaked a private site/source/page'; end if;
  select count(*) into visible_count from public.page_aliases;
  if visible_count <> 141 then raise exception 'Alias visibility leaked a private page'; end if;

  denied := false;
  begin
    perform id from public.owners;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Private owners SELECT was permitted'; end if;

  -- Every payload is otherwise valid and targets a real row or valid parent.
  -- Only insufficient_privilege counts as a pass; constraints are not accepted as protection.
  foreach statement in array array[
    $q$insert into public.owners (slug, display_name) values ('policy-added-owner', 'Unauthorized')$q$,
    $q$update public.owners set display_name = display_name where slug = 'desmond'$q$,
    $q$delete from public.owners where slug = 'policy-does-not-exist'$q$,
    $q$insert into public.sites (owner_id, slug, title, home_page_slug) select owner_id, 'policy-added-site', 'Unauthorized', 'home' from public.sites where slug = 'hlc'$q$,
    $q$update public.sites set title = title where slug = 'hlc'$q$,
    $q$delete from public.sites where slug = 'policy-does-not-exist'$q$,
    $q$insert into public.site_sources (site_id, kind, source_key, source_ref, label) select id, 'markdown', 'policy-added-source', 'fixture', 'Unauthorized' from public.sites where slug = 'hlc'$q$,
    $q$update public.site_sources set label = label where source_key = 'hlc-markdown'$q$,
    $q$delete from public.site_sources where source_key = 'policy-does-not-exist'$q$,
    $q$insert into public.pages (site_id, source_id, source_page_id, slug, title) select site_id, id, 'policy-added-page', 'policy-added-page', 'Unauthorized' from public.site_sources where source_key = 'hlc-markdown'$q$,
    $q$update public.pages set title = title where source_page_id = 'home'$q$,
    $q$delete from public.pages where source_page_id = '52203993'$q$,
    $q$insert into public.page_aliases (site_id, page_id, path) select site_id, id, '/policy-added-alias' from public.pages where source_page_id = 'home'$q$,
    $q$update public.page_aliases set path = path where path = '/barthes'$q$,
    $q$delete from public.page_aliases where path = '/barthes'$q$
  ] loop
    denied := false;
    begin
      execute statement;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'Client write unexpectedly permitted: %', statement; end if;
  end loop;
end;
$tests$;

reset role;

set local role authenticated;

do $tests$
declare
  statement text;
  denied boolean;
  visible_count integer;
begin
  select count(*) into visible_count from public.sites;
  if visible_count <> 2 then raise exception 'Public sites read expected 2, got %', visible_count; end if;
  select count(*) into visible_count from public.site_sources;
  if visible_count <> 2 then raise exception 'Source visibility leaked a private ancestor'; end if;
  select count(*) into visible_count from public.pages;
  if visible_count <> 36 then raise exception 'Page visibility leaked a private site/source/page'; end if;
  select count(*) into visible_count from public.page_aliases;
  if visible_count <> 141 then raise exception 'Alias visibility leaked a private page'; end if;

  denied := false;
  begin
    perform id from public.owners;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Private owners SELECT was permitted'; end if;

  -- Every payload is otherwise valid and targets a real row or valid parent.
  -- Only insufficient_privilege counts as a pass; constraints are not accepted as protection.
  foreach statement in array array[
    $q$insert into public.owners (slug, display_name) values ('policy-added-owner', 'Unauthorized')$q$,
    $q$update public.owners set display_name = display_name where slug = 'desmond'$q$,
    $q$delete from public.owners where slug = 'policy-does-not-exist'$q$,
    $q$insert into public.sites (owner_id, slug, title, home_page_slug) select owner_id, 'policy-added-site', 'Unauthorized', 'home' from public.sites where slug = 'hlc'$q$,
    $q$update public.sites set title = title where slug = 'hlc'$q$,
    $q$delete from public.sites where slug = 'policy-does-not-exist'$q$,
    $q$insert into public.site_sources (site_id, kind, source_key, source_ref, label) select id, 'markdown', 'policy-added-source', 'fixture', 'Unauthorized' from public.sites where slug = 'hlc'$q$,
    $q$update public.site_sources set label = label where source_key = 'hlc-markdown'$q$,
    $q$delete from public.site_sources where source_key = 'policy-does-not-exist'$q$,
    $q$insert into public.pages (site_id, source_id, source_page_id, slug, title) select site_id, id, 'policy-added-page', 'policy-added-page', 'Unauthorized' from public.site_sources where source_key = 'hlc-markdown'$q$,
    $q$update public.pages set title = title where source_page_id = 'home'$q$,
    $q$delete from public.pages where source_page_id = '52203993'$q$,
    $q$insert into public.page_aliases (site_id, page_id, path) select site_id, id, '/policy-added-alias' from public.pages where source_page_id = 'home'$q$,
    $q$update public.page_aliases set path = path where path = '/barthes'$q$,
    $q$delete from public.page_aliases where path = '/barthes'$q$
  ] loop
    denied := false;
    begin
      execute statement;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'Client write unexpectedly permitted: %', statement; end if;
  end loop;
end;
$tests$;

reset role;

rollback;
select 'passed' as access_test,
  'anon and authenticated: public reads, private hierarchy filtered, owner reads denied, all writes denied' as checks,
  'rolled back' as fixtures;
