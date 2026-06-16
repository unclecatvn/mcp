import {
  DbQueryInputSchema,
  DbListTablesInputSchema,
  DbDescribeTableInputSchema,
  DbTestConnectionInputSchema,
  DbQueryHistoryInputSchema,
  DbExplainQueryInputSchema,
  parseOrThrow,
  resolveDatabaseAlias,
} from "./validators.js";
import { analyzeQuery } from "./queryAnalyzer.js";
import { enforceMode } from "./modeEnforcer.js";
import { applyRowLimit, resolveTimeout, resolveMaxRows } from "./limits.js";
import { convertParams } from "./paramConverter.js";
import { formatErrorForMcp } from "./errors.js";
import { ToolDescriptorBuilder } from "./toolDescriptors.js";

const HISTORY_MAX = 50;

export class ToolHandlers {
  /**
   * @param {import("./connectionManager.js").ConnectionRegistry} registry
   * @param {{ defaultAlias?: string, configSource?: "config_file"|"env" }} [opts]
   */
  constructor(registry, opts = {}) {
    this.registry = registry;
    this.history = [];
    this.defaultAlias = opts.defaultAlias;
    this.configSource = opts.configSource ?? "env";
    this.descriptorBuilder = new ToolDescriptorBuilder(registry, {
      defaultAlias: this.defaultAlias,
    });
  }

  toolDescriptors() {
    return this.descriptorBuilder.build();
  }

  async dispatch(name, input) {
    try {
      switch (name) {
        case "db_query":
          return await this.handleQuery(input);
        case "db_list_tables":
          return await this.handleListTables(input);
        case "db_describe_table":
          return await this.handleDescribeTable(input);
        case "db_test_connection":
          return await this.handleTestConnection(input);
        case "db_query_history":
          return await this.handleHistory(input);
        case "db_explain_query":
          return await this.handleExplain(input);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      return formatErrorForMcp(err);
    }
  }

  async handleQuery(input) {
    const parsed = await parseOrThrow(DbQueryInputSchema, input, "db_query");
    const args = await resolveDatabaseAlias(parsed, this.defaultAlias, "db_query");
    return this._runQuery(args, /*explain*/ false);
  }

  async handleExplain(input) {
    const parsed = await parseOrThrow(DbExplainQueryInputSchema, input, "db_explain_query");
    const args = await resolveDatabaseAlias(parsed, this.defaultAlias, "db_explain_query");
    const cfg = this.registry.getConfig(args.databaseAlias);
    let prefix;
    switch (cfg.type) {
      case "postgresql":
      case "mysql":
      case "mariadb":
        prefix = "EXPLAIN ";
        break;
      case "sqlserver":
        prefix = "";
        break;
      default:
        prefix = "EXPLAIN ";
    }
    return this._runQuery({ ...args, sql: `${prefix}${args.sql}` }, /*explain*/ true);
  }

  async _runQuery({ databaseAlias, sql, params, maxRows, timeoutMs }, isExplain) {
    const cfg = this.registry.getConfig(databaseAlias);
    const analysis = analyzeQuery(sql);
    enforceMode(analysis, cfg.mode, databaseAlias, { configSource: this.configSource });

    const effMaxRows = resolveMaxRows(maxRows, cfg.maxRows);
    const effTimeout = resolveTimeout(timeoutMs, cfg.timeoutMs);

    const limited = applyRowLimit(analysis, sql, effMaxRows, cfg.type);
    const converted = convertParams(limited.sql, params, cfg.type);

    const start = Date.now();
    const { result, retries } = await this.registry.withRetry(databaseAlias, (driver) =>
      driver.executeQuery({
        sql: converted.sql,
        params: converted.params,
        timeoutMs: effTimeout,
      }),
    );
    const elapsedMs = Date.now() - start;

    let rows = result.rows;
    let truncated = false;
    if (limited.fetchPlusOne && rows.length > effMaxRows) {
      rows = rows.slice(0, effMaxRows);
      truncated = true;
    }
    const rowCount = truncated ? effMaxRows : result.rowCount;

    this._record({
      alias: databaseAlias,
      type: analysis.primaryType,
      elapsedMs,
      rowCount,
      truncated,
      success: true,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              rows,
              rowCount,
              columns: result.columns,
              elapsedMs,
              retries,
              truncated,
              ...(truncated
                ? {
                    hint: "Result truncated. Add LIMIT to your query or pass a higher maxRows.",
                  }
                : {}),
              ...(isExplain ? { isExplain: true } : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  async handleListTables(input) {
    const parsed = await parseOrThrow(DbListTablesInputSchema, input, "db_list_tables");
    const args = await resolveDatabaseAlias(parsed, this.defaultAlias, "db_list_tables");
    const cfg = this.registry.getConfig(args.databaseAlias);
    const schema = args.schema ?? cfg.defaultSchema;
    const { result } = await this.registry.withRetry(args.databaseAlias, (d) =>
      d.listTables({
        schema,
        limit: args.limit,
        offset: args.offset,
        namePattern: args.namePattern,
      }),
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  async handleDescribeTable(input) {
    const parsed = await parseOrThrow(DbDescribeTableInputSchema, input, "db_describe_table");
    const args = await resolveDatabaseAlias(parsed, this.defaultAlias, "db_describe_table");
    const cfg = this.registry.getConfig(args.databaseAlias);
    const schema = args.schema ?? cfg.defaultSchema;
    const { result } = await this.registry.withRetry(args.databaseAlias, (d) =>
      d.describeTable({ tableName: args.tableName, schema }),
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  async handleTestConnection(input) {
    const parsed = await parseOrThrow(DbTestConnectionInputSchema, input, "db_test_connection");
    const args = await resolveDatabaseAlias(parsed, this.defaultAlias, "db_test_connection");
    const { result } = await this.registry.withRetry(args.databaseAlias, (d) => d.healthCheck());
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: result }, null, 2) }],
    };
  }

  async handleHistory(input) {
    const args = await parseOrThrow(DbQueryHistoryInputSchema, input, "db_query_history");
    const filtered = args.databaseAlias
      ? this.history.filter((h) => h.alias === args.databaseAlias)
      : this.history;
    const limit = args.limit ?? HISTORY_MAX;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(filtered.slice(-limit), null, 2),
        },
      ],
    };
  }

  _record(entry) {
    this.history.push({ ...entry, ts: new Date().toISOString() });
    if (this.history.length > HISTORY_MAX) this.history.shift();
  }
}
