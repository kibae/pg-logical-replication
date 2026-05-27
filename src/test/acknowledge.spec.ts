/*
SELECT * FROM pg_create_logical_replication_slot('slot_decoderbufs', 'decoderbufs');
*/
import { LogicalReplicationService } from '../logical-replication-service.js';
import { Wal2Json } from '../output-plugins/wal2json/wal2json-plugin-output.type.js';
import { Wal2JsonPlugin } from '../output-plugins/wal2json/wal2json-plugin.js';
import { TestClientConfig } from './client-config.js';
import { sleep, TestClient } from './test-common.js';

jest.setTimeout(1000 * 30);
const [slotName, decoderName] = ['slot_acknowledge', 'wal2json'];

let client: TestClient;
describe('acknowledge', () => {
  let service: LogicalReplicationService | null = null;

  beforeAll(async () => {
    client = await TestClient.New(slotName, decoderName);
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    if (service) {
      await service.destroy();
      service = null;
    }
  });

  it('Resume streaming using the internal last-received LSN value', async () => {
    service = new LogicalReplicationService(TestClientConfig, {
      autoAck: false,
      keepaliveIntervalSeconds: 0,
    });
    const plugin = new Wal2JsonPlugin({});

    let inserted = 0;
    service.on('data', (lsn: string, log: Wal2Json.Output) => {
      inserted += log.change.filter((change) => change.kind === 'insert').length;
    });

    service.subscribe(plugin, slotName);

    await sleep(100);

    //language=postgresql
    const insertQuery = `INSERT INTO users(firstname, lastname, email, phone)
       SELECT md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT)
       FROM generate_series(1, 5) RETURNING *`;

    // insert
    expect((await client.query(insertQuery)).rowCount).toBe(5);

    await sleep(500);
    expect(inserted).toBe(5);

    // stop & resume
    await service.stop();
    await sleep(500);
    service.subscribe(plugin, slotName);
    await sleep(500);
    expect(inserted).toBe(5);

    expect((await client.query(insertQuery)).rowCount).toBe(5);

    await sleep(500);
    expect(inserted).toBe(10);

    // stop & resume with 0/00000000 lsn - replays all unacknowledged data
    await service.stop();
    await sleep(500);
    service.subscribe(plugin, slotName, '0/00000000');
    await sleep(1000);
    expect(inserted).toBe(20);
  });
});
