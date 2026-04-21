import { LogicalReplicationService } from '../logical-replication-service.js';

describe('config normalization', () => {
  const dummyClientConfig = { host: 'localhost', user: 'none', database: 'none' };

  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('applies defaults when no config is passed', () => {
    const service = new LogicalReplicationService(dummyClientConfig);
    expect(service.config.autoAck).toBe(true);
    expect(service.config.keepaliveIntervalSeconds).toBe(10);
    expect(service.config.flowControl.enabled).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('uses new top-level keys when provided', () => {
    const service = new LogicalReplicationService(dummyClientConfig, {
      autoAck: false,
      keepaliveIntervalSeconds: 30,
    });
    expect(service.config.autoAck).toBe(false);
    expect(service.config.keepaliveIntervalSeconds).toBe(30);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('maps deprecated `acknowledge` keys and emits a warning', () => {
    const service = new LogicalReplicationService(dummyClientConfig, {
      acknowledge: { auto: false, timeoutSeconds: 20 },
    });
    expect(service.config.autoAck).toBe(false);
    expect(service.config.keepaliveIntervalSeconds).toBe(20);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/deprecated/);
  });

  it('prefers new keys over deprecated ones when both are supplied', () => {
    const service = new LogicalReplicationService(dummyClientConfig, {
      autoAck: true,
      keepaliveIntervalSeconds: 5,
      acknowledge: { auto: false, timeoutSeconds: 99 },
    });
    expect(service.config.autoAck).toBe(true);
    expect(service.config.keepaliveIntervalSeconds).toBe(5);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
