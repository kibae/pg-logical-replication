import { Client } from 'pg';
import { LogicalReplicationService } from '../';
import { TestClientConfig } from './client-config';

import { PgoutputPlugin, Pgoutput } from '../output-plugins/pgoutput';

jest.setTimeout(10_000);
const slotName = 'pgoutput_test_slot';
const publicationName = 'pgoutput_test_pub';
const decoderName = 'pgoutput';

const lsnRe = /^[0-9A-F]{8}\/[0-9A-F]{8}$/;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let client: Client;

describe('pgoutput', () => {
  beforeAll(async () => {
    client = new Client({ ...TestClientConfig });
    await client.connect();

    await client
      .query(
        //language=sql
        `SELECT *
         FROM pg_create_logical_replication_slot('${slotName}', '${decoderName}');
        CREATE PUBLICATION "${publicationName}" FOR ALL TABLES;`
      )
      .catch((e) => {});
  });

  afterAll(async () => {
    await client
      .query(
        //language=sql
        `SELECT pg_drop_replication_slot('${slotName}');
        DROP PUBLICATION "${publicationName}";`
      )
      .catch((e) => {});
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
           FROM generate_series(1, 5)
           RETURNING *`
    );
    expect(result.rowCount).toBe(5);

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
          `DELETE FROM users WHERE id >= ${result.rows[0].id}`
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
});
