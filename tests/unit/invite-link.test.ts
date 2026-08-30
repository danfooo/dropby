import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToken, slugifyName, inviteUrl } from '../../server/src/utils/invite-link.js';
import { applyPreview } from '../../server/src/services/invite-preview.js';

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

test('normalizeToken — a bare token is unchanged', () => {
  assert.equal(normalizeToken(TOKEN), TOKEN);
});

test('normalizeToken — the slug is stripped off a named link', () => {
  assert.equal(normalizeToken(`sunday-bbq-${TOKEN}`), TOKEN);
});

test('normalizeToken — a name that looks like hex does not confuse the token', () => {
  assert.equal(normalizeToken(`cafe-babe-${TOKEN}`), TOKEN);
});

test('slugifyName — spaces, punctuation and case', () => {
  assert.equal(slugifyName("Anna's Sunday BBQ!"), 'anna-s-sunday-bbq');
});

test('slugifyName — diacritics are folded, not dropped into nothing', () => {
  assert.equal(slugifyName('Grillen bei Jürgen'), 'grillen-bei-jurgen');
});

test('slugifyName — truncated without leaving a trailing dash', () => {
  const slug = slugifyName('a very long name that will certainly be cut off somewhere');
  assert.ok(slug.length <= 24, `expected <= 24 chars, got "${slug}"`);
  assert.ok(!slug.endsWith('-'), `expected no trailing dash, got "${slug}"`);
});

test('slugifyName — a name with no usable characters yields no slug', () => {
  assert.equal(slugifyName('🎉🎉🎉'), '');
});

test('inviteUrl — unnamed links keep the bare token path', () => {
  assert.equal(inviteUrl('https://dropby.cc', TOKEN, null), `https://dropby.cc/invite/${TOKEN}`);
});

test('inviteUrl — the name is readable in the path and still resolves', () => {
  const url = inviteUrl('https://dropby.cc', TOKEN, 'Sunday BBQ');
  assert.equal(url, `https://dropby.cc/invite/sunday-bbq-${TOKEN}`);
  assert.equal(normalizeToken(url.split('/').pop()!), TOKEN);
});

const HTML = [
  '<title>dropby</title>',
  '<meta property="og:title" content="dropby" />',
  '<meta property="og:description" content="Spend more time with friends." />',
  '<meta name="twitter:title" content="dropby" />',
  '<meta name="twitter:description" content="Spend more time with friends." />',
].join('\n');

test('applyPreview — the link name becomes the share title', () => {
  const out = applyPreview(HTML, { title: 'Sunday BBQ', description: 'Anna shared this.' });
  assert.ok(out.includes('<meta property="og:title" content="Sunday BBQ" />'));
  assert.ok(out.includes('<meta name="twitter:title" content="Sunday BBQ" />'));
  assert.ok(out.includes('<meta property="og:description" content="Anna shared this." />'));
  assert.ok(out.includes('<title>Sunday BBQ</title>'));
});

test('applyPreview — a name with quotes cannot break out of the meta tag', () => {
  const out = applyPreview(HTML, { title: '"><script>alert(1)</script>', description: 'x' });
  assert.ok(!out.includes('<script>'), `unescaped markup in: ${out}`);
  assert.ok(out.includes('&quot;&gt;&lt;script&gt;'));
});
