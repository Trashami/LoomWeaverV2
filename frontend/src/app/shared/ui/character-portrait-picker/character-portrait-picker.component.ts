import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import {
  CHARACTER_3D_PORTRAIT_PRESETS,
  CharacterPortraitPresetVm,
  FIVE_E_TOOLS_PORTRAIT_PRESETS,
  resolveCharacterGlbUrl,
} from '../../../features/characters/models/character-portrait-catalog.data';
import { LwIconComponent } from '../icon/icon.component';
import type { LwCharacterPortrait3dViewer } from './character-portrait-3d-viewer';

export type LwPortraitSourceTab = '5e-tools' | '3d-character';

interface PortraitPlacement {
  x: number;
  y: number;
  zoom: number;
}

const PLACEMENT_STORAGE_KEY = 'lw.portraitPlacement.v1';

@Component({
  selector: 'lw-character-portrait-picker',
  standalone: true,
  imports: [FormsModule, NgpButton, LwIconComponent],
  templateUrl: './character-portrait-picker.component.html',
  styleUrl: './character-portrait-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwCharacterPortraitPickerComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly portraitUrl = input.required<string>();
  readonly characterName = input<string>('Character Portrait');
  readonly minHeight = input<string>('460px');

  readonly portraitSelected = output<string>();

  readonly babylonCanvas = viewChild<ElementRef<HTMLCanvasElement>>('babylonCanvas');

  readonly pickerOpen = signal<boolean>(false);
  readonly activeTab = signal<LwPortraitSourceTab>('5e-tools');
  readonly searchQuery = signal<string>('');

  readonly offsetX = signal<number>(50);
  readonly offsetY = signal<number>(15);
  readonly zoomPercent = signal<number>(100);
  readonly isDragging = signal<boolean>(false);
  readonly modelLoading = signal<boolean>(false);
  readonly modelError = signal<boolean>(false);

  private viewer3d: LwCharacterPortrait3dViewer | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private startOffsetX = 50;
  private startOffsetY = 15;

  readonly activeGlbUrl = computed<string | null>(() =>
    resolveCharacterGlbUrl(this.portraitUrl()),
  );

  readonly is3dMode = computed<boolean>(() => Boolean(this.activeGlbUrl()));

  readonly count5e = FIVE_E_TOOLS_PORTRAIT_PRESETS.length;
  readonly count3d = CHARACTER_3D_PORTRAIT_PRESETS.length;

  readonly filteredPresets = computed<readonly CharacterPortraitPresetVm[]>(() => {
    const source =
      this.activeTab() === '5e-tools'
        ? FIVE_E_TOOLS_PORTRAIT_PRESETS
        : CHARACTER_3D_PORTRAIT_PRESETS;
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return source;
    return source.filter(
      (item) =>
        item.label.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q),
    );
  });

  constructor() {
    effect(() => {
      const url = this.portraitUrl();
      const glbUrl = this.activeGlbUrl();
      const canvasRef = this.babylonCanvas();

      if (glbUrl && canvasRef?.nativeElement) {
        void this.ensureAndLoad3dViewer(canvasRef.nativeElement, glbUrl);
      } else {
        this.dispose3dViewer();
        this.loadSavedPlacement(url);
      }
    });

    this.destroyRef.onDestroy(() => this.dispose3dViewer());
  }

  private async ensureAndLoad3dViewer(
    canvas: HTMLCanvasElement,
    glbUrl: string,
  ): Promise<void> {
    if (!this.viewer3d) {
      this.modelLoading.set(true);
      const { LwCharacterPortrait3dViewer: ViewerClass } = await import(
        './character-portrait-3d-viewer'
      );
      if (!this.is3dMode()) return;
      this.viewer3d = new ViewerClass(canvas, (state) => {
        this.modelLoading.set(state.loading);
        this.modelError.set(state.error);
      });
    }
    await this.viewer3d.loadModel(glbUrl);
  }

  togglePicker(): void {
    this.pickerOpen.update((v) => !v);
  }

  selectPreset(preset: CharacterPortraitPresetVm): void {
    const targetUrl =
      preset.category === '3d-character' && preset.glbUrl ? preset.glbUrl : preset.imageUrl;
    this.portraitSelected.emit(targetUrl);
    this.pickerOpen.set(false);
  }

  isPresetSelected(item: CharacterPortraitPresetVm): boolean {
    const current = this.portraitUrl();
    return current === item.imageUrl || (Boolean(item.glbUrl) && current === item.glbUrl);
  }

  onFileSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement | null;
    const file = inputEl?.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.glb') || lowerName.endsWith('.gltf')) {
      const objectUrl = `${URL.createObjectURL(file)}#custom.glb`;
      this.portraitSelected.emit(objectUrl);
      this.pickerOpen.set(false);
      inputEl.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.length > 0) {
        this.portraitSelected.emit(reader.result);
        this.pickerOpen.set(false);
      }
    };
    reader.readAsDataURL(file);
    inputEl.value = '';
  }

  onStagePointerDown(event: PointerEvent): void {
    if (this.pickerOpen()) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.lw-portrait-stage__edit-btn, .lw-portrait-stage__toolbar')) {
      return;
    }
    this.isDragging.set(true);
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.startOffsetX = this.offsetX();
    this.startOffsetY = this.offsetY();
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  onStagePointerMove(event: PointerEvent): void {
    if (!this.isDragging()) return;
    if (this.is3dMode()) {
      const dx = event.clientX - this.dragStartX;
      this.dragStartX = event.clientX;
      this.viewer3d?.rotateHorizontal(dx);
      return;
    }

    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;
    const nextX = Math.max(0, Math.min(100, Math.round(this.startOffsetX - dx * 0.22)));
    const nextY = Math.max(0, Math.min(100, Math.round(this.startOffsetY - dy * 0.22)));
    this.offsetX.set(nextX);
    this.offsetY.set(nextY);
    this.savePlacement();
  }

  onStagePointerUp(event: PointerEvent): void {
    if (!this.isDragging()) return;
    this.isDragging.set(false);
    (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
  }

  setOffsetX(value: number): void {
    this.offsetX.set(Math.max(0, Math.min(100, Number(value) || 0)));
    this.savePlacement();
  }

  setOffsetY(value: number): void {
    this.offsetY.set(Math.max(0, Math.min(100, Number(value) || 0)));
    this.savePlacement();
  }

  setZoomPercent(value: number): void {
    this.zoomPercent.set(Math.max(80, Math.min(180, Number(value) || 100)));
    this.savePlacement();
  }

  resetAdjustment(): void {
    if (this.is3dMode()) {
      this.viewer3d?.resetRotation();
      return;
    }
    this.offsetX.set(50);
    this.offsetY.set(15);
    this.zoomPercent.set(100);
    this.savePlacement();
  }

  private loadSavedPlacement(url: string): void {
    if (!url || typeof localStorage === 'undefined') {
      this.offsetX.set(50);
      this.offsetY.set(15);
      this.zoomPercent.set(100);
      return;
    }
    try {
      const raw = localStorage.getItem(PLACEMENT_STORAGE_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, PortraitPlacement>) : {};
      const entry = map[url];
      this.offsetX.set(entry?.x ?? 50);
      this.offsetY.set(entry?.y ?? 15);
      this.zoomPercent.set(entry?.zoom ?? 100);
    } catch {
      this.offsetX.set(50);
      this.offsetY.set(15);
      this.zoomPercent.set(100);
    }
  }

  private savePlacement(): void {
    const url = this.portraitUrl();
    if (!url || this.is3dMode() || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(PLACEMENT_STORAGE_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, PortraitPlacement>) : {};
      map[url] = {
        x: this.offsetX(),
        y: this.offsetY(),
        zoom: this.zoomPercent(),
      };
      localStorage.setItem(PLACEMENT_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore storage quota errors
    }
  }

  private dispose3dViewer(): void {
    if (this.viewer3d) {
      this.viewer3d.dispose();
      this.viewer3d = null;
    }
  }
}
