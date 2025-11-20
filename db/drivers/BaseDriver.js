export default class BaseDriver {
  constructor(config = {}) {
    this.config = config;
    this.connection = null;
    this.currentDatabase = null;
  }

  async connect() {
    throw new Error('connect() not implemented');
  }

  async query() {
    throw new Error('query() not implemented');
  }

  async listTables() {
    throw new Error('listTables() not implemented');
  }

  async describeTable(tableName) {
    throw new Error('describeTable() not implemented');
  }

  async close() {
    throw new Error('close() not implemented');
  }
}