export const REDACTION_PLACEHOLDER = '[REDACTED]';

const BUILT_IN_SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'token',
  'access_token',
  'refresh_token',
  'credential_ref',
  'request_payload',
]);

type RedactionOptions = {
  sensitiveFieldPaths?: string[];
};

export const redactForStorage = <T>(
  input: T,
  options: RedactionOptions = {},
): T => {
  const sensitivePaths = new Set(options.sensitiveFieldPaths ?? []);

  return redactNode(input, [], sensitivePaths) as T;
};

const redactNode = (
  value: unknown,
  pathSegments: string[],
  sensitivePaths: Set<string>,
): unknown => {
  const currentPath = pathSegments.join('.');

  if (currentPath && sensitivePaths.has(currentPath)) {
    return REDACTION_PLACEHOLDER;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      redactNode(item, [...pathSegments, String(index)], sensitivePaths),
    );
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const redactedEntries = Object.entries(value).map(([key, childValue]) => {
    if (BUILT_IN_SENSITIVE_KEYS.has(key.toLowerCase())) {
      return [key, REDACTION_PLACEHOLDER];
    }

    return [
      key,
      redactNode(childValue, [...pathSegments, key], sensitivePaths),
    ];
  });

  return Object.fromEntries(redactedEntries);
};

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
