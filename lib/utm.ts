/**
 * UTM parameter helper for attribution tracking.
 * 
 * Appends UTM parameters to URLs while preserving existing query params.
 * Used to track where signups come from (email, share, SMS, etc.).
 */

export interface UtmParams {
  /** Where the link lives (invite_email, event_share, welcome_email, etc.) */
  utm_source?: string;
  /** Channel type (email, social, sms, ai, qr, share) */
  utm_medium?: string;
  /** Short campaign/event slug when useful */
  utm_campaign?: string;
}

/**
 * Append UTM parameters to a URL, preserving existing query params.
 * 
 * @param url - Base URL (can already have query params)
 * @param params - UTM parameters to append
 * @returns URL with UTM parameters appended
 * 
 * @example
 * withUtm('https://example.com/event/123', {
 *   utm_source: 'welcome_email',
 *   utm_medium: 'email',
 *   utm_campaign: 'creator_welcome'
 * })
 * // => 'https://example.com/event/123?utm_source=welcome_email&utm_medium=email&utm_campaign=creator_welcome'
 */
export function withUtm(url: string, params: UtmParams): string {
  try {
    const urlObj = new URL(url);
    
    // Only add defined UTM params
    if (params.utm_source) {
      urlObj.searchParams.set('utm_source', params.utm_source);
    }
    if (params.utm_medium) {
      urlObj.searchParams.set('utm_medium', params.utm_medium);
    }
    if (params.utm_campaign) {
      urlObj.searchParams.set('utm_campaign', params.utm_campaign);
    }
    
    return urlObj.toString();
  } catch (e) {
    // If URL parsing fails, return original URL unchanged (fail closed)
    console.error('withUtm: invalid URL', url, e);
    return url;
  }
}
