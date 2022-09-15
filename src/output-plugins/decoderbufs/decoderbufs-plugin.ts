import { AbstractPlugin } from '../abstract.plugin';
import { Client } from 'pg';
import decoderbufsProto from './pg_logicaldec.proto';

export interface ProtocolBuffersPluginOptions {}

export class ProtocolBuffersPlugin extends AbstractPlugin<ProtocolBuffersPluginOptions> {
  private proto: any;
  private rowMessage: any;

  constructor(options?: ProtocolBuffersPluginOptions) {
    super(options || {});
    try {
      const protobufjs = require('protobufjs');

      this.proto = protobufjs.Root.fromJSON(decoderbufsProto);
      this.rowMessage = this.proto.lookupType('RowMessage');
    } catch (e) {
      console.error(`To use decoderbufs decoder, you need to install protobufjs package.
https://github.com/protobufjs/protobuf.js`);
      throw e;
    }
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
