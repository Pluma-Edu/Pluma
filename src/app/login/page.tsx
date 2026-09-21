import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site paths, so the destination cannot be turned into an open redirect.
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  return <LoginForm next={safeNext} />;
}
