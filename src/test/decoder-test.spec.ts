/*
SELECT * FROM pg_create_logical_replication_slot('slot_test_decoding', 'test_decoding');
*/
import { Client } from 'pg';
import { LogicalReplicationService } from '../logical-replication-service';
import { TestClientConfig } from './client-config';
import { TestDecodingPlugin } from '../output-plugins/test_decoding/test-decoding-plugin';

jest.setTimeout(1000 * 10);
const [slotName, decoderName] = ['slot_test_decoding', 'test_decoding'];

let client: Client;
describe('test_decoding', () => {
  beforeAll(async () => {
    client = new Client({ ...TestClientConfig });
    await client.connect();

    await client
      .query(
        //language=sql
        `SELECT *
         FROM pg_create_logical_replication_slot('${slotName}', '${decoderName}')`
      )
      .catch((e) => {});
  });

  afterAll(async () => {
    await client
      .query(
        //language=sql
        `SELECT pg_drop_replication_slot('${slotName}')`
      )
      .catch((e) => {});
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

    await new Promise((resolve) => setTimeout(resolve, 100));

    // insert
    const result = await client.query(
      //language=sql
      `INSERT INTO users(firstname, lastname, email, phone)
           SELECT md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT)
           FROM generate_series(1, 5)
           RETURNING *`
    );
    expect(result.rowCount).toBe(5);

    await new Promise((resolve) => setTimeout(resolve, 500));
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

    await new Promise((resolve) => setTimeout(resolve, 500));
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

    await new Promise((resolve) => setTimeout(resolve, 500));
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

    await new Promise((resolve) => setTimeout(resolve, 100));

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

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(rowCount).toBe(10);
    await service.stop();
  });
});
