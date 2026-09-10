import type { AuditErrorDetails, CrawlProgress, AuditResult } from '../types';

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  errorDetails?: AuditErrorDetails;
  rawText?: string;
}

export interface StreamProgressCallbacks {
  onProgress: (progress: CrawlProgress) => void;
  onComplete: (result: AuditResult) => void;
  onError: (error: string, errorDetails?: AuditErrorDetails) => void;
}

/**
 * Streams audit progress events directly from the API endpoint.
 * Supports both streaming responses (NDJSON chunks / SSE) and standard JSON responses.
 * Never throws unhandled exceptions; all failures are routed cleanly to onError.
 */
export async function streamAuditCrawl(
  targetUrl: string,
  maxPages: number,
  callbacks: StreamProgressCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const fullUrl = getApiUrl('/api/audit/start');

  try {
    const res = await fetch(fullUrl, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/x-ndjson, text/event-stream, application/json',
      },
      body: JSON.stringify({ url: targetUrl, maxPages, stream: true }),
    });

    const contentType = (res.headers.get('content-type') || '').toLowerCase();

    // Check for HTTP errors first
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let errJson: any = null;
      try {
        errJson = JSON.parse(text);
      } catch {
        // Non-JSON error
      }

      const errorMsg =
        errJson?.error ||
        errJson?.message ||
        (res.status === 404
          ? 'Audit API route was not found (HTTP 404). Please verify API deployment.'
          : `Server returned HTTP ${res.status} (${res.statusText || 'Error'})`);

      const details: AuditErrorDetails = errJson?.errorDetails || {
        type: 'crawl_error',
        errorType: errJson?.errorType || `HTTP Error ${res.status}`,
        reason: errJson?.reason || `HTTP_${res.status}`,
        message: errorMsg,
        url: targetUrl,
        statusCode: res.status,
      };

      callbacks.onError(errorMsg, details);
      return;
    }

    // Handle Streaming response (ReadableStream)
    if (res.body && (contentType.includes('ndjson') || contentType.includes('stream') || !contentType.includes('application/json'))) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let completedOrFailed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep remainder in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            // Strip SSE "data: " prefix if present
            const jsonStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
            const parsed = JSON.parse(jsonStr);

            if (parsed.type === 'progress' && parsed.progress) {
              callbacks.onProgress(parsed.progress);
            } else if (parsed.type === 'completed' && parsed.result) {
              completedOrFailed = true;
              callbacks.onComplete(parsed.result);
            } else if (parsed.type === 'failed') {
              completedOrFailed = true;
              callbacks.onError(parsed.error || 'Audit crawl failed.', parsed.errorDetails);
            }
          } catch {
            // Ignore non-JSON heartbeat lines
          }
        }
      }

      // Check leftover buffer
      if (buffer.trim()) {
        try {
          const jsonStr = buffer.trim().startsWith('data:') ? buffer.trim().slice(5).trim() : buffer.trim();
          const parsed = JSON.parse(jsonStr);
          if (parsed.type === 'completed' && parsed.result) {
            completedOrFailed = true;
            callbacks.onComplete(parsed.result);
          } else if (parsed.type === 'failed') {
            completedOrFailed = true;
            callbacks.onError(parsed.error || 'Audit crawl failed.', parsed.errorDetails);
          }
        } catch {
          // Ignore
        }
      }

      if (completedOrFailed) return;
    }

    // Fallback: If response was not chunked or reader completed without final event, parse as single JSON
    const text = await res.text().catch(() => '');
    if (text.trim()) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.result) {
          callbacks.onComplete(parsed.result);
          return;
        }
        if (parsed.status === 'failed') {
          callbacks.onError(parsed.error || 'Audit failed.', parsed.errorDetails);
          return;
        }
      } catch {
        // Fall through
      }
    }
  } catch (err: any) {
    if (signal?.aborted) {
      callbacks.onError('Audit was cancelled.');
      return;
    }

    const message = err?.message || 'Failed to establish connection to audit server.';
    callbacks.onError(message, {
      type: 'unreachable',
      errorType: 'Network Error',
      reason: 'NETWORK_ERROR',
      message,
      url: targetUrl,
    });
  }
}

/**
 * Base API URL resolution:
 * In development or standard deployment, this defaults to empty string (same-origin relative URLs).
 * If VITE_API_URL or VITE_API_BASE_URL is defined in environment variables, it prepends that base URL.
 */
export function getApiUrl(path: string): string {
  const metaEnv = (import.meta as any)?.env;
  const envBase = (metaEnv?.VITE_API_URL || metaEnv?.VITE_API_BASE_URL || '').trim();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (!envBase) {
    return cleanPath;
  }

  const normalizedBase = envBase.replace(/\/+$/, '');
  return `${normalizedBase}${cleanPath}`;
}

/**
 * Safely executes an HTTP request and parses the response without crashing on HTML or plain text.
 * NEVER blindly calls response.json().
 * Inspects Content-Type, handles empty bodies, HTML error pages, and plain text gracefully.
 */
export async function safeFetchJson<T = any>(
  path: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const fullUrl = getApiUrl(path);

  try {
    const res = await fetch(fullUrl, {
      ...init,
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...(init?.headers || {}),
      },
    });

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text();
    const trimmedText = text.trim();

    // 1. Empty body handling
    if (!trimmedText) {
      if (res.ok) {
        return {
          ok: true,
          status: res.status,
          data: undefined,
        };
      }
      return {
        ok: false,
        status: res.status,
        error: `Server returned HTTP ${res.status} with empty response`,
        errorDetails: {
          type: 'crawl_error',
          errorType: 'Server Error',
          reason: `HTTP_${res.status}`,
          message: `The server returned HTTP status ${res.status} (${res.statusText || 'Error'}) without response data.`,
          url: fullUrl,
        },
      };
    }

    // 2. Check if content is JSON or looks like JSON
    const isJsonHeader = contentType.includes('application/json');
    const looksLikeJson =
      (trimmedText.startsWith('{') && trimmedText.endsWith('}')) ||
      (trimmedText.startsWith('[') && trimmedText.endsWith(']'));

    if (isJsonHeader || looksLikeJson) {
      try {
        const parsed = JSON.parse(trimmedText);

        if (!res.ok) {
          const errorMsg =
            parsed.error ||
            parsed.message ||
            `Request failed with HTTP status ${res.status} (${res.statusText || 'Error'})`;

          const details: AuditErrorDetails = parsed.errorDetails || {
            type: 'crawl_error',
            errorType: parsed.errorType || `HTTP Error ${res.status}`,
            reason: parsed.reason || `HTTP_${res.status}`,
            message: errorMsg,
            url: parsed.url || fullUrl,
            statusCode: res.status,
          };

          return {
            ok: false,
            status: res.status,
            error: errorMsg,
            errorDetails: details,
            data: parsed,
            rawText: trimmedText,
          };
        }

        return {
          ok: true,
          status: res.status,
          data: parsed,
          rawText: trimmedText,
        };
      } catch {
        // If JSON parsing fails despite looking like JSON, fall through to text/HTML handling below
      }
    }

    // 3. Response is NOT JSON (e.g. HTML from Vercel / reverse proxy or plain text)
    const isHtml =
      contentType.includes('text/html') ||
      trimmedText.toLowerCase().startsWith('<!doctype') ||
      trimmedText.toLowerCase().startsWith('<html');

    let cleanErrorMessage = '';
    let errorReason = `HTTP_${res.status}`;

    if (isHtml) {
      if (res.status === 404) {
        cleanErrorMessage =
          'The requested API endpoint was not found (HTTP 404). If deployed on Vercel or GitHub, ensure API serverless functions are configured.';
        errorReason = 'API_NOT_FOUND';
      } else if (res.status === 502 || res.status === 503 || res.status === 504) {
        cleanErrorMessage = `The application gateway or server is temporarily unavailable (HTTP ${res.status}).`;
        errorReason = 'GATEWAY_ERROR';
      } else {
        cleanErrorMessage = `Server returned an HTML response instead of JSON (HTTP ${res.status} ${res.statusText || ''}).`;
        errorReason = 'NON_JSON_RESPONSE';
      }
    } else {
      // Plain text response: strip extra whitespace and truncate to reasonable length
      const snippet = trimmedText.replace(/[\r\n\t]+/g, ' ').slice(0, 160);
      cleanErrorMessage = snippet || `Server returned HTTP ${res.status} (${res.statusText || 'Error'})`;
    }

    return {
      ok: res.ok,
      status: res.status,
      error: cleanErrorMessage,
      errorDetails: {
        type: 'crawl_error',
        errorType: isHtml ? 'Non-JSON Server Response' : `HTTP Error ${res.status}`,
        reason: errorReason,
        message: cleanErrorMessage,
        url: fullUrl,
        statusCode: res.status,
      },
      rawText: trimmedText,
    };
  } catch (networkErr: any) {
    const isAbort = networkErr?.name === 'AbortError';
    const errorMsg = isAbort
      ? 'The request timed out while contacting the audit server.'
      : 'Network connection failed. Could not communicate with the audit server.';

    return {
      ok: false,
      status: 0,
      error: errorMsg,
      errorDetails: {
        type: 'unreachable',
        errorType: isAbort ? 'Request Timeout' : 'Network Error',
        reason: isAbort ? 'TIMEOUT' : 'FETCH_FAILED',
        message: errorMsg,
        url: fullUrl,
      },
    };
  }
}
