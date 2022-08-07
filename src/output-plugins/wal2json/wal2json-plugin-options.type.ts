export interface Wal2JsonDecodingPluginOptions {
  /**
   * include-xids: add xid to each changeset. Default is false.
   */
  includeXids?: boolean;

  /**
   * include-timestamp: add timestamp to each changeset. Default is false.
   */
  includeTimestamp?: boolean;

  /**
   * include-schemas: add schema to each change. Default is true.
   */
  includeSchemas?: boolean;

  /**
   * include-types: add type to each change. Default is true.
   */
  includeTypes?: boolean;

  /**
   * include-typmod: add modifier to types that have it (eg. varchar(20) instead of varchar). Default is true.
   */
  includeTypmod?: boolean;

  /**
   * include-type-oids: add type oids. Default is false.
   */
  includeTypeOids?: boolean;

  /**
   * include-domain-data-type: replace domain name with the underlying data type. Default is false.
   */
  includeDomainDataType?: boolean;

  /**
   * include-column-positions: add column position (pg_attribute.attnum). Default is false.
   */
  includeColumnPositions?: boolean;

  /**
   * include-origin: add origin of a piece of data. Default is false.
   */
  includeOrigin?: boolean;

  /**
   * include-not-null: add not null information as columnoptionals. Default is false.
   */
  includeNotNull?: boolean;

  /**
   * include-default: add default expression. Default is false.
   */
  includeDefault?: boolean;

  /**
   * include-pk: add primary key information as pk. Column name and data type is included. Default is false.
   */
  includePk?: boolean;

  /**
   * pretty-print: add spaces and indentation to JSON structures. Default is false.
   */
  prettyPrint?: boolean;

  /**
   * write-in-chunks: write after every change instead of every changeset. Only used when format-version is 1. Default is false.
   */
  writeInChunks?: boolean;

  /**
   * include-lsn: add nextlsn to each changeset. Default is false.
   */
  includeLsn?: boolean;

  /**
   * include-transaction: emit records denoting the start and end of each transaction. Default is true.
   */
  includeTransaction?: boolean;

  /**
   * filter-origins: exclude changes from the specified origins. Default is empty which means that no origin will be filtered. It is a comma separated value.
   */
  filterOrigins?: string;

  /**
   * filter-tables: exclude rows from the specified tables. Default is empty which means that no table will be filtered.
   * It is a comma separated value. The tables should be schema-qualified. *.foo means table foo in all schemas and bar.* means all tables in schema bar.
   * Special characters (space, single quote, comma, period, asterisk) must be escaped with backslash. Schema and table are case-sensitive.
   * Table "public"."Foo bar" should be specified as public.Foo\ bar.
   */
  filterTables?: string;

  /**
   * add-tables: include only rows from the specified tables. Default is all tables from all schemas. It has the same rules from filter-tables.
   */
  addTables?: string;

  /**
   * filter-msg-prefixes: exclude messages if prefix is in the list. Default is empty which means that no message will be filtered. It is a comma separated value.
   */
  filterMsgPrefixes?: string;

  /**
   * add-msg-prefixes: include only messages if prefix is in the list. Default is all prefixes. It is a comma separated value.
   * wal2json applies filter-msg-prefixes before this parameter.
   */
  addMsgPrefixes?: string;

  /**
   * format-version: defines which format to use. Default is 1.
   */
  formatVersion?: string;

  /**
   * actions: define which operations will be sent. Default is all actions (insert, update, delete, and truncate). However, if you are using format-version 1, truncate is not enabled (backward compatibility).
   */
  actions?: string;
}

export const StringOptionKeys: Array<keyof Wal2JsonDecodingPluginOptions> = [
  'filterOrigins',
  'filterTables',
  'addTables',
  'filterMsgPrefixes',
  'addMsgPrefixes',
  'formatVersion',
  'actions',
];
