import { Client } from 'pg';

export abstract class AbstractPlugin<OPTION = any> {
  public constructor(public readonly options: OPTION) {}

  public abstract get name(): string;
  public abstract start(client: Client, slotName: string, lastLsn: string): Promise<any>;
  public abstract parse(buffer: Buffer): any;
}
