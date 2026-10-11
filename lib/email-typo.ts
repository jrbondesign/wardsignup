/**
 * "Did you mean" suggestions for common email typos. Pure and client safe.
 * Only suggests; never blocks a signup or sign in.
 */

const DOMAIN_FIXES: Record<string, string> = {
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.comm": "gmail.com",
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.cim": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
  "icoud.com": "icloud.com",
  "comcast.met": "comcast.net",
  "comcast.ne": "comcast.net",
  "aol.co": "aol.com",
  "msn.co": "msn.com",
  "live.co": "live.com",
};

const TLD_FIXES: Record<string, string> = {
  prg: "org",
  ogr: "org",
  orh: "org",
  con: "com",
  cmo: "com",
  ocm: "com",
  vom: "com",
  xom: "com",
  comm: "com",
  nte: "net",
  ner: "net",
};

/** Returns a corrected address, or null when nothing looks wrong. */
export function suggestEmailFix(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  const direct = DOMAIN_FIXES[domain];
  if (direct) return `${local}@${direct}`;

  const dot = domain.lastIndexOf(".");
  if (dot < 1) return null;
  const tld = domain.slice(dot + 1);
  const fixedTld = TLD_FIXES[tld];
  if (fixedTld) return `${local}@${domain.slice(0, dot)}.${fixedTld}`;
  return null;
}
