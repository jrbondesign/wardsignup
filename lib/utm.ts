/**
 * UTM parameter helper for attribution tracking.
 * 
 * Appends UTM parameters to URLs while preserving existing query params and hashes.
 * Used to track where signups come from (email, share, QR codes, etc.).
 * Never overwrites existing parameters.
 */

export interface UtmParams {
  /** Where the link lives (invite_email, event_share, welcome_email, qr, etc.) */
  utm_source?: string;
  /** Channel type (email, social, sms, ai, qr, share, print, referral) */
  utm_medium?: string;
  /** Short campaign/event slug when useful */
  utm_campaign?: string;
  /** Custom ref parameter for non-UTM tracking (e.g. ref=share) */
  ref?: string;
}

/**
 * Append UTM and ref parameters to a URL, preserving existing query params and hashes.
 * Never overwrites existing parameters.
 * 
 * @param url - Base URL (can already have query params and hash)
 * @param params - UTM/ref parameters to append
 * @returns URL with parameters appended
 * 
 * @example
 * withUtm('https://example.com/event/123', {
 *   utm_source: 'welcome_email',
 *   utm_medium: 'email',
 *   utm_campaign: 'creator_welcome'
 * })
 * // => 'https://example.com/event/123?utm_source=welcome_email&utm_medium=email&utm_campaign=creator_welcome'
 * 
 * @example
 * withUtm('https://example.com/event/123?token=abc#section', {
 *   ref: 'share'
 * })
 * // => 'https://example.com/event/123?token=abc&ref=share#section'
 */
export function withUtm(url: string, params: UtmParams): string {
  // Relative paths (e.g. '/create') parse against a placeholder origin and
  // come back relative.
  const isRelative = url.startsWith('/') && !url.startsWith('//');
  try {
    const urlObj = isRelative ? new URL(url, 'http://relative.invalid') : new URL(url);
    
    // Only add defined params if they don't already exist
    if (params.utm_source && !urlObj.searchParams.has('utm_source')) {
      urlObj.searchParams.set('utm_source', params.utm_source);
    }
    if (params.utm_medium && !urlObj.searchParams.has('utm_medium')) {
      urlObj.searchParams.set('utm_medium', params.utm_medium);
    }
    if (params.utm_campaign && !urlObj.searchParams.has('utm_campaign')) {
      urlObj.searchParams.set('utm_campaign', params.utm_campaign);
    }
    if (params.ref && !urlObj.searchParams.has('ref')) {
      urlObj.searchParams.set('ref', params.ref);
    }
    
    return isRelative
      ? `${urlObj.pathname}${urlObj.search}${urlObj.hash}`
      : urlObj.toString();
  } catch (e) {
    // If URL parsing fails, return original URL unchanged (fail closed)
    console.error('withUtm: invalid URL', url, e);
    return url;
  }
}
