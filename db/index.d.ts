export declare class MultiDatabaseMCPServer {
  constructor();
  run(): Promise<void>;
}

export type DbType = "mysql" | "mariadb" | "postgresql" | "sqlserver";
export type DbMode = "readonly" | "readwrite" | "readwrite+ddl";
export type SslMode = "disable" | "prefer" | "require" | "verify";

export interface AliasConfig {
  alias: string;
  type: DbType;
  host: string;
  port: number;
  user?: string;
  password?: string;
  database?: string;
  mode: DbMode;
  ssl: SslMode;
  caCert?: string;
  timeoutMs: number;
  maxRows: number;
  poolMax: number;
}
