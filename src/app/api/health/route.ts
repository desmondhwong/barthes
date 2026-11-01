// hx generated — read-only runtime verification, with no keys or database internals returned.
import { checkDatabaseConnection } from '@/lib/database';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const result = await checkDatabaseConnection();
    return Response.json({ status: 'ok', database: result.ok ? 'connected' : 'unavailable', sites: result.siteSlugs, commit: process.env.VERCEL_GIT_COMMIT_SHA || null, environment: process.env.VERCEL_ENV || 'local' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable', database: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
