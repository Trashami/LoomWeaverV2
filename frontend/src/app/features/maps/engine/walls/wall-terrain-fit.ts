import { Matrix, Mesh, Scene, TransformNode, Vector3, VertexBuffer, VertexData } from '@babylonjs/core';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';

export interface WallDoorEndAttachment {
  /** Signed distance along the span axis from `origin` to the door center. */
  readonly doorCenterAlong: number;
  /** Total rendered width of the door instance in meters. */
  readonly doorRenderWidth: number;
  /** Total rendered height of the door instance in meters. */
  readonly doorHeight: number;
  /** World Y of the door base. */
  readonly doorBaseY: number;
  /** 8-band normalized half-span profile (0.18..0.50) of the door model from bottom to top. */
  readonly halfSpanProfile?: readonly number[];
}

function sampleDoorHalfSpanProfile(
  profile: readonly number[] | undefined,
  normY: number,
): number {
  if (!profile || profile.length === 0) {
    return 0.45;
  }
  const clamped = Math.max(0, Math.min(1, normY));
  const scaled = clamped * (profile.length - 1);
  const idx0 = Math.floor(scaled);
  const idx1 = Math.min(profile.length - 1, idx0 + 1);
  const frac = scaled - idx0;
  return profile[idx0] * (1 - frac) + profile[idx1] * frac;
}

/** Smooth samples are shared across stamp boundaries, so adjoining tops meet at the same height. */
export function wallGroundAt(scene: Scene, x: number, z: number, smoothing: number): number {
  const radius = Math.max(0, Math.min(100, smoothing)) * 0.025;
  const sample = (dx: number, dz: number) => TerrainMeshBuilder.sampleElevationAt(scene, x + dx, z + dz);
  if (radius === 0) return sample(0, 0);
  const filtered = (sample(0, 0) * 4 + sample(radius, 0) + sample(-radius, 0)
    + sample(0, radius) + sample(0, -radius)) / 8;
  // Keep the wall base buried where averaging smooths a steep crest.
  return filtered;
}

export function fitWallStamp(
  scene: Scene, root: TransformNode, origin: readonly [number, number],
  axis: readonly [number, number], spanLength: number, ground: number,
  smoothing: number, hasSlope = false,
  doorAttachStart?: WallDoorEndAttachment,
  doorAttachEnd?: WallDoorEndAttachment,
): void {
  const bounds = root.getHierarchyBoundingVectors(true);
  const height = Math.max(0.01, bounds.max.y - bounds.min.y);
  const hasDoorAttachment = Boolean(doorAttachStart || doorAttachEnd);

  // Check whether any corner of the stamp bounding box extends beyond [0, spanLength]
  const corners: readonly [number, number][] = [
    [bounds.min.x, bounds.min.z],
    [bounds.max.x, bounds.min.z],
    [bounds.min.x, bounds.max.z],
    [bounds.max.x, bounds.max.z],
  ];
  let needsClip = false;
  for (const [cx, cz] of corners) {
    const along = (cx - origin[0]) * axis[0] + (cz - origin[1]) * axis[1];
    if (along < -0.02 || along > spanLength + 0.02) {
      needsClip = true;
      break;
    }
  }
  // When the ground under this wall piece is flat, no span clipping is needed,
  // and neither end attaches to a door, keep the shared GPU geometry buffer.
  if (!hasSlope && !needsClip && !hasDoorAttachment) {
    return;
  }

  const bandCount = 8;
  const bandMinAlong = new Float32Array(bandCount).fill(Number.POSITIVE_INFINITY);
  const bandMaxAlong = new Float32Array(bandCount).fill(Number.NEGATIVE_INFINITY);

  if (hasDoorAttachment) {
    const tmp = new Vector3();
    for (const child of root.getChildMeshes()) {
      if (!(child instanceof Mesh) || !child.getTotalVertices()) continue;
      const positions = child.getVerticesData(VertexBuffer.PositionKind);
      if (!positions) continue;
      const world = child.computeWorldMatrix(true);
      for (let i = 0; i < positions.length; i += 3) {
        Vector3.TransformCoordinatesFromFloatsToRef(
          positions[i],
          positions[i + 1],
          positions[i + 2],
          world,
          tmp,
        );
        const ny = Math.max(0, Math.min(0.999, (tmp.y - bounds.min.y) / height));
        const b = Math.floor(ny * bandCount);
        const along = (tmp.x - origin[0]) * axis[0] + (tmp.z - origin[1]) * axis[1];
        if (along < bandMinAlong[b]) bandMinAlong[b] = along;
        if (along > bandMaxAlong[b]) bandMaxAlong[b] = along;
      }
    }
    for (let b = 0; b < bandCount; b++) {
      if (!Number.isFinite(bandMinAlong[b]) || !Number.isFinite(bandMaxAlong[b])) {
        bandMinAlong[b] = 0;
        bandMaxAlong[b] = spanLength;
      }
    }
  }

  for (const child of root.getChildMeshes()) {
    if (!(child instanceof Mesh) || !child.getTotalVertices()) continue;
    child.makeGeometryUnique();
    const positions = child.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) continue;
    const world = child.computeWorldMatrix(true).clone();
    const inverse = Matrix.Invert(world);
    for (let i = 0; i < positions.length; i += 3) {
      const p = Vector3.TransformCoordinates(Vector3.FromArray(positions, i), world);
      const along = (p.x - origin[0]) * axis[0] + (p.z - origin[1]) * axis[1];
      let targetAlong = Math.max(0, Math.min(spanLength, along));

      if (hasDoorAttachment) {
        const ny = Math.max(0, Math.min(0.999, (p.y - bounds.min.y) / height));
        const b = Math.floor(ny * bandCount);
        const bMin = bandMinAlong[b];
        const bMax = bandMaxAlong[b];
        const bSpan = Math.max(0.05, bMax - bMin);

        let desiredMin = 0;
        if (doorAttachStart) {
          const doorNormY = Math.max(
            0,
            Math.min(1, (p.y - doorAttachStart.doorBaseY) / Math.max(0.1, doorAttachStart.doorHeight)),
          );
          const outerHalfFrac = sampleDoorHalfSpanProfile(doorAttachStart.halfSpanProfile, doorNormY);
          const embedFactor = doorNormY > 0.68 ? 0.62 : 0.70;
          desiredMin =
            doorAttachStart.doorCenterAlong +
            doorAttachStart.doorRenderWidth * outerHalfFrac * embedFactor;
        }

        let desiredMax = spanLength;
        if (doorAttachEnd) {
          const doorNormY = Math.max(
            0,
            Math.min(1, (p.y - doorAttachEnd.doorBaseY) / Math.max(0.1, doorAttachEnd.doorHeight)),
          );
          const outerHalfFrac = sampleDoorHalfSpanProfile(doorAttachEnd.halfSpanProfile, doorNormY);
          const embedFactor = doorNormY > 0.68 ? 0.62 : 0.70;
          desiredMax =
            doorAttachEnd.doorCenterAlong -
            doorAttachEnd.doorRenderWidth * outerHalfFrac * embedFactor;
        }

        if (doorAttachStart && doorAttachEnd) {
          const u = Math.max(0, Math.min(1, (along - bMin) / bSpan));
          targetAlong = desiredMin + u * Math.max(0.02, desiredMax - desiredMin);
        } else if (doorAttachStart) {
          const anchor = bMin + bSpan * 0.72;
          if (along <= anchor && anchor > bMin + 0.02) {
            const u = Math.max(0, Math.min(1, (along - bMin) / (anchor - bMin)));
            targetAlong = desiredMin + u * (anchor - desiredMin);
          }
          targetAlong = Math.max(desiredMin, Math.min(spanLength, targetAlong));
        } else if (doorAttachEnd) {
          const anchor = bMax - bSpan * 0.72;
          if (along >= anchor && bMax > anchor + 0.02) {
            const u = Math.max(0, Math.min(1, (along - anchor) / (bMax - anchor)));
            targetAlong = anchor + u * (desiredMax - anchor);
          }
          targetAlong = Math.max(0, Math.min(desiredMax, targetAlong));
        }
      }

      p.x += (targetAlong - along) * axis[0];
      p.z += (targetAlong - along) * axis[1];
      if (hasSlope && smoothing > 0) {
        const blend = Math.max(0, Math.min(1, (p.y - bounds.min.y) / height));
        const smooth = wallGroundAt(scene, p.x, p.z, smoothing);
        const base = Math.min(smooth, TerrainMeshBuilder.sampleElevationAt(scene, p.x, p.z));
        p.y += base * (1 - blend) + smooth * blend - ground;
      }
      const local = Vector3.TransformCoordinates(p, inverse);
      positions[i] = local.x; positions[i + 1] = local.y; positions[i + 2] = local.z;
    }
    child.setVerticesData(VertexBuffer.PositionKind, positions, true);
    const indices = child.getIndices();
    if (indices) {
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      child.setVerticesData(VertexBuffer.NormalKind, normals, true);
    }
    child.refreshBoundingInfo();
  }
}
