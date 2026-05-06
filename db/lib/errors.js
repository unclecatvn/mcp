/**
 * Error class hierarchy for the MCP DB server.
 * Every error has a stable `code` (suitable for documentation), a user-friendly
 * `message` (often with a fix hint), optional `details`, optional underlying
 * `cause`, and a `retryable` flag used by the connection retry loop.
 */

export class McpDbError extends Error {
  constructor(code, message, details = {}, cause = undefined, retryable = false) {
    super(message);
    this.name = "McpDbError";
    this.code = code;
    this.details = details;
    this.cause = cause;
    this.retryable = retryable;
  }
}

export class ConfigError extends McpDbError {
  constructor(message, details = {}, cause = undefined) {
    super("DB_CONFIG_INVALID", message, details, cause, false);
    this.name = "ConfigError";
  }
}

export class ValidationError extends McpDbError {
  constructor(message, details = {}, cause = undefined) {
    super("DB_VALIDATION_FAILED", message, details, cause, false);
    this.name = "ValidationError";
  }
}

export class PermissionDeniedError extends McpDbError {
  constructor(message, details = {}, cause = undefined) {
    super("DB_PERMISSION_DENIED", message, details, cause, false);
    this.name = "PermissionDeniedError";
  }
}

export class ConnectionError extends McpDbError {
  constructor(message, details = {}, cause = undefined) {
    super("DB_CONNECTION_FAILED", message, details, cause, true);
    this.name = "ConnectionError";
  }
}

export class TimeoutError extends McpDbError {
  constructor(message, details = {}, cause = undefined) {
    super("DB_TIMEOUT", message, details, cause, false);
    this.name = "TimeoutError";
  }
}

export class QueryError extends McpDbError {
  constructor(message, details = {}, cause = undefined) {
    super("DB_QUERY_FAILED", message, details, cause, false);
    this.name = "QueryError";
  }
}

export class ResultLimitError extends McpDbError {
  constructor(message, details = {}, cause = undefined) {
    super("DB_RESULT_TOO_LARGE", message, details, cause, false);
    this.name = "ResultLimitError";
  }
}

/**
 * Format any thrown value into the MCP tool error response shape.
 * @param {unknown} err
 * @returns {{ isError: true, content: Array<{type: "text", text: string}> }}
 */
export function formatErrorForMcp(err) {
  let code = "DB_INTERNAL";
  let message;
  if (err instanceof McpDbError) {
    code = err.code;
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }
  return {
    isError: true,
    content: [{ type: "text", text: `[${code}] ${message}` }],
  };
}
