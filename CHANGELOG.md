# Changelog

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
