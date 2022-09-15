import { Client } from 'pg'

import { AbstractPlugin } from '../abstract.plugin'
import { Message, Options } from './pgoutput.types'
import { PgoutputParser } from './pgoutput-parser'

export class PgoutputPlugin extends AbstractPlugin<Options> {
  private parser: PgoutputParser

  constructor(options: Options) {
    super(options)

    this.parser = new PgoutputParser()
  }

  get name(): string {
    return 'pgoutput'
  }

  parse(buffer: Buffer): Message {
    return this.parser.parse(buffer)
  }

  start(client: Client, slotName: string, lastLsn: string): Promise<any> {
    const options = [
      `proto_version '${this.options.protoVersion}'`,
      `publication_names '${this.options.publicationNames.join(',')}'`,
    ].join(', ')

    const sql = `START_REPLICATION SLOT "${slotName}" LOGICAL ${lastLsn} (${options})`

    return client.query(sql)
  }
}
