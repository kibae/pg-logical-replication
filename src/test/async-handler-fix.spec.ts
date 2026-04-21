import { LogicalReplicationService } from '../logical-replication-service.js';
import { Wal2JsonPlugin } from '../output-plugins/wal2json/wal2json-plugin.js';
import { TestClientConfig } from './client-config.js';
import { sleep, TestClient } from './test-common.js';

jest.setTimeout(30_000);
const [slotName, decoderName] = ['slot_async_handler_fix', 'wal2json'];

let client: TestClient;

describe('async handler error propagation (issue #62)', () => {
  let service: LogicalReplicationService | null = null;
  const unhandledRejections: unknown[] = [];
  const unhandledRejectionHandler = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  beforeAll(async () => {
    client = await TestClient.New(slotName, decoderName);
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(() => {
    unhandledRejections.length = 0;
    process.on('unhandledRejection', unhandledRejectionHandler);
  });

  afterEach(async () => {
    process.off('unhandledRejection', unhandledRejectionHandler);
    if (service) {
      await service.destroy();
      service = null;
    }
  });

  it('routes acknowledge failures from the data path to the error event', async () => {
    service = new LogicalReplicationService(TestClientConfig, { autoAck: true });
    const plugin = new Wal2JsonPlugin({});

    const errors: Error[] = [];
    service.on('error', (err: Error) => errors.push(err));

    service.subscribe(plugin, slotName).catch(() => {});
    await sleep(200);

    // Override sendStandbyStatus so the fire-and-forget _acknowledge(lsn)
    // rejects when a data message arrives.
    (service as any).sendStandbyStatus = jest
      .fn()
      .mockRejectedValue(new Error('boom: data-path ack failure'));

    await client.query(
      //language=postgresql
      `INSERT INTO users(firstname, lastname, email, phone)
       SELECT md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT)
       FROM generate_series(1, 1)`
    );

    await sleep(500);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toBe('boom: data-path ack failure');
    expect(unhandledRejections).toEqual([]);
  });

  it('routes keepalive failures from the standby timer to the error event', async () => {
    service = new LogicalReplicationService(TestClientConfig, {
      autoAck: false,
      keepaliveIntervalSeconds: 1,
    });
    const plugin = new Wal2JsonPlugin({});

    const errors: Error[] = [];
    service.on('error', (err: Error) => errors.push(err));

    // Seed _lastAckedLsn via uptoLsn so the keepalive gate opens without
    // needing a real data message.
    service.subscribe(plugin, slotName, '0/00000000').catch(() => {});
    await sleep(200);

    (service as any).sendStandbyStatus = jest
      .fn()
      .mockRejectedValue(new Error('boom: keepalive failure'));

    // Timer ticks every 1s; with keepaliveIntervalSeconds=1 the first tick
    // already satisfies the elapsed-time gate.
    await sleep(1500);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toBe('boom: keepalive failure');
    expect(unhandledRejections).toEqual([]);
  });
});
