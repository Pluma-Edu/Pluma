/**
 * The worksheet, as paper, on screen.
 *
 * This is a twin of what lib/render/worksheet.ts prints — same masthead, same
 * field row, same instruction block, same numbering. That matters: the preview
 * is the only thing a teacher sees before downloading, so if it flatters the
 * PDF it is a lie with a download attached.
 *
 * Sized in container query units so one component serves a full-bleed page
 * preview and a 52px thumbnail without a second set of styles.
 */
export type PaperItem = {
  position: number;
  item_type: string;
  stem: string;
  choices: Array<{ key: string; text: string }>;
};

type Props = {
  title: string;
  eyebrow: string;
  instructions: string;
  items: PaperItem[];
  footerLeft?: string;
  footerRight?: string;
};

const MARK_PATH =
  'M86 12 C98 48 86 96 66 130 C60 140 52 152 45 161 C50 163 54 164 58 165 '
  + 'C50 172 42 178 36 183 L28 199 L22 196 L31 175 C18 146 20 106 31 78 C42 50 62 24 86 12 Z '
  + 'M82 22 C58 54 42 96 34 176 L30 175 C38 94 58 50 79 19 Z';

/** A run of underscores in a stem becomes a ruled blank, exactly as in print. */
function renderStem(stem: string) {
  const parts = stem.split(/(_{3,})/);
  return parts.map((part, i) =>
    /^_{3,}$/.test(part)
      ? <span key={i} className="inline-block align-baseline"
              style={{ width: '13cqw', borderBottom: '0.18cqw solid var(--color-ink)' }} />
      : <span key={i}>{part}</span>);
}

export function PaperPreview({ title, eyebrow, instructions, items, footerLeft, footerRight }: Props) {
  return (
    <div
      className="w-full bg-white border border-rule rounded-sm overflow-hidden text-ink"
      style={{
        containerType: 'inline-size',
        aspectRatio: '8.5 / 11',
        boxShadow: '0 22px 50px -40px var(--color-ink)',
        padding: '6.5cqw 6cqw 4.5cqw',
        display: 'flex',
        flexDirection: 'column',
        gap: '2.4cqw',
      }}
    >
      <div className="flex items-end justify-between"
           style={{ borderBottom: '0.45cqw solid var(--color-ink)', paddingBottom: '1.2cqw' }}>
        <div className="flex flex-col" style={{ gap: '0.5cqw' }}>
          <div className="font-mono uppercase text-ink-soft"
               style={{ fontSize: '1.5cqw', letterSpacing: '0.1em' }}>{eyebrow}</div>
          <div className="font-bold leading-[1.1] tracking-[-0.01em]"
               style={{ fontSize: '3.3cqw' }}>{title}</div>
        </div>
        <div className="flex items-center" style={{ gap: '1cqw' }}>
          <svg viewBox="0 0 100 200" aria-hidden="true" fill="var(--color-ink)"
               style={{ width: '1.35cqw', height: '2.6cqw', display: 'block' }}>
            <path fillRule="evenodd" d={MARK_PATH} />
          </svg>
          <div className="font-bold tracking-[-0.01em]" style={{ fontSize: '2.1cqw' }}>Pluma</div>
        </div>
      </div>

      <div className="grid items-end" style={{ gridTemplateColumns: '1.6fr 1fr 1fr', gap: '2.4cqw' }}>
        {['Name', 'Date', 'Class / Period'].map((label) => (
          <div key={label}>
            <div className="font-mono uppercase text-ink-soft"
                 style={{ fontSize: '1.4cqw', letterSpacing: '0.1em', marginBottom: '2.4cqw' }}>
              {label}
            </div>
            <div style={{ borderBottom: '0.18cqw solid var(--color-ink)' }} />
          </div>
        ))}
      </div>

      <div style={{
        background: 'var(--color-note-fill)',
        borderLeft: '0.55cqw solid var(--color-tangerine-bright)',
        padding: '1.3cqw 1.7cqw', fontSize: '1.9cqw', lineHeight: 1.5,
      }}>
        {instructions}
      </div>

      <ol className="flex flex-col" style={{ gap: '1.5cqw', fontSize: '1.95cqw', lineHeight: 1.5 }}>
        {items.map((item) => (
          <li key={item.position} className="flex" style={{ gap: '1.2cqw' }}>
            <span className="font-bold shrink-0 text-right" style={{ width: '3cqw' }}>
              {item.position}.
            </span>
            <span className="min-w-0">
              {renderStem(item.stem)}
              {item.choices.length > 0 && (
                <span className="grid grid-cols-2" style={{ gap: '0.4cqw 2cqw', marginTop: '0.6cqw' }}>
                  {item.choices.map((c) => (
                    <span key={c.key}><span className="font-bold">{c.key}.</span> {c.text}</span>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-auto flex justify-between font-mono uppercase text-ink-soft"
           style={{
             borderTop: '0.18cqw solid var(--color-ink)', paddingTop: '1cqw',
             fontSize: '1.3cqw', letterSpacing: '0.06em',
           }}>
        <span>{footerLeft}</span>
        <span>Made with Pluma</span>
        <span>{footerRight}</span>
      </div>
    </div>
  );
}

/** The same page at thumbnail size: structure only, no legible text. */
export function PaperThumb({ lines = 5, accent = false }: { lines?: number; accent?: boolean }) {
  return (
    <div className="shrink-0 border border-rule bg-white rounded-sm flex flex-col"
         style={{ width: 52, height: 67, padding: 6, gap: 3 }} aria-hidden="true">
      <div style={{ height: 3, background: 'var(--color-ink)' }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{
          height: 2,
          width: `${58 + ((i * 37) % 42)}%`,
          background: accent ? 'var(--color-primary)' : 'var(--color-rule)',
        }} />
      ))}
    </div>
  );
}
