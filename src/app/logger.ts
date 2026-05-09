export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

export type Logger = Record<LogLevel, (message: string, context?: LogContext) => void>;

const sensitiveKeyPattern = /(authorization|cookie|credential|password|property|raw.?body|request.?body|secret|tenant|token)/i;

function isPrimitiveLogValue(value: unknown): value is string | number | boolean | null | undefined {
  return (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value === null
    || value === undefined
  );
}

export function sanitizeLogContext(context: LogContext = {}) {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      if (sensitiveKeyPattern.test(key)) {
        return [key, '[redacted]'];
      }

      if (isPrimitiveLogValue(value)) {
        return [key, value];
      }

      return [key, '[omitted]'];
    }),
  );
}

export function createLogger(options: { enabled?: boolean } = {}): Logger {
  const enabled = options.enabled ?? import.meta.env.DEV;

  function write(level: LogLevel, message: string, context?: LogContext) {
    if (!enabled) {
      return;
    }

    console[level](message, sanitizeLogContext(context));
  }

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
  };
}

export const logger = createLogger();
