import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionRegistry } from '../../services/ConnectionRegistry.js';

describe('ConnectionRegistry', () => {
  let registry: ConnectionRegistry;

  beforeEach(() => {
    registry = new ConnectionRegistry(2, { warn: vi.fn() });
  });

  it('tracks unique active connections', () => {
    expect(registry.add('client-1')).toBe(true);
    expect(registry.add('client-1')).toBe(true);
    expect(registry.count()).toBe(1);

    registry.remove('client-1');
    expect(registry.count()).toBe(0);
  });

  it('rejects new connections after reaching capacity', () => {
    registry.add('client-1');
    registry.add('client-2');

    expect(registry.add('client-3')).toBe(false);
    expect(registry.count()).toBe(2);
    expect(registry.max()).toBe(2);
  });
});
