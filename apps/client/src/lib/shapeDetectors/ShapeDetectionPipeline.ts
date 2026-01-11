/**
 * Main shape detection pipeline that orchestrates all shape detectors
 */

import { Point } from '../geometry';
import { processStroke, ProcessedStroke } from '../strokeProcessor';
import { 
  ShapeDetector, 
  DetectionResult, 
  DetectionThresholds, 
  DEFAULT_THRESHOLDS 
} from './types';
import { LineDetector } from './LineDetector';
import { RectangleDetector } from './RectangleDetector';
import { EllipseDetector } from './EllipseDetector';
import { TriangleDetector } from './TriangleDetector';
import { ParabolaDetector } from './ParabolaDetector';
import { ArrowDetector } from './ArrowDetector';
import { StarDetector } from './StarDetector';

export interface ShapeDetectionResult {
  detectedShape: DetectionResult | null;
  allCandidates: DetectionResult[];
  processingTime: number;
  processedStroke: ProcessedStroke;
}

export interface DetectionOptions {
  thresholds?: Partial<DetectionThresholds>;
  enabledDetectors?: string[];
  strokeProcessingOptions?: {
    minSize?: number;
    resampleStep?: number;
    smoothingWindow?: number;
    closureTolerance?: number;
    simplificationTolerance?: number;
  };
  returnAllCandidates?: boolean;
  debugMode?: boolean;
}

export class ShapeDetectionPipeline {
  private detectors: ShapeDetector[];
  private thresholds: DetectionThresholds;
  
  constructor(options: DetectionOptions = {}) {
    // Initialize all detectors
    this.detectors = [
      new ArrowDetector(),
      new StarDetector(),
      new LineDetector(),
      new RectangleDetector(),
      new EllipseDetector(),
      new TriangleDetector(),
      new ParabolaDetector()
    ];
    
    // Sort by priority (higher priority first)
    this.detectors.sort((a, b) => b.priority - a.priority);
    
    // Filter enabled detectors
    if (options.enabledDetectors) {
      this.detectors = this.detectors.filter(detector => 
        options.enabledDetectors!.includes(detector.shapeType)
      );
    }
    
    // Merge thresholds
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  }
  
  /**
   * Detect shapes from a stroke path
   */
  detectShape(points: Point[], options: DetectionOptions = {}): ShapeDetectionResult {
    const startTime = performance.now();
    
    // Merge options with instance defaults
    const finalThresholds = { ...this.thresholds, ...options.thresholds };
    
    // Step 1: Preprocess the stroke
    const processedStroke = processStroke(points, options.strokeProcessingOptions);
    
    if (options.debugMode) {
      console.log(`Input: ${points.length} points, processed: ${processedStroke?.processedPoints.length || 0} points`);
      if (processedStroke) {
        console.log(`Stroke analysis: closed=${processedStroke.isClosed}, smooth=${processedStroke.isSmooth}, complexity=${processedStroke.complexity.toFixed(3)}`);
      }
    }
    
    if (!processedStroke) {
      return {
        detectedShape: null,
        allCandidates: [],
        processingTime: performance.now() - startTime,
        processedStroke: {
          originalPoints: points,
          processedPoints: points,
          boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 },
          totalLength: 0,
          isClosed: false,
          isSmooth: false,
          aspectRatio: 1,
          complexity: 0
        }
      };
    }
    
    // Step 2: Run all detectors
    const candidates: DetectionResult[] = [];
    
    for (const detector of this.detectors) {
      try {
        const result = detector.detect(processedStroke, finalThresholds);
        if (result && result.confidence >= finalThresholds.minConfidence) {
          candidates.push(result);
          
          if (options.debugMode) {
            const compositeScore = this.calculateCompositeScore(result, finalThresholds);
            console.log(`${detector.shapeType} detector: confidence=${result.confidence.toFixed(3)}, error=${result.error.toFixed(3)}, composite=${compositeScore.toFixed(3)}`);
          }
        } else if (options.debugMode && result) {
          console.log(`${detector.shapeType} detector: REJECTED - confidence=${result.confidence.toFixed(3)} < ${finalThresholds.minConfidence}`);
        } else if (options.debugMode) {
          console.log(`${detector.shapeType} detector: FAILED - no result returned`);
        }
      } catch (error) {
        if (options.debugMode) {
          console.error(`Error in ${detector.shapeType} detector:`, error);
        }
      }
    }
    
    // Step 3: Select the best candidate
    const bestCandidate = this.selectBestCandidate(candidates, finalThresholds);
    
    const processingTime = performance.now() - startTime;
    
    if (options.debugMode) {
      console.log(`Shape detection completed in ${processingTime.toFixed(2)}ms`);
      console.log(`Found ${candidates.length} candidates, best: ${bestCandidate?.shape.type || 'none'}`);
      if (candidates.length > 1) {
        const scores = candidates.map(c => ({
          type: c.shape.type,
          confidence: c.confidence.toFixed(3),
          error: c.error.toFixed(3),
          composite: this.calculateCompositeScore(c, finalThresholds).toFixed(3)
        }));
        console.table(scores);
      }
    }
    
    return {
      detectedShape: bestCandidate,
      allCandidates: options.returnAllCandidates ? candidates : [],
      processingTime,
      processedStroke
    };
  }
  
  /**
   * Select the best candidate from all detection results
   */
  private selectBestCandidate(
    candidates: DetectionResult[], 
    thresholds: DetectionThresholds
  ): DetectionResult | null {
    
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    
    // Sort candidates by a composite score
    const scoredCandidates = candidates.map(candidate => ({
      candidate,
      score: this.calculateCompositeScore(candidate, thresholds),
      priority: this.getDetectorPriority(candidate.shape.type)
    }));
    
    scoredCandidates.sort((a, b) => b.score - a.score);
    
    // Resolve line vs parabola conflicts using stroke characteristics
    const lineEntry = scoredCandidates.find(entry => entry.candidate.shape.type === 'line');
    const parabolaEntry = scoredCandidates.find(entry => entry.candidate.shape.type === 'parabola');

    if (lineEntry && parabolaEntry) {
      const lineMetadata = lineEntry.candidate.metadata || {};
      const parabolaMetadata = parabolaEntry.candidate.metadata || {};

      const lineStraightSegmentRatio = lineMetadata.strokeAnalysis?.straightSegmentRatio;
      const lineComplexity = typeof lineMetadata.complexity === 'number' ? lineMetadata.complexity : null;
      const parabolaAnalysis = parabolaMetadata.analysis || {};
      const parabolaStraightSegmentRatio = parabolaAnalysis.straightSegmentRatio;
      const parabolaSymmetry = parabolaMetadata.parabolaInfo?.symmetry ?? parabolaAnalysis.symmetry ?? 0;
      const parabolaCurvature = parabolaMetadata.parabolaInfo?.curvature ?? parabolaMetadata.parabolaFit?.a ?? null;

      let preferParabola = false;

      if (typeof lineStraightSegmentRatio === 'number' && lineStraightSegmentRatio < thresholds.lineMinStraightSegmentRatio + 0.05) {
        preferParabola = true;
      }

      if (typeof lineComplexity === 'number' && lineComplexity > thresholds.lineMaxComplexity * 0.8) {
        preferParabola = true;
      }

      if (typeof parabolaStraightSegmentRatio === 'number' && parabolaStraightSegmentRatio < thresholds.lineMinStraightSegmentRatio * 0.9) {
        preferParabola = true;
      }

      if (
        preferParabola &&
        parabolaSymmetry >= thresholds.parabolaSymmetryTolerance &&
        typeof parabolaCurvature === 'number'
      ) {
        const lineScore = lineEntry.score;
        const parabolaScore = parabolaEntry.score;

        if (parabolaScore >= lineScore * 0.8 && parabolaEntry.candidate.confidence >= thresholds.minConfidence) {
          if (
            parabolaEntry.candidate.confidence >= thresholds.minConfidence &&
            parabolaEntry.candidate.error <= lineEntry.candidate.error * 1.25 &&
            Math.abs(parabolaCurvature) >= thresholds.parabolaMinCurvature * 0.9
          ) {
            if (parabolaEntry !== scoredCandidates[0]) {
              scoredCandidates.splice(scoredCandidates.indexOf(parabolaEntry), 1);
              scoredCandidates.unshift(parabolaEntry);
            }
          }
        }
      }
    }

    const best = scoredCandidates[0];
    const secondBest = scoredCandidates[1];
    
    // Check if a higher-priority shape with good accuracy should override
    const highPriorityCandidate = scoredCandidates.find(c => 
      c.priority > best.priority && 
      c.candidate.error < best.candidate.error * 1.5 && // Error not much worse
      c.score > best.score * 0.85 // Score reasonably close (within 15%)
    );
    
    if (highPriorityCandidate) {
      console.log(`Selecting higher priority ${highPriorityCandidate.candidate.shape.type} (priority ${highPriorityCandidate.priority}) over ${best.candidate.shape.type} (priority ${best.priority})`);
      return highPriorityCandidate.candidate;
    }
    
    // Only return the best if it's significantly better than the second best
    const margin = best.score - secondBest.score;
    const minMargin = 0.05; // Reduced margin to allow closer competition between shapes
    
    if (margin >= minMargin) {
      return best.candidate;
    }
    
    // If the margin is too small, prefer simpler shapes
    const shapeComplexity = this.getShapeComplexity(best.candidate.shape.type);
    const secondComplexity = this.getShapeComplexity(secondBest.candidate.shape.type);
    
    if (shapeComplexity <= secondComplexity) {
      return best.candidate;
    } else {
      return secondBest.candidate;
    }
  }
  
  /**
   * Calculate a composite score for ranking candidates
   */
  private calculateCompositeScore(candidate: DetectionResult, thresholds: DetectionThresholds): number {
    // Weights for different factors - favor accuracy over confidence for geometric shapes
    const confidenceWeight = 0.35; // Reduced from 0.5
    const errorWeight = 0.45; // Increased from 0.3 - accuracy is key for geometric shapes
    const simplicityWeight = 0.1; // Reduced from 0.2 to prevent over-favoring simple shapes
    const consistencyWeight = 0.1;
    
    // Confidence score (higher is better)
    const confidenceScore = candidate.confidence;
    
    // Error score (lower error is better)
    const maxExpectedError = this.getMaxExpectedError(candidate.shape.type, thresholds);
    const errorScore = 1 - Math.min(1, candidate.error / maxExpectedError);
    
    // Simplicity score (simpler shapes are preferred when scores are close)
    const simplicityScore = 1 - (this.getShapeComplexity(candidate.shape.type) / 10);
    
    // Consistency score (based on how well the shape matches expected properties)
    const consistencyScore = this.calculateConsistencyScore(candidate);
    
    return (
      confidenceWeight * confidenceScore +
      errorWeight * errorScore +
      simplicityWeight * simplicityScore +
      consistencyWeight * consistencyScore
    );
  }
  
  /**
   * Get the detector priority for a shape type
   */
  private getDetectorPriority(shapeType: string): number {
    const priorities: Record<string, number> = {
      'line': 10,
      'rectangle': 6,
      'triangle': 5,
      'circle': 3,
      'ellipse': 3,
      'parabola': 1
    };
    
    return priorities[shapeType] || 0;
  }
  
  /**
   * Get the complexity ranking of a shape type
   */
  private getShapeComplexity(shapeType: string): number {
    const complexity: Record<string, number> = {
      'line': 1,
      'triangle': 2, // Triangles are very geometric and precise when hand-drawn
      'circle': 3,   // Circles are harder to draw perfectly by hand
      'rectangle': 4,
      'ellipse': 5,
      'parabola': 6
    };
    
    return complexity[shapeType] || 10;
  }
  
  /**
   * Get the maximum expected error for a shape type
   */
  private getMaxExpectedError(shapeType: string, thresholds: DetectionThresholds): number {
    const errorMap: Record<string, number> = {
      'line': thresholds.lineMaxError,
      'rectangle': thresholds.rectangleMaxError,
      'ellipse': thresholds.ellipseMaxError,
      'circle': thresholds.ellipseMaxError,
      'triangle': thresholds.triangleMaxError,
      'parabola': thresholds.parabolaMaxError
    };
    
    return errorMap[shapeType] || thresholds.maxError;
  }
  
  /**
   * Calculate a consistency score based on shape properties
   */
  private calculateConsistencyScore(candidate: DetectionResult): number {
    const shape = candidate.shape;
    const properties = shape.properties || {};
    
    let score = 0.5; // Base score
    
    switch (shape.type) {
      case 'line':
        // Lines should have high straightness
        if (candidate.metadata?.straightness) {
          score = candidate.metadata.straightness;
        }
        break;
        
      case 'rectangle':
        // Rectangles should have good edge alignment and corner detection
        if (candidate.metadata?.analysis) {
          const analysis = candidate.metadata.analysis;
          score = (analysis.straightSegmentRatio + (analysis.cornerCount / 4)) / 2;
        }
        break;
        
      case 'ellipse':
      case 'circle':
        // Ellipses should be smooth and symmetric
        if (candidate.metadata?.analysis) {
          const analysis = candidate.metadata.analysis;
          score = (Number(analysis.dominantDirection === 'circular') + analysis.symmetry) / 2;
        }
        break;
        
      case 'triangle':
        // Triangles should have 3 corners and good edge ratios
        if (candidate.metadata?.analysis) {
          const analysis = candidate.metadata.analysis;
          const cornerScore = Math.min(1, analysis.cornerCount / 3);
          score = (cornerScore + analysis.straightSegmentRatio) / 2;
        }
        break;
        
      case 'parabola':
        // Parabolas should have good symmetry and curvature
        if (properties.symmetry && properties.curvature) {
          score = (properties.symmetry + Math.min(1, properties.curvature / 2)) / 2;
        }
        break;
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Update detection thresholds
   */
  updateThresholds(newThresholds: Partial<DetectionThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }
  
  /**
   * Get current thresholds
   */
  getThresholds(): DetectionThresholds {
    return { ...this.thresholds };
  }
  
  /**
   * Get available detector types
   */
  getAvailableDetectors(): string[] {
    return this.detectors.map(detector => detector.shapeType);
  }
  
  /**
   * Enable/disable specific detectors
   */
  setEnabledDetectors(detectorTypes: string[]): void {
    // Re-initialize detectors with only enabled ones
    const allDetectors = [
      new LineDetector(),
      new RectangleDetector(), 
      new EllipseDetector(),
      new TriangleDetector(),
      new ParabolaDetector()
    ];
    
    this.detectors = allDetectors.filter(detector => 
      detectorTypes.includes(detector.shapeType)
    );
    
    this.detectors.sort((a, b) => b.priority - a.priority);
  }
}
