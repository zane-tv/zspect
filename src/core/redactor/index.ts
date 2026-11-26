const SENSITIVE_KEY_PATTERN =
  /(authorization|proxy-authorization|cookie|set-cookie|token|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|client[_-]?secret|password|passwd|pwd|api[_-]?key|apikey|x-api-key|session|session[_-]?id|csrf|xsrf|private[_-]?key|signature|sig)/i;

const INLINE_SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /Basic\s+[A-Za-z0-9+/]+=*/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{12,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
];

export const REDACTED = '[REDACTED]';

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key.trim());
}

export function redactInlineSecrets(input: string): string {
  let out = input;
  for (const pattern of INLINE_SECRET_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

export function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, 'https://placeholder.local');
    const isRelative = !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(rawUrl);

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (isSensitiveKey(key)) {
        parsed.searchParams.set(key, REDACTED);
      } else {
        const val = parsed.searchParams.get(key) ?? '';
        const cleaned = redactInlineSecrets(val);
        if (cleaned !== val) {
          parsed.searchParams.set(key, cleaned);
        }
      }
    }

    if (parsed.username || parsed.password) {
      parsed.username = REDACTED;
      parsed.password = '';
    }

    if (isRelative) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    return redactInlineSecrets(rawUrl);
  }
}

export function redactHeaders(
  headers: Record<string, string> | Headers | Array<[string, string]>,
): Record<string, string> {
  const result: Record<string, string> = {};
  const entries: Array<[string, string]> =
    headers instanceof Headers
      ? Array.from(headers.entries())
      : Array.isArray(headers)
        ? headers
        : Object.entries(headers);

  for (const [key, val] of entries) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactInlineSecrets(String(val));
  }
  return result;
}

function redactObjectDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[MAX_DEPTH]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactInlineSecrets(value);
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => redactObjectDeep(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redactObjectDeep(v, depth + 1);
  }
  return out;
}

export function redactTextOrJson(payload: string | null | undefined, maxLength = 1024): string {
  if (!payload) return '';
  const trimmed = payload.trim();
  if (!trimmed) return '';

  let sanitized: string;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      sanitized = JSON.stringify(redactObjectDeep(parsed));
    } catch {
      sanitized = redactInlineSecrets(trimmed);
    }
  } else {
    sanitized = redactInlineSecrets(trimmed);
  }

  if (sanitized.length > maxLength) {
    return `${sanitized.slice(0, maxLength)}… [truncated]`;
  }
  return sanitized;
}
