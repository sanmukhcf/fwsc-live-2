/**
 * Bulletproof error string formatter.
 * Guarantees that any error input (object, Error instance, Vercel gateway error,
 * NDJSON error chunk, or unknown structure) is converted into a safe, clean string.
 * React will NEVER crash with "Minified React error #31 (found: object with keys {code, message})".
 */
export function formatErrorMessage(val: any, fallback = 'An unexpected crawl or network error occurred.'): string {
  if (val == null) {
    return fallback;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }

  if (typeof val === 'object') {
    // 1. If it's a native Error
    if (val instanceof Error && val.message) {
      return val.message;
    }

    // 2. If it has both message and code, e.g. { code: 'FUNCTION_INVOCATION_TIMEOUT', message: '...' }
    const code = typeof val.code === 'string' ? val.code.trim() : '';
    const message = typeof val.message === 'string' ? val.message.trim() : '';
    if (message) {
      if (code && !message.toLowerCase().includes(code.toLowerCase())) {
        return `${message} (${code})`;
      }
      return message;
    }

    // 3. If it has an 'error' field (e.g. { error: { code: '...', message: '...' } } or { error: '...' })
    if (val.error) {
      if (typeof val.error === 'string' && val.error.trim()) {
        return val.error.trim();
      }
      if (typeof val.error === 'object') {
        return formatErrorMessage(val.error, fallback);
      }
    }

    // 4. If it has 'reason'
    if (typeof val.reason === 'string' && val.reason.trim()) {
      return val.reason.trim();
    }

    // 5. If it has 'errorType'
    if (typeof val.errorType === 'string' && val.errorType.trim()) {
      return val.errorType.trim();
    }

    // 6. If it only has 'code'
    if (code) {
      return `Server error: ${code}`;
    }

    // 7. Fallback JSON representation if non-empty
    try {
      const json = JSON.stringify(val);
      if (json && json !== '{}') {
        return json;
      }
    } catch {
      // Ignore
    }
  }

  return fallback;
}

/**
 * Safely extracts a string from any potential string-or-object field for JSX display.
 */
export function safeString(val: any, fallback = ''): string {
  if (val == null) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return formatErrorMessage(val, fallback);
}
