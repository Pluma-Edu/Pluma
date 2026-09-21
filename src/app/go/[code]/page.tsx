import { notFound } from 'next/navigation';
import { findClassByCode, rosterForPicker } from '@/lib/classroom/student';
import { NamePicker } from './name-picker';

export const dynamic = 'force-dynamic';

export default async function PickPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const klass = await findClassByCode(code);
  if (!klass) notFound();

  const roster = await rosterForPicker(klass.id);

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-lg font-semibold tracking-tight">{klass.name}</h1>
      <p className="mt-1 text-sm text-neutral-600">Find your name.</p>
      <NamePicker code={code.toUpperCase()} roster={roster} />
    </main>
  );
}
