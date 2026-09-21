import { redirect } from 'next/navigation';
import { currentAccountId } from './session.ts';
import { query } from '../db/client.ts';

export async function requireTeacher(): Promise<string> {
  const id = await currentAccountId();
  if (!id) redirect('/login');
  const rows = await query<{ id: string }>(
    `SELECT id FROM account WHERE id = $1 AND role = 'teacher' AND deleted_at IS NULL`, [id]);
  if (rows.length === 0) redirect('/login');
  return id;
}

/** Confirms this teacher owns this class before anything reads its students. */
export async function requireOwnedClass(teacherId: string, classId: string): Promise<{
  id: string; name: string; class_code: string; course_slug: string; course_name: string; require_pin: boolean;
}> {
  const rows = await query<{
    id: string; name: string; class_code: string; course_slug: string; course_name: string; require_pin: boolean;
  }>(
    `SELECT c.id, c.name, c.class_code, c.require_pin, co.slug AS course_slug, co.name AS course_name
       FROM class c JOIN course co ON co.id = c.course_id
      WHERE c.id = $1 AND c.teacher_account_id = $2 AND c.archived_at IS NULL`,
    [classId, teacherId]);
  if (rows.length === 0) redirect('/teacher');
  return rows[0];
}
