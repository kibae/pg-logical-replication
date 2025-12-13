import EventEmitter2 from 'eventemitter2';
import { Client, ClientConfig, Connection } from 'pg';
import { AbstractPlugin } from './output-plugins/abstract.plugin.js';

export interface ReplicationClientConfig extends ClientConfig {
  replication: 'database';
}

export interface LogicalReplicationConfig {
  acknowledge?: {
    /**
     * If the value is false, acknowledge must be done manually.
     * Default: true
     */
    auto: boolean;
    /**
     * Acknowledge is performed every set time (sec). If 0, do not do it.
     * Default: 10
     */
    timeoutSeconds: 0 | 10 | number;
  };
  /**
   * Flow control (backpressure) configuration.
   * When enabled, the stream will be paused until the data handler completes,
   * preventing memory overflow when processing is slower than the incoming message rate.
   */
  flowControl?: {
    /**
     * If true, pause the stream until the data handler completes.
     * This enables backpressure support for async handlers.
     * Default: false
     */
    enabled: boolean;
  };
}

export interface LogicalReplicationService {
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'data', listener: (lsn: string, log: any) => Promise<void> | void): this;
  on(event: 'start', listener: () => Promise<void> | void): this;
  on(event: 'acknowledge', listener: (lsn: string) => Promise<void> | void): this;
  on(
    event: 'heartbeat',
    listener: (lsn: string, timestamp: number, shouldRespond: boolean) => Promise<void> | void
  ): this;
}

export class LogicalReplicationService extends EventEmitter2 implements LogicalReplicationService {
  public readonly config: LogicalReplicationConfig;
  constructor(public readonly clientConfig: ClientConfig, config?: Partial<LogicalReplicationConfig>) {
    super();
    this.config = {
      acknowledge: {
        auto: true,
        timeoutSeconds: 10,
        ...(config?.acknowledge || {}),
      },
      flowControl: {
        enabled: false,
        ...(config?.flowControl || {}),
      },
    };
  }

  private _lastLsn: string | null = null;
  public lastLsn(): string {
    return this._lastLsn || '0/00000000';
  }

  private _client: Client | null = null;
  private _connection: Connection | null = null;
  private async client(): Promise<[Client, Connection]> {
    await this.stop();

    this._client = new Client({
      ...this.clientConfig,
      replication: 'database',
    } as ReplicationClientConfig);

    await this._client.connect();
    // @ts-ignore
    this._connection = this._client.connection;

    this._client.on('error', (e) => this.emit('error', e));

    return [this._client!, this._connection!];
  }

  private _stop: boolean = true;
  public isStop(): boolean {
    return this._stop;
  }

  // Flow control (backpressure) queue
  private _messageQueue: Array<{ lsn: string; data: any }> = [];
  private _processing: boolean = false;

  public async stop(): Promise<this> {
    this._stop = true;

    // Clear flow control queue
    this._messageQueue = [];
    this._processing = false;

    this._connection?.removeAllListeners();
    this._connection = null;

    this._client?.removeAllListeners();
    await this._client?.end();
    this._client = null;

    this.checkStandbyStatus(false);

    return this;
  }

  async subscribe(plugin: AbstractPlugin, slotName: string): Promise<this>;
  async subscribe(plugin: AbstractPlugin, slotName: string, uptoLsn: string): Promise<this>;
  /**
   * subscribe
   * @param plugin One of [TestDecodingPlugin, ]
   * @param slotName
   * @param uptoLsn
   */
  async subscribe(plugin: AbstractPlugin, slotName: string, uptoLsn?: string): Promise<this> {
    try {
      const [client, connection] = await this.client();
      this._lastLsn = uptoLsn || this._lastLsn;

      // check replicationStart
      connection.once('replicationStart', () => {
        this._stop = false;
        this.emit('start');
        this.checkStandbyStatus(true);
      });

      connection.on('copyData', ({ chunk: buffer }: { length: number; chunk: Buffer; name: string }) => {
        if (buffer[0] != 0x77 && buffer[0] != 0x6b) {
          console.warn('Unknown message', buffer[0]);
          return;
        }
        const lsn =
          buffer.readUInt32BE(1).toString(16).toUpperCase() + '/' + buffer.readUInt32BE(5).toString(16).toUpperCase();

        if (buffer[0] == 0x77) {
          // XLogData
          if (this.config.flowControl!.enabled) {
            // Flow control enabled: queue the message and process sequentially
            this._messageQueue.push({ lsn, data: plugin.parse(buffer.subarray(25)) });
            this._processQueue();
          } else {
            // Original behavior: emit immediately
            this.emit('data', lsn, plugin.parse(buffer.subarray(25)));
            this._acknowledge(lsn);
          }
        } else if (buffer[0] == 0x6b) {
          // Primary keepalive message
          const timestamp = Math.floor(
            buffer.readUInt32BE(9) * 4294967.296 + buffer.readUInt32BE(13) / 1000 + 946080000000
          );
          const shouldRespond = !!buffer.readInt8(17);
          this.emit('heartbeat', lsn, timestamp, shouldRespond);
        }
        this._lastLsn = lsn;
      });

      return plugin.start(client, slotName, this._lastLsn || '0/00000000');
    } catch (e) {
      await this.stop();
      this.emit('error', e);
      throw e;
    }
  }

  private async _acknowledge(lsn: string) {
    if (!this.config.acknowledge!.auto) return;

    this.emit('acknowledge', lsn);
    await this.acknowledge(lsn);
  }

  /**
   * Process messages in the queue sequentially with backpressure support.
   * Pauses the stream while processing and resumes when the queue is empty.
   */
  private _processQueue(): void {
    if (this._processing || this._stop) return;
    this._processing = true;

    // Pause the stream to prevent buffer overflow
    // @ts-ignore - accessing internal stream property
    this._connection?.stream?.pause?.();

    const processNext = async (): Promise<void> => {
      while (this._messageQueue.length > 0 && !this._stop) {
        const message = this._messageQueue.shift()!;

        try {
          // Wait for all listeners to complete (supports async handlers)
          await this.emitAsync('data', message.lsn, message.data);
          await this._acknowledge(message.lsn);
        } catch (e) {
          this.emit('error', e);
        }
      }

      this._processing = false;

      // Resume the stream when queue is empty
      if (!this._stop) {
        // @ts-ignore - accessing internal stream property
        this._connection?.stream?.resume?.();
      }
    };

    processNext();
  }

  private lastStandbyStatusUpdatedTime = 0;
  private checkStandbyStatusTimer: NodeJS.Timeout | null = null;
  private checkStandbyStatus(enable: boolean) {
    if (this.checkStandbyStatusTimer) {
      clearInterval(this.checkStandbyStatusTimer);
      this.checkStandbyStatusTimer = null;
    }
    if (this.config.acknowledge!.timeoutSeconds > 0 && enable)
      this.checkStandbyStatusTimer = setInterval(async () => {
        if (this._stop) return;

        if (
          this._lastLsn &&
          Date.now() - this.lastStandbyStatusUpdatedTime > this.config.acknowledge!.timeoutSeconds * 1000
        )
          await this.acknowledge(this._lastLsn);
      }, 1000);
  }

  /**
   * @param lsn
   * @param ping Request server to respond
   */
  public async acknowledge(lsn: string, ping: boolean = false): Promise<boolean> {
    if (this._stop) return false;
    this.lastStandbyStatusUpdatedTime = Date.now();

    const slice = lsn.split('/');
    let [upperWAL, lowerWAL]: [number, number] = [parseInt(slice[0], 16), parseInt(slice[1], 16)];

    // Timestamp as microseconds since midnight 2000-01-01
    const now = Date.now() - 946080000000;
    const upperTimestamp = Math.floor(now / 4294967.296);
    const lowerTimestamp = Math.floor(now - upperTimestamp * 4294967.296);

    if (lowerWAL === 4294967295) {
      // [0xff, 0xff, 0xff, 0xff]
      upperWAL = upperWAL + 1;
      lowerWAL = 0;
    } else {
      lowerWAL = lowerWAL + 1;
    }

    const response = Buffer.alloc(34);
    response.fill(0x72); // 'r'

    // Last WAL Byte + 1 received and written to disk locally
    response.writeUInt32BE(upperWAL, 1);
    response.writeUInt32BE(lowerWAL, 5);

    // Last WAL Byte + 1 flushed to disk in the standby
    response.writeUInt32BE(upperWAL, 9);
    response.writeUInt32BE(lowerWAL, 13);

    // Last WAL Byte + 1 applied in the standby
    response.writeUInt32BE(upperWAL, 17);
    response.writeUInt32BE(lowerWAL, 21);

    // Timestamp as microseconds since midnight 2000-01-01
    response.writeUInt32BE(upperTimestamp, 25);
    response.writeUInt32BE(lowerTimestamp, 29);

    // If 1, requests server to respond immediately - can be used to verify connectivity
    response.writeInt8(ping ? 1 : 0, 33);

    // @ts-ignore
    this._connection?.sendCopyFromChunk(response);

    return true;
  }
}
