# Changelog

## v3.0.0 (2026-04-14)

### Features
- Add `destroy()` method to `LogicalReplicationService` for clean full shutdown
  - Calls `stop()` then `removeAllListeners()` to release all resources
  - Use `destroy()` when done with the service entirely; use `stop()` when re-subscription is needed

### Bug Fixes
- Fix compatibility with TypeScript 6.0
  - Add explicit `rootDir` to `tsconfig.build.json` and `tsconfig.json` (TS5011)
  - Replace deprecated `module` keyword with `namespace` in output type declarations (TS1540)
- Fix `acknowledge` test: use `timeoutSeconds: 0` to prevent standby status timer from auto-acknowledging LSN before replay test

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
