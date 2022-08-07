import { AbstractPlugin } from '../abstract.plugin';
import { Client } from 'pg';
import { Root, Type } from 'protobufjs';

// https://github.com/debezium/postgres-decoderbufs/blob/main/proto/pg_logicaldec.proto
const decoderbufsProto = require('./pg_logicaldec.proto.json');

export interface ProtocolBuffersDecodingPluginOptions {}

export class ProtocolBuffersDecodingPlugin extends AbstractPlugin<ProtocolBuffersDecodingPluginOptions> {
  private proto: Root;
  private rowMessage: Type;

  constructor(options?: ProtocolBuffersDecodingPluginOptions) {
    super(options || {});

    this.proto = Root.fromJSON(decoderbufsProto);
    this.rowMessage = this.proto.lookupType('RowMessage');
  }

  get name(): string {
    return 'decoderbufs';
  }

  async start(client: Client, slotName: string, lastLsn: string): Promise<any> {
    const options: string[] = [];

    let sql = `START_REPLICATION SLOT "${slotName}" LOGICAL ${lastLsn}`;
    if (options.length > 0) sql += ` (${options.join(' , ')})`;
    // console.log(sql);
    return client.query(sql);
  }

  parse(buffer: Buffer): any {
    return this.rowMessage.decode(buffer);
  }
}
