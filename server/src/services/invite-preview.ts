import { db } from '../db/index.js';
import { normalizeToken } from '../utils/invite-link.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Title and description for a link's share preview. Deliberately says nothing about
 *  whether the link is still live — an expired link previews exactly like a live one,
 *  so the state is only revealed in the app, after signing in. */
export function invitePreview(rawToken: string): { title: string; description: string } | null {
  const token = normalizeToken(rawToken);
  const invite = db.prepare(`
    SELECT l.name, u.display_name FROM invite_links l
    JOIN users u ON u.id = l.created_by WHERE l.token = ?
  `).get(token) as { name: string | null; display_name: string } | undefined;
  if (!invite) return null;

  return invite.name
    ? { title: invite.name, description: `${invite.display_name} shared this on dropby. Open it to see who's here.` }
    : { title: 'dropby', description: `${invite.display_name} wants to connect with you on dropby.` };
}

/** Rewrites the og:title / og:description / twitter equivalents in the built index.html. */
export function applyPreview(html: string, preview: { title: string; description: string }): string {
  const title = escapeHtml(preview.title);
  const description = escapeHtml(preview.description);
  return html
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<title>)[^<]*(<\/title>)/, `$1${title}$2`);
}
