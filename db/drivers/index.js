import MySQLDriver from './mysql.js';
import PostgreSQLDriver from './postgresql.js';
import SQLServerDriver from './sqlserver.js';

export default {
  mysql: MySQLDriver,
  mariadb: MySQLDriver,
  postgresql: PostgreSQLDriver,
  sqlserver: SQLServerDriver
}; 