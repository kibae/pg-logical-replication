# Changelog

## v3.0.1 (2026-04-22)

### Breaking Changes
- Replace nested `acknowledge: { auto, timeoutSeconds }` with top-level `autoAck` and `keepaliveIntervalSeconds`
  - The old shape conflated two independent concerns (auto-ack on data messages vs. periodic keepalive), which silently advanced the replication slot when `auto: false` was set — see #174
  - The deprecated `acknowledge` key is still accepted for one major version and mapped to the new keys with a `console.warn`; it will be removed in 4.0

### Bug Fixes
- The periodic keepalive timer no longer silently advances `confirmed_flush_lsn` when `autoAck: false`
  - Received LSN and acknowledged LSN are now tracked separately internally
  - The keepalive continues to run (so `wal_sender_timeout` does not drop the connection) but only reports the manually acknowledged position as flushed/applied

### Migration

Before (v2.x):
```ts
new LogicalReplicationService(clientConfig, {
  acknowledge: { auto: false, timeoutSeconds: 10 },
});
```

After (v3.0.1):
```ts
new LogicalReplicationService(clientConfig, {
  autoAck: false,
  keepaliveIntervalSeconds: 10,
});
```

## v2.4.0 (2026-04-15)

### Features
- Add `destroy()` method to `LogicalReplicationService` for clean full shutdown
  - Calls `stop()` then `removeAllListeners()` to release all resources
  - Use `destroy()` when done with the service entirely; use `stop()` when re-subscription is needed

### Bug Fixes
- Fix compatibility with TypeScript 6.0
  - Add explicit `rootDir` to `tsconfig.build.json` and `tsconfig.json` (TS5011)
  - Replace deprecated `module` keyword with `namespace` in output type declarations (TS1540)
- Fix `acknowledge` test: use `timeoutSeconds: 0` to prevent standby status keepalive from interfering with replay assertions

## v2.3.0 (2026-03-10)

### Features
- Add `flowControl` option for backpressure support (#52)
  - Prevents OOM when handlers are slower than incoming messages
  - Uses EventEmitter2.emitAsync() for async handler support
  - Message queue with stream pause/resume for sequential processing
  - Default: disabled for backward compatibility

### Dependencies
- bump pg 8.16 -> 8.20
- bump protobufjs 7.5 -> 8.0
- bump @types/node, @types/pg, prettier

## v2.2.1 (2025-08-22)

## v2.2.0 (2025-06-23)
