import { z } from "zod";

export const MAX_PROJECT_BYTES = 80 * 1024 * 1024;
const number = z.number().finite();
const positive = number.positive();
const point = z.object({ x: number, y: number });
const imageSource = z.string().regex(/^data:image\/(?:png|jpeg|webp|gif|bmp|svg\+xml)[;,]/i);
const mask = z.object({
  shapeId: z.string(), x: number, y: number, w: positive, h: positive,
  rotation: number, cornerRadius: number, feather: number, invert: z.boolean(),
  path: z.string().optional(), lockAspect: z.boolean(),
});
const edgePin = z.object({ id: z.string(), t: number, offset: point });
const design = z.object({
  x: number, y: number, scale: positive, scaleX: positive, scaleY: positive,
  rotation: number, opacity: number, naturalWidth: positive, naturalHeight: positive,
  flipH: z.boolean(), flipV: z.boolean(),
  filters: z.object({ brightness: number, contrast: number, grayscale: number, invert: number }),
  warpMesh: z.object({
    tl: point, tr: point, bl: point, br: point,
    top: z.array(edgePin), bottom: z.array(edgePin), left: z.array(edgePin), right: z.array(edgePin),
    interior: z.array(z.object({ id: z.string(), s: number, t: number, offset: point, radius: positive })),
  }).nullable(),
  mask: mask.nullable(),
  keepOuts: z.array(mask).optional(),
  partCopies: z.array(z.object({
    id: z.string(), dx: number, dy: number, name: z.string().optional(),
    points: z.array(point).optional(), closed: z.boolean().optional(),
  })).optional(),
});

export const projectSchema = z.object({
  app: z.literal("engraving-prep-tool"),
  version: z.literal(1),
  unit: z.enum(["in", "mm"]),
  material: z.object({ widthIn: positive.max(1000), heightIn: positive.max(1000) }),
  canvas: z.object({ width: positive.max(10000), height: positive.max(10000) }),
  selectedPresetId: z.string(),
  showRuler: z.boolean(),
  resizeMode: z.boolean(),
  partPhotoSrc: imageSource.nullable(),
  partRotation: number,
  designSrc: imageSource.nullable(),
  designState: design.nullable(),
  eraserMaskSrc: imageSource.nullable(),
  vectorObjects: z.array(z.object({
    id: z.string(), name: z.string(), mode: z.enum(["cut", "score", "engrave"]),
    strokeWidth: number.nonnegative(),
    subpaths: z.array(z.object({
      closed: z.boolean(),
      anchors: z.array(point.extend({ in: point.optional(), out: point.optional() })),
    })),
  })),
  trace: z.object({
    points: z.array(point), closed: z.boolean(), clipDesign: z.boolean(),
    style: z.object({
      strokeColor: z.string(), strokeWidth: number.nonnegative(),
      fillEnabled: z.boolean(), fillColor: z.string(),
    }),
  }),
}).superRefine((project, context) => {
  if (Boolean(project.designSrc) !== Boolean(project.designState)) {
    context.addIssue({ code: "custom", message: "Artwork data and placement must both be present." });
  }
  if (project.eraserMaskSrc && !project.designSrc) {
    context.addIssue({ code: "custom", message: "An eraser mask needs artwork." });
  }
});

export type EngravingProject = z.infer<typeof projectSchema>;

export function parseProject(text: string): EngravingProject {
  if (new Blob([text]).size > MAX_PROJECT_BYTES) throw new Error("Project files must be under 80 MB.");
  try {
    return projectSchema.parse(JSON.parse(text));
  } catch {
    throw new Error("This is not a supported Engraving Prep project (version 1). Your current work was not changed.");
  }
}

export async function portableImage(source: string): Promise<string> {
  if (imageSource.safeParse(source).success) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error("An image could not be included. Your project was not saved.");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = imageSource.safeParse(reader.result);
      if (result.success) resolve(result.data);
      else reject(new Error("An image could not be included. Your project was not saved."));
    };
    reader.onerror = () => reject(new Error("An image could not be read. Your project was not saved."));
    reader.readAsDataURL(blob);
  });
}

export function decodeProjectImage(source: string | null): Promise<HTMLImageElement | null> {
  if (!source) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("An embedded image could not be opened. Your current work was not changed."));
    image.src = source;
  });
}
