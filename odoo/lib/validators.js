import { z } from "zod";

const ConnectionName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, {
    message: "connection name must be lowercase, start with a letter, and contain only [a-z0-9_]",
  });

const ModelName = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9_.]*$/, {
    message: "Odoo model name must match [a-z][a-z0-9_.]* (e.g., 'sale.order', 'res.partner')",
  });

const MethodName = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: "method name must match [A-Za-z_][A-Za-z0-9_]*",
  });

// Odoo domain leaf:  [field, operator, value]  or  "&" / "|" / "!"
const DomainItem = z.union([
  z.enum(["&", "|", "!"]),
  z.tuple([z.string(), z.string(), z.unknown()]),
]);
const Domain = z.array(DomainItem);

const IdArray = z.array(z.number().int().positive()).min(1);

const PositiveInt = z.number().int().positive();
const NonNegativeInt = z.number().int().min(0);

const FieldNameArray = z.array(z.string().min(1)).min(1);

export const ListConnectionsInputSchema = z.object({}).strict();

export const FieldsGetInputSchema = z
  .object({
    connection: ConnectionName,
    model: ModelName,
    fields: FieldNameArray.optional(),
    attributes: FieldNameArray.optional(),
  })
  .strict();

export const SearchReadInputSchema = z
  .object({
    connection: ConnectionName,
    model: ModelName,
    domain: Domain.optional(),
    fields: z.array(z.string()).optional(),
    limit: PositiveInt.max(10_000).optional(),
    offset: NonNegativeInt.optional(),
    order: z.string().max(256).optional(),
  })
  .strict();

export const CreateInputSchema = z
  .object({
    connection: ConnectionName,
    model: ModelName,
    values: z.union([z.record(z.unknown()), z.array(z.record(z.unknown())).min(1)]),
  })
  .strict();

export const WriteInputSchema = z
  .object({
    connection: ConnectionName,
    model: ModelName,
    ids: IdArray,
    values: z.record(z.unknown()),
  })
  .strict();

export const UnlinkInputSchema = z
  .object({
    connection: ConnectionName,
    model: ModelName,
    ids: IdArray,
  })
  .strict();

export const CallMethodInputSchema = z
  .object({
    connection: ConnectionName,
    model: ModelName,
    method: MethodName,
    args: z.array(z.unknown()).optional(),
    kwargs: z.record(z.unknown()).optional(),
  })
  .strict();

export const SearchCountInputSchema = z
  .object({
    connection: ConnectionName,
    model: ModelName,
    domain: Domain.optional(),
    limit: PositiveInt.max(1_000_000).optional(),
  })
  .strict();

export const NameSearchInputSchema = z
  .object({
    connection: ConnectionName,
    model: ModelName,
    name: z.string().max(256).optional(),
    domain: Domain.optional(),
    operator: z.enum(["ilike", "like", "=ilike", "=like", "="]).optional(),
    limit: PositiveInt.max(1_000).optional(),
  })
  .strict();

// Aggregate spec like "amount_total:sum" / "name:count" / "alias:agg(field)".
// We don't try to validate the body strictly — Odoo's regex covers a wide
// surface area. We just require non-empty strings.
const AggregateSpec = z.string().min(1).max(128);

export const ReadGroupInputSchema = z
  .object({
    connection: ConnectionName,
    model: ModelName,
    domain: Domain.optional(),
    aggregates: z.array(AggregateSpec).min(1),
    groupby: z.array(z.string().min(1).max(128)).min(1),
    offset: NonNegativeInt.optional(),
    limit: PositiveInt.max(10_000).optional(),
    orderby: z.string().max(256).optional(),
    lazy: z.boolean().optional(),
  })
  .strict();

/**
 * Parse input through a zod schema. On failure, throws InputValidationError
 * with a human-readable message. Lazy-imports errors to avoid a circular dep.
 */
export async function parseOrThrow(schema, input, toolName) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const { InputValidationError } = await import("./errors.js");
  const issues = result.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  throw new InputValidationError(`Invalid input for ${toolName}: ${issues}`, {
    toolName,
    issues: result.error.issues,
  });
}
