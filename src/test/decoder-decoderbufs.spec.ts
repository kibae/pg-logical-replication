/*
SELECT * FROM pg_create_logical_replication_slot('slot_decoderbufs', 'decoderbufs');
*/
import { LogicalReplicationService } from '../logical-replication-service';
import { TestClientConfig } from './client-config';
import { ProtocolBuffersPlugin } from '../output-plugins/decoderbufs/decoderbufs-plugin';
import {
  ProtocolBuffers,
  ProtocolBuffersOperation,
} from '../output-plugins/decoderbufs/decoderbufs-plugin-output.type';
import { sleep, TestClient } from './test-common';

jest.setTimeout(1000 * 10);
const [slotName, decoderName] = ['slot_decoderbufs', 'decoderbufs'];

let client: TestClient;
describe('decoderbufs', () => {
  beforeAll(async () => {
    client = await TestClient.New(slotName, decoderName);
  });

  afterAll(async () => {
    await client.end();
  });

  it('Insert, Delete(w/FK)', async () => {
    const service = new LogicalReplicationService(TestClientConfig);
    const plugin = new ProtocolBuffersPlugin({});

    let inserted = 0;
    let deleted = 0;
    service.on('data', (lsn: string, log: ProtocolBuffers.RowMessage) => {
      // console.log(lsn, log);
      inserted += log.op === ProtocolBuffersOperation.INSERT ? 1 : 0;
      deleted += log.op === ProtocolBuffersOperation.DELETE ? 1 : 0;
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
    const plugin = new ProtocolBuffersPlugin({});

    let rowCount = 0;
    service.on('data', (lsn: string, log: ProtocolBuffers.RowMessage) => {
      // console.log(lsn, log);
      rowCount += log.op === ProtocolBuffersOperation.UPDATE ? 1 : 0;
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
