const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

/** Renders text as-is, except http(s) URLs become clickable links (e.g. a pasted Google Maps link). */
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className={className ?? 'underline'}
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}
