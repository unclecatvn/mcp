import { describe, it, expect } from "vitest";
import {
  SearchReadInputSchema,
  SearchCountInputSchema,
  NameSearchInputSchema,
  ReadGroupInputSchema,
  CreateInputSchema,
  WriteInputSchema,
  UnlinkInputSchema,
  CallMethodInputSchema,
  FieldsGetInputSchema,
  parseOrThrow,
} from "../../lib/validators.js";

describe("validators", () => {
  describe("SearchReadInputSchema", () => {
    it("accepts a minimal valid input", () => {
      const r = SearchReadInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
      });
      expect(r.success).toBe(true);
    });

    it("accepts a full domain + paging", () => {
      const r = SearchReadInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        domain: [["state", "=", "sale"], "&", ["amount_total", ">", 100]],
        fields: ["name", "amount_total"],
        limit: 10,
        offset: 0,
        order: "date_order desc",
      });
      expect(r.success).toBe(true);
    });

    it("rejects invalid model name", () => {
      const r = SearchReadInputSchema.safeParse({ connection: "prod", model: "Sale.Order" });
      expect(r.success).toBe(false);
    });

    it("rejects invalid connection name", () => {
      const r = SearchReadInputSchema.safeParse({ connection: "PROD", model: "res.partner" });
      expect(r.success).toBe(false);
    });

    it("rejects unknown property (strict mode)", () => {
      const r = SearchReadInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        extra: 1,
      });
      expect(r.success).toBe(false);
    });

    it("rejects limit above 10000", () => {
      const r = SearchReadInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        limit: 10001,
      });
      expect(r.success).toBe(false);
    });
  });

  describe("CreateInputSchema", () => {
    it("accepts a single record dict", () => {
      const r = CreateInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        values: { name: "Acme" },
      });
      expect(r.success).toBe(true);
    });

    it("accepts an array of records", () => {
      const r = CreateInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        values: [{ name: "Acme" }, { name: "Initech" }],
      });
      expect(r.success).toBe(true);
    });

    it("rejects empty array of records", () => {
      const r = CreateInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        values: [],
      });
      expect(r.success).toBe(false);
    });
  });

  describe("WriteInputSchema", () => {
    it("accepts valid input", () => {
      const r = WriteInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        ids: [1, 2],
        values: { active: false },
      });
      expect(r.success).toBe(true);
    });

    it("rejects empty ids array", () => {
      const r = WriteInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        ids: [],
        values: { active: false },
      });
      expect(r.success).toBe(false);
    });

    it("rejects non-positive ids", () => {
      const r = WriteInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        ids: [0, -1],
        values: { active: false },
      });
      expect(r.success).toBe(false);
    });
  });

  describe("UnlinkInputSchema", () => {
    it("accepts valid input", () => {
      const r = UnlinkInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        ids: [10],
      });
      expect(r.success).toBe(true);
    });
  });

  describe("CallMethodInputSchema", () => {
    it("accepts minimal input", () => {
      const r = CallMethodInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        method: "action_confirm",
      });
      expect(r.success).toBe(true);
    });

    it("accepts args and kwargs", () => {
      const r = CallMethodInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        method: "action_confirm",
        args: [[1]],
        kwargs: { context: { lang: "en_US" } },
      });
      expect(r.success).toBe(true);
    });

    it("rejects bad method name", () => {
      const r = CallMethodInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        method: "1bad",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("FieldsGetInputSchema", () => {
    it("accepts attributes array", () => {
      const r = FieldsGetInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        attributes: ["string", "type", "required"],
      });
      expect(r.success).toBe(true);
    });

    it("accepts fields whitelist", () => {
      const r = FieldsGetInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        fields: ["name", "state"],
      });
      expect(r.success).toBe(true);
    });

    it("rejects empty attributes array", () => {
      const r = FieldsGetInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        attributes: [],
      });
      expect(r.success).toBe(false);
    });

    it("rejects empty fields array", () => {
      const r = FieldsGetInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        fields: [],
      });
      expect(r.success).toBe(false);
    });
  });

  describe("SearchCountInputSchema", () => {
    it("accepts minimal input", () => {
      const r = SearchCountInputSchema.safeParse({ connection: "prod", model: "res.partner" });
      expect(r.success).toBe(true);
    });

    it("accepts domain + limit", () => {
      const r = SearchCountInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        domain: [["active", "=", true]],
        limit: 1,
      });
      expect(r.success).toBe(true);
    });

    it("rejects unknown keys", () => {
      const r = SearchCountInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        extra: 1,
      });
      expect(r.success).toBe(false);
    });
  });

  describe("NameSearchInputSchema", () => {
    it("accepts minimal input", () => {
      const r = NameSearchInputSchema.safeParse({ connection: "prod", model: "res.partner" });
      expect(r.success).toBe(true);
    });

    it("accepts full input", () => {
      const r = NameSearchInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        name: "acme",
        domain: [["customer_rank", ">", 0]],
        operator: "ilike",
        limit: 5,
      });
      expect(r.success).toBe(true);
    });

    it("rejects unknown operator", () => {
      const r = NameSearchInputSchema.safeParse({
        connection: "prod",
        model: "res.partner",
        operator: "regex",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("ReadGroupInputSchema", () => {
    it("accepts minimal valid input", () => {
      const r = ReadGroupInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        aggregates: ["amount_total:sum"],
        groupby: ["user_id"],
      });
      expect(r.success).toBe(true);
    });

    it("accepts date granularity + lazy=false", () => {
      const r = ReadGroupInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        domain: [["state", "=", "sale"]],
        aggregates: ["amount_total:sum", "id:count"],
        groupby: ["user_id", "date_order:month"],
        lazy: false,
        orderby: "user_id, date_order",
        limit: 100,
      });
      expect(r.success).toBe(true);
    });

    it("rejects empty aggregates", () => {
      const r = ReadGroupInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        aggregates: [],
        groupby: ["user_id"],
      });
      expect(r.success).toBe(false);
    });

    it("rejects empty groupby", () => {
      const r = ReadGroupInputSchema.safeParse({
        connection: "prod",
        model: "sale.order",
        aggregates: ["amount_total:sum"],
        groupby: [],
      });
      expect(r.success).toBe(false);
    });
  });

  describe("parseOrThrow", () => {
    it("returns parsed value on success", async () => {
      const r = await parseOrThrow(
        UnlinkInputSchema,
        { connection: "prod", model: "res.partner", ids: [1] },
        "unlink",
      );
      expect(r.connection).toBe("prod");
    });

    it("throws InputValidationError on failure with composed message", async () => {
      await expect(
        parseOrThrow(UnlinkInputSchema, { connection: "PROD" }, "unlink"),
      ).rejects.toMatchObject({
        name: "InputValidationError",
        code: "ODOO_INPUT_INVALID",
      });
    });
  });
});
