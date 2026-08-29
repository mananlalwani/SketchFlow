import { describe, expect, it } from 'vitest';
import { Logger } from '../../utils/logger.js';

describe('Logger request context', () => {
  it('keeps request ids isolated across overlapping async work', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = Logger.runWithRequestId('request-a', async () => {
      await firstGate;
      return Logger.getRequestId();
    });
    const second = Logger.runWithRequestId('request-b', async () => {
      releaseFirst();
      await Promise.resolve();
      return Logger.getRequestId();
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['request-a', 'request-b']);
    expect(Logger.getRequestId()).toBeUndefined();
  });
});
