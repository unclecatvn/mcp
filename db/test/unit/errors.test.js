import { describe, it, expect } from "vitest";
import {
  McpDbError,
  ConfigError,
  ValidationError,
  PermissionDeniedError,
  ConnectionError,
  TimeoutError,
  QueryError,
  ResultLimitError,
  formatErrorForMcp,
} from "../../lib/errors.js";

describe("McpDbError base class", () => {
  it("captures code, message, details, cause, retryable flag", () => {
    const cause = new Error("boom");
    const err = new McpDbError("DB_TEST", "test msg", { foo: "bar" }, cause, false);
    expect(err.code).toBe("DB_TEST");
    expect(err.message).toBe("test msg");
    expect(err.details).toEqual({ foo: "bar" });
    expect(err.cause).toBe(cause);
    expect(err.retryable).toBe(false);
    expect(err.name).toBe("McpDbError");
  });

  it("is instanceof Error", () => {
    expect(new McpDbError("X", "y")).toBeInstanceOf(Error);
  });
});

describe("specific error subclasses", () => {
  it("ConfigError has code DB_CONFIG_INVALID, not retryable", () => {
    const err = new ConfigError("missing field", { field: "type" });
    expect(err.code).toBe("DB_CONFIG_INVALID");
    expect(err.retryable).toBe(false);
    expect(err.name).toBe("ConfigError");
  });

  it("ValidationError has code DB_VALIDATION_FAILED", () => {
    expect(new ValidationError("bad input").code).toBe("DB_VALIDATION_FAILED");
  });

  it("PermissionDeniedError has code DB_PERMISSION_DENIED", () => {
    expect(new PermissionDeniedError("nope").code).toBe("DB_PERMISSION_DENIED");
  });

  it("ConnectionError is retryable=true", () => {
    expect(new ConnectionError("conn lost").retryable).toBe(true);
    expect(new ConnectionError("conn lost").code).toBe("DB_CONNECTION_FAILED");
  });

  it("TimeoutError has code DB_TIMEOUT, not retryable", () => {
    const err = new TimeoutError("too slow", { timeoutMs: 5000 });
    expect(err.code).toBe("DB_TIMEOUT");
    expect(err.retryable).toBe(false);
  });

  it("QueryError has code DB_QUERY_FAILED", () => {
    expect(new QueryError("syntax err").code).toBe("DB_QUERY_FAILED");
  });

  it("ResultLimitError has code DB_RESULT_TOO_LARGE", () => {
    expect(new ResultLimitError("too many").code).toBe("DB_RESULT_TOO_LARGE");
  });
});

describe("formatErrorForMcp", () => {
  it("formats McpDbError with code prefix", () => {
    const err = new PermissionDeniedError("Database 'prod' is in readonly mode.");
    const out = formatErrorForMcp(err);
    expect(out).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "[DB_PERMISSION_DENIED] Database 'prod' is in readonly mode.",
        },
      ],
    });
  });

  it("formats unknown Error with DB_INTERNAL code", () => {
    const out = formatErrorForMcp(new Error("oops"));
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toBe("[DB_INTERNAL] oops");
  });

  it("formats non-error values defensively", () => {
    const out = formatErrorForMcp("string value");
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toBe("[DB_INTERNAL] string value");
  });
});
