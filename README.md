# pg-logical-replication

- [PostgreSQL Logical Replication](https://www.postgresql.org/docs/current/logical-replication.html) client for node.js(
  `>=16.9.0`)
- Supported plugins
    - [pgoutput](https://www.postgresql.org/docs/current/protocol-logicalrep-message-formats.html) (Native to
      PostgreSQL, Recommended)
        - Use the pgoutput plugin to process huge transactions.
    - [wal2json](https://github.com/eulerto/wal2json)
    - [decoderbufs](https://github.com/debezium/postgres-decoderbufs)
    - [test_decoding](https://www.postgresql.org/docs/current/test-decoding.html) (Not recommended)
- [Document for old version(1.x)](https://github.com/kibae/pg-logical-replication/blob/master/README-1.x.md)

[![NPM Version](https://badge.fury.io/js/pg-logical-replication.svg)](https://www.npmjs.com/package/pg-logical-replication)
[![License](https://img.shields.io/github/license/kibae/pg-logical-replication)](https://github.com/kibae/pg-logical-replication/blob/main/LICENSE)

| PostgreSQL Versions | on Node.js 16, 18, 20, 22, 24                                                                                                                                                                                                        |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| PostgreSQL 14       | [![Node.js(16, 18, 20, 22, 24) w/Postgres 14](https://github.com/kibae/pg-logical-replication/actions/workflows/nodejs-pgsql14.yml/badge.svg)](https://github.com/kibae/pg-logical-replication/actions/workflows/nodejs-pgsql14.yml) |
| PostgreSQL 15       | [![Node.js(16, 18, 20, 22, 24) w/Postgres 15](https://github.com/kibae/pg-logical-replication/actions/workflows/nodejs-pgsql15.yml/badge.svg)](https://github.com/kibae/pg-logical-replication/actions/workflows/nodejs-pgsql15.yml) |
| PostgreSQL 16       | [![Node.js(16, 18, 20, 22, 24) w/Postgres 16](https://github.com/kibae/pg-logical-replication/actions/workflows/nodejs-pgsql16.yml/badge.svg)](https://github.com/kibae/pg-logical-replication/actions/workflows/nodejs-pgsql16.yml) |
| PostgreSQL 17       | [![Node.js(16, 18, 20, 22, 24) w/Postgres 17](https://github.com/kibae/pg-logical-replication/actions/workflows/nodejs-pgsql17.yml/badge.svg)](https://github.com/kibae/pg-logical-replication/actions/workflows/nodejs-pgsql17.yml) |
| PostgreSQL 18       | [![Node.js(16, 18, 20, 22, 24) w/Postgres 18](https://github.com/kibae/pg-logical-replication/actions/workflows/nodejs-pgsql18.yml/badge.svg)](https://github.com/kibae/pg-logical-replication/actions/workflows/nodejs-pgsql18.yml) |

## 1. Install

- **pg-logical-replication** depends on [pg(node-postgres) >= 6.2.2](https://github.com/brianc/node-postgres)
  and [eventemitter2](https://www.npmjs.com/package/eventemitter2)

```sh
$ npm install pg-logical-replication
```

## 2. Usage

- This is an example using `wal2json`. A replication slot(`test_slot_wal2json`) must be created on the PostgreSQL
  server.
    - `SELECT * FROM pg_create_logical_replication_slot('test_slot_wal2json', 'wal2json')`

```typescript
const slotName = 'test_slot_wal2json';

const service = new LogicalReplicationService(
  /**
   * node-postgres Client options for connection
   * https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/pg/index.d.ts#L16
   */
  {
    database: 'playground',
    // ...
  },
  /**
   * Logical replication service config
   * https://github.com/kibae/pg-logical-replication/blob/main/src/logical-replication-service.ts#L9
   */
  {
    acknowledge: {
      auto: true,
      timeoutSeconds: 10
    }
  }
)

// `TestDecodingPlugin` for test_decoding and `ProtocolBuffersPlugin` for decoderbufs are also available.
const plugin = new Wal2JsonPlugin({
  /**
   * Plugin options for wal2json
   * https://github.com/kibae/pg-logical-replication/blob/main/src/output-plugins/wal2json/wal2json-plugin-options.type.ts
   */
  //...
});

/**
 * Wal2Json.Output
 * https://github.com/kibae/pg-logical-replication/blob/main/src/output-plugins/wal2json/wal2json-plugin-output.type.ts
 */
service.on('data', (lsn: string, log: Wal2Json.Output) => {
  // Do something what you want.
  // log.change.filter((change) => change.kind === 'insert').length;
});

// Start subscribing to data change events.
(function proc() {
  service.subscribe(plugin, slotName)
    .catch((e) => {
      console.error(e);
    })
    .then(() => {
      setTimeout(proc, 100);
    });
})();
```

----

## 3. LogicalReplicationService

### 3-1. `Constructor(clientConfig: ClientConfig, config?: Partial<LogicalReplicationConfig>)`

```typescript
const service = new LogicalReplicationService({
  /**
   * node-postgres Client options for connection
   * https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/pg/index.d.ts#L16
   */
  clientConfig: {
    user? : string | undefined;
    database? : string | undefined;
    password? : string | (() => string | Promise<string>) | undefined;
    port? : number | undefined;
    host? : string | undefined;
    connectionString? : string | undefined;
    keepAlive? : boolean | undefined;
    stream? : stream.Duplex | undefined;
    statement_timeout? : false | number | undefined;
    parseInputDatesAsUTC? : boolean | undefined;
    ssl? : boolean | ConnectionOptions | undefined;
    query_timeout? : number | undefined;
    keepAliveInitialDelayMillis? : number | undefined;
    idle_in_transaction_session_timeout? : number | undefined;
    application_name? : string | undefined;
    connectionTimeoutMillis? : number | undefined;
    types? : CustomTypesConfig | undefined;
    options? : string | undefined;
  },
  /**
   * Logical replication service config
   * https://github.com/kibae/pg-logical-replication/blob/main/src/logical-replication-service.ts#L9
   */
  config? : Partial<{
    acknowledge?: {
      /**
       * If the value is false, acknowledge must be done manually.
       * Default: true
       */
      auto: boolean;
      /**
       * Acknowledge is performed every set time (sec). If 0, do not do it.
       * Default: 10
       */
      timeoutSeconds: 0 | 10 | number;
    };
    flowControl?: {
      /**
       * If true, pause the stream until the data handler completes.
       * This enables backpressure support for async handlers.
       * Default: false
       */
      enabled: boolean;
    };
  }>
})
```

### 3-2. `subscribe(plugin: AbstractPlugin, slotName: string, uptoLsn?: string): Promise<this>`

- **Receive changes from the server.**
- `plugin` [output plugins](#4-output-plugins).
- `slotName` Logical replication slot name. You can create slot
  via [pg_create_logical_replication_slot](https://www.postgresql.org/docs/current/logicaldecoding-walsender.html)
  function.
- `uptoLsn` (optional) The starting point of the data to be streamed.

### 3-3. `acknowledge(lsn: string): Promise<boolean>`

- After processing the data, it signals the PostgreSQL server that it is OK to clear the WAL log.
- Usually this is done **automatically**.
- Manually use only when `new LogicalReplicationService({}, {acknowledge: {auto: false}})`.

### 3-4. Flow Control (Backpressure)

When processing messages takes longer than the rate at which PostgreSQL sends them, the internal buffer can grow
indefinitely, leading to memory issues (OOM). The `flowControl` option enables backpressure support to prevent this.

```typescript
const service = new LogicalReplicationService(clientConfig, {
  acknowledge: { auto: true, timeoutSeconds: 10 },
  flowControl: { enabled: true }  // Enable backpressure support
});

// Now async handlers are fully supported - the stream pauses until processing completes
service.on('data', async (lsn: string, log: Pgoutput.Message) => {
  await someSlowAsyncOperation(log);  // Safe: next message waits for this to complete
});
```

**How it works:**
- When `flowControl.enabled` is `true`, the stream is paused while processing each message
- Messages are queued and processed sequentially
- The stream resumes only after the handler (including async operations) completes
- This prevents memory overflow when handlers are slower than the incoming message rate

**Default behavior:**
- `flowControl.enabled` defaults to `false` for backward compatibility
- When disabled, messages are emitted immediately without waiting for handler completion

### 3-5. Event

- `on(event: 'start', listener: () => Promise<void> | void)`
    - Emitted when replication starts.
- `on(event: 'data', listener: (lsn: string, log: any) => Promise<void> | void)`
    - Emitted when PostgreSQL data changes. The log value type varies depending on the plugin.
- `on(event: 'error', listener: (err: Error) => void)`
- `on(event: 'acknowledge', listener: (lsn: string) => Promise<void> | void)`
    - Emitted when acknowledging automatically.
- `on(event: 'heartbeat', listener: (lsn: string, timestamp: number, shouldRespond: boolean) => Promise<void> | void)`
    - A heartbeat check signal has been received from the server. You may need to run `service.acknowledge()`.

### 3-6. Misc. method

- `stop(): Promise<this>`
    - Terminate the server's connection and stop replication.
- `isStop(): boolean`
    - Returns false when replication starts from the server.
- `lastLsn(): string`
    - Returns the last [LSN(Log Sequence Number)](https://www.postgresql.org/docs/current/datatype-pg-lsn.html) received
      from the server.

----

## 4. Output Plugins

### 4-1. `PgoutputPlugin` for [pgoutput](https://www.postgresql.org/docs/current/protocol-logicalrep-message-formats.html) (Native to PostgreSQL)

- Use the pgoutput plugin to process large-scale transactions.

### 4-2. `Wal2JsonPlugin` for [wal2json](https://github.com/eulerto/wal2json)

### 4-3. `ProtocolBuffersPlugin` for [decoderbufs](https://github.com/debezium/postgres-decoderbufs)

### 4-4. `TestDecodingPlugin` for [test_decoding](https://www.postgresql.org/docs/current/test-decoding.html) (Not recommended)

## Contributors

<a href="https://github.com/kibae/pg-logical-replication/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=kibae/pg-logical-replication" />
</a>
