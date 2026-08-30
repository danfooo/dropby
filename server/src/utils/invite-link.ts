// A link's name is cosmetic in the URL: the trailing 32 hex characters are the token,
// so a renamed link keeps working from every copy already shared.
const TOKEN_PATTERN = /([0-9a-f]{32})$/i;

export function normalizeToken(raw: string): string {
  return TOKEN_PATTERN.exec(raw)?.[1] ?? raw;
}

export function slugifyName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics so "Sünde" slugs as "sunde"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');
}

export function inviteUrl(appUrl: string, token: string, name?: string | null): string {
  const slug = slugifyName(name);
  return `${appUrl}/invite/${slug ? `${slug}-${token}` : token}`;
}
