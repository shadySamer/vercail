/**
 * Helper to clean and extract valid TikTok Click ID (ttclid)
 * Handles raw click IDs, subids, cids, and wrappers like ttclid(E.C.P...) or ttclid:E.C.P...
 */
export function extractCleanTtclid(raw?: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '__CLICKID__' || trimmed === '{SUBID}' || trimmed === '{cid}' || trimmed === '{extclid}') {
    return undefined;
  }

  // Handle wrapper: ttclid(XYZ) or ttclid:XYZ or ttclid=XYZ
  const matchParen = trimmed.match(/^ttclid\((.*?)\)$/i);
  if (matchParen && matchParen[1]) {
    return matchParen[1].trim();
  }

  const matchColon = trimmed.match(/^ttclid[:=](.*)$/i);
  if (matchColon && matchColon[1]) {
    return matchColon[1].trim();
  }

  return trimmed;
}
