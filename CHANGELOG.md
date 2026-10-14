# Changelog

## v3.0.0 (Unreleased)

### Breaking Changes
- Require Node.js `>=22.0.0`; Node.js 20 is no longer supported (#218).
- `acknowledge(lsn)` now sends the supplied LSN unchanged instead of adding one byte (#222).
  - Pass the exclusive end position of durably processed WAL. Remove any `-1` workaround previously used to compensate for the increment.
  - For transaction-end checkpoints, use pgoutput's `commitEndLsn`, or wal2json's `nextlsn` with `includeLsn: true`. A wal2json data event's LSN is not necessarily the transaction end.
  - Method signatures and replication configuration options remain unchanged.

### Bug Fixes
- Stop acknowledging one byte beyond the supplied WAL end, addressing the off-by-one position reported during PostgreSQL failover slot synchronization (#222).

### Build and CI
- Upgrade to TypeScript 7 and replace `ts-jest` with `@swc/jest`; `npm test` runs TypeScript checking before Jest (#218).
- Update locked dependencies, including pg, Jest, protobufjs, and type definitions.
- Wait for PostgreSQL readiness before running tests and test Node.js 22, 24, and 26 across PostgreSQL 14–18 (#223).
- Skip publishing test-report checks for fork PRs whose token cannot write checks; their tests still run (#224).

### Validation
- Add wire-encoding regression tests and manual ACK checkpoint/reconnect integration tests for wal2json and pgoutput (#222).
- All 31 tests pass across the 15 PostgreSQL/Node.js CI combinations. Coverage includes upgrading existing checkpoints and callers using a `-1` workaround.
- Live primary/standby failover remains unverified by this test suite.

## v2.5.0 (2026-05-27)

### Features
- Add Node.js 26 support
  - CI test matrix now runs on Node.js 20, 22, 24, 26 across PostgreSQL 14–18

### Breaking Changes
- Drop support for EOL Node.js 16 and 18; minimum supported version is now Node.js `>=20.0.0`
  - `engines.node` bumped from `>=16.9.0` to `>=20.0.0`

### CI
- Bump `actions/setup-node` from v3 to v4 for reliable resolution of the latest Node.js releases

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
