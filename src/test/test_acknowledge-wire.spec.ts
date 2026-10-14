import { LogicalReplicationService } from '../logical-replication-service.js';

describe('standby status WAL positions', () => {
  it.each(['140F/15000238', '0/FFFFFFFF', '1/0', '12345678/9ABCDEF0', '0/0'])(
    'reports WAL end %s unchanged, including repeated idle acknowledgements',
    async (lsn) => {
      const packets: Buffer[] = [];
      const service = new LogicalReplicationService({}, { acknowledge: { auto: false, timeoutSeconds: 0 } });
      // Record the real encoder's output without opening a PostgreSQL connection.
      Object.assign(service, {
        _stop: false,
        _connection: { sendCopyFromChunk: (packet: Buffer) => packets.push(packet) },
      });

      await expect(service.acknowledge(lsn)).resolves.toBe(true);
      await expect(service.acknowledge(lsn, true)).resolves.toBe(true);

      const [high, low] = lsn.split('/');
      const expected = (BigInt('0x' + high) << 32n) | BigInt('0x' + low);
      expect(packets).toHaveLength(2);
      for (const packet of packets) {
        expect(packet.length).toBe(34);
        expect(packet[0]).toBe('r'.charCodeAt(0));
        // Written, flushed and applied positions are exclusive WAL end positions.
        expect(packet.readBigUInt64BE(1)).toBe(expected);
        expect(packet.readBigUInt64BE(9)).toBe(expected);
        expect(packet.readBigUInt64BE(17)).toBe(expected);
      }
      expect(packets[0][33]).toBe(0);
      expect(packets[1][33]).toBe(1);
    },
  );
});
