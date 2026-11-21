/** Open only conventional external web or email links from imported documents. */
export function openSafeExternalLink(rawUrl: string): void {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return;
    window.open(url.href, '_blank', 'noopener,noreferrer');
  } catch {
    // Invalid document links are ignored.
  }
}
