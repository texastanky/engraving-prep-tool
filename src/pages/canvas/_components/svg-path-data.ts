/**
 * SVG path `d` parsing.
 *
 * Turns path data into the editor's anchor/handle model so imported artwork is
 * editable — anchors can be dragged and segments reshaped — instead of being
 * rasterised. Every command is supported: M/L/H/V, C/S, Q/T and A.
 *
 * Quadratic and elliptical-arc segments are converted to cubics, which is exact
 * for quadratics (degree elevation) and a standard approximation for arcs.
 */

import type { Anchor, SubPath, VecPt } from "./vector-path.ts";

type Token = { type: "command"; value: string } | { type: "number"; value: number };

const COMMANDS = "MmZzLlHhVvCcSsQqTtAa";

/** Argument counts per command; drives implicit repetition. */
const ARG_COUNT: Record<string, number> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};

/** Split path data into commands and numbers. */
export function tokenizePathData(d: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < d.length) {
    const char = d[index];

    if (char === "," || /\s/.test(char)) {
      index += 1;
      continue;
    }

    if (COMMANDS.includes(char)) {
      tokens.push({ type: "command", value: char });
      index += 1;
      continue;
    }

    // Numbers may use exponents and may omit separators before a sign.
    const match = /^[+-]?(\d*\.\d+|\d+\.?)([eE][+-]?\d+)?/.exec(d.slice(index));
    if (!match || match[0] === "") {
      // Unknown token — skip it rather than failing the whole path.
      index += 1;
      continue;
    }
    tokens.push({ type: "number", value: Number(match[0]) });
    index += match[0].length;
  }

  return tokens;
}

function reflect(point: VecPt, about: VecPt): VecPt {
  return { x: 2 * about.x - point.x, y: 2 * about.y - point.y };
}

/**
 * Convert an SVG elliptical arc into cubic segments.
 * Standard endpoint-to-centre conversion followed by a ≤90° per-segment split.
 */
export function arcToCubics(
  start: VecPt,
  rxIn: number,
  ryIn: number,
  xAxisRotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  end: VecPt
): { c1: VecPt; c2: VecPt; end: VecPt }[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);

  if (rx === 0 || ry === 0 || (start.x === end.x && start.y === end.y)) {
    return [{ c1: start, c2: end, end }];
  }

  const phi = (xAxisRotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (start.x - end.x) / 2;
  const dy2 = (start.y - end.y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Scale radii up if they are too small to span the endpoints.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator));

  const cxp = (coefficient * rx * y1p) / ry;
  const cyp = (-coefficient * ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (start.x + end.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (start.y + end.y) / 2;

  const angleOf = (ux: number, uy: number) => Math.atan2(uy, ux);
  const startAngle = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry);
  const endAngle = angleOf((-x1p - cxp) / rx, (-y1p - cyp) / ry);

  let sweepAngle = endAngle - startAngle;
  if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
  if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2)));
  const delta = sweepAngle / segments;
  const out: { c1: VecPt; c2: VecPt; end: VecPt }[] = [];

  const pointAt = (angle: number): VecPt => ({
    x: cx + rx * Math.cos(angle) * cosPhi - ry * Math.sin(angle) * sinPhi,
    y: cy + rx * Math.cos(angle) * sinPhi + ry * Math.sin(angle) * cosPhi,
  });
  const derivativeAt = (angle: number): VecPt => ({
    x: -rx * Math.sin(angle) * cosPhi - ry * Math.cos(angle) * sinPhi,
    y: -rx * Math.sin(angle) * sinPhi + ry * Math.cos(angle) * cosPhi,
  });

  let angle = startAngle;
  for (let i = 0; i < segments; i += 1) {
    const nextAngle = angle + delta;
    const alpha = (4 / 3) * Math.tan(delta / 4);
    const p1 = pointAt(angle);
    const p2 = pointAt(nextAngle);
    const d1 = derivativeAt(angle);
    const d2 = derivativeAt(nextAngle);

    out.push({
      c1: { x: p1.x + alpha * d1.x, y: p1.y + alpha * d1.y },
      c2: { x: p2.x - alpha * d2.x, y: p2.y - alpha * d2.y },
      end: i === segments - 1 ? { ...end } : p2,
    });

    angle = nextAngle;
  }

  return out;
}

/** Parse path data into subpaths of anchors with absolute control handles. */
export function parsePathData(d: string): SubPath[] {
  const tokens = tokenizePathData(d);
  const subpaths: SubPath[] = [];

  let current: Anchor[] = [];
  let closed = false;
  let cursor: VecPt = { x: 0, y: 0 };
  let subpathStart: VecPt = { x: 0, y: 0 };
  let lastControl: VecPt | null = null; // for smooth curve reflection
  let lastCommand = "";
  let index = 0;

  const flush = () => {
    if (current.length > 0) subpaths.push({ anchors: current, closed });
    current = [];
    closed = false;
  };

  while (index < tokens.length) {
    let command = lastCommand;
    const firstToken = tokens[index];
    if (firstToken.type === "command") {
      command = firstToken.value;
      index += 1;
    } else if (!lastCommand) {
      index += 1;
      continue;
    }

    const upper = command.toUpperCase();
    const relative = command !== upper && upper !== "Z";
    const argCount = ARG_COUNT[upper] ?? 0;

    const args: number[] = [];
    for (let i = 0; i < argCount; i += 1) {
      const token = tokens[index];
      if (!token || token.type !== "number") break;
      args.push(token.value);
      index += 1;
    }

    // A command without enough (or with non-finite) arguments means the data is
    // malformed; stop rather than emitting NaN geometry.
    if (args.length < argCount || args.some((value) => !Number.isFinite(value))) {
      break;
    }

    const ax = (x: number) => (relative ? cursor.x + x : x);
    const ay = (y: number) => (relative ? cursor.y + y : y);

    switch (upper) {
      case "M": {
        flush();
        cursor = { x: ax(args[0]), y: ay(args[1]) };
        subpathStart = { ...cursor };
        current.push({ x: cursor.x, y: cursor.y });
        lastControl = null;
        // Following coordinate pairs are implicit line-to commands.
        lastCommand = relative ? "l" : "L";
        continue;
      }
      case "L": {
        cursor = { x: ax(args[0]), y: ay(args[1]) };
        current.push({ x: cursor.x, y: cursor.y });
        lastControl = null;
        break;
      }
      case "H": {
        cursor = { x: ax(args[0]), y: cursor.y };
        current.push({ x: cursor.x, y: cursor.y });
        lastControl = null;
        break;
      }
      case "V": {
        cursor = { x: cursor.x, y: ay(args[0]) };
        current.push({ x: cursor.x, y: cursor.y });
        lastControl = null;
        break;
      }
      case "C": {
        const c1 = { x: ax(args[0]), y: ay(args[1]) };
        const c2 = { x: ax(args[2]), y: ay(args[3]) };
        const end = { x: ax(args[4]), y: ay(args[5]) };
        if (current.length === 0) current.push({ x: cursor.x, y: cursor.y });
        current[current.length - 1].out = c1;
        current.push({ x: end.x, y: end.y, in: c2 });
        cursor = end;
        lastControl = c2;
        break;
      }
      case "S": {
        const c1 = lastControl ? reflect(lastControl, cursor) : { ...cursor };
        const c2 = { x: ax(args[0]), y: ay(args[1]) };
        const end = { x: ax(args[2]), y: ay(args[3]) };
        if (current.length === 0) current.push({ x: cursor.x, y: cursor.y });
        current[current.length - 1].out = c1;
        current.push({ x: end.x, y: end.y, in: c2 });
        cursor = end;
        lastControl = c2;
        break;
      }
      case "Q": {
        const control: VecPt = { x: ax(args[0]), y: ay(args[1]) };
        const end = { x: ax(args[2]), y: ay(args[3]) };
        // Degree elevation: quadratic -> cubic.
        const c1 = {
          x: cursor.x + (2 / 3) * (control.x - cursor.x),
          y: cursor.y + (2 / 3) * (control.y - cursor.y),
        };
        const c2 = {
          x: end.x + (2 / 3) * (control.x - end.x),
          y: end.y + (2 / 3) * (control.y - end.y),
        };
        if (current.length === 0) current.push({ x: cursor.x, y: cursor.y });
        current[current.length - 1].out = c1;
        current.push({ x: end.x, y: end.y, in: c2 });
        cursor = end;
        lastControl = control;
        break;
      }
      case "T": {
        const control: VecPt = lastControl ? reflect(lastControl, cursor) : { ...cursor };
        const end = { x: ax(args[0]), y: ay(args[1]) };
        const c1 = {
          x: cursor.x + (2 / 3) * (control.x - cursor.x),
          y: cursor.y + (2 / 3) * (control.y - cursor.y),
        };
        const c2 = {
          x: end.x + (2 / 3) * (control.x - end.x),
          y: end.y + (2 / 3) * (control.y - end.y),
        };
        if (current.length === 0) current.push({ x: cursor.x, y: cursor.y });
        current[current.length - 1].out = c1;
        current.push({ x: end.x, y: end.y, in: c2 });
        cursor = end;
        lastControl = control;
        break;
      }
      case "A": {
        const end = { x: ax(args[5]), y: ay(args[6]) };
        if (current.length === 0) current.push({ x: cursor.x, y: cursor.y });
        for (const segment of arcToCubics(
          cursor,
          args[0],
          args[1],
          args[2],
          args[3] !== 0,
          args[4] !== 0,
          end
        )) {
          current[current.length - 1].out = segment.c1;
          current.push({ x: segment.end.x, y: segment.end.y, in: segment.c2 });
        }
        cursor = end;
        lastControl = null;
        break;
      }
      case "Z": {
        if (current.length > 0) {
          // If the path doubles back to its first point, fold the incoming
          // handle onto that anchor so the closing curve survives.
          const first = current[0];
          const last = current[current.length - 1];
          const duplicate =
            current.length > 1 &&
            Math.abs(first.x - last.x) < 1e-9 &&
            Math.abs(first.y - last.y) < 1e-9;

          if (duplicate) {
            if (last.in) first.in = last.in;
            current.pop();
          }
          closed = true;
          flush();
        }
        cursor = { ...subpathStart };
        lastControl = null;
        continue;
      }
      default:
        break;
    }

    lastCommand = command;
  }

  flush();
  return subpaths;
}
