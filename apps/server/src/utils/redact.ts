/**
 * Utility to redact PII from logs and data structures
 */

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_REGEX = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
const SSN_REGEX = /\b\d{3}-?\d{2}-?\d{4}\b/g;

export interface RedactionOptions {
  emails?: boolean;
  phones?: boolean;
  ssn?: boolean;
  custom?: RegExp[];
}

const defaultOptions: RedactionOptions = {
  emails: true,
  phones: true,
  ssn: true,
  custom: [],
};

/**
 * Redact PII from a string
 */
export function redactString(
  text: string,
  options: RedactionOptions = defaultOptions
): string {
  let result = text;

  if (options.emails) {
    result = result.replace(EMAIL_REGEX, '[EMAIL_REDACTED]');
  }

  if (options.phones) {
    result = result.replace(PHONE_REGEX, '[PHONE_REDACTED]');
  }

  if (options.ssn) {
    result = result.replace(SSN_REGEX, '[SSN_REDACTED]');
  }

  if (options.custom) {
    options.custom.forEach((regex) => {
      result = result.replace(regex, '[CUSTOM_REDACTED]');
    });
  }

  return result;
}

/**
 * Redact PII from an object (deep)
 */
export function redactObject<T>(
  obj: T,
  options: RedactionOptions = defaultOptions
): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactString(obj, options) as T;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, options)) as T;
  }

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    // Special handling for known PII fields
    if (key.toLowerCase().includes('email') && typeof value === 'string') {
      result[key] = '[EMAIL_REDACTED]';
    } else if (key.toLowerCase().includes('phone') && typeof value === 'string') {
      result[key] = '[PHONE_REDACTED]';
    } else if (key.toLowerCase().includes('ssn') && typeof value === 'string') {
      result[key] = '[SSN_REDACTED]';
    } else {
      result[key] = redactObject(value, options);
    }
  }

  return result as T;
}

/**
 * Create a redacted version for logging
 */
export function forLogging<T>(data: T, options?: RedactionOptions): T {
  return redactObject(data, options);
}
