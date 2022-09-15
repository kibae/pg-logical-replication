import { AbstractPlugin } from '../abstract.plugin';
import { Client } from 'pg';

const decoder = require('./decoder');

export interface TestDecodingPluginOptions {
  /**
   * include-xids: on/off
   */
  includeXids?: boolean;

  /**
   * include-timestamp: on/off
   */
  includeTimestamp?: boolean;

  /**
   * skip-empty-xacts: on/off
   */
  skipEmptyXacts?: boolean;

  /**
   * (pg.ver>=11) include-rewrites: on/off
   */
  includeRewrites?: boolean;

  /**
   * (pg.ver>=15) include-sequences: on/off
   */
  includeSequences?: boolean;

  /**
   * (pg.ver>=14) stream-changes: on/off
   */
  streamChanges?: boolean;
}

export class TestDecodingPlugin extends AbstractPlugin<TestDecodingPluginOptions> {
  constructor(options?: TestDecodingPluginOptions) {
    super(options || {});
  }

  get name(): string {
    return 'test_decoding';
  }

  async start(client: Client, slotName: string, lastLsn: string): Promise<any> {
    const options: string[] = [
      `"include-xids" '${this.options.includeXids === true ? 'on' : 'off'}'`,
      `"include-timestamp" '${this.options.includeTimestamp === true ? 'on' : 'off'}'`,
    ];
    if (this.options.skipEmptyXacts) options.push(`"skip-empty-xacts" 'on'`);
    if (this.options.includeRewrites) options.push(`"include-rewrites" 'on'`);
    if (this.options.includeSequences) options.push(`"include-sequences" 'on'`);
    if (this.options.streamChanges) options.push(`"stream-changes" 'on'`);

    const sql = `START_REPLICATION SLOT "${slotName}" LOGICAL ${lastLsn} (${options.join(' , ')})`;
    return client.query(sql);
  }

  parse(buffer: Buffer): any {
    return decoder.parse(buffer.toString(), {});
  }
}
