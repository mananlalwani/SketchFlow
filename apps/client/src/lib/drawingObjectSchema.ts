import { z } from 'zod';

const strokePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  pressure: z.number().optional(),
  width: z.number().optional(),
});

const drawingPropertiesSchema = z.object({
  orientation: z.enum(['up', 'down', 'left', 'right']).optional(),
  angle: z.number().optional(),
  length: z.number().optional(),
  curvature: z.number().optional(),
  pointCount: z.number().int().min(3).max(64).optional(),
  hidden: z.boolean().optional(),
  rotation: z.number().optional(),
});

export const drawingObjectSchema = z.object({
  id: z.string(),
  type: z.enum([
    'stroke',
    'line',
    'rectangle',
    'ellipse',
    'circle',
    'triangle',
    'parabola',
    'text',
    'image',
    'arrow',
    'star',
  ]),
  points: z.array(strokePointSchema).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string(),
  size: z.number(),
  alpha: z.number().optional(),
  text: z.string().optional(),
  fontSize: z.number().optional(),
  rotation: z.number().optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
  name: z.string().optional(),
  groupId: z.string().optional(),
  zIndex: z.number().optional(),
  filled: z.boolean().optional(),
  orientation: z.enum(['up', 'down', 'left', 'right']).optional(),
  imageData: z.string().optional(),
  properties: drawingPropertiesSchema.optional(),
  createdBy: z.string().optional(),
  createdAt: z.number().optional(),
  lastModifiedBy: z.string().optional(),
  lastModifiedAt: z.number().optional(),
});

export type DrawingObject = z.infer<typeof drawingObjectSchema>;
