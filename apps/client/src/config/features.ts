/**
 * Feature flags for enabling/disabling features
 *
 * To enable/disable a feature:
 * 1. Change the boolean value for the feature (true = enabled, false = disabled)
 * 2. The feature will be hidden from UI and disabled in the codebase
 * 3. Restart the dev server for changes to take effect
 */

export const FEATURES = {
  /**
   * Auto shape detection - converts rough drawings into perfect shapes
   * Set to false to disable shape detection completely
   * When disabled: hides UI controls and prevents shape detection from running
   */
  AUTO_SHAPE: false,

  /**
   * Advanced shape detection - experimental improved detection
   */
  ADVANCED_SHAPE_DETECTION: false,

  /**
   * Real-time collaboration features
   */
  COLLABORATION: true,

  /**
   * Project sharing
   */
  SHARING: true,

  /**
   * Performance monitoring
   */
  PERFORMANCE_MONITORING: true,
} as const;

export type FeatureFlag = keyof typeof FEATURES;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: FeatureFlag): boolean {
  return FEATURES[feature];
}
