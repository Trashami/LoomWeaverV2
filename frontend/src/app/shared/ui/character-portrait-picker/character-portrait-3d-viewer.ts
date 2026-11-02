import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  CubeTexture,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  MeshoptCompression,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

MeshoptCompression.Configuration = {
  decoder: {
    url: '/assets/object-library/meshopt_decoder.js',
  },
};

export class LwCharacterPortrait3dViewer {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private characterRoot: TransformNode | null = null;
  private loadedMeshes: AbstractMesh[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private burstRafId: number | null = null;
  private currentGlbUrl = '';
  private loadSeq = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onStateChange?: (state: { loading: boolean; error: boolean }) => void,
  ) {
    this.initScene();
  }

  private initScene(): void {
    this.engine = new Engine(
      this.canvas,
      true,
      {
        preserveDrawingBuffer: true,
        stencil: false,
        powerPreference: 'high-performance',
        antialias: true,
      },
      true,
    );
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this.engine.setHardwareScalingLevel(1 / dpr);

    const scene = new Scene(this.engine);
    this.scene = scene;
    scene.clearColor = new Color4(0.02, 0.055, 0.04, 1);

    try {
      const envTex = CubeTexture.CreateFromPrefilteredData(
        '/assets/object-library/studio.env',
        scene,
      );
      scene.environmentTexture = envTex;
      scene.environmentIntensity = 0.9;
    } catch {
      // Fallback to studio directional + hemispheric lights if studio.env is unavailable
    }

    const camera = new ArcRotateCamera(
      'charPortraitCam',
      -Math.PI / 2,
      Math.PI * 0.46,
      3.15,
      new Vector3(0, 1.06, 0),
      scene,
    );
    camera.fov = 0.68;
    camera.minZ = 0.05;
    camera.maxZ = 50;

    const hemi = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
    hemi.intensity = 1.15;
    hemi.diffuse = new Color3(0.92, 0.97, 0.94);
    hemi.groundColor = new Color3(0.08, 0.16, 0.12);

    const keyLight = new DirectionalLight('keyLight', new Vector3(-0.55, -0.9, 0.75), scene);
    keyLight.intensity = 1.85;
    keyLight.diffuse = new Color3(1.0, 0.96, 0.88);

    const rimLight = new DirectionalLight('rimLight', new Vector3(0.65, -0.35, -0.85), scene);
    rimLight.intensity = 0.95;
    rimLight.diffuse = new Color3(0.35, 0.92, 0.65);

    this.buildPedestal(scene);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.engine?.resize();
        this.renderSingleFrame();
      });
      this.resizeObserver.observe(this.canvas);
    }
  }

  private buildPedestal(scene: Scene): void {
    const base = MeshBuilder.CreateCylinder(
      'heroPedestalBase',
      { diameterTop: 1.48, diameterBottom: 1.62, height: 0.07, tessellation: 48 },
      scene,
    );
    base.position.y = -0.035;
    const mat = new StandardMaterial('heroPedestalMat', scene);
    mat.diffuseColor = new Color3(0.06, 0.14, 0.1);
    mat.specularColor = new Color3(0.25, 0.35, 0.28);
    mat.emissiveColor = new Color3(0.02, 0.06, 0.04);
    base.material = mat;

    const rim = MeshBuilder.CreateTorus(
      'heroPedestalRim',
      { diameter: 1.5, thickness: 0.025, tessellation: 48 },
      scene,
    );
    rim.position.y = 0.002;
    const rimMat = new StandardMaterial('heroPedestalRimMat', scene);
    rimMat.diffuseColor = new Color3(0.85, 0.72, 0.48);
    rimMat.emissiveColor = new Color3(0.28, 0.22, 0.12);
    rim.material = rimMat;
  }

  async loadModel(glbUrl: string): Promise<void> {
    if (!this.scene || !glbUrl) return;
    if (this.currentGlbUrl === glbUrl && this.characterRoot) {
      this.renderBurst(20);
      return;
    }
    this.currentGlbUrl = glbUrl;
    const seq = ++this.loadSeq;
    this.onStateChange?.({ loading: true, error: false });

    this.clearCharacterMeshes();

    const cleanGlbUrl = glbUrl.replace(/#custom\.(glb|gltf)$/i, '');
    const isBlobOrData = cleanGlbUrl.startsWith('blob:') || cleanGlbUrl.startsWith('data:');
    const lastSlash = isBlobOrData ? -1 : cleanGlbUrl.lastIndexOf('/');
    const rootUrl = lastSlash >= 0 ? cleanGlbUrl.slice(0, lastSlash + 1) : '';
    const fileName = lastSlash >= 0 ? cleanGlbUrl.slice(lastSlash + 1) : cleanGlbUrl;

    try {
      const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, this.scene, undefined, '.glb');
      if (seq !== this.loadSeq || !this.scene) {
        result.meshes.forEach((m) => m.dispose());
        return;
      }

      this.loadedMeshes = result.meshes;
      const rootNode = new TransformNode('characterTurnRoot', this.scene);
      this.characterRoot = rootNode;

      const rootMesh = result.meshes[0];
      if (rootMesh) {
        rootMesh.parent = rootNode;
      }

      rootNode.computeWorldMatrix(true);
      result.meshes.forEach((m) => m.computeWorldMatrix(true));

      const bounds = rootNode.getHierarchyBoundingVectors(true);
      const size = bounds.max.subtract(bounds.min);
      const maxDim = Math.max(size.y, size.x, size.z, 0.001);
      const targetHeight = 2.15;
      const scale = targetHeight / maxDim;

      rootNode.scaling = new Vector3(scale, scale, scale);
      rootNode.computeWorldMatrix(true);
      const scaledBounds = rootNode.getHierarchyBoundingVectors(true);
      const centerX = (scaledBounds.min.x + scaledBounds.max.x) * 0.5;
      const centerZ = (scaledBounds.min.z + scaledBounds.max.z) * 0.5;
      const bottomY = scaledBounds.min.y;

      rootNode.position = new Vector3(-centerX, -bottomY, -centerZ);

      this.onStateChange?.({ loading: false, error: false });
      this.renderBurst(55);
      this.scene.executeWhenReady(() => {
        this.renderBurst(25);
      });
    } catch {
      if (seq === this.loadSeq) {
        this.onStateChange?.({ loading: false, error: true });
      }
    }
  }

  rotateHorizontal(deltaPixelsX: number): void {
    if (!this.characterRoot) return;
    this.characterRoot.rotation.y -= deltaPixelsX * 0.011;
    this.renderSingleFrame();
  }

  resetRotation(): void {
    if (!this.characterRoot) return;
    this.characterRoot.rotation.y = 0;
    this.renderSingleFrame();
  }

  renderSingleFrame(): void {
    if (!this.scene || !this.engine) return;
    this.scene.render();
  }

  private renderBurst(frames = 40): void {
    if (this.burstRafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.burstRafId);
      this.burstRafId = null;
    }
    let remaining = frames;
    const step = () => {
      if (!this.scene || !this.engine || remaining <= 0) {
        this.burstRafId = null;
        return;
      }
      this.scene.render();
      remaining--;
      if (typeof requestAnimationFrame !== 'undefined') {
        this.burstRafId = requestAnimationFrame(step);
      }
    };
    step();
  }

  private clearCharacterMeshes(): void {
    for (const m of this.loadedMeshes) {
      try {
        m.dispose(false, true);
      } catch {
        // Ignore already disposed meshes
      }
    }
    this.loadedMeshes = [];
    if (this.characterRoot) {
      this.characterRoot.dispose();
      this.characterRoot = null;
    }
  }

  dispose(): void {
    if (this.burstRafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.burstRafId);
      this.burstRafId = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.clearCharacterMeshes();
    this.scene?.dispose();
    this.scene = null;
    this.engine?.dispose();
    this.engine = null;
  }
}
