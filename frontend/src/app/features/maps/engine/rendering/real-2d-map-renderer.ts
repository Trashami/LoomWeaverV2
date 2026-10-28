import { MapFloorBlendMode, MapSceneGraphState } from '../map-scene-contract';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';

export interface Real2dRenderOptions {
  readonly hideGmSecrets: boolean;
  readonly selectedNodeId?: string;
  readonly gridStepWorld?: number;
  readonly gridMode?: string;
  readonly floorAlbedoUrl?: string;
  readonly floorTilingScale?: number;
  readonly floorColorHex?: string;
  readonly floorColorStrength?: number;
  readonly floorColorBlendMode?: MapFloorBlendMode;
  readonly ghostX?: number;
  readonly ghostZ?: number;
  readonly ghostLabel?: string;
  readonly ghostRadiusMeters?: number;
  readonly ghostSharpness?: number;
  readonly ghostColorHex?: string;
  readonly wallStartAnchor?: { x: number; z: number } | null;
  readonly celestialMode?: 'sun' | 'moon';
  readonly celestialAzimuthDeg?: number;
  readonly celestialAltitudeDeg?: number;
  readonly onImageLoaded?: () => void;
}

export class Real2dMapRenderer {
  private static imageCache = new Map<string, HTMLImageElement>();
  private static loadingUrls = new Set<string>();

  private static getOrLoadImage(url: string, onLoaded?: () => void): HTMLImageElement | null {
    if (!url) return null;
    const cached = this.imageCache.get(url);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      return cached;
    }
    if (!this.loadingUrls.has(url) && typeof Image !== 'undefined') {
      this.loadingUrls.add(url);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.loadingUrls.delete(url);
        this.imageCache.set(url, img);
        if (onLoaded) onLoaded();
      };
      img.onerror = () => {
        this.loadingUrls.delete(url);
      };
      img.src = url;
    }
    return null;
  }

  static renderSceneToCanvas(
    canvas: HTMLCanvasElement,
    state: MapSceneGraphState,
    options: Real2dRenderOptions,
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const width = canvas.width || 960;
    const height = canvas.height || 600;
    const scale = Math.min(width, height) / 30;
    const cx = width / 2;
    const cy = height / 2;

    const toScreenX = (wx: number): number => cx + wx * scale;
    const toScreenY = (wz: number): number => cy - wz * scale;

    // 1. Background bump/height terrain base + seamless 2D floor texture tiling
    const isMoon = options.celestialMode === 'moon';
    const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, Math.max(width, height) * 0.65);
    grad.addColorStop(0, isMoon ? '#0e1d2a' : '#162d21');
    grad.addColorStop(0.65, isMoon ? '#08121b' : '#0b1912');
    grad.addColorStop(1, '#040a07');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const floorUrl = options.floorAlbedoUrl || state.floorAlbedoUrl;
    if (floorUrl) {
      const floorImg = this.getOrLoadImage(floorUrl, options.onImageLoaded);
      if (floorImg) {
        const tiling = Math.max(2, options.floorTilingScale || state.floorTilingScale || 10);
        const tilePx = Math.max(36, Math.round(width / tiling));
        ctx.save();
        for (let y = 0; y < height; y += tilePx) {
          for (let x = 0; x < width; x += tilePx) {
            ctx.drawImage(floorImg, x, y, tilePx + 1, tilePx + 1);
          }
        }
        // Global Floor Colorize with Photoshop Blend Mode
        const cStrength = options.floorColorStrength ?? state.floorColorStrength ?? 0;
        const cHex = options.floorColorHex ?? state.floorColorHex ?? '#ffffff';
        const cMode = options.floorColorBlendMode ?? state.floorColorBlendMode ?? 'multiply';
        if (cStrength > 0 && cHex) {
          ctx.save();
          ctx.globalCompositeOperation = (
            cMode === 'eraser' ? 'multiply' : cMode
          ) as GlobalCompositeOperation;
          ctx.globalAlpha = Math.max(0, Math.min(1, cStrength / 100));
          ctx.fillStyle = cHex;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
        // Render painted floor color dabs with Photoshop Blend Modes & Edge Feathering
        const dabs = TerrainMeshBuilder.getPaintDabs();
        for (const dab of dabs) {
          if (dab.blendMode === 'eraser') continue;
          const dx = toScreenX(dab.x);
          const dy = toScreenY(dab.z);
          const rPx = Math.max(4, dab.radius * scale);
          const sharpFrac = Math.max(0, Math.min(0.96, dab.sharpness / 100));
          const innerR = rPx * sharpFrac;
          const alpha = Math.max(0.02, Math.min(1, dab.opacity / 100));
          const clean = (dab.colorHex || '#49e892').replace('#', '');
          const r = parseInt(clean.substring(0, 2), 16) || 73;
          const g = parseInt(clean.substring(2, 4), 16) || 232;
          const b = parseInt(clean.substring(4, 6), 16) || 146;
          const dabGrad = ctx.createRadialGradient(dx, dy, innerR, dx, dy, rPx);
          dabGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
          dabGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
          dabGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.save();
          ctx.globalCompositeOperation = dab.blendMode as GlobalCompositeOperation;
          ctx.fillStyle = dabGrad;
          ctx.beginPath();
          ctx.arc(dx, dy, rPx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        // Subtle directional sun/moon lighting overlay
        ctx.fillStyle = isMoon ? 'rgba(8, 20, 36, 0.32)' : 'rgba(5, 16, 12, 0.18)';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }

    const azRad = ((options.celestialAzimuthDeg ?? 135) * Math.PI) / 180;
    const altRad = (Math.max(10, options.celestialAltitudeDeg ?? 42) * Math.PI) / 180;
    const shadowLenPx = Math.min(28, (1 / Math.tan(altRad)) * 11);
    const shadowDx = -Math.cos(azRad) * shadowLenPx;
    const shadowDy = Math.sin(azRad) * shadowLenPx;

    // 2. Tactical floor grid (5 ft, 10 ft, Hex, or Off)
    const mode = options.gridMode ?? '5 ft';
    if (mode !== 'Off') {
      ctx.strokeStyle = 'rgba(73, 232, 146, 0.16)';
      ctx.lineWidth = 1;
      if (mode === 'Hex') {
        const hexR = 0.92;
        const hexW = Math.sqrt(3) * hexR;
        const rowH = 1.5 * hexR;
        let rowIdx = 0;
        for (let gz = -12; gz <= 12; gz += rowH) {
          const offsetX = rowIdx % 2 === 1 ? hexW / 2 : 0;
          for (let gx = -16 + offsetX; gx <= 16; gx += hexW) {
            ctx.beginPath();
            for (let i = 0; i <= 6; i++) {
              const a = ((60 * i - 30) * Math.PI) / 180;
              const sx = toScreenX(gx + Math.cos(a) * hexR);
              const sy = toScreenY(gz + Math.sin(a) * hexR);
              if (i === 0) ctx.moveTo(sx, sy);
              else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
          }
          rowIdx++;
        }
      } else {
        const gridStep = mode === '10 ft' ? 3.0 : (options.gridStepWorld ?? 1.5);
        for (let gx = -16; gx <= 16; gx += gridStep) {
          const sx = toScreenX(gx);
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, height);
          ctx.stroke();
        }
        for (let gz = -12; gz <= 12; gz += gridStep) {
          const sy = toScreenY(gz);
          ctx.beginPath();
          ctx.moveTo(0, sy);
          ctx.lineTo(width, sy);
          ctx.stroke();
        }
      }
    }

    // 3. Water splines
    for (const water of state.waterSplines) {
      if (water.points.length === 0) continue;
      ctx.save();
      ctx.strokeStyle = water.colorHex || '#1b6d82';
      ctx.fillStyle = water.colorHex || '#1b6d82';
      const wPx = Math.max(8, water.width * scale);
      if (water.points.length === 1) {
        const sx = toScreenX(water.points[0][0]);
        const sy = toScreenY(water.points[0][2]);
        ctx.beginPath();
        ctx.arc(sx, sy, wPx * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineWidth = wPx;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        water.points.forEach((pt, idx) => {
          const sx = toScreenX(pt[0]);
          const sy = toScreenY(pt[2]);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4. Scatter clusters
    for (const cluster of state.scatterClusters ?? []) {
      const sx = toScreenX(cluster.x);
      const sy = toScreenY(cluster.z);
      const rPx = Math.max(10, cluster.radius * scale * 0.65);
      ctx.save();
      ctx.fillStyle = 'rgba(46, 168, 102, 0.28)';
      ctx.strokeStyle = 'rgba(73, 232, 146, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, rPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 5. Cutaway rooms, dungeon walls, doors, and directional Sun/Moon shadows
    for (const wall of state.walls ?? []) {
      if (wall.points.length < 2) continue;
      const isSelected = options.selectedNodeId === wall.id;
      const closed = wall.drawMode !== 'line' && wall.drawMode !== 'freehand';

      ctx.save();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = Math.max(5, wall.thicknessMeters * scale * 1.15);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      wall.points.forEach((pt, idx) => {
        const sx = toScreenX(pt[0]) + shadowDx;
        const sy = toScreenY(pt[1]) + shadowDy;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      if (closed) ctx.closePath();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = 'rgba(26, 36, 32, 0.42)';
      ctx.strokeStyle = isSelected ? '#49e892' : '#96a69d';
      ctx.lineWidth = Math.max(4, wall.thicknessMeters * scale * 0.95);
      ctx.lineJoin = 'round';

      ctx.beginPath();
      wall.points.forEach((pt, idx) => {
        const sx = toScreenX(pt[0]);
        const sy = toScreenY(pt[1]);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      if (closed) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
    }

    // 6. Dynamic Lights & Placement Width Halos
    for (const light of state.lights) {
      const sx = toScreenX(light.x);
      const sy = toScreenY(light.z);
      const radiusPx = Math.max(24, light.range * scale * 0.35);
      const halo = ctx.createRadialGradient(sx, sy, 2, sx, sy, radiusPx);
      halo.addColorStop(0, 'rgba(255, 198, 109, 0.42)');
      halo.addColorStop(0.5, 'rgba(255, 152, 68, 0.16)');
      halo.addColorStop(1, 'rgba(255, 152, 68, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, radiusPx, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Props, Bump Stamps & Tokens
    for (const st of state.stamps) {
      if (options.hideGmSecrets && (st.gmSecretOnly || st.label.toLowerCase().includes('secret'))) {
        continue;
      }
      const sx = toScreenX(st.x);
      const sy = toScreenY(st.z);
      const r = Math.max(12, 16 * st.scale);
      const isSelected = options.selectedNodeId === st.id;
      const stampImgUrl = st.albedoUrl || st.thumbnailUrl;
      const stampImg = stampImgUrl ? this.getOrLoadImage(stampImgUrl, options.onImageLoaded) : null;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-st.rotationY);
      if (stampImg) {
        ctx.drawImage(stampImg, -r, -r, r * 2, r * 2);
        if (isSelected) {
          ctx.strokeStyle = '#49e892';
          ctx.lineWidth = 2;
          ctx.strokeRect(-r, -r, r * 2, r * 2);
        }
      } else {
        ctx.fillStyle = st.colorHex || '#49e892';
        ctx.strokeStyle = isSelected ? '#49e892' : '#06140e';
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.beginPath();
        ctx.roundRect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2, 4);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 8. Ghost Preview at Mouse Cursor
    if (options.ghostX !== undefined && options.ghostZ !== undefined) {
      const gx = toScreenX(options.ghostX);
      const gy = toScreenY(options.ghostZ);

      ctx.save();
      if (options.wallStartAnchor) {
        const ax = toScreenX(options.wallStartAnchor.x);
        const ay = toScreenY(options.wallStartAnchor.z);
        ctx.strokeStyle = 'rgba(73, 232, 146, 0.85)';
        ctx.lineWidth = 5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(gx, gy);
        ctx.stroke();
      }

      const rPx = options.ghostRadiusMeters
        ? Math.max(8, options.ghostRadiusMeters * scale)
        : 12;
      ctx.fillStyle = 'rgba(46, 230, 107, 0.18)';
      ctx.strokeStyle = options.ghostColorHex || '#49e892';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, gy, rPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (options.ghostSharpness !== undefined && options.ghostRadiusMeters) {
        const innerR = rPx * Math.max(0.08, Math.min(0.95, options.ghostSharpness / 100));
        ctx.strokeStyle = 'rgba(217, 183, 122, 0.85)';
        ctx.lineWidth = 1.25;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(gx, gy, innerR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  static screenToWorld(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
  ): { x: number; z: number } {
    const rect = canvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
    const py = ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
    const scale = Math.min(canvas.width, canvas.height) / 30;
    const wx = (px - canvas.width / 2) / scale;
    const wz = (canvas.height / 2 - py) / scale;
    return {
      x: Math.round(wx * 100) / 100,
      z: Math.round(wz * 100) / 100,
    };
  }
}
