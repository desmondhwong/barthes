'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <main className="fallback"><h1>The reader could not load</h1><p>The source may be temporarily unavailable. Your saved exploration has not been cleared.</p><button onClick={reset}>Try again</button><p><a href="/s/hlc">HLC field notes</a></p></main>;
}
