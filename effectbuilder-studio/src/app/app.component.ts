import { LayerControlsComponent } from './shared/components/layer-controls/layer-controls.component';
import { supportsParticular } from './effects/layer-control-profile';
import { TELEPORT_DEFAULTS } from './effects/effect-definition';
import { OptionGridComponent } from './shared/components/option-grid/option-grid.component';
import { makeLayerCatalog } from './effects/layer-catalog';
import { getSpellIconUrl, resolveEffectIconUrl, resolveLayerIconSlug } from './effects/effect-icon-catalog';
import { LightSettings, parseLight } from './effects/spell-light-settings';
import { makeSpellTemplates, makeGasCone } from './effects/spell-templates';
import { HttpClient } from '@angular/common/http';
import { UserMenuComponent } from './shared/components/user-menu/user-menu.component';
import { SplitterComponent } from './shared/components/splitter/splitter.component';
import { SpellPickerComponent, CatalogSpell } from './shared/components/spell-picker/spell-picker.component';
import { makeAmbientPresets } from './effects/ambient-presets';
import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonComponent } from './shared/components/button/button.component';
import { IconComponent } from './shared/components/icon/icon.component';
import { ModalComponent } from './shared/components/modal/modal.component';
import { AuthModalComponent } from './shared/components/auth-modal/auth-modal.component';
import { AuthService } from './core/services/auth.service';
import { CampaignService } from './core/services/campaign.service';
import { UiLayoutService } from './core/services/ui-layout.service';
import { adaptEffectForCampaign, downloadStandaloneEffectFile, parseStandaloneEffectPayload } from './effects/standalone-effect-io';
import { EffectPreviewComponent } from './shared/effect-preview.component';
import { TimelineComponent, ClipChange } from './shared/timeline/timeline.component';
import { EffectApiService, EffectListing } from './effect-api.service';
import { CINEMATIC_DEFAULTS,CinematicSettings,GameplaySettings,GAMEPLAY_DEFAULTS,createMageHandEffect, MageHandSettings, createFireballComposition, FireMaterialSettings, FIRE_MATERIAL_CONTROLS, createFireHitEffect, FIRE_HIT_CONTROLS, FireHitSettings, MISSILE_CONTROLS, MagicMissileSettings, PreviewScene, defaultScene, WHIP_CONTROLS, WHIP_DEFAULTS, WhipSettings, BLEND_MODES, EFFECT_KINDS, VARIANTS, EffectDefinition, EffectKind, EffectLayer, EffectMotion, EffectAssignment, createEffect, createLayer, defaultMotion, effectDuration, makePresets, newId, parseEffect, PROJECTILE_ELEMENTS, PROJECTILE_SHAPES, PROJECTILE_CORE_CONTROLS, ProjectileCoreSettings, ProjectileElement, ProjectileCoreShape, defaultProjectileCoreForVariant, parseProjectileCore, SkyProjectileSettings, SkyBeamSettings, SkyLightningSettings, SKY_ORIGIN_CONTROLS, SKY_BEAM_CONTROLS, SKY_LIGHTNING_CONTROLS, parseSkyProjectile, parseSkyBeam, parseSkyLightning, ParticularSettings, PARTICULAR_SPRITE_TYPES, PARTICULAR_EMITTER_TYPES, PARTICULAR_SIZE_CURVES, PARTICULAR_OPACITY_CURVES, PARTICULAR_COLOR_GRADIENTS, PARTICULAR_EMITTER_CONTROLS, PARTICULAR_PARTICLE_CONTROLS, PARTICULAR_PHYSICS_CONTROLS, PARTICULAR_AUX_CONTROLS, defaultParticularForLayer, parseParticular } from './effects/effect-definition';
@Component({ selector: 'mw-root', standalone: true, imports: [LayerControlsComponent, OptionGridComponent, UserMenuComponent, SplitterComponent, FormsModule, SpellPickerComponent, ButtonComponent, IconComponent, ModalComponent, AuthModalComponent, EffectPreviewComponent, TimelineComponent], templateUrl: './app.component.html', styleUrl: './app.component.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class AppComponent {
 readonly supportsParticular=supportsParticular;
  private readonly http=inject(HttpClient);private readonly destroyRef=inject(DestroyRef);
  readonly sessionReady=signal(false);readonly sessionError=signal('');private sessionGeneration=0;
  private readonly accountId=computed(()=>this.auth.isAuthenticated()?this.auth.currentUser()?.id:null);
  @HostListener('window:focus') checkSession():void { void this.validateSession(); }
  async validateSession(): Promise<void> {
    const generation = ++this.sessionGeneration;
    try {
      await firstValueFrom(this.auth.refreshProfile());
      if (generation === this.sessionGeneration) {
        this.sessionError.set('');
        this.sessionReady.set(true);
        this.campaigns.loadMyCampaigns().subscribe({ error: () => {} });
      }
    } catch (e: any) {
      if (generation !== this.sessionGeneration) return;
      if (this.auth.isAuthenticated()) {
        if (e?.status === 401) {
          this.sessionReady.set(false);
          this.sessionError.set('Your session expired. Sign in to continue.');
          this.auth.clearInvalidSession();
        } else {
          this.sessionError.set('');
          this.sessionReady.set(true);
          this.campaigns.loadMyCampaigns().subscribe({ error: () => {} });
        }
      } else {
        this.sessionReady.set(false);
      }
    }
  }
  readonly auth = inject(AuthService); readonly campaigns = inject(CampaignService); readonly ui = inject(UiLayoutService); private api = inject(EffectApiService);
  @ViewChild(EffectPreviewComponent) preview?: EffectPreviewComponent;
  readonly ambient = [...makeAmbientPresets(),{role:'target' as const,effect:createFireHitEffect()},{role:'caster' as const,effect:createFireballComposition('caster')},{role:'target' as const,effect:createFireballComposition('impact')}]; readonly presetRoles = new Map(this.ambient.map(p => [p.effect.id,p.role]));
  readonly layerCatalog=makeLayerCatalog();
  readonly layerChoices=computed(()=>{const available=16-this.definition().layers.length;return this.layerCatalog.map(({effect,...option})=>({...option,disabled:effect.layers.length>available,disabledReason:effect.layers.length>available?'Needs '+effect.layers.length+' free layer slots (maximum 16).':undefined}));});
  chooseLayer(id:string):void{const option=this.layerCatalog.find(entry=>entry.id===id);if(!option||this.definition().layers.length+option.effect.layers.length>16)return;this.addPreset(option.effect);this.dialog.set(null);this.workspace.set('layers');}
  readonly premium=makeSpellTemplates();readonly premiumIds=new Set(this.premium.map(e=>e.id));
  readonly presets = [...this.premium,createMageHandEffect(),createFireballComposition(),...makePresets(), ...this.ambient.map(p=>p.effect)];
  readonly presetGroup = signal<'all'|'premium'|'starter'|'caster'|'target'>('all');
  presetRole(e: EffectDefinition): string { return this.presetRoles.get(e.id) ?? 'starter'; }
  effectIconUrl(e: EffectDefinition): string { return resolveEffectIconUrl(e); }
  layerIconUrl(l: EffectLayer): string { return getSpellIconUrl(resolveLayerIconSlug(l, this.definition().name)); }
  variantIconUrl(kind: EffectKind, variantId: string, name: string, desc: string): string { return getSpellIconUrl(resolveLayerIconSlug({ kind, variant: variantId, color: '#ffffff' }, `${name} ${desc}`)); }
  readonly kinds = EFFECT_KINDS; readonly blendModes = BLEND_MODES; readonly whipControls = WHIP_CONTROLS; readonly missileControls = MISSILE_CONTROLS; readonly activeBolt=signal(0);
  readonly projectileElements = PROJECTILE_ELEMENTS;
  readonly projectileShapes = PROJECTILE_SHAPES;
  readonly projectileControls = PROJECTILE_CORE_CONTROLS;
  readonly skyOriginControls = SKY_ORIGIN_CONTROLS;
  readonly skyBeamControls = SKY_BEAM_CONTROLS;
  readonly skyLightningControls = SKY_LIGHTNING_CONTROLS;
  readonly particularSpriteTypes = PARTICULAR_SPRITE_TYPES;
  readonly particularEmitterTypes = PARTICULAR_EMITTER_TYPES;
  readonly particularSizeCurves = PARTICULAR_SIZE_CURVES;
  readonly particularOpacityCurves = PARTICULAR_OPACITY_CURVES;
  readonly particularColorGradients = PARTICULAR_COLOR_GRADIENTS;
  readonly particularEmitterControls = PARTICULAR_EMITTER_CONTROLS;
  readonly particularParticleControls = PARTICULAR_PARTICLE_CONTROLS;
  readonly particularPhysicsControls = PARTICULAR_PHYSICS_CONTROLS;
  readonly particularAuxControls = PARTICULAR_AUX_CONTROLS;
  readonly fullscreenPreview = signal(false);
  @HostListener('window:keydown.escape') onEscapeKey(): void {
    if (this.fullscreenPreview()) this.fullscreenPreview.set(false);
  }
  particularSettings(layer: EffectLayer): ParticularSettings {
    if (layer.particular) {
      return parseParticular(layer.particular, layer.kind, layer.variant, layer.color) ?? defaultParticularForLayer(layer.kind, layer.variant, layer.color);
    }
    return {
      ...defaultParticularForLayer(layer.kind, layer.variant, layer.color),
      enabled: false,
    };
  }
  particular<K extends keyof ParticularSettings>(key: K, value: ParticularSettings[K]): void {
    const l = this.selected();
    if (!l) return;
    const base = l.particular
      ? (parseParticular(l.particular, l.kind, l.variant, l.color) ?? defaultParticularForLayer(l.kind, l.variant, l.color))
      : { ...defaultParticularForLayer(l.kind, l.variant, l.color), enabled: true };
    const next = parseParticular({ ...base, [key]: value }, l.kind, l.variant, l.color);
    this.updateLayer({ particular: next });
  }
  skyProjectileSettings(layer: EffectLayer): SkyProjectileSettings {
    return parseSkyProjectile(layer.skyProjectile, layer.variant, layer.color);
  }
  skyProjectile<K extends keyof SkyProjectileSettings>(key: K, value: SkyProjectileSettings[K]): void {
    const l = this.selected();
    if (!l || l.kind !== 'sky_projectile') return;
    const cur = this.skyProjectileSettings(l);
    this.updateLayer({
      skyProjectile: parseSkyProjectile({ ...cur, [key]: value }, l.variant, l.color),
    });
  }
  applySkyProjectileElementPreset(elementId: ProjectileElement): void {
    const l = this.selected();
    if (!l || l.kind !== 'sky_projectile') return;
    const preset = this.projectileElements.find((e) => e.id === elementId);
    if (!preset) return;
    const cur = this.skyProjectileSettings(l);
    this.updateLayer({
      color: preset.color,
      secondaryColor: preset.secondaryColor,
      skyProjectile: parseSkyProjectile(
        { ...cur, element: preset.id, shape: preset.shape },
        l.variant,
        preset.color
      ),
    });
    this.replay();
  }
  skyBeamSettings(layer: EffectLayer): SkyBeamSettings {
    return parseSkyBeam(layer.skyBeam);
  }
  skyBeam<K extends keyof SkyBeamSettings>(key: K, value: SkyBeamSettings[K]): void {
    const l = this.selected();
    if (!l || l.kind !== 'sky_beam') return;
    const cur = this.skyBeamSettings(l);
    this.updateLayer({ skyBeam: parseSkyBeam({ ...cur, [key]: value }) });
  }
  skyLightningSettings(layer: EffectLayer): SkyLightningSettings {
    return parseSkyLightning(layer.skyLightning);
  }
  skyLightning<K extends keyof SkyLightningSettings>(key: K, value: SkyLightningSettings[K]): void {
    const l = this.selected();
    if (!l || l.kind !== 'sky_lightning') return;
    const cur = this.skyLightningSettings(l);
    this.updateLayer({ skyLightning: parseSkyLightning({ ...cur, [key]: value }) });
  }
  projectileCoreSettings(layer: EffectLayer): ProjectileCoreSettings {
    return parseProjectileCore(layer.projectileCore, layer.variant, layer.color);
  }
  applyProjectileElementPreset(elementId: ProjectileElement): void {
    const l = this.selected();
    if (!l || l.kind !== 'projectile') return;
    const preset = this.projectileElements.find((e) => e.id === elementId);
    if (!preset) return;
    const cur = this.projectileCoreSettings(l);
    const variant = preset.shape === 'lance' ? 'shard' : preset.shape === 'comet' ? 'meteor' : l.variant;
    this.updateLayer({
      variant,
      color: preset.color,
      secondaryColor: preset.secondaryColor,
      fireMaterial: undefined,
      projectileCore: {
        ...cur,
        element: preset.id,
        shape: preset.shape,
      },
    });
    this.replay();
  }
  projectileCore<K extends keyof ProjectileCoreSettings>(key: K, value: ProjectileCoreSettings[K]): void {
    const l = this.selected();
    if (!l || l.kind !== 'projectile') return;
    const cur = this.projectileCoreSettings(l);
    this.updateLayer({
      fireMaterial: undefined,
      projectileCore: parseProjectileCore({ ...cur, [key]: value }, l.variant, l.color),
    });
  }
  readonly hasProjectileArc = computed(() =>
    this.definition().layers.some(
      (l) => (l.kind === 'projectile' && !l.mageHand) || !!l.missile || l.fireMaterial?.role === 'projectile'
    )
  );
  readonly spellArc = computed(() => {
    const sel = this.selected();
    const targetLayer =
      sel && ((sel.kind === 'projectile' && !sel.mageHand) || !!sel.missile || sel.fireMaterial?.role === 'projectile')
        ? sel
        : this.definition().layers.find(
            (l) => (l.kind === 'projectile' && !l.mageHand) || !!l.missile || l.fireMaterial?.role === 'projectile'
          );
    if (!targetLayer) return 0;
    if (targetLayer.missile) return targetLayer.missile.curve;
    if (targetLayer.fireMaterial?.role === 'projectile') return targetLayer.fireMaterial.arc;
    return this.projectileCoreSettings(targetLayer).arc;
  });
  setSpellArc(arcVal: number): void {
    const clamped = Math.max(-180, Math.min(180, Number(arcVal) || 0));
    const sel = this.selected();
    const applyToLayer = (l: EffectLayer): EffectLayer => {
      if (l.missile) return { ...l, missile: { ...l.missile, curve: Math.max(-160, Math.min(160, clamped)) } };
      if (l.fireMaterial?.role === 'projectile') return { ...l, fireMaterial: { ...l.fireMaterial, arc: clamped } };
      if (l.kind === 'projectile' && !l.mageHand) {
        const cur = this.projectileCoreSettings(l);
        return { ...l, fireMaterial: undefined, projectileCore: parseProjectileCore({ ...cur, arc: clamped }, l.variant, l.color) };
      }
      return l;
    };
    if (sel && ((sel.kind === 'projectile' && !sel.mageHand) || !!sel.missile || sel.fireMaterial?.role === 'projectile')) {
      this.updateLayer(applyToLayer(sel), sel.id);
    } else {
      this.update({ layers: this.definition().layers.map(applyToLayer) });
    }
  }
  setTargetMotion(enabled: boolean): void {
    const scene = this.definition().previewScene;
    this.update({ previewScene: { ...scene, targetMotion: !!enabled } });
  }
  setWallTest(enabled: boolean): void {
    const scene = this.definition().previewScene;
    this.update({
      previewScene: {
        ...scene,
        walls: enabled ? (scene.walls?.length ? scene.walls : [{ a: { x: 0.55, y: 0.2 }, b: { x: 0.55, y: 0.8 } }]) : [],
      },
    });
  }
  readonly viewportWidth=signal(window.innerWidth);readonly viewportHeight=signal(window.innerHeight);
  @HostListener('window:resize') viewportChanged():void{this.viewportWidth.set(window.innerWidth);this.viewportHeight.set(window.innerHeight);}
  readonly previewMin=computed(()=>Math.min(45,Math.max(20,190/Math.max(1,this.viewportHeight()-180)*100)));
  readonly previewMax=computed(()=>Math.max(55,Math.min(80,100-140/Math.max(1,this.viewportHeight()-180)*100)));
  readonly previewSize=computed(()=>Math.max(this.previewMin(),Math.min(this.previewMax(),this.previewShare())));
  readonly libraryLimit=computed(()=>Math.min(440,Math.max(180,Math.floor((this.viewportWidth()-340)*.45))));
  readonly inspectorLimit=computed(()=>Math.min(480,Math.max(240,Math.floor((this.viewportWidth()-340)*.48))));
  readonly librarySize=computed(()=>Math.min(this.libraryWidth(),this.libraryLimit()));readonly inspectorSize=computed(()=>Math.min(this.inspectorWidth(),this.inspectorLimit()));
  readonly libraryWidth=signal(240);readonly inspectorWidth=signal(320);readonly previewShare=signal(62);
  readonly libraryCollapsed=signal(false);readonly inspectorCollapsed=signal(false);readonly previewCollapsed=signal(false);readonly timelineCollapsed=signal(false);
  setPane(name:'library'|'inspector',value:number):void{if(name==='library'){this.libraryWidth.set(value);this.libraryCollapsed.set(false);}else{this.inspectorWidth.set(value);this.inspectorCollapsed.set(false);}}
  toggleCenter(name:'preview'|'timeline'):void{if(name==='preview'){this.previewCollapsed.update(v=>!v);this.timelineCollapsed.set(false);}else{this.timelineCollapsed.update(v=>!v);this.previewCollapsed.set(false);}}
  resetLayout():void{this.libraryWidth.set(240);this.inspectorWidth.set(320);this.previewShare.set(62);this.libraryCollapsed.set(false);this.inspectorCollapsed.set(false);this.previewCollapsed.set(false);this.timelineCollapsed.set(false);}
  readonly workspace=signal<'preview'|'library'|'layers'|'controls'>('preview'); readonly fireControls=FIRE_HIT_CONTROLS; readonly materialControls=FIRE_MATERIAL_CONTROLS;
  readonly selectedMissile=computed(()=>this.selected()?.missile?this.selected():this.definition().layers.find(l=>!!l.missile));
  readonly definition = signal<EffectDefinition>(structuredClone(this.presets[0]));
  readonly selectedId = signal(this.definition().layers[0].id);
  readonly selected = computed(() => this.definition().layers.find(l => l.id === this.selectedId()));
  readonly variants = computed(() => VARIANTS[this.selected()?.kind ?? 'beam']);
  readonly variantDescription = computed(() => this.variants().find(v => v.id === this.selected()?.variant)?.description ?? '');
  readonly clips = computed(() => this.definition().layers.map(l => ({ id: l.id, name:l.cinematic?'Cinematic / '+l.cinematic.element+' '+l.cinematic.style:l.mageHand?'Mage Hand / spectral shader':l.fireMaterial?'Fire / '+l.fireMaterial.role+' / textured GPU': l.fireHit ? 'Fire hit / GPU shader' : l.missile ? 'Magic Missile / 3 bolts' : l.kind==='projectile'&&l.projectileCore ? `Projectile / ${l.projectileCore.element} 3D ${l.projectileCore.shape}` : `${l.kind} / ${VARIANTS[l.kind].find(v => v.id === l.variant)?.name ?? l.variant}`, color: l.color, start: l.delay, duration: l.duration, enabled: l.enabled, easing: l.easing, opacityKeyframes: l.opacityKeyframes })));
  readonly duration = computed(() => effectDuration(this.definition()));
  readonly library = signal<EffectDefinition[]>([]); readonly listings = signal<EffectListing[]>([]);
  readonly assignments = signal<EffectAssignment[]>([]); readonly members = signal<{ character_id: number | null; character_name: string | null }[]>([]);
  readonly tab = signal<'presets' | 'library' | 'community'>('presets'); readonly search = signal('');
  readonly filtered = computed(() => (this.tab() === 'library' ? this.library() : this.presets).filter(e => `${e.name} ${e.spellName} ${e.description}`.toLowerCase().includes(this.search().toLowerCase()) && (this.tab() !== 'presets' || this.presetGroup() === 'all' || (this.presetGroup()==='premium'?this.premiumIds.has(e.id):this.presetRole(e) === this.presetGroup()))));
  readonly dialog = signal<'assign' | 'publish' | 'json' | 'layer' | 'actions' | null>(null); readonly notice = signal(''); readonly busy = signal(false);
  readonly ground=signal(false); readonly playing = signal(true); readonly loop = signal(true); readonly grid = signal(true); readonly speed = signal(1); readonly seekTime = signal<number | null>(null); readonly time = signal(0);
  readonly undoStack: EffectDefinition[] = []; readonly redoStack: EffectDefinition[] = [];
  readonly json = computed(() => JSON.stringify(this.definition(), null, 2));
  readonly summonNpcs=signal<{id:number;name:string;tokenUrl:string}[]>([]);
  readonly summonTokens=signal<{name:string;tokenUrl:string}[]>([]);
  summonCampaign=0; summonNpc=0; summonSearch=''; summonToken=''; summonDelay=800; summonSize=1;
  async loadSummonNpcs():Promise<void>{this.summonNpc=0;this.summonNpcs.set([]);if(this.summonCampaign)await this.task(async()=>this.summonNpcs.set(await firstValueFrom(this.api.summonNpcs(+this.summonCampaign))));}
  async browseSummonTokens():Promise<void>{await this.task(async()=>{const result=await firstValueFrom(this.api.tokenAssets(this.summonSearch));this.summonTokens.set(result.items.filter(t=>!!t.tokenUrl));});}
  selectSummonNpc():void{const npc=this.summonNpcs().find(n=>n.id===+this.summonNpc);if(npc?.tokenUrl)this.summonToken=npc.tokenUrl;}
  async uploadSummon(event:Event):Promise<void>{const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;if(!this.auth.isAuthenticated())return this.signIn();await this.task(async()=>{if(file.size>2000000)throw new Error('Choose an image smaller than 2 MB.');this.summonToken=(await firstValueFrom(this.api.uploadToken(file))).url;this.notice.set('Private token uploaded. Choose its NPC and add the summon.');});input.value='';}
  applySummon():void{const npc=this.summonNpcs().find(n=>n.id===+this.summonNpc);if(!npc||!this.summonToken){this.notice.set('Choose an NPC and token artwork.');return;}try{const summon={campaignId:+this.summonCampaign,npcId:npc.id,name:npc.name,tokenUrl:this.summonToken,delay:+this.summonDelay,size:+this.summonSize};parseEffect({...this.definition(),summon});this.update({summon,layers:this.definition().layers.length?this.definition().layers:[{...createLayer('sigil'),variant:'summoning',anchor:'target'}]});this.replay();this.notice.set('Summon added. Assign this effect to a spell in the same campaign.');}catch(e:any){this.notice.set(e.message);}}
  campaignId = 0; characterId = 0; assignmentSpell = ''; publishTitle = ''; publishDescription = ''; publishPack = false; rightsConfirmed = false;
  constructor() {
    const sessionTimer=setInterval(()=>void this.validateSession(),60000);this.destroyRef.onDestroy(()=>clearInterval(sessionTimer));
    effect(()=>{this.accountId();this.sessionReady.set(false);void this.validateSession();});
    try{const saved=JSON.parse(localStorage.getItem('mw-effectbuilder-layout-v2')??'null');if(saved&&typeof saved==='object'){for(const [key,target,min,max] of [['library',this.libraryWidth,180,440],['inspector',this.inspectorWidth,240,480],['preview',this.previewShare,20,80]] as const){const n=saved[key];if(typeof n==='number'&&Number.isFinite(n))target.set(Math.max(min,Math.min(max,n)));}this.libraryCollapsed.set(saved.libraryCollapsed===true);this.inspectorCollapsed.set(saved.inspectorCollapsed===true);this.previewCollapsed.set(saved.previewCollapsed===true);this.timelineCollapsed.set(saved.timelineCollapsed===true&&!this.previewCollapsed());}}catch{}
    effect(()=>{const layout={library:this.libraryWidth(),inspector:this.inspectorWidth(),preview:this.previewShare(),libraryCollapsed:this.libraryCollapsed(),inspectorCollapsed:this.inspectorCollapsed(),previewCollapsed:this.previewCollapsed(),timelineCollapsed:this.timelineCollapsed()};try{localStorage.setItem('mw-effectbuilder-layout-v2',JSON.stringify(layout));}catch{}});

    try {
      const raw = localStorage.getItem('mw-effectbuilder-draft-v1');
      if (raw) {
        let draft = parseEffect(JSON.parse(raw));
        if (
          draft.layers.some((l) => l.kind === 'projectile') &&
          draft.layers.some((l) => l.cinematic?.style === 'beam')
        ) {
          draft.layers = draft.layers.filter((l) => l.cinematic?.style !== 'beam');
        }
        if (draft.name === 'Inferno Impact' && draft.layers.length < 3) {
          draft = createFireHitEffect();
        } else if (draft.name === 'Furnace Invocation' && draft.layers.length < 2) {
          draft = createFireballComposition('caster');
        } else if (draft.name === 'Pyroclasm Impact' && draft.layers.length < 3) {
          draft = createFireballComposition('impact');
        } else if ((draft.name === 'Fireball / Pyroclasm' || draft.name === 'Fireball') && draft.layers.length < 5) {
          draft = createFireballComposition();
        }
        this.open(draft);
      }
    } catch {
      /* Bad drafts never prevent opening the editor. */
    }
    if (new URLSearchParams(location.search).get('tab') === 'community') this.tab.set('community');
    effect(() => { const draft = this.definition(); try { localStorage.setItem('mw-effectbuilder-draft-v1', JSON.stringify(draft)); } catch { /* Browser storage may be unavailable. */ } });
    effect(() => { if (this.sessionReady() && this.auth.isAuthenticated()) void this.loadLibrary(); else {this.library.set([]);this.assignments.set([]);this.members.set([]);this.summonNpcs.set([]);this.dialog.set(null);} });
    void this.loadCommunity();
  }
  remember(): void { this.undoStack.push(structuredClone(this.definition())); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack.length = 0; }
  undo(): void { const e = this.undoStack.pop(); if (e) { this.redoStack.push(structuredClone(this.definition())); this.open(e); } }
  redo(): void { const e = this.redoStack.pop(); if (e) { this.undoStack.push(structuredClone(this.definition())); this.open(e); } }
  open(e: EffectDefinition): void { this.definition.set(structuredClone(e)); if (!e.layers.some(l => l.id === this.selectedId())) this.selectedId.set(e.layers[0]?.id ?? ''); }
  use(e: EffectDefinition, copy = true): void { this.remember(); const d = parseEffect(e); if (copy) d.id = newId(); this.open(d); this.selectedId.set(d.layers[0]?.id ?? '');this.workspace.set('preview'); this.replay(); }
  addPreset(e: EffectDefinition): void { const layers=e.layers.map(l=>({...structuredClone(l),id:newId()})); if(this.definition().layers.length+layers.length>16){this.notice.set('This preset needs '+layers.length+' free layer slots (maximum 16).');return;} this.update({layers:[...this.definition().layers,...layers],...(e.previewScene.teleport?{previewScene:{...this.definition().previewScene,teleport:structuredClone(e.previewScene.teleport)}}:{})});this.selectedId.set(layers[0].id);this.replay();this.notice.set('Added '+e.name+' layers. Drag their clips to align with your spell.'); }
  blank(): void { const e = createEffect(); e.layers = []; this.use(e); }
  update(patch: Partial<EffectDefinition>): void { this.remember(); this.definition.update(d => ({ ...d, ...patch })); }
  updateLayer(patch: Partial<EffectLayer>, id = this.selectedId(), remember = true): void {
    if (remember) this.remember();
    this.definition.update(d => ({ ...d, layers: d.layers.map(l => l.id === id ? { ...l, ...patch } : l) }));
  }
  lightSettings(layer:EffectLayer):LightSettings{return parseLight(layer.lighting);}
  light(key:keyof LightSettings,value:boolean|string|number):void{const l=this.selected();if(l)this.updateLayer({lighting:parseLight({...l.lighting,[key]:value})});}
  motion(key: keyof EffectMotion, value: number): void { const l = this.selected(); if (l) this.updateLayer({ motion: { ...l.motion, [key]: Number(value) } }); }
  addFireballLayers(role?:FireMaterialSettings['role']):void{const effect=createFireballComposition(role);if(this.definition().layers.length+effect.layers.length>16)return;this.addPreset(effect);this.dialog.set(null);this.workspace.set('layers');}
  showMaterialControl(key:string,role:string):boolean{return key==='arc'||key==='trail'?role==='projectile':key==='scorch'||key==='shadows'?role==='impact':true;}
  material(key:Exclude<keyof FireMaterialSettings,'role'>,value:string|number):void{const l=this.selected();if(l?.fireMaterial)this.updateLayer({fireMaterial:{...l.fireMaterial,[key]:value}});}
  toggleTargetMotion():void{const scene=this.definition().previewScene;this.update({previewScene:{...scene,targetMotion:!scene.targetMotion}});}
  toggleWallTest():void{const scene=this.definition().previewScene;this.update({previewScene:{...scene,walls:scene.walls?.length?[]:[{a:{x:.55,y:.2},b:{x:.55,y:.8}}]}});}
  fire(key:keyof FireHitSettings,value:string|number):void{const l=this.selected();if(l?.fireHit)this.updateLayer({fireHit:{...l.fireHit,[key]:value}});}
  upgradeMaterial():void{const l=this.selected();if(!l)return;this.updateLayer({missile:undefined,mageHand:undefined,fireHit:undefined,fireMaterial:undefined,cinematic:{...CINEMATIC_DEFAULTS,style:l.kind==='cone'?'cone':l.kind==='beam'||l.kind==='lightning'?'beam':'nova',element:l.kind==='cone'?'fire':l.kind==='lightning'?'lightning':'force'},motion:{...l.motion,direction:0}});}
  cinematic(key:keyof CinematicSettings,value:string|number):void{const l=this.selected();if(l?.cinematic)this.updateLayer({cinematic:{...l.cinematic,[key]:value}});}
  gameplay(key:keyof GameplaySettings,value:any):void{const current=this.definition().gameplay??{...GAMEPLAY_DEFAULTS};const next={...current,[key]:value};if(next.prone)next.basis='homebrew';this.update({gameplay:next});}
  addCone(element:'fire'|'ice'|'gas'):void{const e=element==='gas'?makeGasCone():this.premium.find(e=>e.spellName===(element==='ice'?'Cone of Cold':'Burning Hands'))!;const copy=structuredClone(e);if(element==='ice'){copy.layers.find(l=>l.cinematic)!.cinematic!.reachFeet=15;copy.layers.find(l=>l.cinematic)!.cinematic!.widthFeet=15;}this.addPreset(copy);this.dialog.set(null);}
  readonly editingHandPath=signal(false);
  hand(key:'growth'|'wrist'|'wisps',value:number):void{const l=this.selected();if(l?.mageHand)this.updateLayer({mageHand:{...l.mageHand,[key]:Number(value)}});}
  handPath(path:{x:number;y:number}[]):void{const l=this.selected();if(l?.mageHand)this.updateLayer({mageHand:{...l.mageHand,path}});}
  addMageHand():void{if(this.definition().layers.length>=16)return;this.addPreset(createMageHandEffect());this.dialog.set(null);this.workspace.set('preview');}
  addFireHit():void{if(this.definition().layers.length>=16)return;const layer=createFireHitEffect().layers[0];this.update({layers:[...this.definition().layers,layer]});this.selectedId.set(layer.id);this.dialog.set(null);this.workspace.set('layers');this.replay();}
  missile(key: Exclude<keyof MagicMissileSettings,'targets'>,value:string|number):void{const layer=this.selectedMissile();if(layer?.missile)this.updateLayer({missile:{...layer.missile,[key]:value}},layer.id);}
  assignBolt(bolt:number,slot:number):void{const layer=this.selectedMissile();if(!layer?.missile)return;const targets=[...layer.missile.targets];targets[bolt]=Number(slot);this.updateLayer({missile:{...layer.missile,targets}},layer.id);}
  teleport(key:'enabled'|'vanishMs'|'hiddenMs'|'appearMs',value:boolean|number):void{if(key!=='enabled')value=Number.isFinite(+value)?Math.max(100,Math.min(2500,+value)):650;const d=this.definition(),old={...TELEPORT_DEFAULTS,...d.previewScene.teleport},next={...structuredClone(TELEPORT_DEFAULTS),...d.previewScene.teleport,[key]:value},shift=next.vanishMs+next.hiddenMs-old.vanishMs-old.hiddenMs;this.update({previewScene:{...d.previewScene,teleport:next},layers:d.layers.map(l=>l.anchor==='target'?{...l,delay:Math.max(0,Math.min(5000,l.delay+shift))}:l)});}
  revealTeleport(ms:number):void{this.seekTime.set(null);this.preview?.startAt(ms);this.playing.set(true);}
  scene(scene:PreviewScene):void{this.definition.update(d=>({...d,previewScene:scene}));}
  resetScene():void{this.update({previewScene:defaultScene()});}
  whip(key: keyof WhipSettings, value: number): void { const l = this.selected(); if (l) this.updateLayer({ whip: { ...(l.whip ?? WHIP_DEFAULTS), [key]: Number(value) } }); }
  kind(kind: EffectKind): void { const variant = VARIANTS[kind][0].id; const defaults = createLayer(kind); this.updateLayer({ kind, variant, aura:undefined, ...(kind !== 'projectile' ? {missile:undefined,mageHand:undefined,projectileCore:undefined} : {projectileCore:defaults.projectileCore}), ...(kind !== 'sky_projectile' ? {skyProjectile:undefined} : {skyProjectile:defaults.skyProjectile}), ...(kind !== 'sky_beam' ? {skyBeam:undefined} : {skyBeam:defaults.skyBeam}), ...(kind !== 'sky_lightning' ? {skyLightning:undefined} : {skyLightning:defaults.skyLightning}), ...(kind!=='burst'?{fireHit:undefined}:{}),fireMaterial:undefined,cinematic:defaults.cinematic, size: defaults.size, anchor: defaults.anchor, ...(kind === 'whip' ? {color: defaults.color, secondaryColor: defaults.secondaryColor, duration: defaults.duration} : {}), motion: defaultMotion(kind, variant) }); this.replay(); }
  variant(id: string): void { const l = this.selected(); if (l) { const nextCore = l.kind==='projectile'&&!l.mageHand&&!l.missile?{...this.projectileCoreSettings(l),shape:(id==='shard'?'lance':id==='meteor'||id==='comet'?'comet':id==='swarm'?'prism':'sphere') as ProjectileCoreShape}:l.projectileCore; this.updateLayer({ variant: id, ...(l.kind==='projectile'?{projectileCore:nextCore}:{}), motion: {...defaultMotion(l.kind, id),...(l.kind==='cone'?{direction:0}:{})},...(l.cinematic&&l.kind==='cone'?{cinematic:{...l.cinematic,element:id==='frost'||id==='shards'?'ice':id==='poison'?'gas':id==='force'?'force':'fire'}}:{}) }); this.replay(); } }
  add(kind: EffectKind): void { if (this.definition().layers.length >= 16) return; const l = createLayer(kind); this.update({ layers: [...this.definition().layers, l] }); this.selectedId.set(l.id);this.dialog.set(null);this.workspace.set('layers'); this.replay(); }
  toggle(id: string): void { const l = this.definition().layers.find(l => l.id === id); if (l) this.updateLayer({ enabled: !l.enabled }, id); }
  duplicate(id: string): void { const l = this.definition().layers.find(l => l.id === id); if (!l || this.definition().layers.length >= 16) return; const clone = structuredClone(l); clone.id = newId(); this.update({ layers: [...this.definition().layers, clone] }); this.selectedId.set(clone.id); }
  remove(id: string): void { const layers = this.definition().layers.filter(l => l.id !== id); this.update({ layers }); if (this.selectedId() === id) this.selectedId.set(layers[0]?.id ?? ''); }
  reorder(e: { id: string; direction: number }): void { const layers = [...this.definition().layers], i = layers.findIndex(l => l.id === e.id), j = i + e.direction; if (i < 0 || j < 0 || j >= layers.length) return; [layers[i], layers[j]] = [layers[j], layers[i]]; this.update({ layers }); }
  timelineStart(): void { this.remember(); this.playing.set(false); this.seekTime.set(this.time()); }
  timelineChange(e: ClipChange): void { this.updateLayer({ delay: e.start, duration: e.duration }, e.id, false); }
  scrub(ms: number): void { this.playing.set(false); this.seekTime.set(ms); this.time.set(ms); }
  play(): void { this.seekTime.set(null); this.playing.update(v => !v); }
  replay(): void { this.seekTime.set(null); this.preview?.restart(); this.playing.set(true); }
  signIn(): void { this.ui.openAuthModal(); }
  private async task(action: () => Promise<void>): Promise<void> { if (this.busy()) return; this.busy.set(true); this.notice.set(''); try { await action(); } catch (e: any) { this.notice.set(e?.error?.message || e?.message || 'The request could not be completed.'); } finally { this.busy.set(false); } }
  async loadLibrary(): Promise<void> { try { const uid = this.auth.currentUser()?.id, result = await firstValueFrom(this.api.library()); if (this.auth.currentUser()?.id === uid) this.library.set(result.map(parseEffect)); } catch { this.notice.set('Could not load your cloud library. Your browser draft is safe.'); } }
  async save(): Promise<void> { if (!this.auth.isAuthenticated()) return this.signIn(); await this.task(async () => { const d = parseEffect(this.definition()); if (!d.layers.length) throw new Error('Add a layer before saving.'); await firstValueFrom(this.api.save(d)); await this.loadLibrary(); this.notice.set('Saved to your effect library.'); }); }
  async deleteSaved(id: string): Promise<void> { await this.task(async () => { await firstValueFrom(this.api.delete(id)); this.library.update(es => es.filter(e => e.id !== id)); this.notice.set('Removed from the library. Assigned copies are preserved.'); }); }
  export(pack = false, singleEffect?: EffectDefinition): void {
    if (!pack) {
      downloadStandaloneEffectFile(singleEffect ?? this.definition());
      return;
    }
    const data = { format: 'loomweaver-effect-pack', schemaVersion: 1, effects: this.library() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'effect-pack.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  exportSingleEffect(e: EffectDefinition, ev?: Event): void {
    ev?.stopPropagation();
    downloadStandaloneEffectFile(e);
  }
  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    await this.task(async () => {
      if (file.size > 512000) throw new Error('Use an effect file smaller than 500 KB.');
      const raw = JSON.parse(await file.text());
      const effects = parseStandaloneEffectPayload(raw, this.campaignId || this.campaigns.activeCampaignId());
      if (effects.length > 50) throw new Error('Import 1–50 effects.');
      if (this.auth.isAuthenticated()) {
        for (const e of effects) await firstValueFrom(this.api.save(e));
        await this.loadLibrary();
      }
      this.use(effects[0]);
      this.notice.set(`Imported ${effects.length} standalone effect${effects.length > 1 ? 's' : ''}. Ready for any campaign.`);
    });
    input.value = '';
  }
  async importIntoCampaignFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    await this.task(async () => {
      if (!this.campaignId) throw new Error('Choose a campaign first.');
      if (file.size > 512000) throw new Error('Use an effect file smaller than 500 KB.');
      const raw = JSON.parse(await file.text());
      const res = await firstValueFrom(
        this.api.importIntoCampaign(this.campaignId, raw, this.assignmentSpell || undefined, +this.characterId)
      );
      await this.loadLibrary();
      this.assignments.set(await firstValueFrom(this.api.assignments(this.campaignId)));
      if (res.effects?.length) {
        this.use(parseEffect(res.effects[0]));
      }
      this.notice.set(
        this.assignmentSpell
          ? `Imported & assigned to ${this.assignmentSpell} in campaign.`
          : `Imported ${res.imported} standalone effect(s) into campaign and your library.`
      );
    });
    input.value = '';
  }
  async openAssignments(): Promise<void> {
    if (!this.auth.isAuthenticated()) return this.signIn();
    this.assignmentSpell = this.definition().spellName || '';
    this.campaignId = this.campaigns.activeCampaignId() ?? (this.campaigns.myCampaigns()[0]?.id ?? 0);
    this.dialog.set('assign');
    await this.loadAssignments();
  }
  setDesignSpell(spell: CatalogSpell | null): void { if (spell) this.update({spellName:spell.name}); }
  selectAssignmentSpell(spell: CatalogSpell | null): void { this.assignmentSpell = spell?.name ?? ''; }
  async loadAssignments(): Promise<void> { this.assignments.set([]); this.members.set([]); this.characterId = 0; if (!this.campaignId) return; await this.task(async () => { const [as, ms] = await Promise.all([firstValueFrom(this.api.assignments(this.campaignId)), firstValueFrom(this.api.members(this.campaignId))]); this.assignments.set(as); this.members.set(ms.members.filter(m => m.character_id)); }); }
  async assign(): Promise<void> { await this.task(async () => { if (!this.campaignId || !this.assignmentSpell.trim()) throw new Error('Choose a campaign and a spell from the catalog.'); const adapted = adaptEffectForCampaign(this.definition(), this.campaignId); const a = { spellName: this.assignmentSpell.trim(), characterId: +this.characterId, definition: parseEffect(adapted) }; await firstValueFrom(this.api.assign(this.campaignId, a)); this.notice.set('Effect assigned to '+this.assignmentSpell+'. The campaign copy is saved.'); this.assignments.set(await firstValueFrom(this.api.assignments(this.campaignId))); }); }
  async unassign(a: EffectAssignment): Promise<void> { await this.task(async () => { await firstValueFrom(this.api.unassign(this.campaignId, a)); this.assignments.update(as => as.filter(x => x !== a)); }); }
  openPublish(): void { if (!this.auth.isAuthenticated()) return this.signIn(); this.publishTitle = this.definition().name; this.publishDescription = this.definition().description; this.rightsConfirmed = false; this.dialog.set('publish'); }
  async loadCommunity(): Promise<void> { try { this.listings.set(await firstValueFrom(this.api.listings())); } catch { /* Explicit refresh remains available. */ } }
  async previewListing(l: EffectListing): Promise<void> { await this.task(async () => { const pack = await firstValueFrom(this.api.pack(l.id)); if (pack.effects.length) this.use(parseEffect(pack.effects[0])); }); }
  async install(l: EffectListing): Promise<void> { if (!this.auth.isAuthenticated()) return this.signIn(); await this.task(async () => { const pack = await firstValueFrom(this.api.pack(l.id)); for (const e of pack.effects) await firstValueFrom(this.api.save({ ...parseEffect(e), id: newId() })); await this.loadLibrary(); this.tab.set('library'); this.notice.set('Installed into your library.'); }); }
  async publish(): Promise<void> { await this.task(async () => { if (!this.rightsConfirmed || !this.publishTitle.trim()) throw new Error('Provide a title and confirm your publishing rights.'); const effects = this.publishPack ? this.library() : [this.definition()]; if (!effects.length) throw new Error('Save at least one effect first.'); if(effects.some(e=>e.summon))throw new Error('Remove campaign NPC links before publishing. Publish the visual effect, then each campaign can link its own summon.'); await firstValueFrom(this.api.publish(this.publishTitle, this.publishDescription, effects.map(parseEffect))); this.dialog.set(null); this.tab.set('community'); await this.loadCommunity(); this.notice.set('Published a free marketplace listing.'); }); }
}
