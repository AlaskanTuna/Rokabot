/** The privacy floor for stored facts: the few categories no memory path may keep, whoever asks. */

/**
 * Deliberately narrow. The controlled predicate vocabulary already encodes the "general, not specific"
 * policy the extractor prompt describes in prose — `general_occupation` holds the job and never the
 * employer, `nickname` holds the chosen name and never the legal one — and someone who asks Roka outright
 * to remember something has consented to it. Birthdays, ages, occupations, diets and nicknames therefore
 * stay storable on purpose; blocking them would cost real character behaviour to buy nothing.
 *
 * What is blocked is only what has no legitimate use in a character chatbot's memory at all: contact
 * details, money, government identifiers, and secrets. Two signals, because either alone leaks. The key
 * catches `password` -> "hunter2", whose value looks like any other word. The value catches an address
 * or an API key filed under an innocent name, and is the only signal the passive path still has by the
 * time it reaches storage — `normalizePredicate` has already collapsed its key to `misc` by then.
 */

export type SensitiveFactReason = 'sensitive_key' | 'email' | 'phone' | 'account_number' | 'credential'

const SENSITIVE_KEY =
  /_(?:password|passwd|pwd|secret|token|api_?key|credential|otp|email|phone|mobile|telephone|address|residence|postcode|zipcode|ssn|nric|passport|iban|swift|credit_?card|card_?number|cvv|bank_?account|account_?number|salary|income)_/

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const PHONE = /\+\d[\d\s().-]{7,}\d|\b\d{3}[\s.-]\d{3,4}[\s.-]\d{4}\b/
const ACCOUNT_NUMBER = /\b\d[\d\s-]{11,}\d\b/
const CREDENTIAL = /\b(?:sk-[a-z0-9]{16,}|ghp_[a-z0-9]{20,}|AIza[\w-]{20,}|xox[baprs]-[\w-]{10,})\b/i

/** Mirrors normalizePredicate's string transform so a camelCase or spaced key cannot slip the list. */
function normalizeKey(key: string): string {
  return key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
}

/** The reason this fact may not be stored, or undefined when it is fine to keep. */
export function sensitiveFactReason(key: string, value: string): SensitiveFactReason | undefined {
  if (SENSITIVE_KEY.test(`_${normalizeKey(key)}_`)) return 'sensitive_key'
  if (EMAIL.test(value)) return 'email'
  if (CREDENTIAL.test(value)) return 'credential'
  if (PHONE.test(value)) return 'phone'
  if (ACCOUNT_NUMBER.test(value)) return 'account_number'
  return undefined
}

/** Value-only check, for writers that reach storage after the raw key has been normalized away. */
export function sensitiveValueReason(value: string): SensitiveFactReason | undefined {
  return sensitiveFactReason('misc', value)
}
