/**
 * Mask email address for display while preserving enough context
 * for the user to recognize it. Shows first character of local part
 * and domain, masking the rest.
 * 
 * Examples:
 *   john@example.com -> j***@e***.com
 *   a@b.co -> a***@b***.co
 */
export function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  
  const [local, domain] = parts;
  if (local.length === 0 || domain.length === 0) return email;
  
  const maskedLocal = local[0] + "***";
  
  const domainParts = domain.split(".");
  if (domainParts.length < 2) {
    return `${maskedLocal}@${domain[0]}***`;
  }
  
  const maskedDomainStart = domainParts[0][0] + "***";
  const extension = domainParts.slice(1).join(".");
  
  return `${maskedLocal}@${maskedDomainStart}.${extension}`;
}
