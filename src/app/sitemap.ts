import type { MetadataRoute } from 'next';
import { allWorksheetPaths, listCourses, listSkills } from '@/lib/library/queries';

const SITE = process.env.SITE_URL ?? 'http://localhost:3000';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const courses = await listCourses();
  const skillEntries = (
    await Promise.all(courses.map(async (c) =>
      (await listSkills(c.subject_slug, c.course_slug)).map((s) => ({
        url: `${SITE}/worksheets/${c.subject_slug}/${c.course_slug}/${s.skill_slug}`,
        changeFrequency: 'weekly' as const, priority: 0.7,
      }))))
  ).flat();

  return [
    { url: `${SITE}/worksheets`, changeFrequency: 'daily', priority: 1 },
    ...courses.map((c) => ({
      url: `${SITE}/worksheets/${c.subject_slug}/${c.course_slug}`,
      changeFrequency: 'weekly' as const, priority: 0.8,
    })),
    ...skillEntries,
    ...(await allWorksheetPaths()).map((p) => ({
      url: `${SITE}/worksheets/${p.subject}/${p.course}/${p.skill}/${p.slug}`,
      lastModified: p.updated ? new Date(p.updated) : undefined,
      changeFrequency: 'monthly' as const, priority: 0.6,
    })),
  ];
}
