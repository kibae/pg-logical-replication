/*
SELECT * FROM pg_create_logical_replication_slot('slot_test_decoding', 'test_decoding');
*/
import { LogicalReplicationService } from '../logical-replication-service.js';
import { TestDecodingPlugin } from '../output-plugins/test_decoding/test-decoding-plugin.js';
import { TestClientConfig } from './client-config.js';
import { sleep, TestClient } from './test-common.js';

jest.setTimeout(1000 * 10);
const [slotName, decoderName] = ['slot_test_decoding', 'test_decoding'];

let client: TestClient;
describe('test_decoding', () => {
  beforeAll(async () => {
    client = await TestClient.New(slotName, decoderName);
  });

  afterAll(async () => {
    await client.end();
  });

  it('Insert, Delete(w/FK)', async () => {
    const service = new LogicalReplicationService(TestClientConfig);
    const plugin = new TestDecodingPlugin({});

    let inserted = 0;
    let deleted = 0;
    service.on('data', (lsn: string, log: any) => {
      // console.log(lsn, log);
      if (log.action === 'INSERT') inserted++;
      else if (log.action === 'DELETE') deleted++;
    });

    (function proc() {
      service.subscribe(plugin, slotName).catch((e) => {
        console.error(e);
        setTimeout(proc, 100);
      });
    })();

    await sleep(100);

    // insert
    const result = await client.query(
      //language=sql
      `INSERT INTO users(firstname, lastname, email, phone)
           SELECT md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT)
           FROM generate_series(1, 5)
           RETURNING *`
    );
    expect(result.rowCount).toBe(5);

    await sleep(500);
    expect(inserted).toBe(5);

    // insert child
    expect(
      (
        await client.query(
          //language=sql
          `INSERT INTO user_contents(user_id, title, body)
       SELECT id, md5(RANDOM()::TEXT), md5(RANDOM()::TEXT) FROM users WHERE id >= ${result.rows[0].id}`
        )
      ).rowCount
    ).toBe(5);

    await sleep(500);
    expect(inserted).toBe(10);

    // delete
    expect(
      (
        await client.query(
          //language=sql
          `DELETE FROM users WHERE id >= ${result.rows[0].id}`
        )
      ).rowCount
    ).toBe(5);

    await sleep(500);
    // users 5 rows + user_contents 5 rows
    expect(deleted).toBe(10);

    await service.stop();
  });

  it('Update', async () => {
    const service = new LogicalReplicationService(TestClientConfig);
    const plugin = new TestDecodingPlugin({});

    let rowCount = 0;
    service.on('data', (lsn: string, log: any) => {
      // console.log(lsn, log);
      if (log.action === 'UPDATE') rowCount++;
    });

    (function proc() {
      service.subscribe(plugin, slotName).catch((e) => {
        console.error(e);
        setTimeout(proc, 100);
      });
    })();

    await sleep(100);

    expect(
      (
        await client.query(
          //language=sql
          `UPDATE users
           SET firstname = md5(RANDOM()::TEXT)
           WHERE id BETWEEN 1 AND 10`
        )
      ).rowCount
    ).toBe(10);

    await sleep(1000);

    expect(rowCount).toBe(10);
    await service.stop();
  });
});
