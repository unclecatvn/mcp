/**
 * Query Analysis Module
 * Provides database-specific query analysis and optimization suggestions
 * @module lib/queryAnalyzer
 */

import {
  DATABASE_FEATURES,
  TABLE_PATTERNS,
} from "./constants.js";

/**
 * Detect query type for better context
 * @param {string} query - SQL query to analyze
 * @param {string} dbType - Database type (mysql, postgresql, sqlserver)
 * @returns {Object} Query type info with type, readOnly, and optional flags
 */
export function detectQueryType(query, dbType = "mysql") {
  const trimmed = query.trim().toUpperCase();

  // Database-specific command detection
  if (dbType === "postgresql") {
    if (trimmed.startsWith("WITH")) return { type: "CTE", readOnly: true };
    if (/^\s*(SELECT|WITH)\s+.*?\bFOR\s+UPDATE\b/i.test(query))
      return { type: "SELECT_FOR_UPDATE", readOnly: false };
    if (trimmed.startsWith("REFRESH MATERIALIZED VIEW"))
      return { type: "REFRESH_MV", readOnly: false };
    if (/\bRETURNING\b/i.test(query))
      return { type: "DML_RETURNING", readOnly: false, hasReturning: true };
  }

  if (dbType === "sqlserver") {
    if (trimmed.startsWith("SELECT") && /\bINTO\s+\w+/i.test(query))
      return { type: "SELECT_INTO", readOnly: false };
    if (trimmed.startsWith("EXEC") || trimmed.startsWith("EXECUTE"))
      return { type: "EXECUTE", readOnly: false };
    if (/^\s*MERGE\b/i.test(query))
      return { type: "MERGE", readOnly: false };
    if (/^\s*BULK\s+INSERT\b/i.test(query))
      return { type: "BULK_INSERT", readOnly: false };
  }

  if (dbType === "mysql" || dbType === "mariadb") {
    if (/^\s*REPLACE\b/i.test(query))
      return { type: "REPLACE", readOnly: false };
    if (/^\s*INSERT\s+.*?\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i.test(query))
      return { type: "INSERT_ON_DUPLICATE", readOnly: false };
    if (/^\s*(SHOW|DESCRIBE|EXPLAIN|HELP)\b/i.test(query))
      return { type: "METADATA", readOnly: true };
    if (/FOR\s+UPDATE\b/i.test(query))
      return { type: "SELECT_FOR_UPDATE", readOnly: false };
    if (/^.*?\bLOCK\s+IN\s+SHARE\s+MODE\b/i.test(query))
      return { type: "SELECT_LOCK", readOnly: false };
  }

  // Common SQL commands
  if (trimmed.startsWith("SELECT")) return { type: "SELECT", readOnly: true };
  if (trimmed.startsWith("INSERT")) return { type: "INSERT", readOnly: false };
  if (trimmed.startsWith("UPDATE")) return { type: "UPDATE", readOnly: false };
  if (trimmed.startsWith("DELETE")) return { type: "DELETE", readOnly: false };
  if (trimmed.startsWith("CREATE")) return { type: "CREATE", readOnly: false, isDDL: true };
  if (trimmed.startsWith("ALTER")) return { type: "ALTER", readOnly: false, isDDL: true };
  if (trimmed.startsWith("DROP")) return { type: "DROP", readOnly: false, isDDL: true };
  if (trimmed.startsWith("TRUNCATE")) return { type: "TRUNCATE", readOnly: false, isDDL: true };
  if (trimmed.startsWith("BEGIN") || trimmed.startsWith("START TRANSACTION"))
    return { type: "TRANSACTION_BEGIN", readOnly: false, isTransaction: true };
  if (trimmed.startsWith("COMMIT")) return { type: "TRANSACTION_COMMIT", readOnly: false, isTransaction: true };
  if (trimmed.startsWith("ROLLBACK")) return { type: "TRANSACTION_ROLLBACK", readOnly: false, isTransaction: true };

  return { type: "UNKNOWN", readOnly: false };
}

/**
 * Get database-specific features and configuration
 * @param {string} type - Database type
 * @returns {Object} Database features object
 */
export function getDatabaseFeatures(type) {
  return DATABASE_FEATURES[type] || DATABASE_FEATURES.mysql;
}

/**
 * Detect database-specific functions used in query
 * @param {string} query - SQL query to analyze
 * @param {string} dbType - Database type
 * @returns {Object} Detected functions by category
 */
export function detectDatabaseFunctions(query, dbType) {
  const features = getDatabaseFeatures(dbType);
  const detected = {
    stringFunctions: [],
    dateFunctions: [],
    aggregateFunctions: [],
    windowFunctions: [],
    jsonFunctions: [],
    otherFunctions: [],
  };

  const allFuncs = [
    ...features.stringFunctions.map(f => ({ name: f, category: "stringFunctions" })),
    ...features.dateFunctions.map(f => ({ name: f, category: "dateFunctions" })),
    ...["COUNT", "SUM", "AVG", "MIN", "MAX", "GROUP_CONCAT", "STRING_AGG"].map(f => ({ name: f, category: "aggregateFunctions" })),
    ...["ROW_NUMBER", "RANK", "DENSE_RANK", "LAG", "LEAD", "NTILE"].map(f => ({ name: f, category: "windowFunctions" })),
    ...["JSON_EXTRACT", "JSON_ARRAY", "JSON_OBJECT", "JSON_VALUE", "JSON_QUERY"].map(f => ({ name: f, category: "jsonFunctions" })),
  ];

  for (const func of allFuncs) {
    const regex = new RegExp(`\\b${func.name}\\s*\\(`, "i");
    if (regex.test(query)) {
      detected[func.category].push(func.name);
    }
  }

  return detected;
}

/**
 * Extract table names from query for context
 * @param {string} query - SQL query
 * @param {string} type - Database type
 * @returns {string[]} Array of table names (max 10)
 */
export function extractTableNames(query, type) {
  const tables = [];
  const upperQuery = query.toUpperCase();

  const relevantPatterns = TABLE_PATTERNS[type] || TABLE_PATTERNS.mysql;

  for (const pattern of relevantPatterns) {
    let match;
    // Reset regex state
    pattern.lastIndex = 0;
    while ((match = pattern.exec(upperQuery)) !== null) {
      let table = match[1];
      // Clean up table name
      table = table.replace(/[`"\[\]]/g, "").trim();
      if (table && !tables.includes(table) && !table.toUpperCase().startsWith("WHERE")) {
        tables.push(table);
      }
    }
  }

  return [...new Set(tables)].slice(0, 10);
}

/**
 * Analyze query for performance issues and best practices
 * @param {string} query - SQL query to analyze
 * @param {Object} queryInfo - Query type info from detectQueryType
 * @param {string[]} tables - Tables involved in query
 * @param {string} dbType - Database type
 * @returns {string} Analysis report in markdown format
 */
export function analyzeQueryPerformance(query, queryInfo, tables, dbType) {
  const features = getDatabaseFeatures(dbType);
  const issues = [];
  const suggestions = [];
  const positives = [];
  const warnings = [];
  const dbSpecificHints = [];

  // Detect functions used
  const functions = detectDatabaseFunctions(query, dbType);

  // ===== Common SQL checks =====

  // Check for SELECT *
  if (/\bSELECT\s+\*\s+FROM\b/i.test(query)) {
    issues.push("Using `SELECT *` retrieves all columns");
    suggestions.push("Replace `SELECT *` with specific column names to reduce data transfer and improve query plan caching");
  }

  // Check for missing WHERE clause in DELETE/UPDATE
  if ((queryInfo.type === "DELETE" || queryInfo.type === "UPDATE") && !/\bWHERE\b/i.test(query)) {
    issues.push("DANGEROUS: DELETE/UPDATE without WHERE clause");
    suggestions.push("Always include WHERE clause to limit affected rows");
  }

  // Check for LIKE with leading wildcard
  if (/LIKE\s+['"][%_]/i.test(query)) {
    issues.push("LIKE pattern starts with wildcard (% or_)");
    suggestions.push("Leading wildcards prevent index usage. Consider: full-text search, reversed column storage, or specialized search engines");
  }

  // Check for subqueries in SELECT clause
  if (/\bSELECT\b[\s\S]*?\(\s*SELECT\b/i.test(query) && !/\bFROM\s+\(/i.test(query)) {
    issues.push("Subquery in SELECT clause (correlated subquery)");
    suggestions.push("Consider JOIN instead for better performance");
  }

  // Check for multiple OR conditions on same column
  const orMatches = query.match(/\b(\w+)\s*=\s*['"][^'"]*['"]\s+OR\s+\1\s*=/gi);
  if (orMatches && orMatches.length > 1) {
    issues.push("Multiple OR conditions on same column");
    suggestions.push(`Consider using IN clause: \`${orMatches[0].split(/\s+OR\s+/i)[0]} IN (...)\``);
  }

  // Check for NOT IN
  if (/\bNOT\s+IN\b/i.test(query)) {
    issues.push("NOT IN can be slow with large datasets");
    suggestions.push("Consider NOT EXISTS or LEFT JOIN ... WHERE ... IS NULL for better performance");
  }

  // Check for JOIN without ON condition
  if (/\bJOIN\b/i.test(query) && !/\bON\b/i.test(query) && !/\bNATURAL\b/i.test(query)) {
    issues.push("JOIN without ON condition");
    suggestions.push("Always specify join conditions with ON clause");
  }

  // ===== Database-specific checks =====

  if (dbType === "mysql" || dbType === "mariadb") {
    // MySQL-specific issues
    if (/\bGROUP\s+BY\b/i.test(query) && /\bHAVING\b/i.test(query)) {
      const whereBeforeHaving = /\bWHERE\b.*?\bGROUP\s+BY\b/is.test(query);
      if (!whereBeforeHaving) {
        issues.push("Using HAVING without filtering in WHERE first");
        suggestions.push("Move filters to WHERE clause before GROUP BY when possible");
      }
    }

    // Check for filesort indicators
    if (/\bORDER\s+BY\b/i.test(query) && !/\bLIMIT\b/i.test(query)) {
      warnings.push("ORDER BY without LIMIT may cause filesort on large datasets");
      dbSpecificHints.push("MySQL Limit Syntax: " + features.limitSyntax);
    }

    // Check for non-deterministic ORDER BY with LIMIT
    if (/\bORDER\s+BY\b/i.test(query) && /\bLIMIT\b/i.test(query)) {
      const orderByCols = query.match(/ORDER\s+BY\s+([^,\s]+)/i);
      if (orderByCols) {
        const hasUniqueKey = /\bPRIMARY\s+KEY\b/i.test(query) || /\bUNIQUE\b/i.test(query);
        if (!hasUniqueKey) {
          warnings.push("ORDER BY with LIMIT but no unique/primary key - results may be non-deterministic");
        }
      }
    }

    // MySQL function checks
    if (functions.aggregateFunctions.includes("GROUP_CONCAT")) {
      positives.push("Uses GROUP_CONCAT for efficient aggregation");
    }

    // Check for index usage hint opportunity
    if (/\bJOIN\b/i.test(query) && !/\bUSE\s+INDEX\b/i && !/\bFORCE\s+INDEX\b/i) {
      dbSpecificHints.push("Consider using index hints if join is slow: " + features.indexHint);
    }
  }

  if (dbType === "postgresql") {
    // PostgreSQL-specific issues
    if (/\bOFFSET\s+(\d{3,})\b/i.test(query)) {
      issues.push(`High OFFSET value (${query.match(/OFFSET\s+(\d+)/i)[1]}) is inefficient`);
      suggestions.push("Use keyset pagination (cursor-based) instead of OFFSET for large offsets");
    }

    // Check for ILIKE (case-insensitive like)
    if (/\bILIKE\b/i.test(query)) {
      warnings.push("ILIKE prevents index usage (unless using pg_trgm)");
      dbSpecificHints.push("Consider adding pg_trgm extension: CREATE EXTENSION pg_trgm; and use GIN/GiST indexes");
    }

    // Check for sequential scan patterns
    if (/\bLIKE\b/i.test(query) && !/\bINDEX\b/i.test(query)) {
      dbSpecificHints.push("For pattern matching, consider: pg_trgm extension or full-text search (tsvector)");
    }

    // PostgreSQL function checks
    if (functions.stringFunctions.includes("STRING_AGG")) {
      positives.push("Uses STRING_AGG (PostgreSQL native aggregation)");
    }

    if (/\bRETURNING\b/i.test(query)) {
      positives.push("Uses RETURNING clause - efficient way to get modified data");
    }

    // CTE detection
    if (queryInfo.type === "CTE") {
      positives.push("Uses CTE (WITH clause) - improves readability");
      warnings.push("CTEs in PostgreSQL are optimized fences - consider inlining for simple cases");
    }
  }

  if (dbType === "sqlserver") {
    // SQL Server-specific issues
    if (/\bTOP\s+\d+\b/i.test(query) && !/\bORDER\s+BY\b/i.test(query)) {
      issues.push("TOP without ORDER BY is non-deterministic");
      suggestions.push("Always use ORDER BY with TOP to ensure consistent results");
    }

    // Check for NOLOCK hint
    if (/\bWITH\s*\(\s*NOLOCK\s*\)/i.test(query)) {
      warnings.push("Using NOLOCK can read uncommitted/dirty data");
      dbSpecificHints.push("Consider READ COMMITTED SNAPSHOT isolation instead of NOLOCK");
    }

    // Check for string concatenation with +
    if (/\+.*?['"]|['"].*?\+/i.test(query) && !/\bCONCAT\b/i.test(query)) {
      warnings.push("Using + for string concatenation can cause issues with NULL");
      dbSpecificHints.push("Use CONCAT() or CONCAT_WS() for safer string concatenation");
    }

    // Check for table variables vs temp tables
    if (/\bDECLARE\s+@\w+\s+TABLE\b/i.test(query)) {
      dbSpecificHints.push("Table variables have no statistics - consider temp tables for larger datasets");
    }

    // SQL Server function checks
    if (functions.aggregateFunctions.includes("STRING_AGG")) {
      positives.push("Uses STRING_AGG (SQL Server 2017+)");
    }
  }

  // ===== Positive patterns =====
  if (/\bLIMIT\b/i.test(query) || /\bTOP\b/i.test(query) || /\bFETCH\s+NEXT\b/i.test(query)) {
    positives.push("Uses result limiting (LIMIT/TOP/FETCH)");
  }

  if (/\bWHERE\b/i.test(query)) {
    positives.push("Uses WHERE clause for filtering");
  }

  if (/\bINNER\s+JOIN\b/i.test(query) || /\bJOIN\b/i.test(query)) {
    positives.push("Uses explicit JOIN syntax");
  }

  if (/\bLEFT\s+JOIN\b/i.test(query) || /\bRIGHT\s+JOIN\b/i.test(query)) {
    positives.push("Uses OUTER JOIN - ensure NULL handling is correct");
  }

  if (functions.windowFunctions.length > 0) {
    positives.push(`Uses window functions: ${functions.windowFunctions.join(", ")}`);
  }

  if (functions.jsonFunctions.length > 0) {
    positives.push(`Uses JSON functions: ${functions.jsonFunctions.join(", ")}`);
  }

  // Check for prepared statement patterns
  if (/\?|@\w+|:\w+|\$\d+/i.test(query)) {
    positives.push("Uses parameterized query pattern (good for security and performance)");
  }

  // ===== Build analysis report =====
  let report = "";

  // Database info
  report += `**Database:** ${features.name}\n\n`;

  // Functions detected
  const allDetectedFuncs = [
    ...functions.stringFunctions,
    ...functions.dateFunctions,
    ...functions.aggregateFunctions,
    ...functions.windowFunctions,
    ...functions.jsonFunctions,
  ];
  if (allDetectedFuncs.length > 0) {
    report += `**Functions Used:** ${allDetectedFuncs.join(", ")}\n\n`;
  }

  if (positives.length > 0) {
    report += "### ✅ Good Practices\n\n";
    positives.forEach(p => {
      report += `- ${p}\n`;
    });
    report += "\n";
  }

  if (issues.length > 0) {
    report += "### ⚠️ Potential Issues\n\n";
    issues.forEach((issue, i) => {
      report += `${i + 1}. **${issue}**\n`;
      report += `   - 💡 ${suggestions[i]}\n\n`;
    });
  } else {
    report += "### ✅ No Major Issues Detected\n\n";
  }

  if (warnings.length > 0) {
    report += "### ⚡ Warnings\n\n";
    warnings.forEach(w => {
      report += `- ${w}\n`;
    });
    report += "\n";
  }

  if (dbSpecificHints.length > 0) {
    report += "### 🔧 Database-Specific Hints\n\n";
    dbSpecificHints.forEach(h => {
      report += `- ${h}\n`;
    });
    report += "\n";
  }

  // Performance recommendations
  report += "### 📌 Performance Recommendations\n\n";
  report += `- Use appropriate indexes on columns in WHERE, JOIN, and ORDER BY clauses\n`;
  report += `- Use \`db_explain_query\` to see actual execution plan\n`;
  report += `- Syntax: \`${features.explainSyntax}\`\n`;

  if (tables.length > 2) {
    report += `- Query involves ${tables.length} tables - verify join order and indexing strategy\n`;
  }

  if (!queryInfo.readOnly) {
    report += `- ⚠️ Write operation - consider transaction wrapper for multiple related writes\n`;
  }

  return report;
}
