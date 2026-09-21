'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTeacher, requireOwnedClass } from '@/lib/auth/require';
import { createClass, addRosterEntry, setChipConfirmed, setRosterPin } from '@/lib/classroom/teacher';
import { createAssignment } from '@/lib/classroom/assignment';
import { hashPin } from '@/lib/auth/password';
import type { Difficulty, ItemType } from '@/lib/generation/params';

export async function createClassAction(_prev: string | null, form: FormData): Promise<string | null> {
  const teacherId = await requireTeacher();
  const name = String(form.get('name') ?? '').trim();
  const course = String(form.get('course') ?? 'spanish-2');
  if (!name) return 'Give the class a name.';
  const id = await createClass(teacherId, name, course);
  redirect(`/teacher/${id}`);
}

export async function addStudentAction(_prev: string | null, form: FormData): Promise<string | null> {
  const teacherId = await requireTeacher();
  const classId = String(form.get('classId') ?? '');
  await requireOwnedClass(teacherId, classId);

  const firstName = String(form.get('firstName') ?? '').trim();
  if (!firstName) return 'A first name is needed.';

  const gradeRaw = String(form.get('gradeLevel') ?? '').trim();
  const gradeLevel = gradeRaw ? Number(gradeRaw) : null;

  await addRosterEntry({
    teacherId, classId, firstName,
    lastInitial: String(form.get('lastInitial') ?? '').trim().slice(0, 1) || null,
    gradeLevel,
    // Defaulted from grade, never from a date of birth — we do not collect one.
    ageBand: gradeLevel !== null && gradeLevel <= 7 ? 'under_13' : '13_plus',
    note: String(form.get('note') ?? '').trim() || null,
  });

  revalidatePath(`/teacher/${classId}`);
  return null;
}

export async function confirmChipAction(form: FormData): Promise<void> {
  await requireTeacher();
  await setChipConfirmed(String(form.get('paramId')), form.get('confirmed') === '1');
  revalidatePath(String(form.get('path') ?? '/teacher'));
}

export async function setPinAction(form: FormData): Promise<void> {
  await requireTeacher();
  const pin = String(form.get('pin') ?? '').trim();
  await setRosterPin(String(form.get('rosterEntryId')), pin ? await hashPin(pin) : null);
  revalidatePath(String(form.get('path') ?? '/teacher'));
}

export async function createAssignmentAction(_prev: string | null, form: FormData): Promise<string | null> {
  const teacherId = await requireTeacher();
  const classId = String(form.get('classId') ?? '');
  await requireOwnedClass(teacherId, classId);

  const due = String(form.get('dueAt') ?? '').trim();
  try {
    await createAssignment({
      teacherId, classId,
      title: String(form.get('title') ?? '').trim() || 'Practice',
      skill: String(form.get('skill') ?? ''),
      itemType: String(form.get('itemType') ?? 'cloze') as ItemType,
      difficulty: Number(form.get('difficulty') ?? 2) as Difficulty,
      count: Math.min(40, Math.max(1, Number(form.get('count') ?? 10))),
      dueAt: due || null,
    });
  } catch (e) {
    return (e as Error).message;
  }
  redirect(`/teacher/${classId}`);
}
