/**
 * TypeScript Type Definitions for MCP Database Server
 * @file index.d.ts
 * @see {@link https://github.com/unclecat/mcp-db}
 */

/**
 * Supported database types
 */
export type DatabaseType = "mysql" | "mariadb" | "postgresql" | "sqlserver";

/**
 * Connection configuration for database
 */
export interface ConnectionConfig {
  /** Database host or server name */
  host?: string;
  /** Database server name (SQL Server uses this instead of host) */
  server?: string;
  /** Database port */
  port?: number;
  /** Database username */
  user?: string;
  /** Database password */
  password?: string;
  /** Database name */
  database?: string;
  /** Connection string (overrides other config) */
  connectionString?: string;
  /** SQL Server specific options */
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    enableArithAbort?: boolean;
  };
}

/**
 * Query execution metadata
 */
export interface QueryMetadata {
  /** Database type */
  databaseType: DatabaseType;
  /** Database host */
  host: string;
  /** Database port */
  port: number;
  /** Database name */
  database: string;
  /** Query type (SELECT, INSERT, etc.) */
  queryType: string;
  /** Whether query is read-only */
  isReadOnly: boolean;
  /** Tables involved in query */
  tables: string[];
  /** Query preview (first 100 chars) */
  queryPreview: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Whether query succeeded */
  success: boolean;
  /** Number of rows affected/returned */
  rowCount?: number;
  /** Whether result has data */
  hasResults?: boolean;
  /** Error message if failed */
  error?: string;
  /** Error code if failed */
  errorCode?: string;
  /** Query timestamp */
  timestamp?: string;
}

/**
 * Query type detection result
 */
export interface QueryTypeInfo {
  /** Query type */
  type: string;
  /** Whether query is read-only */
  readOnly: boolean;
  /** Whether query is DDL */
  isDDL?: boolean;
  /** Whether query has RETURNING clause (PostgreSQL) */
  hasReturning?: boolean;
  /** Whether query is transaction-related */
  isTransaction?: boolean;
}

/**
 * Database features configuration
 */
export interface DatabaseFeatures {
  /** Database name */
  name: string;
  /** LIMIT clause syntax */
  limitSyntax: string;
  /** Whether database supports top-level sort */
  topLevelSort: boolean;
  /** Whether database supports CTE */
  supportsCTE: boolean;
  /** Whether database supports window functions */
  supportsWindow: boolean;
  /** Whether database supports JSON */
  supportsJSON: boolean;
  /** Whether database supports full-text search */
  supportsFullText: boolean;
  /** Auto increment syntax */
  autoIncrement: string;
  /** Quote characters for identifiers */
  quoting: [string, string];
  /** Index hint syntax */
  indexHint: string;
  /** EXPLAIN syntax */
  explainSyntax: string;
  /** String functions available */
  stringFunctions: string[];
  /** Date functions available */
  dateFunctions: string[];
  /** Common anti-patterns */
  antiPatterns: Array<{
    pattern: string;
    issue: string;
    fix: string;
  }>;
}

/**
 * Detected functions in query
 */
export interface DetectedFunctions {
  /** String functions used */
  stringFunctions: string[];
  /** Date functions used */
  dateFunctions: string[];
  /** Aggregate functions used */
  aggregateFunctions: string[];
  /** Window functions used */
  windowFunctions: string[];
  /** JSON functions used */
  jsonFunctions: string[];
  /** Other functions used */
  otherFunctions: string[];
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retries */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

/**
 * MCP Tool response
 */
export interface ToolResponse {
  /** Response content */
  content: Array<{
    type: string;
    text: string;
  }>;
  /** Whether response is an error */
  isError?: boolean;
  /** Query metadata */
  _metadata?: QueryMetadata;
}

/**
 * MCP Tool definition
 */
export interface ToolDefinition {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema */
  inputSchema: {
    type: "object";
    properties: Record<string, {
      type: string;
      enum?: string[];
      description: string;
    }>;
    required: string[];
  };
}

/**
 * MCP Resource definition
 */
export interface ResourceDefinition {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name: string;
  /** Resource description */
  description: string;
  /** MIME type */
  mimeType: string;
}

/**
 * Database driver interface
 */
export interface DatabaseDriver {
  /** Connection pool */
  pool: any;
  /** Current database name */
  currentDatabase: string | null;
  /** Connect to database */
  connect(): Promise<any>;
  /** Execute query */
  query(queryText: string): Promise<any>;
  /** List all tables */
  listTables(): Promise<string[]>;
  /** Describe table structure */
  describeTable(tableName: string): Promise<{
    columns: any[];
    indexes: any[];
  }>;
  /** Check connection health */
  healthCheck(): Promise<boolean>;
  /** Close connection */
  close(): Promise<void>;
}

/**
 * Database connection class
 */
export declare class DatabaseConnection {
  /** Database driver instance */
  driver: DatabaseDriver;
  /** Database type */
  type: DatabaseType;

  constructor(type: DatabaseType, config: ConnectionConfig);
  connect(): Promise<any>;
  query(q: string): Promise<any>;
  listTables(): Promise<string[]>;
  describeTable(tableName: string): Promise<any>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
  get currentDatabase(): string | null;
  set currentDatabase(db: string | null);
}

/**
 * MCP Server class
 */
export declare class MultiDatabaseMCPServer {
  /** MCP server instance */
  server: any;
  /** Active connections */
  connections: Map<string, DatabaseConnection>;
  /** Query history */
  queryHistory: QueryMetadata[];
  /** Maximum history size */
  maxHistorySize: number;

  constructor();
  addToQueryHistory(metadata: QueryMetadata): void;
  getConnection(type: DatabaseType, cfg: ConnectionConfig): Promise<DatabaseConnection>;
  removeConnection(type: DatabaseType, cfg: ConnectionConfig): void;
  executeWithRetry(operation: () => Promise<any>, type: DatabaseType, cfg: ConnectionConfig): Promise<any>;
  setupToolHandlers(): void;
  setupResourceHandlers(): void;
  cleanup(): Promise<void>;
  run(): Promise<void>;
}

/**
 * Query analyzer functions
 */
export declare namespace QueryAnalyzer {
  /** Detect query type */
  function detectQueryType(query: string, dbType?: DatabaseType): QueryTypeInfo;

  /** Get database features */
  function getDatabaseFeatures(type: DatabaseType): DatabaseFeatures;

  /** Detect functions used in query */
  function detectDatabaseFunctions(query: string, dbType: DatabaseType): DetectedFunctions;

  /** Extract table names from query */
  function extractTableNames(query: string, type: DatabaseType): string[];

  /** Analyze query for performance issues */
  function analyzeQueryPerformance(
    query: string,
    queryInfo: QueryTypeInfo,
    tables: string[],
    dbType: DatabaseType
  ): string;
}

/**
 * Connection manager functions
 */
export declare namespace ConnectionManager {
  /** Generate connection key */
  function getConnectionKey(type: DatabaseType, cfg: ConnectionConfig): string;

  /** Get default port for database type */
  function getDefaultPort(type: DatabaseType): number;

  /** Parse connection string */
  function parseConnectionString(str: string, type: DatabaseType): ConnectionConfig;

  /** Normalize SQL Server config */
  function normalizeSqlServerConfig(cfg: ConnectionConfig, type?: DatabaseType): ConnectionConfig;

  /** Validate connection config */
  function validateConnectionConfig(cfg: ConnectionConfig, type: DatabaseType): ConnectionConfig;

  /** Parse connection string from env */
  function parseConnectionStringEnv(type: DatabaseType, connections: Record<string, ConnectionConfig>, parseErrors: string[]): void;

  /** Parse numbered env vars */
  function parseNumberedEnv(type: DatabaseType, connections: Record<string, ConnectionConfig>): void;

  /** Parse legacy env vars */
  function parseLegacyEnv(type: DatabaseType, connections: Record<string, ConnectionConfig>): void;

  /** Parse all connection configs */
  function parseMultipleConnections(type: DatabaseType): Record<string, ConnectionConfig>;

  /** Get available database aliases */
  function getAvailableDatabases(type: DatabaseType): string[];

  /** Resolve database connection */
  function resolveDatabaseConnection(type: DatabaseType, databaseAlias?: string, connection?: ConnectionConfig): {
    cfg: ConnectionConfig;
    usedAlias: string;
  };

  /** Apply connection overrides */
  function applyConnectionOverrides(cfg: ConnectionConfig, type: DatabaseType, connection?: ConnectionConfig): ConnectionConfig;

  /** Sleep utility */
  function sleep(ms: number): Promise<void>;

  /** Check if error is retryable */
  function isRetryableError(err: Error): boolean;

  /** Execute with retry logic */
  function executeWithRetry(
    operation: () => Promise<any>,
    type: DatabaseType,
    cfg: ConnectionConfig,
    removeConnection: (type: DatabaseType, cfg: ConnectionConfig) => void,
    retryConfig: RetryConfig
  ): Promise<any>;
}

/**
 * Tool handler functions
 */
export declare namespace ToolHandlers {
  /** Create tool definitions */
  function createToolDefinitions(): ToolDefinition[];

  /** Validate query request */
  function validateQueryRequest(args: any): any;

  /** Validate common request */
  function validateCommonRequest(args: any): any;

  /** Execute database query */
  function executeDatabaseQuery(
    type: DatabaseType,
    cfg: ConnectionConfig,
    query: string,
    getConnection: (type: DatabaseType, cfg: ConnectionConfig) => Promise<DatabaseConnection>,
    executeWithRetry: (operation: () => Promise<any>, type: DatabaseType, cfg: ConnectionConfig) => Promise<any>,
    addToHistory: (metadata: QueryMetadata) => void
  ): Promise<ToolResponse>;

  /** Get query history */
  function getQueryHistory(queryHistory: QueryMetadata[], limit?: number): ToolResponse;

  /** Analyze query */
  function analyzeQuery(type: DatabaseType, query: string): ToolResponse;

  /** Explain query */
  function explainQuery(
    type: DatabaseType,
    cfg: ConnectionConfig,
    query: string,
    getConnection: (type: DatabaseType, cfg: ConnectionConfig) => Promise<DatabaseConnection>,
    executeWithRetry: (operation: () => Promise<any>, type: DatabaseType, cfg: ConnectionConfig) => Promise<any>
  ): Promise<ToolResponse>;

  /** List tables */
  function listTables(
    type: DatabaseType,
    cfg: ConnectionConfig,
    getConnection: (type: DatabaseType, cfg: ConnectionConfig) => Promise<DatabaseConnection>,
    executeWithRetry: (operation: () => Promise<any>, type: DatabaseType, cfg: ConnectionConfig) => Promise<any>
  ): Promise<ToolResponse>;

  /** Describe table */
  function describeTable(
    type: DatabaseType,
    tableName: string,
    cfg: ConnectionConfig,
    getConnection: (type: DatabaseType, cfg: ConnectionConfig) => Promise<DatabaseConnection>,
    executeWithRetry: (operation: () => Promise<any>, type: DatabaseType, cfg: ConnectionConfig) => Promise<any>
  ): Promise<ToolResponse>;
}

/**
 * Resource handler functions
 */
export declare namespace ResourceHandlers {
  /** Get assistant guidance */
  function getAssistantGuidance(): string;

  /** Get resource definitions */
  function getResourceDefinitions(): ResourceDefinition[];

  /** Read resource content */
  function readResource(uri: string): {
    contents: Array<{
      uri: string;
      mimeType: string;
      text: string;
    }>;
  };
}
