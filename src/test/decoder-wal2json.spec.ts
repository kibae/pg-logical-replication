/*
SELECT * FROM pg_create_logical_replication_slot('slot_wal2json', 'wal2json');
*/
import { LogicalReplicationService } from '../logical-replication-service.js';
import { Wal2Json } from '../output-plugins/wal2json/wal2json-plugin-output.type.js';
import { Wal2JsonPlugin } from '../output-plugins/wal2json/wal2json-plugin.js';
import { TestClientConfig } from './client-config.js';
import { sleep, TestClient } from './test-common.js';

jest.setTimeout(1000 * 30);
const [slotName, decoderName] = ['slot_wal2json', 'wal2json'];

let client: TestClient;
describe('wal2json', () => {
  beforeAll(async () => {
    client = await TestClient.New(slotName, decoderName);
  });

  afterAll(async () => {
    await client.end();
  });

  it('Insert, Delete(w/FK)', async () => {
    const service = new LogicalReplicationService(TestClientConfig);
    const plugin = new Wal2JsonPlugin({});

    let inserted = 0;
    let deleted = 0;
    service.on('data', (lsn: string, log: Wal2Json.Output) => {
      // console.log(lsn, log);
      inserted += log.change.filter((change) => change.kind === 'insert').length;
      deleted += log.change.filter((change) => change.kind === 'delete').length;
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
       FROM generate_series(1, 5) RETURNING *`
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
           SELECT id, md5(RANDOM()::TEXT), md5(RANDOM()::TEXT)
           FROM users
           WHERE id >= ${result.rows[0].id}`
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
          `DELETE
           FROM users
           WHERE id >= ${result.rows[0].id}`
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
    const plugin = new Wal2JsonPlugin({});

    let rowCount = 0;
    service.on('data', (lsn: string, log: Wal2Json.Output) => {
      // console.log(lsn, log);
      rowCount += log.change.filter((change) => change.kind === 'update').length;
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
