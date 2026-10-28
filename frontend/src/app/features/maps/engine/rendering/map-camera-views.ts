import { ArcRotateCamera, Camera, Scene, Vector3, Viewport } from '@babylonjs/core';

/** Multiple views of one scene: water, lights, assets and edits stay shared. */
export class MapCameraViews {
  private overview: ArcRotateCamera | null = null;
  private mode = 'isometric';
  private attached: ArcRotateCamera;
  constructor(private scene: Scene, private main: ArcRotateCamera, private canvas: HTMLCanvasElement) {
    this.attached = main;
  }
  setMode(mode: string): void {
    this.mode = mode;
    const split = mode === 'split-2d-3d';
    const top = ['real-2d', 'top-down', '2D Blueprint'].includes(mode);
    this.main.viewport = new Viewport(0, 0, split ? 0.5 : 1, 1);
    this.configure(this.main, top);
    if (!top) {
      this.main.alpha = -Math.PI / 2.3;
      this.main.beta = mode === 'first-person' ? 1.32 : 0.78;
      this.main.radius = mode === 'first-person' ? 11 : 25;
    }
    if (split) {
      this.overview ??= new ArcRotateCamera('lw-map-overhead', -Math.PI / 2, 0.0001, 31, Vector3.Zero(), this.scene);
      this.overview.setTarget(this.main.target.clone());
      this.overview.viewport = new Viewport(0.5, 0, 0.5, 1);
      this.configure(this.overview, true);
      this.scene.activeCameras = [this.main, this.overview];
    } else this.scene.activeCameras = [];
    this.scene.activeCamera = this.main;
    this.activate(this.main);
    this.update();
  }
  private configure(camera: ArcRotateCamera, top: boolean): void {
    camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
    camera.lowerAlphaLimit = top ? -Math.PI / 2 : null;
    camera.upperAlphaLimit = top ? -Math.PI / 2 : null;
    camera.lowerBetaLimit = top ? 0.0001 : 0.01;
    camera.upperBetaLimit = top ? 0.0001 : Math.PI - 0.01;
    camera.mode = top ? Camera.ORTHOGRAPHIC_CAMERA : Camera.PERSPECTIVE_CAMERA;
    camera.attachControl(true, false, 2);
    if (camera !== this.attached) camera.detachControl();
    camera.lowerRadiusLimit = 4;
    camera.upperRadiusLimit = 68;
    if (top) { camera.alpha = -Math.PI / 2; camera.beta = 0.0001; camera.radius = 31; }
  }
  pointerAt(clientX: number): void {
    const bounds = this.canvas.getBoundingClientRect();
    this.activate(this.mode === 'split-2d-3d' && clientX - bounds.left >= bounds.width / 2 && this.overview ? this.overview : this.main);
  }
  private activate(camera: ArcRotateCamera): void {
    if (this.attached !== camera) {
      this.attached.detachControl();
      camera.attachControl(true, false, 2);
      this.attached = camera;
    }
    this.scene.cameraToUseForPointers = camera;
  }
  update(): void {
    for (const camera of [this.main, this.overview]) {
      if (!camera || camera.mode !== Camera.ORTHOGRAPHIC_CAMERA) continue;
      // Radius drives orthographic zoom as well as wheel/pinch input.
      const halfHeight = camera.radius * 0.55;
      const engine = this.scene.getEngine();
      const aspect = engine.getRenderWidth() * camera.viewport.width / Math.max(1, engine.getRenderHeight());
      camera.orthoTop = halfHeight; camera.orthoBottom = -halfHeight;
      camera.orthoLeft = -halfHeight * aspect; camera.orthoRight = halfHeight * aspect;
    }
  }
}
