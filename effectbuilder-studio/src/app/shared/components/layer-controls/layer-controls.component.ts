import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpInput } from 'ng-primitives/input';
import { EffectLayer, EffectMotion } from '../../../effects/effect-definition';
import { LayerControl, layerControls } from '../../../effects/layer-control-profile';
import { AuraSettings, parseAura } from '../../../effects/aura-settings';
@Component({selector:'lw-layer-controls',standalone:true,imports:[FormsModule,NgpInput],templateUrl:'./layer-controls.component.html',styleUrl:'./layer-controls.component.scss',changeDetection:ChangeDetectionStrategy.OnPush})
export class LayerControlsComponent {
 readonly layer=input.required<EffectLayer>();
 readonly changed=output<Partial<EffectLayer>>();
 readonly groups=computed(()=>{const controls=layerControls(this.layer());return [...new Set(controls.map(c=>c.group))].map(name=>({name,controls:controls.filter(c=>c.group===name)}));});
 value(c:LayerControl):number {const l=this.layer();return c.source==='motion'?l.motion[c.key as keyof EffectMotion]:c.source==='aura'?parseAura(l.aura,l.variant)[c.key as keyof AuraSettings]:Number(l[c.key as keyof EffectLayer]);}
 change(c:LayerControl,value:number):void {if(!Number.isFinite(value))return;const v=Math.max(c.min,Math.min(c.max,value)),l=this.layer();this.changed.emit(c.source==='motion'?{motion:{...l.motion,[c.key]:v}}:c.source==='aura'?{aura:parseAura({...parseAura(l.aura,l.variant),[c.key]:v},l.variant)}:{[c.key]:v});}
}
