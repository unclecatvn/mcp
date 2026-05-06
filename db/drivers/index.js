import { MysqlDriver } from "./mysql.js";
import { PostgresqlDriver } from "./postgresql.js";
import { SqlServerDriver } from "./sqlserver.js";

export const DRIVERS = {
  mysql: MysqlDriver,
  mariadb: MysqlDriver,
  postgresql: PostgresqlDriver,
  sqlserver: SqlServerDriver,
};

/** @param {object} config */
export function createDriver(config) {
  const Cls = DRIVERS[config.type];
  if (!Cls) throw new Error(`Unknown driver type: ${config.type}`);
  return new Cls(config);
}
