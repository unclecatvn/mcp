import { resolveListPaging } from "./tableListing.js";

/**
 * @param {"postgresql"|"mysql"|"mariadb"|"sqlserver"} dialect
 * @param {{ schema?: string, namePattern?: string, limit?: number, offset?: number }} opts
 * @returns {{ sql: string, params: Array<unknown>|Record<string, unknown>, paging: object, paramStyle: "array"|"named" }}
 */
export function buildListTablesQuery(dialect, opts = {}) {
  const paging = resolveListPaging(opts);
  const { schema, namePattern } = opts;

  if (dialect === "postgresql") {
    const clauses = [];
    const params = [];
    let paramIdx = 1;

    if (schema) {
      clauses.push(`table_schema = $${paramIdx++}`);
      params.push(schema);
    } else {
      clauses.push(`table_schema NOT IN ('pg_catalog','information_schema')`);
    }
    if (namePattern) {
      clauses.push(`table_name LIKE $${paramIdx++}`);
      params.push(namePattern);
    }

    const sql = `SELECT table_schema, table_name FROM information_schema.tables WHERE ${clauses.join(" AND ")} ORDER BY table_schema, table_name LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(paging.fetchLimit, paging.offset);
    return { sql, params, paging, paramStyle: "array" };
  }

  if (dialect === "mysql" || dialect === "mariadb") {
    const clauses = [schema ? "table_schema = ?" : "table_schema = DATABASE()"];
    const params = schema ? [schema] : [];
    if (namePattern) {
      clauses.push("table_name LIKE ?");
      params.push(namePattern);
    }
    const sql = `SELECT table_schema, table_name FROM information_schema.tables WHERE ${clauses.join(" AND ")} ORDER BY table_schema, table_name LIMIT ? OFFSET ?`;
    params.push(paging.fetchLimit, paging.offset);
    return { sql, params, paging, paramStyle: "array" };
  }

  if (dialect === "sqlserver") {
    const clauses = [schema ? "TABLE_SCHEMA = @schema" : "TABLE_TYPE = 'BASE TABLE'"];
    const params = schema ? { schema } : {};
    if (namePattern) {
      clauses.push("TABLE_NAME LIKE @namePattern");
      params.namePattern = namePattern;
    }
    const sql = `SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE ${clauses.join(" AND ")} ORDER BY TABLE_SCHEMA, TABLE_NAME OFFSET @offset ROWS FETCH NEXT @fetchLimit ROWS ONLY`;
    params.offset = paging.offset;
    params.fetchLimit = paging.fetchLimit;
    return { sql, params, paging, paramStyle: "named" };
  }

  throw new Error(`Unsupported dialect for listTables: ${dialect}`);
}

/**
 * @param {"postgresql"|"mysql"|"mariadb"|"sqlserver"} dialect
 * @param {object} row
 */
export function mapListTablesRow(dialect, row) {
  if (dialect === "sqlserver") {
    return { name: row.TABLE_NAME, schema: row.TABLE_SCHEMA };
  }
  return {
    name: row.table_name ?? row.TABLE_NAME,
    schema: row.table_schema ?? row.TABLE_SCHEMA,
  };
}
