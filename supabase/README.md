> hx generated 261101-135000-001 current — Barthes development database schema and verification

The existing `barthes` Supabase project is `zqiwvslkjggofcosbvpj`, in organization `authentic`. These migrations hold public reader configuration and URL mappings. Markdown and Are.na remain the content sources; browser reading state remains local.

The checked-in migration versions match the versions assigned by the Supabase migration tool. Both migrations were applied to the existing development project. `verification.json` records their source hashes and the observed policy tests.

- `owners` is operator-only attribution metadata. Its lack of a SELECT policy is intentional; the Supabase advisor reports this as an informational notice.
- `sites`, `site_sources`, `pages`, and `page_aliases` expose only rows in the explicitly public hierarchy. Client roles have SELECT only, with RLS enabled.
- Page mappings are optional overrides. New public Are.na blocks can use their stable block IDs without requiring runtime database writes.
- The schema contains no document bodies, credentials, user login, or application administration interface.

Apply migrations in filename order through an operator connection. Do not run them again against a database where their recorded versions are already applied. Future changes belong in a new migration. The application reads using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; neither value belongs in this directory.

Run `tests/public_reader_access.sql` through the operator SQL connection after applying the migrations. It creates temporary-in-transaction private fixtures, checks both client roles, and rolls back all fixtures. Its checks accept only PostgreSQL `insufficient_privilege` as proof of a denied write, so a foreign-key or uniqueness failure cannot produce a false pass. The final result is `access_test: passed` only after all assertions succeed. This script assumes the initial two-site seed; update expected counts deliberately when the public catalog changes.

Run the deterministic TypeScript tests with `node --import tsx --test tests/database/*.test.ts` from the repository root. Application runtime verification remains a separate check: a successful operator SQL test alone does not establish Vercel-to-Supabase connectivity.
