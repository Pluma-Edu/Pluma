import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Pluma</h1>
      <p className="mt-3 text-neutral-600">
        Phase 0. One item bank, one validator, one print renderer.
      </p>
      <Link href="/proof" className="mt-6 inline-block underline underline-offset-4">
        Open the proof page
      </Link>
    </main>
  );
}
