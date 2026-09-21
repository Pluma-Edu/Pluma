import type { MetadataRoute } from 'next';

const SITE = process.env.SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: ['/', '/worksheets/', '/library/'],
      // Nothing behind a login and nothing a student touches belongs in an index.
      disallow: ['/teacher/', '/go/', '/proof', '/api/', '/login'],
    }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
