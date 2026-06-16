import { z } from "zod";

export const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LIKE_PATTERN_RE = /^[A-Za-z0-9_%]+$/;

const Identifier = z.string().regex(IDENTIFIER_RE, {
  message: "must be a valid identifier (letters, digits, underscore; not starting with a digit)",
});

const Sql = z.string().min(1).max(100_000);

const Params = z.union([z.array(z.unknown()), z.record(z.unknown())]).optional();

const MaxRows = z.number().int().positive().max(1_000_000).optional();
const TimeoutMs = z.number().int().positive().max(600_000).optional();

const OptionalAlias = Identifier.optional();

const ListLimit = z.number().int().positive().max(500).optional();
const ListOffset = z.number().int().min(0).optional();
const NamePattern = z
  .string()
  .regex(LIKE_PATTERN_RE, {
    message: "must contain only letters, digits, underscore, %, and _",
  })
  .max(128)
  .optional();

export const DbQueryInputSchema = z
  .object({
    databaseAlias: OptionalAlias,
    sql: Sql,
    params: Params,
    maxRows: MaxRows,
    timeoutMs: TimeoutMs,
  })
  .strict();

export const DbListTablesInputSchema = z
  .object({
    databaseAlias: OptionalAlias,
    schema: Identifier.optional(),
    limit: ListLimit,
    offset: ListOffset,
    namePattern: NamePattern,
  })
  .strict();

export const DbDescribeTableInputSchema = z
  .object({
    databaseAlias: OptionalAlias,
    tableName: Identifier,
    schema: Identifier.optional(),
  })
  .strict();

export const DbTestConnectionInputSchema = z
  .object({
    databaseAlias: OptionalAlias,
  })
  .strict();

export const DbQueryHistoryInputSchema = z
  .object({
    databaseAlias: Identifier.optional(),
    limit: z.number().int().positive().max(500).optional(),
  })
  .strict();

export const DbExplainQueryInputSchema = z
  .object({
    databaseAlias: OptionalAlias,
    sql: Sql,
    params: Params,
  })
  .strict();

/**
 * Resolve databaseAlias from tool input, falling back to server defaultAlias.
 * @throws {import("./errors.js").ValidationError}
 */
export async function resolveDatabaseAlias(input, defaultAlias, toolName) {
  const alias = input.databaseAlias ?? defaultAlias;
  if (!alias) {
    const { ValidationError } = await import("./errors.js");
    throw new ValidationError(
      `Invalid input for ${toolName}: databaseAlias is required when no defaultAlias is configured`,
      { toolName, field: "databaseAlias" },
    );
  }
  return { ...input, databaseAlias: alias };
}

/**
 * Parse input through a schema. On failure, throws ValidationError with a
 * human-readable message.
 *
 * Imported lazily to avoid a circular dep between validators ↔ errors.
 */
export async function parseOrThrow(schema, input, toolName) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const { ValidationError } = await import("./errors.js");
  const issues = result.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  throw new ValidationError(`Invalid input for ${toolName}: ${issues}`, {
    toolName,
    issues: result.error.issues,
  });
}
