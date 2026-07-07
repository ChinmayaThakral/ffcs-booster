import { z } from 'zod';

/**
 * TypeScript mirror of schemas/capture-dataset.v1.json.
 * The JSON Schema file is the contract of record; keep the two in sync.
 */

export const CaptureOptionSchema = z.object({
  id: z.string().optional(),
  slotCombo: z.array(z.string().regex(/^[A-Z]{1,3}\d{1,2}$/)).optional(),
  rawSlotText: z.string().min(1),
  venue: z.string(),
  faculty: z.string().min(1),
  seats: z.union([z.number().int().nonnegative(), z.literal('Full')]),
  totalSeats: z.number().int().nonnegative().optional(),
  slotStatus: z.string().optional(),
  capturedAt: z.string().optional(),
  unknownSlots: z.array(z.string()).optional(),
});

export const CaptureCourseSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{4,12}$/),
  title: z.string().min(1),
  courseType: z.string().optional(),
  credits: z.number().int().min(0).max(30).optional(),
  category: z.string().optional(),
  slotless: z.boolean().optional(),
  ltpjc: z
    .object({
      l: z.number().int().nonnegative(),
      t: z.number().int().nonnegative(),
      p: z.number().int().nonnegative(),
      j: z.number().int().nonnegative(),
      c: z.number().int().nonnegative(),
    })
    .optional(),
  options: z.array(CaptureOptionSchema),
});

export const CaptureDatasetSchema = z.object({
  schemaVersion: z.literal(1),
  campus: z.string().min(1),
  semesterLabel: z.string().min(1),
  capturedAt: z.string(),
  sourceUrl: z.string().optional(),
  courses: z.array(CaptureCourseSchema),
});

export type CaptureOption = z.infer<typeof CaptureOptionSchema>;
export type CaptureCourse = z.infer<typeof CaptureCourseSchema>;
export type CaptureDataset = z.infer<typeof CaptureDatasetSchema>;

/** A course seen on the course-list page but whose View page hasn't been opened yet. */
export interface DiscoveredCourse {
  code: string;
  title: string;
  courseType?: string;
  credits?: number;
  category?: string;
  discoveredAt: string;
}

export interface ParseIssue {
  at: string;
  url: string;
  message: string;
}
