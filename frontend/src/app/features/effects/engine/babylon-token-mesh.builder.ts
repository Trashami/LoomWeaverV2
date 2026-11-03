import {
  AbstractMesh,
  AssetContainer,
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import {
  VttTokenVm,
  getDndSizeScale,
  getTokenBaseColorHex,
} from './effect-timeline.contract';
import { sampleTokenFootprintElevation } from './token-drag-controller';
import { resolve2dTokenUrlFromLibrary } from '../../arcane-screen/services/vtt-token-library-resolver';
import {
  attachTokenLightAndGlowMeshes,
  createSpinningBaseTargetReticleMesh,
} from './babylon-token-light-aura.helper';

export class BabylonTokenMeshBuilder {
  private readonly glbContainerCache = new Map<string, AssetContainer>();
  private readonly loadingGlbUrls = new Set<string>();
  private readonly imageElementCache = new Map<string, HTMLImageElement>();

  clearCache(): void {
    this.glbContainerCache.forEach((c) => c.dispose());
    this.glbContainerCache.clear();
    this.loadingGlbUrls.clear();
  }

  private disposeTokenArtifacts(scene: Scene, tokenKey: string): void {
    scene.lights.filter((l) => l.name === `lw-token-light-${tokenKey}`).forEach((l) => l.dispose());
    scene.meshes.filter((m) => m.metadata?.tokenKey === tokenKey || m.name.startsWith(`lw-token-glow-${tokenKey}`) || m.name.startsWith(`lw-target-reticle-`) && m.name.endsWith(tokenKey)).forEach((m) => m.dispose());
    scene.transformNodes.filter((n) => n.name === `lw-token-root-${tokenKey}`).forEach((n) => n.dispose());
  }

  private disposeReticle(scene: Scene, tokenKey: string): void {
    scene.meshes.filter((m) => m.name.startsWith('lw-target-reticle-') && m.name.endsWith(tokenKey)).forEach((m) => m.dispose());
  }

  syncTokens(
    scene: Scene,
    tokens: readonly VttTokenVm[],
    isTopDown2D: boolean,
    attackerKey: string | undefined,
    targetKey: string | undefined,
    targetedKeys: readonly string[],
    opacityByKey: ReadonlyMap<string, number>,
    gridScale: number,
    onGlbLoaded: () => void,
  ): void {
    const activeTargetSet = new Set<string>(
      targetedKeys.length > 0 ? targetedKeys : targetKey ? [targetKey] : [],
    );

    const visibleKeys = new Set<string>();
    for (const t of tokens) {
      if ((opacityByKey.get(t.key) ?? 1) > 0.05) {
        visibleKeys.add(t.key);
      }
    }

    // Remove meshes for tokens that were deleted or hidden by Fog of War / LoS
    const existingTokenKeys = new Set<string>();
    for (const m of scene.meshes) {
      const tk = m.metadata?.tokenKey as string | undefined;
      if (tk) existingTokenKeys.add(tk);
    }
    for (const tk of existingTokenKeys) {
      if (!visibleKeys.has(tk)) {
        this.disposeTokenArtifacts(scene, tk);
      }
    }

    for (const t of tokens) {
      const tokenOpacity = opacityByKey.get(t.key) ?? 1;
      if (tokenOpacity <= 0.05) {
        continue;
      }
      const isDead = t.currentHp <= 0;
      const isTargeted = activeTargetSet.has(t.key);
      const isAttacker = t.key === attackerKey;

      const sizeScale = getDndSizeScale(t.sizeCategory);
      const effectiveScale = sizeScale;
      const baseDiameter = 0.82 * effectiveScale;
      const baseHeight = isDead ? 0.028 : 0.06;
      const footprintRadius = baseDiameter * 0.42;
      const groundY = sampleTokenFootprintElevation(scene, t.x, t.z, footprintRadius);

      const glbReady = Boolean(!isTopDown2D && t.glbUrl && this.glbContainerCache.has(t.glbUrl));
      const renderSig = `${isTopDown2D ? '2d' : '3d'}|${t.glbUrl ?? ''}|${glbReady ? 1 : 0}|${t.avatarUrl ?? ''}|${t.sizeCategory ?? 'medium'}|${isDead ? 1 : 0}|${isAttacker ? 1 : 0}|${isTargeted ? 1 : 0}|${t.faction}|${t.colorHex ?? ''}|${t.emitsLight ? 1 : 0}|${t.lightColorHex ?? ''}|${t.lightDimFeet ?? 0}|${t.ambientGlowEnabled ? 1 : 0}|${t.ambientGlowColorHex ?? ''}|${t.ambientGlowRadiusFeet ?? 0}|${t.ambientGlowIntensity ?? 0}|${gridScale.toFixed(2)}`;

      const existingBase = scene.getMeshByName(`lw-token-${t.key}`) as Mesh | null;
      if (existingBase && existingBase.metadata?.renderSig === renderSig) {
        existingBase.position.set(t.x, groundY + baseHeight / 2 + 0.01, t.z);
        const pickable = tokenOpacity > 0.05;
        existingBase.visibility = tokenOpacity;
        existingBase.isPickable = pickable;
        for (const child of existingBase.getChildMeshes()) {
          if (!child.name.startsWith('lw-token-hitbox-')) {
            child.visibility = tokenOpacity;
          }
          child.isPickable = pickable;
        }
        const existingReticle = scene.getMeshByName(`lw-target-reticle-root-${t.key}`) as Mesh | null;
        if (isTargeted && pickable) {
          if (existingReticle) {
            existingReticle.position.set(t.x, groundY + 0.025, t.z);
          } else {
            createSpinningBaseTargetReticleMesh(scene, t.key, t.x, groundY, t.z, effectiveScale);
          }
        } else if (existingReticle) {
          this.disposeReticle(scene, t.key);
        }
        continue;
      }

      this.disposeTokenArtifacts(scene, t.key);

      const baseMesh = MeshBuilder.CreateCylinder(
        `lw-token-${t.key}`,
        { height: baseHeight, diameter: baseDiameter, tessellation: 36 },
        scene,
      );
      baseMesh.position.set(t.x, groundY + baseHeight / 2 + 0.01, t.z);
      baseMesh.metadata = { tokenKey: t.key, baseHeight, footprintRadius, renderSig };
      baseMesh.renderingGroupId = 2;
      baseMesh.alphaIndex = 10;
      baseMesh.isPickable = true;
      baseMesh.receiveShadows = true;
      baseMesh.visibility = tokenOpacity;

      const hitboxHeight = isTopDown2D ? 0.35 : 1.15 * effectiveScale;
      const hitbox = MeshBuilder.CreateCylinder(
        `lw-token-hitbox-${t.key}`,
        { height: hitboxHeight, diameter: 0.94 * effectiveScale, tessellation: 18 },
        scene,
      );
      hitbox.parent = baseMesh;
      hitbox.position.set(0, hitboxHeight / 2, 0);
      hitbox.renderingGroupId = 2;
      hitbox.alphaIndex = 10;
      hitbox.visibility = 0;
      hitbox.isPickable = true;
      hitbox.metadata = { tokenKey: t.key };

      const baseColorHex = getTokenBaseColorHex(t);
      const baseMat = new StandardMaterial(`lw-tmat-${t.key}`, scene);
      baseMat.maxSimultaneousLights = 8;
      baseMat.diffuseColor = Color3.FromHexString(baseColorHex);
      baseMat.specularColor = new Color3(0.02, 0.02, 0.02);
      baseMat.specularPower = 2;
      baseMat.emissiveColor = Color3.FromHexString(baseColorHex).scale(0.16);
      baseMesh.material = baseMat;

      if (!isTopDown2D && t.glbUrl) {
        this.attachGlbMiniature(
          scene,
          t,
          baseMesh,
          isDead,
          effectiveScale,
          baseHeight,
          isAttacker,
          isTargeted,
          onGlbLoaded,
        );
      } else {
        this.attachMattePuckFace(
          scene,
          t,
          baseMesh,
          effectiveScale,
          baseHeight,
          isAttacker,
          isTargeted,
        );
      }

      if (tokenOpacity > 0.1 && (t.emitsLight || t.ambientGlowEnabled)) {
        attachTokenLightAndGlowMeshes(scene, t, baseMesh, effectiveScale, baseHeight);
      }

      const pickable = tokenOpacity > 0.05;
      baseMesh.visibility = tokenOpacity;
      baseMesh.isPickable = pickable;
      for (const child of baseMesh.getChildMeshes()) {
        child.renderingGroupId = 2;
        child.alphaIndex = 10;
        if (!child.name.startsWith('lw-token-hitbox-')) {
          child.visibility = tokenOpacity;
        }
        child.isPickable = pickable;
      }

      if (isTargeted && pickable) {
        createSpinningBaseTargetReticleMesh(scene, t.key, t.x, groundY, t.z, effectiveScale);
      }
    }
  }

  private attachGlbMiniature(
    scene: Scene,
    token: VttTokenVm,
    baseMesh: Mesh,
    isDead: boolean,
    effectiveScale: number,
    baseHeight: number,
    isAttacker: boolean,
    isTargeted: boolean,
    onGlbLoaded: () => void,
  ): void {
    const glbUrl = token.glbUrl;
    if (!glbUrl) return;
    if (this.glbContainerCache.has(glbUrl)) {
      this.instantiateGlbToToken(
        scene,
        this.glbContainerCache.get(glbUrl)!,
        token,
        baseMesh,
        isDead,
        effectiveScale,
        baseHeight,
        isAttacker,
        isTargeted,
      );
      return;
    }
    this.attachMattePuckFace(scene, token, baseMesh, effectiveScale, baseHeight, isAttacker, isTargeted);
    if (this.loadingGlbUrls.has(glbUrl)) return;
    this.loadingGlbUrls.add(glbUrl);
    const lastSlash = glbUrl.lastIndexOf('/');
    const rootUrl = lastSlash >= 0 ? glbUrl.slice(0, lastSlash + 1) : '';
    const fileName = lastSlash >= 0 ? glbUrl.slice(lastSlash + 1) : glbUrl;
    SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene)
      .then((container) => {
        this.glbContainerCache.set(glbUrl, container);
        this.loadingGlbUrls.delete(glbUrl);
        onGlbLoaded();
      })
      .catch(() => {
        this.loadingGlbUrls.delete(glbUrl);
      });
  }

  private instantiateGlbToToken(
    scene: Scene,
    container: AssetContainer,
    token: VttTokenVm,
    baseMesh: Mesh,
    isDead: boolean,
    effectiveScale: number,
    baseHeight: number,
    isAttacker: boolean,
    isTargeted: boolean,
  ): void {
    try {
      const instance = container.instantiateModelsToScene(
        (name) => `lw-token-mini-${token.key}-${name}`,
        false,
      );
      const rootNode = new TransformNode(`lw-token-root-${token.key}`, scene);
      instance.rootNodes.forEach((node) => {
        node.parent = rootNode;
      });
      rootNode.computeWorldMatrix(true);
      const allMeshes: AbstractMesh[] = [];
      instance.rootNodes.forEach((node) => {
        if (node instanceof AbstractMesh) allMeshes.push(node);
        allMeshes.push(...node.getChildMeshes());
      });

      let min = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
      let max = new Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);
      let foundBounds = false;
      for (const m of allMeshes) {
        m.computeWorldMatrix(true);
        const b = m.getBoundingInfo().boundingBox;
        min = Vector3.Minimize(min, b.minimumWorld);
        max = Vector3.Maximize(max, b.maximumWorld);
        foundBounds = true;
        this.applyMatteFinishToMiniatureMesh(m);
      }

      const targetHeight = 1.05 * effectiveScale;
      const sizeY = foundBounds ? Math.max(0.01, max.y - min.y) : 1.05;
      const scale = targetHeight / sizeY;
      rootNode.parent = baseMesh;
      rootNode.scaling.set(scale, scale, scale);
      if (foundBounds) {
        rootNode.position.set(
          -((min.x + max.x) / 2) * scale,
          baseHeight / 2 - min.y * scale,
          -((min.z + max.z) / 2) * scale,
        );
      } else {
        rootNode.position.set(0, baseHeight / 2, 0);
      }

      const tagMesh = (m: AbstractMesh) => {
        m.metadata = { tokenKey: token.key };
        m.name = `lw-token-part-${token.key}-${m.name}`;
        m.getChildMeshes().forEach(tagMesh);
      };
      instance.rootNodes.forEach((node) => {
        if (node instanceof AbstractMesh) tagMesh(node);
      });

      this.attachRimOnly(scene, token.key, baseMesh, effectiveScale, baseHeight, isAttacker, isTargeted, token.faction, token.colorHex);
      if (isDead) {
        rootNode.rotation.z = Math.PI / 2.2;
        rootNode.position.y = baseHeight / 2 + 0.03 * effectiveScale;
      }
    } catch {
      this.attachMattePuckFace(scene, token, baseMesh, effectiveScale, baseHeight, isAttacker, isTargeted);
    }
  }

  private applyMatteFinishToMiniatureMesh(mesh: AbstractMesh): void {
    const mat = mesh.material;
    if (!mat) return;
    if (mat instanceof PBRMaterial) {
      mat.maxSimultaneousLights = 8;
      mat.roughness = Math.max(0.88, mat.roughness ?? 0.92);
      mat.metallic = Math.min(0.06, mat.metallic ?? 0.02);
      if (!mat.albedoTexture && mat.albedoColor && mat.albedoColor.r > 0.82 && mat.albedoColor.g > 0.82 && mat.albedoColor.b > 0.82) {
        mat.albedoColor = Color3.FromHexString('#7d8581');
      }
    } else if (mat instanceof StandardMaterial) {
      mat.maxSimultaneousLights = 8;
      mat.specularColor = new Color3(0.03, 0.03, 0.03);
      if (!mat.diffuseTexture && mat.diffuseColor && mat.diffuseColor.r > 0.82 && mat.diffuseColor.g > 0.82 && mat.diffuseColor.b > 0.82) {
        mat.diffuseColor = Color3.FromHexString('#7d8581');
      }
    }
  }

  private attachMattePuckFace(
    scene: Scene,
    token: VttTokenVm,
    baseMesh: Mesh,
    effectiveScale: number,
    baseHeight: number,
    isAttacker: boolean,
    isTargeted: boolean,
  ): void {
    const disc = MeshBuilder.CreateDisc(
      `lw-token-puck-disc-${token.key}`,
      { radius: 0.37 * effectiveScale, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    disc.parent = baseMesh;
    disc.position.set(0, baseHeight / 2 + 0.006, 0);
    disc.rotation.x = Math.PI / 2;
    disc.isPickable = true;
    disc.metadata = { tokenKey: token.key };

    const discMat = new StandardMaterial(`lw-mat-puck-${token.key}`, scene);
    discMat.backFaceCulling = false;
    discMat.disableLighting = true;
    discMat.emissiveColor = Color3.White();
    discMat.specularColor = Color3.Black();

    const size = 256;
    const dt = new DynamicTexture(`lw-dt-puck-${token.key}`, { width: size, height: size }, scene, true);
    const factionRingHex = isTargeted
      ? '#ef4444'
      : isAttacker
        ? '#f59e0b'
        : token.colorHex || (token.faction === 'party' ? '#2ee66b' : token.faction === 'hostile' ? '#ef5d72' : '#94a3b8');
    const bgCenterHex = token.faction === 'party' ? '#1e5638' : token.faction === 'hostile' ? '#6b1d28' : '#334155';
    const bgEdgeHex = token.faction === 'party' ? '#0d2b1c' : token.faction === 'hostile' ? '#380d14' : '#1e293b';
    const initials = (token.name || 'TK')
      .split(/\s+/)
      .map((w) => w[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const drawBackdropAndFrame = (ctx: CanvasRenderingContext2D, img?: HTMLImageElement) => {
      ctx.save();
      ctx.clearRect(0, 0, size, size);
      const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.5);
      grad.addColorStop(0, bgCenterHex);
      grad.addColorStop(1, bgEdgeHex);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
        ctx.clip();
        const cropDim = Math.min(img.naturalWidth, img.naturalHeight) * 0.86;
        const sx = (img.naturalWidth - cropDim) / 2;
        const sy = Math.max(0, (img.naturalHeight - cropDim) * 0.14);
        ctx.drawImage(img, sx, sy, cropDim, cropDim, 0, 0, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle = '#f4efe2';
        ctx.font = 'bold 88px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials, size / 2, size / 2 + 4);
      }

      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(242, 234, 215, 0.72)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.475, 0, Math.PI * 2);
      ctx.strokeStyle = factionRingHex;
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.restore();
      dt.update(false);
    };

    const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
    const portraitUrl = resolve2dTokenUrlFromLibrary(token);
    const cachedImg = portraitUrl ? this.imageElementCache.get(portraitUrl) : undefined;
    if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
      drawBackdropAndFrame(ctx, cachedImg);
    } else {
      drawBackdropAndFrame(ctx);
      if (portraitUrl && typeof Image !== 'undefined') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          this.imageElementCache.set(portraitUrl, img);
          if (!disc.isDisposed()) drawBackdropAndFrame(ctx, img);
        };
        img.src = portraitUrl;
      }
    }

    discMat.diffuseTexture = dt;
    discMat.emissiveTexture = dt;
    disc.material = discMat;
    this.attachRimOnly(scene, token.key, baseMesh, effectiveScale, baseHeight, isAttacker, isTargeted, token.faction, token.colorHex);
  }

  private attachRimOnly(
    scene: Scene,
    tokenKey: string,
    baseMesh: Mesh,
    effectiveScale: number,
    baseHeight: number,
    isAttacker: boolean,
    isTargeted: boolean,
    faction?: VttTokenVm['faction'],
    customColorHex?: string,
  ): void {
    const rim = MeshBuilder.CreateTorus(
      `lw-token-puck-rim-${tokenKey}`,
      { diameter: 0.80 * effectiveScale, thickness: 0.044 * effectiveScale, tessellation: 40 },
      scene,
    );
    rim.parent = baseMesh;
    rim.position.set(0, baseHeight / 2 + 0.008, 0);
    rim.metadata = { tokenKey };

    const rimMat = new StandardMaterial(`lw-mat-rim-${tokenKey}`, scene);
    rimMat.maxSimultaneousLights = 8;
    const rimHex = isTargeted
      ? '#ef4444'
      : isAttacker
        ? '#f59e0b'
        : customColorHex || (faction === 'party' ? '#2ee66b' : faction === 'hostile' ? '#ef5d72' : '#94a3b8');
    rimMat.diffuseColor = Color3.FromHexString(rimHex);
    rimMat.specularColor = new Color3(0.05, 0.05, 0.05);
    rimMat.emissiveColor = Color3.FromHexString(rimHex).scale(isTargeted || isAttacker ? 0.55 : 0.38);
    rim.material = rimMat;
  }
}
