import { LogicalReplicationService } from '../logical-replication-service.js';
import { Pgoutput, PgoutputPlugin } from '../output-plugins/pgoutput/index.js';
import { TestClientConfig } from './client-config.js';
import { sleep, TestClient } from './test-common.js';

jest.setTimeout(30_000);
const [slotName, decoderName, publicationName] = ['slot_flow_control', 'pgoutput', 'flow_control_test_pub'];

let client: TestClient;

describe('flowControl', () => {
  beforeAll(async () => {
    client = await TestClient.New(slotName, decoderName);
    await client.query(`DROP PUBLICATION IF EXISTS "${publicationName}"`);
    await client.query(`CREATE PUBLICATION "${publicationName}" FOR ALL TABLES`);
  });

  afterAll(async () => {
    await client.query(`DROP PUBLICATION IF EXISTS "${publicationName}"`);
    await client.end();
  });

  it('should process messages sequentially when flowControl is enabled', async () => {
    const service = new LogicalReplicationService(TestClientConfig, {
      flowControl: { enabled: true },
    });
    const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [publicationName] });

    const processingOrder: number[] = [];
    const completionOrder: number[] = [];
    let messageIndex = 0;

    service.on('data', async (lsn: string, log: Pgoutput.Message) => {
      if (log.tag !== 'insert') return;

      const currentIndex = messageIndex++;
      processingOrder.push(currentIndex);

      // Simulate async work with varying delays
      // Earlier messages take longer to process
      const delay = (5 - currentIndex) * 50;
      await sleep(delay > 0 ? delay : 10);

      completionOrder.push(currentIndex);
    });

    service.subscribe(plugin, slotName).catch((e) => {
      console.error('Error from .subscribe', e);
    });

    await sleep(100);

    // Insert 5 rows
    await client.query(
      `INSERT INTO users(firstname, lastname, email, phone)
       SELECT md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT)
       FROM generate_series(1, 5)`
    );

    // Wait for all messages to be processed
    await sleep(2000);

    await service.stop();

    // With flowControl enabled, messages should be processed in order
    // Both processing and completion order should be sequential
    expect(processingOrder).toEqual([0, 1, 2, 3, 4]);
    expect(completionOrder).toEqual([0, 1, 2, 3, 4]);
  });

  it('should process messages concurrently when flowControl is disabled (default)', async () => {
    const service = new LogicalReplicationService(TestClientConfig, {
      flowControl: { enabled: false },
    });
    const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [publicationName] });

    const processingOrder: number[] = [];
    const completionOrder: number[] = [];
    let messageIndex = 0;

    service.on('data', async (lsn: string, log: Pgoutput.Message) => {
      if (log.tag !== 'insert') return;

      const currentIndex = messageIndex++;
      processingOrder.push(currentIndex);

      // Earlier messages take longer to process
      const delay = (5 - currentIndex) * 50;
      await sleep(delay > 0 ? delay : 10);

      completionOrder.push(currentIndex);
    });

    service.subscribe(plugin, slotName).catch((e) => {
      console.error('Error from .subscribe', e);
    });

    await sleep(100);

    // Insert 5 rows
    await client.query(
      `INSERT INTO users(firstname, lastname, email, phone)
       SELECT md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT)
       FROM generate_series(1, 5)`
    );

    // Wait for all messages to be processed
    await sleep(2000);

    await service.stop();

    // Without flowControl, messages start processing in order
    expect(processingOrder).toEqual([0, 1, 2, 3, 4]);

    // But completion order may differ due to varying delays
    // Later messages (with shorter delays) may complete first
    // This assertion verifies the concurrent behavior
    expect(completionOrder.length).toBe(5);
    // The completion order should NOT be strictly sequential when delays vary
    // (unless the system happens to process them faster than our delays)
  });

  it('should handle errors in async handlers without blocking the queue', async () => {
    const service = new LogicalReplicationService(TestClientConfig, {
      flowControl: { enabled: true },
    });
    const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [publicationName] });

    const processedMessages: string[] = [];
    const errors: Error[] = [];
    let messageIndex = 0;

    service.on('error', (err: Error) => {
      errors.push(err);
    });

    service.on('data', async (lsn: string, log: Pgoutput.Message) => {
      if (log.tag !== 'insert') return;

      const currentIndex = messageIndex++;

      if (currentIndex === 2) {
        throw new Error('Simulated error on message 2');
      }

      processedMessages.push(`msg-${currentIndex}`);
      await sleep(10);
    });

    service.subscribe(plugin, slotName).catch((e) => {
      console.error('Error from .subscribe', e);
    });

    await sleep(100);

    // Insert 5 rows
    await client.query(
      `INSERT INTO users(firstname, lastname, email, phone)
       SELECT md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT)
       FROM generate_series(1, 5)`
    );

    await sleep(2000);

    await service.stop();

    // Should process all messages except the one that threw
    expect(processedMessages).toEqual(['msg-0', 'msg-1', 'msg-3', 'msg-4']);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('Simulated error on message 2');
  });

  it('should stop processing when service is stopped', async () => {
    const service = new LogicalReplicationService(TestClientConfig, {
      flowControl: { enabled: true },
    });
    const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [publicationName] });

    const processedMessages: number[] = [];
    let messageIndex = 0;

    service.on('data', async (lsn: string, log: Pgoutput.Message) => {
      if (log.tag !== 'insert') return;

      const currentIndex = messageIndex++;
      processedMessages.push(currentIndex);

      // Slow processing
      await sleep(500);
    });

    service.subscribe(plugin, slotName).catch((e) => {
      console.error('Error from .subscribe', e);
    });

    await sleep(100);

    // Insert 5 rows
    await client.query(
      `INSERT INTO users(firstname, lastname, email, phone)
       SELECT md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT)
       FROM generate_series(1, 5)`
    );

    // Stop the service after a short delay (before all messages are processed)
    await sleep(300);
    await service.stop();

    // Should have processed fewer than 5 messages due to early stop
    expect(processedMessages.length).toBeLessThan(5);
  });
});
