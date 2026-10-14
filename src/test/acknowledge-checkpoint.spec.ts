import { Client } from 'pg';
import { LogicalReplicationService } from '../logical-replication-service.js';
import { Pgoutput, PgoutputPlugin } from '../output-plugins/pgoutput/index.js';
import { Wal2Json } from '../output-plugins/wal2json/wal2json-plugin-output.type.js';
import { Wal2JsonPlugin } from '../output-plugins/wal2json/wal2json-plugin.js';
import { TestClientConfig } from './client-config.js';
import { sleep } from './test-common.js';

jest.setTimeout(30_000);

function position(lsn: string): bigint {
  const [high, low] = lsn.split('/');
  return (BigInt(`0x${high}`) << 32n) | BigInt(`0x${low}`);
}

function shift(lsn: string, bytes: bigint): string {
  const value = position(lsn) + bytes;
  return `${(value >> 32n).toString(16)}/${(value & 0xffffffffn).toString(16)}`;
}

// Reproduce the pre-#222 wire contract without depending on a second package version.
class LegacyAcknowledgementService extends LogicalReplicationService {
  override acknowledge(lsn: string, ping = false): Promise<boolean> {
    return super.acknowledge(shift(lsn, 1n), ping);
  }
}

describe.each(['wal2json', 'pgoutput'] as const)('manual ACK checkpoints (%s)', (decoder) => {
  const table = `ack_checkpoint_${decoder}`;
  const slot = `slot_ack_checkpoint_${decoder}`;
  const publication = `ack_checkpoint_${decoder}_pub`;
  const sessions: Array<{ service: LogicalReplicationService; subscription: Promise<unknown> }> = [];
  let client: Client;
  let streamErrors: Error[];

  async function waitFor(condition: () => boolean | Promise<boolean>, description: string, checkStreamErrors = true) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (checkStreamErrors && streamErrors.length) throw streamErrors[0];
      if (await condition()) return;
      await sleep(20);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function checkpoint(): Promise<bigint> {
    const result = await client.query<{ lsn: string }>(
      'SELECT confirmed_flush_lsn::text AS lsn FROM pg_replication_slots WHERE slot_name = $1',
      [slot],
    );
    return position(result.rows[0].lsn);
  }

  async function stop(session: (typeof sessions)[number]) {
    await session.service.destroy();
    await session.subscription;
    // Closing the client does not guarantee the WAL sender has released the slot yet.
    await waitFor(
      async () => {
        const result = await client.query<{ active: boolean }>(
          'SELECT active FROM pg_replication_slots WHERE slot_name = $1',
          [slot],
        );
        return !result.rows[0]?.active;
      },
      'replication slot release',
      false,
    );
  }

  async function start(legacy = false) {
    const Service = legacy ? LegacyAcknowledgementService : LogicalReplicationService;
    const service = new Service(TestClientConfig, { acknowledge: { auto: false, timeoutSeconds: 0 } });
    const transactions: Array<{ lsn: string; dataLsn: string; ids: number[] }> = [];
    let pendingIds: number[] = [];
    let started = false;
    service.once('start', () => {
      started = true;
    });
    service.on('error', (error) => {
      streamErrors.push(error);
    });
    if (decoder === 'wal2json') {
      service.on('data', (lsn: string, log: Wal2Json.Output) => {
        const ids = log.change
          .filter((change) => change.kind === 'insert' && change.table === table)
          .map((change) => Number(change.columnvalues[change.columnnames.indexOf('id')]));
        // wal2json v1's data-frame LSN is not necessarily the transaction end.
        // includeLsn exposes the exclusive end position separately as nextlsn.
        if (ids.length) transactions.push({ lsn: log.nextlsn, dataLsn: lsn, ids });
      });
    } else {
      service.on('data', (lsn: string, log: Pgoutput.Message) => {
        if (log.tag === 'insert' && log.relation.name === table) pendingIds.push(Number(log.new.id));
        if (log.tag === 'commit' && pendingIds.length) {
          transactions.push({ lsn: log.commitEndLsn!, dataLsn: lsn, ids: pendingIds });
          pendingIds = [];
        }
      });
    }
    const plugin =
      decoder === 'wal2json'
        ? new Wal2JsonPlugin({ includeLsn: true })
        : new PgoutputPlugin({ protoVersion: 1, publicationNames: [publication] });
    // A fresh service and 0/0 force PostgreSQL to resume from the slot's checkpoint,
    // rather than the previous service's in-memory lastLsn.
    const subscription = service.subscribe(plugin, slot, '0/0').catch((error: Error) => {
      streamErrors.push(error);
    });
    sessions.push({ service, subscription });
    await waitFor(() => started, 'replication start');
    return { service, transactions, subscription };
  }

  beforeAll(async () => {
    client = new Client(TestClientConfig);
    await client.connect();
    await client.query(`CREATE TABLE ${table} (id integer PRIMARY KEY)`);
    if (decoder === 'pgoutput') await client.query(`CREATE PUBLICATION ${publication} FOR TABLE ${table}`);
  });

  beforeEach(async () => {
    streamErrors = [];
    await client.query(`TRUNCATE ${table}`);
    await client.query('SELECT pg_create_logical_replication_slot($1, $2)', [slot, decoder]);
  });

  afterEach(async () => {
    for (const session of sessions.splice(0)) {
      await stop(session);
    }
    await client.query('SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = $1', [
      slot,
    ]);
  });

  afterAll(async () => {
    try {
      if (decoder === 'pgoutput') await client.query(`DROP PUBLICATION IF EXISTS ${publication}`);
      await client.query(`DROP TABLE IF EXISTS ${table}`);
    } finally {
      await client.end();
    }
  });

  it.each([
    {
      name: 'resumes after a manual end-position ACK',
      legacy: false,
      adjustment: 0n,
      checkpointOffset: 0n,
      replay: [2, 3],
    },
    {
      name: 'resumes after upgrading a legacy end-position ACK',
      legacy: true,
      adjustment: 0n,
      checkpointOffset: 1n,
      replay: [2, 3],
    },
    {
      name: 'resumes after upgrading a legacy minus-one workaround',
      legacy: true,
      adjustment: -1n,
      checkpointOffset: 0n,
      replay: [2, 3],
    },
    {
      name: 'keeps a retained minus-one workaround one byte behind the end',
      legacy: false,
      adjustment: -1n,
      checkpointOffset: -1n,
      replay: [2, 3],
    },
    ...(decoder === 'wal2json'
      ? [
          {
            name: 'preserves replay when a legacy caller ACKs the data-frame LSN',
            legacy: true,
            adjustment: 0n,
            checkpointOffset: 1n,
            replay: [1, 2, 3],
            useDataLsn: true,
          },
          {
            name: 'preserves replay when a current caller ACKs the data-frame LSN',
            legacy: false,
            adjustment: 0n,
            checkpointOffset: 0n,
            replay: [1, 2, 3],
            useDataLsn: true,
          },
        ]
      : []),
  ])('$name', async (scenario) => {
    const { legacy, adjustment, checkpointOffset, replay } = scenario;
    const initialCheckpoint = await checkpoint();
    const first = await start(legacy);
    await client.query(`INSERT INTO ${table} VALUES (1)`);
    await client.query(`INSERT INTO ${table} VALUES (2)`);
    await waitFor(() => first.transactions.length === 2, 'two committed transactions');
    expect(first.transactions.map((transaction) => transaction.ids)).toEqual([[1], [2]]);
    expect(await checkpoint()).toBe(initialCheckpoint);

    const transaction = first.transactions[0];
    const useDataLsn = 'useDataLsn' in scenario && scenario.useDataLsn;
    if (useDataLsn) expect(position(transaction.dataLsn)).toBeLessThan(position(transaction.lsn));
    const acknowledgedLsn = useDataLsn ? transaction.dataLsn : transaction.lsn;
    const expectedCheckpoint = position(acknowledgedLsn) + checkpointOffset;
    const inputLsn = shift(acknowledgedLsn, adjustment);
    await expect(first.service.acknowledge(inputLsn)).resolves.toBe(true);
    await expect(first.service.acknowledge(inputLsn, true)).resolves.toBe(true);
    await waitFor(async () => (await checkpoint()) >= expectedCheckpoint, 'manual ACK checkpoint');
    expect(await checkpoint()).toBe(expectedCheckpoint);
    await stop(first);
    sessions.splice(
      sessions.findIndex((session) => session.service === first.service),
      1,
    );

    const resumed = await start();
    // A new marker proves the stream has caught up; do not infer "no replay"
    // from an arbitrary delay with no messages.
    await client.query(`INSERT INTO ${table} VALUES (3)`);
    await waitFor(() => resumed.transactions.some((transaction) => transaction.ids.includes(3)), 'reconnect marker');
    expect(resumed.transactions.flatMap((transaction) => transaction.ids)).toEqual(replay);

    const last = resumed.transactions[resumed.transactions.length - 1];
    await resumed.service.acknowledge(last.lsn);
    await waitFor(async () => (await checkpoint()) >= position(last.lsn), 'resumed ACK checkpoint');
    expect(await checkpoint()).toBe(position(last.lsn));
    expect(streamErrors).toEqual([]);
  });
});
