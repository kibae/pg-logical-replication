# Changelog

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
