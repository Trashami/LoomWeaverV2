import {
  AbstractMesh,
  AssetContainer,
  Color3,
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
} from './effect-timeline.contract';
import { sampleTokenFootprintElevation } from './token-drag-controller';
import {
  attachTokenLightAndGlowMeshes,
  createSpinningBaseTargetReticleMesh,
  isTokenAmbientGlowActive,
  syncTokenFloatingHealthBarMesh,
  syncTokenPointLightExcludedMeshes,
} from './babylon-token-light-aura.helper';
import { attachVolumetricFogToMaterial } from './babylon-volumetric-fog.plugin';
import {
  attachGrassBaseAndFactionRim,
  attachGrassPuckFace,
  updateTokenRimMaterialHighlight,
} from './babylon-token-grass-base.helper';

export class BabylonTokenMeshBuilder {
  private readonly glbContainerCache = new Map<string, AssetContainer>();
  private readonly loadingGlbUrls = new Set<string>();
  private readonly imageElementCache = new Map<string, HTMLImageElement>();
  private readonly facingByTokenKey = new Map<string, number>();
  private readonly lastPosByTokenKey = new Map<string, { x: number; z: number }>();

  clearCache(): void {
    this.glbContainerCache.forEach((c) => c.dispose());
    this.glbContainerCache.clear();
    this.loadingGlbUrls.clear();
  }

  private disposeTokenArtifacts(scene: Scene, tokenKey: string): void {
    scene.lights.filter((l) => l.name === `lw-token-light-${tokenKey}`).forEach((l) => l.dispose());
    scene.meshes
      .filter(
        (m) =>
          m.metadata?.tokenKey === tokenKey ||
          m.name === `lw-token-hpbar-${tokenKey}` ||
          (m.name.startsWith(`lw-token-glow-`) && m.name.endsWith(tokenKey)) ||
          (m.name.startsWith(`lw-target-reticle-`) && m.name.endsWith(tokenKey)),
      )
      .forEach((m) => m.dispose());
    scene.transformNodes.filter((n) => n.name === `lw-token-root-${tokenKey}`).forEach((n) => n.dispose());
  }

  private disposeReticle(scene: Scene, tokenKey: string): void {
    scene.meshes
      .filter((m) => m.name.startsWith('lw-target-reticle-') && m.name.endsWith(tokenKey))
      .forEach((m) => m.dispose());
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
    healthBarMode: 'all' | 'party' | 'damaged' | 'off' = 'all',
  ): void {
    const activeTargetSet = new Set<string>(
      targetedKeys.length > 0 ? targetedKeys : targetKey ? [targetKey] : [],
    );

    const allTokenKeys = new Set<string>(tokens.map((t) => t.key));

    // Remove meshes for tokens that were deleted from the scene
    const existingTokenKeys = new Set<string>();
    for (const m of scene.meshes) {
      const tk = m.metadata?.tokenKey as string | undefined;
      if (tk) existingTokenKeys.add(tk);
    }
    for (const tk of existingTokenKeys) {
      if (!allTokenKeys.has(tk)) {
        this.disposeTokenArtifacts(scene, tk);
      }
    }

    for (const t of tokens) {
      const prevPos = this.lastPosByTokenKey.get(t.key);
      if (typeof t.facingY === 'number') {
        this.facingByTokenKey.set(t.key, t.facingY);
      } else if (prevPos && Math.hypot(t.x - prevPos.x, t.z - prevPos.z) > 0.08) {
        this.facingByTokenKey.set(t.key, Math.atan2(t.x - prevPos.x, t.z - prevPos.z));
      }
      this.lastPosByTokenKey.set(t.key, { x: t.x, z: t.z });
      const facingY = this.facingByTokenKey.get(t.key) ?? 0;

      const tokenOpacity = opacityByKey.get(t.key) ?? 1;
      const existingBase = scene.getMeshByName(`lw-token-${t.key}`) as Mesh | null;
      const existingLight = scene.getLightByName(`lw-token-light-${t.key}`);
      if (tokenOpacity <= 0.05) {
        if (existingBase) {
          existingBase.setEnabled(false);
          existingBase.isPickable = false;
          for (const child of existingBase.getChildMeshes()) {
            child.isPickable = false;
          }
        }
        existingLight?.setEnabled(false);
        this.disposeReticle(scene, t.key);
        continue;
      }
      const isDead = t.currentHp <= 0;
      const isTargeted = activeTargetSet.has(t.key);
      const isAttacker = t.key === attackerKey;

      const sizeScale = getDndSizeScale(t.sizeCategory);
      const effectiveScale = sizeScale;
      const baseDiameter = 0.82 * effectiveScale;
      const baseHeight = isDead ? 0.032 : 0.068;
      const footprintRadius = baseDiameter * 0.42;
      const groundY = sampleTokenFootprintElevation(scene, t.x, t.z, footprintRadius);

      const glbReady = Boolean(!isTopDown2D && t.glbUrl && this.glbContainerCache.has(t.glbUrl));
      const glowActive = isTokenAmbientGlowActive(t);
      const showHealthBar =
        healthBarMode !== 'off' &&
        t.maxHp > 0 &&
        (healthBarMode === 'all' ||
          (healthBarMode === 'party' && (t.faction === 'party' || t.faction === 'ally')) ||
          (healthBarMode === 'damaged' && t.currentHp < t.maxHp && t.currentHp > 0));
      const renderSig = `${isTopDown2D ? '2d' : '3d-grass-rocks-glow-v5'}|${t.glbUrl ?? ''}|${glbReady ? 1 : 0}|${t.avatarUrl ?? ''}|${t.sizeCategory ?? 'medium'}|${isDead ? 1 : 0}|${t.faction}|${t.roleLabel ?? ''}|${t.colorOverride ?? ''}|${t.emitsLight ? 1 : 0}|${t.lightColorHex ?? ''}|${t.lightDimFeet ?? 0}|${glowActive ? 1 : 0}|${t.ambientGlowColorHex ?? ''}|${t.ambientGlowRadiusFeet ?? 0}|${t.ambientGlowIntensity ?? 0}|${gridScale.toFixed(2)}`;

      if (existingBase && existingBase.metadata?.renderSig === renderSig) {
        existingBase.setEnabled(true);
        existingLight?.setEnabled(true);
        existingBase.metadata.facingY = facingY;
        if (!existingBase.metadata?.isLiftedOrWobbling) {
          existingBase.position.set(t.x, groundY + baseHeight / 2 + 0.01, t.z);
          existingBase.rotation.set(0, facingY, 0);
        } else {
          existingBase.position.x = t.x;
          existingBase.position.z = t.z;
          existingBase.rotation.y = facingY;
        }
        const existingDisc = scene.getMeshByName(`lw-token-puck-disc-${t.key}`) as Mesh | null;
        if (existingDisc) {
          existingDisc.rotation.z = facingY;
        }
        updateTokenRimMaterialHighlight(scene, t, isAttacker, isTargeted);
        syncTokenFloatingHealthBarMesh(
          scene,
          t,
          existingBase,
          effectiveScale,
          baseHeight,
          isTopDown2D,
          showHealthBar,
          tokenOpacity,
        );

        const pickable = tokenOpacity > 0.05;
        existingBase.visibility = tokenOpacity;
        existingBase.isPickable = pickable;
        for (const child of existingBase.getChildMeshes()) {
          const isNonPickableOverlay =
            child.name.startsWith('lw-token-glow-') || child.name.startsWith('lw-token-hpbar-');
          if (!child.name.startsWith('lw-token-hitbox-')) {
            child.visibility = tokenOpacity;
          }
          child.isPickable = isNonPickableOverlay ? false : pickable;
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
        {
          height: baseHeight,
          diameterTop: baseDiameter * 0.96,
          diameterBottom: baseDiameter * 1.02,
          tessellation: 36,
        },
        scene,
      );
      baseMesh.position.set(t.x, groundY + baseHeight / 2 + 0.01, t.z);
      baseMesh.rotation.set(0, facingY, 0);
      baseMesh.metadata = { tokenKey: t.key, baseHeight, footprintRadius, renderSig, facingY };
      baseMesh.renderingGroupId = 0;
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
      hitbox.renderingGroupId = 0;
      hitbox.alphaIndex = 10;
      hitbox.visibility = 0;
      hitbox.isPickable = true;
      hitbox.metadata = { tokenKey: t.key };

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
        attachGrassPuckFace(
          scene,
          t,
          baseMesh,
          effectiveScale,
          baseHeight,
          isAttacker,
          isTargeted,
          this.imageElementCache,
        );
      }

      if (tokenOpacity > 0.1 && (t.emitsLight || glowActive)) {
        attachTokenLightAndGlowMeshes(scene, t, baseMesh, effectiveScale, baseHeight, tokenOpacity);
      }

      syncTokenFloatingHealthBarMesh(
        scene,
        t,
        baseMesh,
        effectiveScale,
        baseHeight,
        isTopDown2D,
        showHealthBar,
        tokenOpacity,
      );

      const pickable = tokenOpacity > 0.05;
      baseMesh.visibility = tokenOpacity;
      baseMesh.isPickable = pickable;
      for (const child of baseMesh.getChildMeshes()) {
        const isNonPickableOverlay =
          child.name.startsWith('lw-token-glow-') || child.name.startsWith('lw-token-hpbar-');
        child.renderingGroupId = 0;
        if (!isNonPickableOverlay) {
          child.alphaIndex = 10;
        }
        if (!child.name.startsWith('lw-token-hitbox-')) {
          child.visibility = tokenOpacity;
        }
        child.isPickable = isNonPickableOverlay ? false : pickable;
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
    attachGrassPuckFace(
      scene,
      token,
      baseMesh,
      effectiveScale,
      baseHeight,
      isAttacker,
      isTargeted,
      this.imageElementCache,
    );
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
        this.applyMatteFinishToMiniatureMesh(m, token);
      }

      const targetHeight = 1.05 * effectiveScale;
      const sizeY = foundBounds ? Math.max(0.01, max.y - min.y) : 1.05;
      const scale = targetHeight / sizeY;
      rootNode.parent = baseMesh;
      rootNode.scaling.set(scale, scale, scale);
      if (foundBounds) {
        rootNode.position.set(
          -((min.x + max.x) / 2) * scale,
          baseHeight / 2 - min.y * scale + 0.004,
          -((min.z + max.z) / 2) * scale,
        );
      } else {
        rootNode.position.set(0, baseHeight / 2 + 0.004, 0);
      }

      rootNode.metadata = { tokenKey: token.key };
      for (const m of allMeshes) {
        m.metadata = { ...(m.metadata ?? {}), tokenKey: token.key };
        m.isPickable = true;
        if (!m.name.startsWith(`lw-token-part-${token.key}-`)) {
          m.name = `lw-token-part-${token.key}-${m.name}`;
        }
      }

      attachGrassBaseAndFactionRim(
        scene,
        token,
        baseMesh,
        effectiveScale,
        baseHeight,
        isAttacker,
        isTargeted,
        true,
      );
      if (isDead) {
        rootNode.rotation.z = Math.PI / 2.2;
        rootNode.position.y = baseHeight / 2 + 0.03 * effectiveScale;
      }
      syncTokenPointLightExcludedMeshes(scene, token.key);
    } catch {
      attachGrassPuckFace(
        scene,
        token,
        baseMesh,
        effectiveScale,
        baseHeight,
        isAttacker,
        isTargeted,
        this.imageElementCache,
      );
    }
  }

  private applyMatteFinishToMiniatureMesh(mesh: AbstractMesh, token: VttTokenVm): void {
    const mat = mesh.material?.clone(`lw-token-minimat-${token.key}-${mesh.name}`) ?? mesh.material;
    if (!mat) return;
    mesh.material = mat;
    attachVolumetricFogToMaterial(mat);

    if (mat instanceof PBRMaterial) {
      mat.maxSimultaneousLights = 8;
      mat.roughness = Math.max(0.88, mat.roughness ?? 0.92);
      mat.metallic = Math.min(0.06, mat.metallic ?? 0.02);
      if (
        !mat.albedoTexture &&
        mat.albedoColor &&
        mat.albedoColor.r > 0.82 &&
        mat.albedoColor.g > 0.82 &&
        mat.albedoColor.b > 0.82
      ) {
        mat.albedoColor = Color3.FromHexString('#7d8581');
      }
      mat.emissiveColor = Color3.Black();
    } else if (mat instanceof StandardMaterial) {
      mat.maxSimultaneousLights = 8;
      mat.specularColor = new Color3(0.03, 0.03, 0.03);
      if (
        !mat.diffuseTexture &&
        mat.diffuseColor &&
        mat.diffuseColor.r > 0.82 &&
        mat.diffuseColor.g > 0.82 &&
        mat.diffuseColor.b > 0.82
      ) {
        mat.diffuseColor = Color3.FromHexString('#7d8581');
      }
      mat.emissiveColor = Color3.Black();
    }
  }
}
