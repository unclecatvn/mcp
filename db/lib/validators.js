import { z } from "zod";

export const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const Identifier = z.string().regex(IDENTIFIER_RE, {
  message: "must be a valid identifier (letters, digits, underscore; not starting with a digit)",
});

const Sql = z.string().min(1).max(100_000);

const Params = z.union([z.array(z.unknown()), z.record(z.unknown())]).optional();

const MaxRows = z.number().int().positive().max(1_000_000).optional();
const TimeoutMs = z.number().int().positive().max(600_000).optional();

export const DbQueryInputSchema = z
  .object({
    databaseAlias: Identifier,
    sql: Sql,
    params: Params,
    maxRows: MaxRows,
    timeoutMs: TimeoutMs,
  })
  .strict();

export const DbListTablesInputSchema = z
  .object({
    databaseAlias: Identifier,
    schema: Identifier.optional(),
  })
  .strict();

export const DbDescribeTableInputSchema = z
  .object({
    databaseAlias: Identifier,
    tableName: Identifier,
    schema: Identifier.optional(),
  })
  .strict();

export const DbTestConnectionInputSchema = z
  .object({
    databaseAlias: Identifier,
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
    databaseAlias: Identifier,
    sql: Sql,
    params: Params,
  })
  .strict();

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
