export declare class OdooMCPServer {
  constructor(options?: { env?: NodeJS.ProcessEnv | Record<string, string | undefined> });
  run(): Promise<void>;
}

export type OdooAuthType = "apikey" | "password";

export interface OdooConnectionConfig {
  name: string;
  url: string;
  db: string;
  username: string;
  authType: OdooAuthType;
  secret: string;
  timeoutMs: number;
}

export type OdooErrorCode =
  | "ODOO_CONFIG_INVALID"
  | "ODOO_INPUT_INVALID"
  | "ODOO_UNKNOWN_CONNECTION"
  | "ODOO_AUTH_FAILED"
  | "ODOO_ACCESS_DENIED"
  | "ODOO_MISSING_RECORD"
  | "ODOO_FIELD_INVALID"
  | "ODOO_USER_ERROR"
  | "ODOO_SERVER_ERROR"
  | "ODOO_TRANSPORT_FAILED"
  | "ODOO_INTERNAL";
