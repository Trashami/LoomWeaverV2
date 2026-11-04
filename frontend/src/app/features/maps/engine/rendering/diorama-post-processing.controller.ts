import {
  Camera,
  Color4,
  DefaultRenderingPipeline,
  Scene,
  SSAO2RenderingPipeline,
} from '@babylonjs/core';

export interface DioramaPostProcessingConfig {
  readonly enableBloom?: boolean;
  readonly enableVignette?: boolean;
  readonly enableSSAO?: boolean;
  readonly bloomThreshold?: number;
  readonly bloomWeight?: number;
  readonly vignetteWeight?: number;
  readonly contrast?: number;
  readonly exposure?: number;
}

export class DioramaPostProcessingController {
  private defaultPipeline: DefaultRenderingPipeline | null = null;
  private ssaoPipeline: SSAO2RenderingPipeline | null = null;
  private currentScene: Scene | null = null;
  private currentCamera: Camera | null = null;

  attach(
    scene: Scene,
    camera: Camera,
    config: DioramaPostProcessingConfig = {},
  ): void {
    this.dispose();
    this.currentScene = scene;
    this.currentCamera = camera;

    const {
      enableBloom = true,
      enableVignette = true,
      enableSSAO = true,
      bloomThreshold = 0.8,
      bloomWeight = 0.28,
      vignetteWeight = 2.2,
      contrast = 1.12,
      exposure = 1.04,
    } = config;

    // 1. SSAO2: Screen Space Ambient Occlusion for realistic contact shadows under minis, tables, barrels, and walls
    if (enableSSAO) {
      try {
        if (SSAO2RenderingPipeline.IsSupported) {
          const ssao = new SSAO2RenderingPipeline('lw-diorama-ssao', scene, {
            ssaoRatio: 0.75,
            blurRatio: 1.0,
          });
          ssao.radius = 1.6;
          ssao.totalStrength = 1.15;
          ssao.samples = 16;
          ssao.maxZ = 120;
          ssao.expensiveBlur = true;
          scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
            'lw-diorama-ssao',
            camera,
          );
          this.ssaoPipeline = ssao;
        }
      } catch (err) {
        // Fallback gracefully on devices where SSAO2 depth buffer texture is unsupported
        console.warn('SSAO2 not supported on this device/context, continuing with default pipeline:', err);
      }
    }

    // 2. Default Rendering Pipeline: Bloom (warm torch/candlelight glow) + Vignette + Chiaroscuro Tone Grading
    try {
      const pipeline = new DefaultRenderingPipeline(
        'lw-diorama-default-pipeline',
        true, // HDR
        scene,
        [camera],
      );

      // Bloom: gives torches, braziers, and tabletop candles an authentic warm photographic glow
      if (enableBloom) {
        pipeline.bloomEnabled = true;
        pipeline.bloomThreshold = bloomThreshold;
        pipeline.bloomWeight = bloomWeight;
        pipeline.bloomKernel = 48;
      }

      // Image processing: Vignette corners to focus attention on the tabletop center + Contrast adjustment
      pipeline.imageProcessingEnabled = true;
      if (enableVignette) {
        pipeline.imageProcessing.vignetteEnabled = true;
        pipeline.imageProcessing.vignetteWeight = vignetteWeight;
        pipeline.imageProcessing.vignetteStretch = 0.5;
        pipeline.imageProcessing.vignetteColor = new Color4(0.01, 0.02, 0.03, 0);
      }
      pipeline.imageProcessing.contrast = contrast;
      pipeline.imageProcessing.exposure = exposure;

      this.defaultPipeline = pipeline;
    } catch (err) {
      console.warn('DefaultRenderingPipeline failed to initialize:', err);
    }
  }

  updateCamera(newCamera: Camera): void {
    if (this.currentCamera === newCamera) return;
    this.currentCamera = newCamera;

    if (this.currentScene) {
      if (this.defaultPipeline) {
        this.currentScene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
          'lw-diorama-default-pipeline',
          newCamera,
        );
      }
      if (this.ssaoPipeline) {
        this.currentScene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
          'lw-diorama-ssao',
          newCamera,
        );
      }
    }
  }

  dispose(): void {
    if (this.defaultPipeline) {
      this.defaultPipeline.dispose();
      this.defaultPipeline = null;
    }
    if (this.ssaoPipeline) {
      this.ssaoPipeline.dispose();
      this.ssaoPipeline = null;
    }
    this.currentScene = null;
    this.currentCamera = null;
  }
}
