import { logger } from '../utils/logger.js';

/** Tracks process-local socket capacity only; project state is persisted by ProjectService. */
export class ConnectionRegistry {
  private connections = new Set<string>();

  public constructor(private readonly maxConnections = 50) {}

  public add(clientId: string): boolean {
    if (this.connections.size >= this.maxConnections) {
      logger.warn(`Max connections reached, rejecting ${clientId}`);
      return false;
    }

    this.connections.add(clientId);
    return true;
  }

  public remove(clientId: string): void {
    this.connections.delete(clientId);
  }

  public count(): number {
    return this.connections.size;
  }

  public max(): number {
    return this.maxConnections;
  }
}
