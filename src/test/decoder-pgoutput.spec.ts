import { LogicalReplicationService } from '../logical-replication-service';
import { TestClientConfig } from './client-config';
import { Pgoutput, PgoutputPlugin } from '../output-plugins/pgoutput';
import { TestClient } from './test-common';

jest.setTimeout(100_000);
const [slotName, decoderName, publicationName] = ['slot_pgoutput', 'pgoutput', 'pgoutput_test_pub'];

const lsnRe = /^[0-9A-F]{8}\/[0-9A-F]{8}$/;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let client: TestClient;

describe('pgoutput', () => {
  beforeAll(async () => {
    client = await TestClient.New(slotName, decoderName);
    await client.query(
      //language=sql
      `DROP
      PUBLICATION IF EXISTS "${publicationName}"`
    );
    await client.query(
      //language=sql
      `CREATE
      PUBLICATION "${publicationName}" FOR ALL TABLES`
    );
  });

  afterAll(async () => {
    await client.query(
      //language=sql
      `DROP
      PUBLICATION IF EXISTS "${publicationName}"`
    );
    await client.end();
  });

  it('Insert, Delete(w/FK)', async () => {
    const service = new LogicalReplicationService(TestClientConfig);
    const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [publicationName] });
    const messages: Pgoutput.Message[] = [];

    service.on('data', (lsn: string, log: Pgoutput.Message) => {
      messages.push(log);
    });

    service.subscribe(plugin, slotName).catch((e) => {
      console.error('Error from .subscribe', e);
    });

    await sleep(100);

    // insert
    const result = await client.query(
      //language=sql
      `INSERT INTO users(firstname, lastname, email, phone)
       SELECT md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT), md5(RANDOM()::TEXT)
       FROM generate_series(1, 5) RETURNING *`
    );
    expect(result.rowCount).toBe(5);

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

    await sleep(1000);

    const begin = messages.find((msg) => msg.tag === 'begin');
    expect(begin).toStrictEqual({
      tag: 'begin',
      commitLsn: expect.stringMatching(lsnRe),
      commitTime: expect.any(BigInt),
      xid: expect.any(Number),
    });

    const commit = messages.find((msg) => msg.tag === 'commit');
    expect(commit).toStrictEqual({
      tag: 'commit',
      flags: 0,
      commitLsn: expect.stringMatching(lsnRe),
      commitEndLsn: expect.stringMatching(lsnRe),
      commitTime: expect.any(BigInt),
    });

    const inserts = messages.filter((msg) => msg.tag === 'insert');
    expect(inserts.length).toBe(10);

    expect(inserts[0]).toEqual({
      tag: 'insert',
      relation: {
        tag: 'relation',
        schema: 'public',
        name: 'users',
        relationOid: expect.any(Number),
        replicaIdentity: 'default',
        columns: expect.any(Array),
        keyColumns: ['id'],
      },
      new: {
        id: expect.any(String),
        firstname: expect.any(String),
        lastname: expect.any(String),
        email: expect.any(String),
        phone: expect.any(String),
        deleted: expect.any(Boolean),
        created: expect.any(Date),
      },
    });

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

    await sleep(1000);

    const deletes = messages.filter((msg) => msg.tag === 'delete');
    // because of the cascade delete, we expect users 5 rows + user_contents 5 rows
    expect(deletes.length).toBe(10);

    expect(deletes[0]).toEqual({
      tag: 'delete',
      relation: {
        tag: 'relation',
        schema: 'public',
        name: 'users',
        relationOid: expect.any(Number),
        replicaIdentity: 'default',
        columns: expect.any(Array),
        keyColumns: ['id'],
      },
      key: { id: expect.any(String) },
      old: null, // only provided when REPLICA IDENTITY set to FULL
    });

    expect(deletes[9]).toEqual({
      tag: 'delete',
      relation: {
        tag: 'relation',
        schema: 'public',
        name: 'user_contents',
        relationOid: expect.any(Number),
        replicaIdentity: 'default',
        columns: expect.any(Array),
        keyColumns: ['id'],
      },
      key: { id: expect.any(String) },
      old: null,
    });

    await service.stop();
  });

  it('Update', async () => {
    const service = new LogicalReplicationService(TestClientConfig);
    const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [publicationName] });
    const messages: Pgoutput.Message[] = [];

    service.on('data', (lsn: string, log: Pgoutput.Message) => {
      messages.push(log);
    });

    service.subscribe(plugin, slotName).catch((e) => {
      console.error('Error from .subscribe', e);
    });

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

    const updates = messages.filter((msg) => msg.tag === 'update');
    expect(updates.length).toBe(10);

    expect(updates[0]).toEqual({
      tag: 'update',
      relation: {
        tag: 'relation',
        schema: 'public',
        name: 'users',
        relationOid: expect.any(Number),
        replicaIdentity: 'default',
        columns: expect.any(Array),
        keyColumns: ['id'],
      },
      key: null,
      old: null, // only provided when REPLICA IDENTITY set to FULL
      new: {
        id: expect.any(String),
        firstname: expect.any(String),
        lastname: expect.any(String),
        email: expect.any(String),
        phone: expect.any(String),
        deleted: expect.any(Boolean),
        created: expect.any(Date),
      },
    });

    await service.stop();
  });

  it('Huge transaction', async () => {
    const service = new LogicalReplicationService(TestClientConfig);
    const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [publicationName] });

    let rowCount = 0;
    service.on('data', (lsn: string, log: Pgoutput.Message) => {
      // console.log(lsn, log);
      rowCount += log.tag === 'update' ? 1 : 0;
    });
    // setInterval(() => console.log(`Updated: ${rowCount}`), 1000);

    (function proc() {
      service.subscribe(plugin, slotName).catch((e) => {
        console.error(e);
        setTimeout(proc, 100);
      });
    })();

    await sleep(100);

    const count = Number(
      (
        await client.query(
          //language=sql
          `SELECT COUNT(*) AS cnt
       FROM huge_transaction`
        )
      ).rows[0].cnt
    );

    await client.query(
      //language=sql
      `UPDATE huge_transaction
       SET column1 = md5(RANDOM()::TEXT),
           column2 = md5(RANDOM()::TEXT)`
    );

    for (let i = 0; i < 100; i++) {
      if (rowCount >= count) break;
      await sleep(1000);
      console.log(`Updated: ${rowCount}/${count}`);
    }

    expect(rowCount).toBe(count);

    await service.stop();
  });
});
