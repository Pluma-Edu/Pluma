/**
 * The Pluma mark: a quill, drawn as a single path.
 *
 * Taken verbatim from the Pluma Logo design file so the product and the brand
 * deck never drift. `tone` picks which of the palette's inks it is drawn in —
 * on paper (the printed worksheet masthead) it is drawn in ink, not primary,
 * because a photocopier turns azure into a mid grey.
 */
export function PlumaMark({
  height = 28, tone = 'primary', className,
}: { height?: number; tone?: 'primary' | 'ink' | 'tangerine' | 'paper'; className?: string }) {
  const fill = {
    primary: 'var(--color-primary)',
    ink: 'var(--color-ink)',
    tangerine: 'var(--color-tangerine)',
    paper: 'var(--color-paper)',
  }[tone];

  return (
    <svg
      viewBox="0 0 100 200"
      role="img"
      aria-label="Pluma"
      className={className}
      style={{ width: height * 0.52, height, display: 'block' }}
      fill={fill}
    >
      <path
        fillRule="evenodd"
        d="M86 12 C98 48 86 96 66 130 C60 140 52 152 45 161 C50 163 54 164 58 165 C50 172 42 178 36 183 L28 199 L22 196 L31 175 C18 146 20 106 31 78 C42 50 62 24 86 12 Z M82 22 C58 54 42 96 34 176 L30 175 C38 94 58 50 79 19 Z"
      />
    </svg>
  );
}

/** Mark plus wordmark. The lockup used in the nav and on printed mastheads. */
export function PlumaLogo({
  height = 28, tone = 'primary', wordmarkClassName = '',
}: { height?: number; tone?: 'primary' | 'ink' | 'tangerine' | 'paper'; wordmarkClassName?: string }) {
  return (
    <span className="flex items-center gap-[9px]">
      <PlumaMark height={height} tone={tone} />
      <span
        className={`font-bold tracking-[-0.02em] ${wordmarkClassName}`}
        style={{ fontSize: height * 0.75 }}
      >
        Pluma
      </span>
    </span>
  );
}

/** The three dots from the foundations header: teal, marigold, tangerine. */
export function PlumaDots({ size = 12 }: { size?: number }) {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {['var(--color-teal)', 'var(--color-marigold)', 'var(--color-tangerine-bright)'].map((c) => (
        <span key={c} className="rounded-full"
              style={{ width: size, height: size, background: c }} />
      ))}
    </span>
  );
}
