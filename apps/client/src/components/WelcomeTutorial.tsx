/**
 * Welcome tutorial for first-time users
 */
import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { 
  X, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Pen,
  Palette,
  Share2,
  Keyboard
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDrawingStore } from '@/store/drawingStore';

interface TutorialStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  target?: string; // CSS selector for highlighting
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const tutorialSteps: TutorialStep[] = [
  {
    title: 'Welcome to SketchFlow!',
    description: 'A collaborative canvas for drawing, sketching, and brainstorming in real-time.',
    icon: <Sparkles className="w-8 h-8 text-blue-500" />,
  },
  {
    title: 'Select a Tool',
    description: 'Choose from pen, shapes, text, and more. Use keyboard shortcuts (P for pen, E for eraser, etc.) for quick access.',
    icon: <Pen className="w-8 h-8 text-purple-500" />,
    target: '[role="toolbar"]',
    position: 'bottom',
  },
  {
    title: 'Customize Your Brush',
    description: 'Adjust size, opacity, and color. Fill shapes or keep them outlined.',
    icon: <Palette className="w-8 h-8 text-pink-500" />,
  },
  {
    title: 'Keyboard Shortcuts',
    description: 'Press ? to see all shortcuts. Use Ctrl+Z/Cmd+Z to undo, Ctrl+S/Cmd+S to save.',
    icon: <Keyboard className="w-8 h-8 text-green-500" />,
  },
  {
    title: 'Share & Collaborate',
    description: 'Save your project and share it with others for real-time collaboration.',
    icon: <Share2 className="w-8 h-8 text-orange-500" />,
  },
];

const TUTORIAL_COMPLETED_KEY = 'sketchflow-tutorial-completed';

interface WelcomeTutorialProps {
  onComplete: () => void;
}

export function WelcomeTutorial({ onComplete }: WelcomeTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if tutorial has been completed
    const completed = localStorage.getItem(TUTORIAL_COMPLETED_KEY);
    if (!completed) {
      // Small delay before showing for better UX
      const timer = setTimeout(() => setShow(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSkip = () => {
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true');
    setShow(false);
    onComplete();
  };

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSkip();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!show) return null;

  const step = tutorialSteps[currentStep];
  const isLastStep = currentStep === tutorialSteps.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fade-in" />

      {/* Tutorial Card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-fade-in">
          {/* Close Button */}
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close tutorial"
          >
            <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>

          {/* Content */}
          <div className="p-8">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-full bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-500/10 dark:to-purple-500/10">
                {step.icon}
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-center text-slate-900 dark:text-slate-100 mb-3">
              {step.title}
            </h2>

            {/* Description */}
            <p className="text-center text-slate-600 dark:text-slate-400 mb-8">
              {step.description}
            </p>

            {/* Progress Dots */}
            <div className="flex justify-center gap-2 mb-6">
              {tutorialSteps.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentStep(index)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    index === currentStep 
                      ? "w-8 bg-blue-500" 
                      : "w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600"
                  )}
                  aria-label={`Go to step ${index + 1}`}
                  aria-current={index === currentStep ? 'step' : undefined}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-4">
              <Button
                onClick={handlePrevious}
                variant="outline"
                disabled={currentStep === 0}
                className="flex-1"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>

              <Button
                onClick={handleNext}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLastStep ? (
                  <>
                    Start Drawing
                    <Sparkles className="w-4 h-4 ml-1" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </div>

            {/* Skip Button */}
            <button
              onClick={handleSkip}
              className="w-full mt-4 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              Skip tutorial
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const HAS_DRAWN_KEY = 'sketchflow-has-drawn';

/**
 * Empty state hint for when canvas is empty
 * Only shows once - hides forever once user has drawn anything
 */
export function EmptyStateHint() {
  const objectCount = useDrawingStore((state) => state.objectCount);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if user has ever drawn before
    const hasDrawnBefore = localStorage.getItem(HAS_DRAWN_KEY);
    
    // Never show if user has drawn before or if there are already objects
    if (hasDrawnBefore || objectCount > 0) {
      return;
    }
    
    // Show hint after delay only if canvas is still empty
    const timer = setTimeout(() => {
      if (objectCount === 0 && !localStorage.getItem(HAS_DRAWN_KEY)) {
        setShow(true);
      }
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [objectCount]);

  // When objects are added, mark as drawn and hide forever
  useEffect(() => {
    if (objectCount > 0) {
      localStorage.setItem(HAS_DRAWN_KEY, 'true');
      setShow(false);
    }
  }, [objectCount]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="text-center animate-fade-in">
        <Pen className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-700" />
        <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-400 mb-2">
          Start Creating
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-500 max-w-sm">
          Select a tool from the toolbar and start drawing
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-600 mt-3">
          Press <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700">?</kbd> for keyboard shortcuts
        </p>
      </div>
    </div>
  );
}
