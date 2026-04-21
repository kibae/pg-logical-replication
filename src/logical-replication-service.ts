import EventEmitter2 from 'eventemitter2';
import { Client, ClientConfig, Connection } from 'pg';
import { AbstractPlugin } from './output-plugins/abstract.plugin.js';

export interface ReplicationClientConfig extends ClientConfig {
  replication: 'database';
}

export interface LogicalReplicationConfig {
  /**
   * If true, send an acknowledgment after every data message so the replication
   * slot advances automatically. If false, the caller must invoke `acknowledge()`
   * manually — the keepalive timer will still run but will NOT advance the slot
   * past the last manually acknowledged LSN.
   * Default: true
   */
  autoAck?: boolean;
  /**
   * Interval (in seconds) for sending a standby status update to keep the
   * replication connection alive. Set to 0 to disable the periodic keepalive.
   * The keepalive uses the last acknowledged LSN for flush/apply positions,
   * so it never silently advances the slot past unacknowledged work.
   * Default: 10
   */
  keepaliveIntervalSeconds?: number;
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
  /**
   * @deprecated Use `autoAck` and `keepaliveIntervalSeconds` at the top level.
   * Will be removed in 4.0. If supplied, values are mapped with a console warning.
   */
  acknowledge?: {
    auto?: boolean;
    timeoutSeconds?: number;
  };
}

interface NormalizedConfig {
  autoAck: boolean;
  keepaliveIntervalSeconds: number;
  flowControl: { enabled: boolean };
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
  public readonly config: NormalizedConfig;
  constructor(public readonly clientConfig: ClientConfig, config?: LogicalReplicationConfig) {
    super();
    this.config = LogicalReplicationService.normalizeConfig(config);
  }

  private static normalizeConfig(config?: LogicalReplicationConfig): NormalizedConfig {
    let autoAck = config?.autoAck ?? true;
    let keepaliveIntervalSeconds = config?.keepaliveIntervalSeconds ?? 10;

    if (config?.acknowledge !== undefined) {
      console.warn(
        '[pg-logical-replication] `acknowledge` config is deprecated and will be removed in 4.0. ' +
          'Use top-level `autoAck` and `keepaliveIntervalSeconds` instead.'
      );
      if (config.autoAck === undefined && config.acknowledge.auto !== undefined) {
        autoAck = config.acknowledge.auto;
      }
      if (
        config.keepaliveIntervalSeconds === undefined &&
        config.acknowledge.timeoutSeconds !== undefined
      ) {
        keepaliveIntervalSeconds = config.acknowledge.timeoutSeconds;
      }
    }

    return {
      autoAck,
      keepaliveIntervalSeconds,
      flowControl: {
        enabled: false,
        ...(config?.flowControl || {}),
      },
    };
  }

  private _lastReceivedLsn: string | null = null;
  private _lastAckedLsn: string | null = null;
  public lastLsn(): string {
    return this._lastReceivedLsn || '0/00000000';
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

    // End the client before removing listeners so the subscribe() promise
    // can resolve/reject properly when the connection closes.
    await this._client?.end();

    this._connection?.removeAllListeners();
    this._connection = null;

    this._client?.removeAllListeners();
    this._client = null;

    this.checkStandbyStatus(false);

    return this;
  }

  public async destroy(): Promise<this> {
    await this.stop();
    this.removeAllListeners();
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
      this._lastReceivedLsn = uptoLsn || this._lastReceivedLsn;
      // Seed the acked LSN floor from the starting position so keepalives
      // never send a flushed value lower than what the slot already holds.
      this._lastAckedLsn = this._lastReceivedLsn;

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
            this._acknowledge(lsn).catch((error) => {
              this.emit('error', error);
            });
          }
        } else if (buffer[0] == 0x6b) {
          // Primary keepalive message
          const timestamp = Math.floor(
            buffer.readUInt32BE(9) * 4294967.296 + buffer.readUInt32BE(13) / 1000 + 946080000000
          );
          const shouldRespond = !!buffer.readInt8(17);
          this.emit('heartbeat', lsn, timestamp, shouldRespond);
        }
        this._lastReceivedLsn = lsn;
      });

      return plugin.start(client, slotName, this._lastReceivedLsn || '0/00000000').catch(e => {
        if (!this._stop || !/Connection\s+terminated/i.test(e?.toString()))
          throw e;
      });
    } catch (e) {
      await this.stop();
      this.emit('error', e);
      throw e;
    }
  }

  private async _acknowledge(lsn: string) {
    if (!this.config.autoAck) return;

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
    if (this.config.keepaliveIntervalSeconds > 0 && enable)
      this.checkStandbyStatusTimer = setInterval(() => {
        if (this._stop) return;

        if (
          this._lastAckedLsn &&
          Date.now() - this.lastStandbyStatusUpdatedTime > this.config.keepaliveIntervalSeconds * 1000
        ) {
          // Keepalive only — never advances the slot past manually acked LSN.
          // The received position may be ahead; the flush/apply position stays
          // at _lastAckedLsn so the server does not discard unacked WAL.
          this.sendStandbyStatus(this._lastReceivedLsn ?? this._lastAckedLsn, this._lastAckedLsn, false).catch(
            (error) => {
              this.emit('error', error);
            }
          );
        }
      }, 1000);
  }

  /**
   * Manually acknowledge an LSN. Advances the replication slot up to `lsn`.
   * @param lsn
   * @param ping Request server to respond
   */
  public async acknowledge(lsn: string, ping: boolean = false): Promise<boolean> {
    if (this._stop) return false;
    this._lastAckedLsn = lsn;
    return this.sendStandbyStatus(lsn, lsn, ping);
  }

  private async sendStandbyStatus(
    receivedLsn: string,
    flushedLsn: string,
    ping: boolean
  ): Promise<boolean> {
    if (this._stop) return false;
    this.lastStandbyStatusUpdatedTime = Date.now();

    const [receivedUpper, receivedLower] = bumpLsn(receivedLsn);
    const [flushedUpper, flushedLower] = bumpLsn(flushedLsn);

    // Timestamp as microseconds since midnight 2000-01-01
    const now = Date.now() - 946080000000;
    const upperTimestamp = Math.floor(now / 4294967.296);
    const lowerTimestamp = Math.floor(now - upperTimestamp * 4294967.296);

    const response = Buffer.alloc(34);
    response.fill(0x72); // 'r'

    // Last WAL Byte + 1 received and written to disk locally
    response.writeUInt32BE(receivedUpper, 1);
    response.writeUInt32BE(receivedLower, 5);

    // Last WAL Byte + 1 flushed to disk in the standby
    response.writeUInt32BE(flushedUpper, 9);
    response.writeUInt32BE(flushedLower, 13);

    // Last WAL Byte + 1 applied in the standby
    response.writeUInt32BE(flushedUpper, 17);
    response.writeUInt32BE(flushedLower, 21);

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

function bumpLsn(lsn: string): [number, number] {
  const slice = lsn.split('/');
  let upper = parseInt(slice[0], 16);
  let lower = parseInt(slice[1], 16);

  if (lower === 4294967295) {
    // [0xff, 0xff, 0xff, 0xff]
    upper = upper + 1;
    lower = 0;
  } else {
    lower = lower + 1;
  }

  return [upper, lower];
}
