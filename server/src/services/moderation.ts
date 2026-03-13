/** Strip HTML tags, control characters, and zero-width Unicode from a note.
 *  Whitespace sequences (including newlines) are collapsed to a single space. */
export function sanitizeNote(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')                          // HTML tags
    .replace(/[\u0000-\u001F\u007F]/g, ' ')            // ASCII control chars → space
    .replace(/[\u200B-\u200D\u2028\u2029\uFEFF]/g, '') // zero-width + line/para separators + BOM
    .replace(/\s+/g, ' ')                             // collapse whitespace sequences
    .trim();
}

/** Returns true if the note is safe to store. Fails open (allows) on API error. */
export async function isNoteAllowed(text: string): Promise<boolean> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return true; // no key configured — skip check

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ input: text }),
    });

    if (!res.ok) return true; // API error — fail open

    const data = await res.json() as { results: Array<{ flagged: boolean }> };
    return !data.results[0]?.flagged;
  } catch {
    return true; // network error — fail open
  }
}
