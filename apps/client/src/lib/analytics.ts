/**
 * Tool Usage Analytics
 * Tracks which drawing tools are used and how often
 */
import { getTracer, getTraceContext } from './otel';

export type TelemetryMetadata = Record<string, string | number | boolean>;

declare global {
  interface Window {
    toolStats: {
      get: typeof getToolStats;
      summary: typeof getStatsSummary;
      log: typeof logStatsSummary;
    };
  }
}

export interface ToolUsageStats {
  selections: Record<string, number>; // How many times each tool was selected
  objectsCreated: Record<string, number>; // How many objects created with each tool
  sessionStart: number;
  lastActivity: number;
}

// In-memory stats for current session
const stats: ToolUsageStats = {
  selections: {},
  objectsCreated: {},
  sessionStart: Date.now(),
  lastActivity: Date.now(),
};

// Batch logging interval (log summary every 60 seconds if there's activity)
let logInterval: ReturnType<typeof setInterval> | null = null;
let hasNewActivity = false;

/**
 * Track tool selection
 */
export function trackToolSelection(tool: string, previousTool?: string): void {
  stats.selections[tool] = (stats.selections[tool] || 0) + 1;
  stats.lastActivity = Date.now();
  hasNewActivity = true;

  // Create OTel span for tool selection
  const tracer = getTracer('tool-analytics');
  if (tracer) {
    const span = tracer.startSpan('tool.selected');
    span.setAttribute('tool.name', tool);
    span.setAttribute('tool.previous', previousTool || 'none');
    span.setAttribute('tool.total_selections', stats.selections[tool]);
    span.end();
  }

  // Log in dev mode
  if (import.meta.env.DEV) {
    console.debug(`[Analytics] Tool selected: ${tool}`, {
      totalSelections: stats.selections[tool],
      ...getTraceContext(),
    });
  }
}

/**
 * Track object creation (actual tool usage)
 */
export function trackObjectCreated(
  objectType: string,
  tool: string,
  metadata?: TelemetryMetadata,
): void {
  stats.objectsCreated[tool] = (stats.objectsCreated[tool] || 0) + 1;
  stats.lastActivity = Date.now();
  hasNewActivity = true;

  // Create OTel span for object creation
  const tracer = getTracer('tool-analytics');
  if (tracer) {
    const span = tracer.startSpan('tool.object_created');
    span.setAttribute('tool.name', tool);
    span.setAttribute('object.type', objectType);
    span.setAttribute('tool.total_objects', stats.objectsCreated[tool]);
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        span.setAttribute(`object.${key}`, value);
      });
    }
    span.end();
  }

  // Log in dev mode
  if (import.meta.env.DEV) {
    console.debug(`[Analytics] Object created: ${objectType} with ${tool}`, {
      totalObjects: stats.objectsCreated[tool],
      ...getTraceContext(),
    });
  }
}

/**
 * Track feature usage (undo, redo, clear, etc.)
 */
export function trackFeatureUsage(feature: string, metadata?: TelemetryMetadata): void {
  const tracer = getTracer('tool-analytics');
  if (tracer) {
    const span = tracer.startSpan('feature.used');
    span.setAttribute('feature.name', feature);
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        span.setAttribute(`feature.${key}`, value);
      });
    }
    span.end();
  }

  if (import.meta.env.DEV) {
    console.debug(`[Analytics] Feature used: ${feature}`, metadata);
  }
}

/**
 * Get current session stats
 */
export function getToolStats(): ToolUsageStats {
  return { ...stats };
}

/**
 * Get formatted stats summary
 */
export function getStatsSummary(): string {
  const sessionDuration = Math.round((Date.now() - stats.sessionStart) / 1000 / 60);

  const selectionsSorted = Object.entries(stats.selections).sort(([, a], [, b]) => b - a);

  const objectsSorted = Object.entries(stats.objectsCreated).sort(([, a], [, b]) => b - a);

  let summary = `\n📊 Tool Usage Stats (${sessionDuration} min session)\n`;
  summary += '─'.repeat(40) + '\n';

  if (selectionsSorted.length > 0) {
    summary += '\n🔧 Tool Selections:\n';
    selectionsSorted.forEach(([tool, count]) => {
      summary += `   ${tool.padEnd(15)} ${count} times\n`;
    });
  }

  if (objectsSorted.length > 0) {
    summary += '\n🎨 Objects Created:\n';
    objectsSorted.forEach(([tool, count]) => {
      summary += `   ${tool.padEnd(15)} ${count} objects\n`;
    });
  }

  const totalSelections = Object.values(stats.selections).reduce((a, b) => a + b, 0);
  const totalObjects = Object.values(stats.objectsCreated).reduce((a, b) => a + b, 0);

  summary += '\n' + '─'.repeat(40);
  summary += `\n   Total selections: ${totalSelections}`;
  summary += `\n   Total objects: ${totalObjects}`;
  summary += '\n';

  return summary;
}

/**
 * Log stats summary to console and OTel
 */
export function logStatsSummary(): void {
  if (!hasNewActivity) return;

  const totalSelections = Object.values(stats.selections).reduce((a, b) => a + b, 0);
  const totalObjects = Object.values(stats.objectsCreated).reduce((a, b) => a + b, 0);

  if (totalSelections === 0 && totalObjects === 0) return;

  // Log to console
  console.log(getStatsSummary());

  // Create OTel span with summary
  const tracer = getTracer('tool-analytics');
  if (tracer) {
    const span = tracer.startSpan('analytics.summary');
    span.setAttribute('session.duration_ms', Date.now() - stats.sessionStart);
    span.setAttribute('session.total_selections', totalSelections);
    span.setAttribute('session.total_objects', totalObjects);

    // Top 3 tools by selection
    const topTools = Object.entries(stats.selections)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    topTools.forEach(([tool, count], i) => {
      span.setAttribute(`session.top_tool_${i + 1}`, tool);
      span.setAttribute(`session.top_tool_${i + 1}_count`, count);
    });

    span.end();
  }

  hasNewActivity = false;
}

/**
 * Start periodic logging (call once on app init)
 */
export function startAnalyticsLogging(intervalMs = 60000): void {
  if (logInterval) return;

  logInterval = setInterval(() => {
    logStatsSummary();
  }, intervalMs);

  // Log on page unload
  if (globalThis.window !== undefined) {
    window.addEventListener('beforeunload', () => {
      logStatsSummary();
    });
  }
}

/**
 * Stop periodic logging
 */
export function stopAnalyticsLogging(): void {
  if (logInterval) {
    clearInterval(logInterval);
    logInterval = null;
  }
}

// Export stats for debugging in console
if (globalThis.window !== undefined) {
  window.toolStats = {
    get: getToolStats,
    summary: getStatsSummary,
    log: logStatsSummary,
  };
}
