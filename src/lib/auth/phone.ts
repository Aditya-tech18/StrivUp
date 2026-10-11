/**
 * src/lib/auth/phone.ts
 *
 * Phone numbers have to reach Supabase in E.164 ("+919876543210") or the SMS
 * provider rejects them. People type them every other way: with spaces, with
 * dashes, with a leading 0, with 91 but no plus, pasted from WhatsApp with
 * brackets. Normalising in one place keeps that mess out of the forms.
 *
 * India is the default country because that is where StrivUp launches. A
 * number typed with an explicit "+" is always honoured as-is, so an
 * international student is never forced through +91.
 */

/** Dialling code assumed when someone types a bare local number. */
export const DEFAULT_DIAL_CODE = "+91";

/**
 * Convert whatever was typed into E.164, or null if it cannot be one.
 *
 * Deliberately strict about Indian mobiles: TRAI allocates mobile numbers
 * starting 6–9, so a 10-digit number beginning 0–5 is a typo or a landline and
 * is better rejected here than burned as a failed SMS.
 */
export function toE164(raw: string): string | null {
  // Strip every separator people use. Keep "+" — it carries meaning.
  const cleaned = raw.trim().replace(/[\s\-().]/g, "");
  if (!cleaned) return null;

  // Already international.
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;

  // "00" is the international access prefix across most of the world.
  if (/^00[1-9]\d{7,14}$/.test(cleaned)) return `+${cleaned.slice(2)}`;

  // "91" written without the plus.
  if (/^91[6-9]\d{9}$/.test(cleaned)) return `+${cleaned}`;

  // Local STD form: a single leading 0, then the mobile number.
  if (/^0[6-9]\d{9}$/.test(cleaned)) return `${DEFAULT_DIAL_CODE}${cleaned.slice(1)}`;

  // A bare Indian mobile.
  if (/^[6-9]\d{9}$/.test(cleaned)) return `${DEFAULT_DIAL_CODE}${cleaned}`;

  return null;
}

/** "+919876543210" → "+91 98765 43210", for confirmation copy. */
export function formatE164(e164: string): string {
  if (e164.startsWith(DEFAULT_DIAL_CODE) && e164.length === 13) {
    const local = e164.slice(3);
    return `${DEFAULT_DIAL_CODE} ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return e164;
}

/** Length of the SMS code Supabase sends. Six everywhere we support. */
export const OTP_LENGTH = 6;
