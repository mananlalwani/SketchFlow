/**
 * OpenTelemetry initialization for Node.js server
 * Must be imported before any other modules to enable auto-instrumentation
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
declare const isOtelEnabled: boolean;
declare let sdk: NodeSDK | null;
export { sdk, isOtelEnabled };
//# sourceMappingURL=otel.d.ts.map