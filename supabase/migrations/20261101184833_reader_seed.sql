-- hx generated 261101-134616-002 — public reader source/URL mappings.
-- HLC identities and titles derive from the retained Sitemap 0.8 published corpus.
-- UUIDs are resolved by stable source keys; no generated IDs are hardcoded.

insert into public.owners (slug, display_name, arena_user_id)
values ('desmond', 'desmond', 2471);

insert into public.sites (owner_id, slug, title, description, home_page_slug, is_public)
select id, 'hlc', 'HLC field notes', 'A field guide to Holographic Linguistic Cosmography.', 'home', true
from public.owners where slug = 'desmond';

insert into public.sites (owner_id, slug, title, description, home_page_slug, is_public)
select id, 'barthes-test', 'Barthes test', 'Live public Are.na channel.', '52203993', true
from public.owners where slug = 'desmond';

insert into public.site_sources (site_id, kind, source_key, source_ref, label, is_public)
select id, 'markdown', 'hlc-markdown', 'hlc-1', 'HLC published adaptations', true
from public.sites where slug = 'hlc';

insert into public.site_sources (site_id, kind, source_key, source_ref, label, is_public)
select id, 'arena', 'arena-channel', '5946473', 'barthes-test', true
from public.sites where slug = 'barthes-test';

insert into public.pages (site_id, source_id, source_page_id, slug, title, is_public)
select source.site_id, source.id, page.source_page_id, page.slug, page.title, true
from public.site_sources source
join public.sites site on site.id = source.site_id
cross join (values
  ('home', 'home', 'A field guide to HLC'),
  ('critique/ideology-and-power', 'critique--ideology-and-power', 'Ideology and the shape of what is easy to say'),
  ('critique/novelty-and-evidence', 'critique--novelty-and-evidence', 'Novelty needs evidence'),
  ('critique/persona', 'critique--persona', 'Persona and the feeling of an interlocutor'),
  ('critique/recursive-loops', 'critique--recursive-loops', 'When reflection becomes a loop'),
  ('critique/technosolutionism', 'critique--technosolutionism', 'Can a telescope become a solution?'),
  ('extensions/multimodal', 'extensions--multimodal', 'Beyond text'),
  ('extensions/multiple-models', 'extensions--multiple-models', 'Comparing different instruments'),
  ('formats/mandala', 'formats--mandala', 'Mandala as a compact format'),
  ('formats/prose-and-maps', 'formats--prose-and-maps', 'Moving between prose and maps'),
  ('foundations/activation-field', 'foundations--activation-field', 'The activation field'),
  ('foundations/corpus-membrane', 'foundations--corpus-membrane', 'The corpus membrane'),
  ('foundations/cultural-hologram', 'foundations--cultural-hologram', 'The cultural hologram'),
  ('foundations/digital-trace', 'foundations--digital-trace', 'The digital trace'),
  ('foundations/language-and-reality', 'foundations--language-and-reality', 'Language and reality'),
  ('foundations/latent-manifold', 'foundations--latent-manifold', 'The latent manifold'),
  ('practice/epistemic-posture', 'practice--epistemic-posture', 'Epistemic posture'),
  ('practice/exercises/attractor-survey', 'practice--exercises--attractor-survey', 'Exercise: survey the familiar answers'),
  ('practice/exercises/boundary-search', 'practice--exercises--boundary-search', 'Exercise: search a boundary'),
  ('practice/exercises/integration', 'practice--exercises--integration', 'Integration: bring an idea back'),
  ('practice/lenses', 'practice--lenses', 'Choosing a lens'),
  ('practice/operators/composition', 'practice--operators--composition', 'Composition and the work of combining'),
  ('practice/operators/hyperrelation', 'practice--operators--hyperrelation', 'Looking across several relations at once'),
  ('practice/operators/recursion', 'practice--operators--recursion', 'Recursion as a working operator'),
  ('practice/operators/topological-thinking', 'practice--operators--topological-thinking', 'Following relationships through change'),
  ('practice/parallax', 'practice--parallax', 'Parallax through comparison'),
  ('practice/reindexing', 'practice--reindexing', 'Reindexing a question'),
  ('practice/telescope-protocol', 'practice--telescope-protocol', 'A small telescope protocol'),
  ('sources', 'sources', 'Sources and editorial approach'),
  ('start/reading-paths', 'start--reading-paths', 'Three ways through the field guide'),
  ('start/what-is-hlc', 'start--what-is-hlc', 'What is HLC?'),
  ('terrain/attractors', 'terrain--attractors', 'Attractors and familiar framings'),
  ('terrain/conceptual-exoplanets', 'terrain--conceptual-exoplanets', 'Conceptual exoplanets'),
  ('terrain/voids', 'terrain--voids', 'Voids and missing records')
) as page(source_page_id, slug, title)
where site.slug = 'hlc' and source.source_key = 'hlc-markdown';

insert into public.pages (site_id, source_id, source_page_id, slug, title, is_public)
select source.site_id, source.id, page.block_id, page.block_id, page.title, true
from public.site_sources source
join public.sites site on site.id = source.site_id
cross join (values ('52203993', 'Test block A'), ('52203995', 'Test block B')) as page(block_id, title)
where site.slug = 'barthes-test' and source.source_key = 'arena-channel';

insert into public.page_aliases (site_id, page_id, path)
select page.site_id, page.id, alias.path
from public.pages page
join public.sites site on site.id = page.site_id
cross join lateral (values
  ('/' || page.slug),
  ('/' || page.slug || '.html'),
  ('/barthes/' || page.slug),
  ('/barthes/' || page.slug || '.html')
) as alias(path)
where site.slug = 'hlc';

insert into public.page_aliases (site_id, page_id, path)
select page.site_id, page.id, alias.path
from public.pages page
join public.sites site on site.id = page.site_id
cross join (values ('/'), ('/index.html'), ('/barthes'), ('/barthes/'), ('/barthes/index.html')) as alias(path)
where site.slug = 'hlc' and page.source_page_id = 'home';
