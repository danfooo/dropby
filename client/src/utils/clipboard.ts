// Clipboard helper that works in iOS Safari PWA.
// ClipboardItem with a Promise preserves gesture trust across async calls.
export async function copyText(textPromise: Promise<string>) {
  try {
    if (typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/plain': textPromise.then(t => new Blob([t], { type: 'text/plain' })) }),
      ]);
    } else {
      await navigator.clipboard.writeText(await textPromise);
    }
  } catch {
    await navigator.clipboard.writeText(await textPromise);
  }
}
