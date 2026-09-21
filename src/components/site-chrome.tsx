import Link from 'next/link';
import { PlumaLogo } from './logo';

/**
 * Public chrome. Deliberately free of any session read: every page that wears
 * it is statically cached, and a nav that says "Sign in" to a signed-in teacher
 * is better than a page that cannot be cached at all. The sign-in link resolves
 * correctly either way.
 */
export function SiteNav() {
  return (
    <nav className="sticky top-0 z-10 bg-paper border-b border-rule">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-4 px-5 py-3">
        <Link href="/" className="mr-auto no-underline text-ink">
          <PlumaLogo height={26} />
        </Link>
        <Link href="/worksheets" className="text-[15px] text-ink-soft no-underline hover:text-ink">
          Worksheet library
        </Link>
        <Link href="/teacher" className="text-[15px] text-ink-soft no-underline hover:text-ink">
          My classes
        </Link>
        <Link href="/go" className="text-[15px] text-ink-soft no-underline hover:text-ink">
          I have a class code
        </Link>
        <Link
          href="/login"
          className="rounded-lg bg-primary px-4 py-2.5 text-[15px] font-bold text-paper no-underline hover:bg-primary-hover"
        >
          Create free account
        </Link>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-5 py-8
                      font-mono text-[11px] uppercase tracking-[0.06em] text-ink-muted">
        <span>Pluma · free for every teacher</span>
        <span>No ads. No paywall. No student accounts.</span>
      </div>
    </footer>
  );
}

/** Mono metadata pill, as in the design's header row. */
export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-rule px-3 py-1.5 font-mono text-[11px]
                     uppercase tracking-[0.06em] text-ink-soft">
      {children}
    </span>
  );
}

/** A checked benefit line: solid circle, solid border — the "correct" mark. */
export function CheckLine({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-start gap-2.5 text-[15px]">
      <span className="mt-px grid h-5 w-5 flex-none place-items-center rounded-full
                       bg-primary-tint text-[12px] font-bold text-primary-deep">✓</span>
      <span>{children}</span>
    </span>
  );
}
