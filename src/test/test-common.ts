import { Client } from 'pg';
import { TestClientConfig } from './client-config.js';

export class TestClient extends Client {
  private constructor(public readonly slotName: string, public readonly decoderName: string) {
    super({ ...TestClientConfig });
  }

  public async createSlot() {
    await this.dropSlot();
    await this.query(
      //language=sql
      `SELECT *
         FROM pg_create_logical_replication_slot('${this.slotName}', '${this.decoderName}')`
    ).catch((e) => {
      console.error(e);
    });
  }

  public async dropSlot() {
    await this.query(
      //language=sql
      `SELECT pg_drop_replication_slot('${this.slotName}')`
    ).catch((e) => {});
  }

  public static async New(slotName: string, decoderName: string): Promise<TestClient> {
    const client: TestClient = new TestClient(slotName, decoderName);

    await client.connect();
    await client.createSlot();

    return client;
  }
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
