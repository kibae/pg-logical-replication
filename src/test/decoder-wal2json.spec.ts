/*
SELECT * FROM pg_create_logical_replication_slot('slot_wal2json', 'wal2json');
*/
import { Client } from 'pg';
import { LogicalReplicationService } from '../logical-replication-service';
import { TestClientConfig } from './client-config';
import { Wal2JsonPlugin } from '../output-plugins/wal2json/wal2json-plugin';
import { Wal2Json } from '../output-plugins/wal2json/wal2json-plugin-output.type';

jest.setTimeout(1000 * 10);
const [slotName, decoderName] = ['slot_wal2json', 'wal2json'];

let client: Client;
describe('wal2json', () => {
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
