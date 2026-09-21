import Link from 'next/link';
import { requireTeacher, requireOwnedClass } from '@/lib/auth/require';
import { query } from '@/lib/db/client';
import { AssignForm } from './assign-form';

export const dynamic = 'force-dynamic';

export default async function AssignPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const teacherId = await requireTeacher();
  const klass = await requireOwnedClass(teacherId, classId);

  const skills = await query<{ slug: string; name: string; unit_label: string | null }>(
    `SELECT sk.slug, sk.name, cs.unit_label
       FROM skill sk
       JOIN course_skill cs ON cs.skill_id = sk.id
       JOIN course co ON co.id = cs.course_id
      WHERE co.slug = $1 AND sk.is_leaf
      ORDER BY cs.sequence_index`, [klass.course_slug]);

  const studentCount = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM enrollment
      WHERE class_id = $1 AND removed_at IS NULL`, [classId]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href={`/teacher/${classId}`} className="text-sm text-neutral-500 underline underline-offset-4">
        ← {klass.name}
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">New assignment</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Goes to all {studentCount[0]?.n ?? 0} students. Anyone whose confirmed chips differ gets
        their own draw from the same bank — same skills, different difficulty or length.
      </p>

      <AssignForm classId={classId} skills={skills} />
    </main>
  );
}
