import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwButtonComponent } from '../../../../shared/ui/public-api';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import { VttCombatWorkflowService } from '../../services/vtt-combat-workflow.service';

@Component({
  selector: 'lw-vtt-combat-order-modal',
  standalone: true,
  imports: [NgpButton, LwButtonComponent, LwIconComponent],
  template: `
    @if (workflow.state(); as s) {
      @if (s.phase !== 'rolling-attack' && s.phase !== 'rolling-damage') {
        <div class="lw-combat-modal-backdrop" role="dialog" aria-modal="true" aria-label="D&D 5e Combat Resolution">
          <div class="lw-combat-modal" (click)="$event.stopPropagation()">
            <header class="lw-combat-modal__head">
              <div class="lw-combat-modal__title-wrap">
                <span class="lw-combat-modal__badge">D&amp;D 5E ORDER OF OPERATIONS</span>
                <h4>{{ s.ability.name }}</h4>
                <small>{{ s.attacker.name }} &middot; {{ s.ability.category }} &middot; {{ s.ability.actionCost }} &middot; Range {{ s.ability.rangeFeet }}ft</small>
              </div>
              <button ngpButton type="button" class="lw-combat-modal__close" (click)="workflow.cancelWorkflow()" title="Cancel [Esc]">
                <lw-icon name="close" [size]="15" />
              </button>
            </header>

            <div class="lw-combat-modal__steps">
              <span class="step-pill" [class.active]="s.phase === 'declare-attack'">1. Declare &amp; Roll Mode</span>
              <span class="step-arrow">&rarr;</span>
              <span class="step-pill" [class.active]="s.phase === 'reaction-or-save'">2. Reactions &amp; Saves</span>
              <span class="step-arrow">&rarr;</span>
              <span class="step-pill" [class.active]="s.phase === 'attack-outcome'">3. Hit / Miss &amp; Damage</span>
            </div>

            @if (s.phase === 'declare-attack') {
              <div class="lw-combat-modal__body">
                <p class="lw-combat-modal__desc">{{ s.ability.executeThen }}</p>

                <div class="lw-combat-modal__section">
                  <span class="section-label">SELECTED TARGETS ({{ s.targets.length }})</span>
                  <div class="target-chips">
                    @for (t of s.targets; track t.key) {
                      <div class="target-chip">
                        <strong>{{ t.name }}</strong>
                        <span>AC {{ t.armorClass }} &middot; HP {{ t.currentHp }}/{{ t.maxHp }}</span>
                      </div>
                    }
                  </div>
                </div>

                <div class="lw-combat-modal__section">
                  <span class="section-label">SELECT D20 ROLL MODIFIER (ADVANTAGE / DISADVANTAGE)</span>
                  <div class="adv-row">
                    <button
                      ngpButton
                      type="button"
                      class="adv-btn"
                      [class.active]="s.advantageMode === 'advantage'"
                      (click)="workflow.setAdvantageMode('advantage')"
                    >
                      Advantage (2d20kh1)
                    </button>
                    <button
                      ngpButton
                      type="button"
                      class="adv-btn"
                      [class.active]="s.advantageMode === 'normal'"
                      (click)="workflow.setAdvantageMode('normal')"
                    >
                      Normal (1d20)
                    </button>
                    <button
                      ngpButton
                      type="button"
                      class="adv-btn"
                      [class.active]="s.advantageMode === 'disadvantage'"
                      (click)="workflow.setAdvantageMode('disadvantage')"
                    >
                      Disadvantage (2d20kl1)
                    </button>
                  </div>
                </div>

                <div class="lw-combat-modal__meta">
                  <span>Attack Bonus: <strong>+{{ s.ability.attackBonus }}</strong></span>
                  @if (s.ability.saveDc > 0) {
                    <span>Save DC: <strong>{{ s.ability.saveDc }} ({{ s.saveAbilityLabel }})</strong></span>
                  }
                  <span>Damage: <strong>{{ s.ability.damageFormula }}</strong></span>
                </div>

                <footer class="lw-combat-modal__foot">
                  <lw-button variant="ghost" size="sm" (pressed)="workflow.cancelWorkflow()">Cancel</lw-button>
                  <lw-button variant="gold" size="sm" (pressed)="workflow.confirmAttackOrCastDeclaration()">
                    {{ s.ability.turnCategory === 'spell' ? 'Cast ' + s.ability.name : 'Attack with ' + s.ability.name }}
                  </lw-button>
                </footer>
              </div>
            }

            @if (s.phase === 'reaction-or-save') {
              <div class="lw-combat-modal__body">
                @if (s.qualifyingReactions.length > 0) {
                  <div class="lw-combat-modal__section">
                    <span class="section-label">QUALIFYING DEFENDER REACTION TRIGGERED</span>
                    <p class="lw-combat-modal__desc">
                      A targeted combatant has an available D&amp;D 5e Reaction that can respond to <strong>{{ s.ability.name }}</strong>:
                    </p>
                    <div class="reaction-list">
                      @for (rx of s.qualifyingReactions; track rx.id) {
                        <button
                          ngpButton
                          type="button"
                          class="reaction-card"
                          (click)="workflow.resolveReactionOrSaveStep(rx.id)"
                        >
                          <div class="reaction-card__head">
                            <strong>{{ rx.defenderName }}: Use {{ rx.name }}</strong>
                            <span class="reaction-tag">1 Reaction</span>
                          </div>
                          <p>{{ rx.summary }}</p>
                        </button>
                      }
                    </div>
                  </div>
                }

                @if (s.requiresSave) {
                  <div class="lw-combat-modal__section">
                    <span class="section-label">SAVING THROW REQUIRED</span>
                    <p class="lw-combat-modal__desc">
                      Targets in the area of effect must roll a <strong>DC {{ s.ability.saveDc }} {{ s.saveAbilityLabel }} Saving Throw</strong>.
                    </p>
                  </div>
                }

                <footer class="lw-combat-modal__foot">
                  <lw-button variant="ghost" size="sm" (pressed)="workflow.cancelWorkflow()">Cancel</lw-button>
                  <lw-button variant="primary" size="sm" (pressed)="workflow.resolveReactionOrSaveStep(null)">
                    {{ s.requiresSave ? 'Roll Saving Throw (d20)' : 'Pass Reaction & Roll Attack' }}
                  </lw-button>
                </footer>
              </div>
            }

            @if (s.phase === 'attack-outcome') {
              <div class="lw-combat-modal__body">
                <div class="outcome-banner" [class.outcome-banner--hit]="s.canRollDamage" [class.outcome-banner--miss]="!s.canRollDamage">
                  <strong>{{ s.attackRollSummary }}</strong>
                </div>

                <div class="lw-combat-modal__section">
                  <span class="section-label">TARGET RESOLUTION BREAKDOWN</span>
                  <div class="outcome-list">
                    @for (out of s.targetOutcomes; track out.target.key) {
                      <div class="outcome-row" [class.hit]="out.hit || out.savedHalf">
                        <div class="outcome-row__left">
                          <strong>{{ out.target.name }}</strong>
                          <span>
                            @if (s.requiresSave) {
                              d20 ({{ out.rawD20 }}) + {{ out.saveBonus }} = {{ out.totalRoll }} vs DC {{ out.saveDc }}
                            } @else {
                              d20 ({{ out.rawD20 }}) + {{ s.ability.attackBonus }} = {{ out.totalRoll }} vs AC {{ out.effectiveAc }}
                            }
                            @if (out.reactionAppliedLabel) {
                              &middot; {{ out.reactionAppliedLabel }}
                            }
                          </span>
                        </div>
                        <span class="outcome-pill" [class.crit]="out.isCritical" [class.hit]="out.hit || out.savedHalf">
                          {{ out.isCritical ? 'CRITICAL HIT' : out.hit ? (s.requiresSave ? 'FAILED SAVE' : 'HIT') : out.savedHalf ? 'SAVED (HALF)' : 'MISS' }}
                        </span>
                      </div>
                    }
                  </div>
                </div>

                <footer class="lw-combat-modal__foot">
                  <lw-button variant="ghost" size="sm" (pressed)="workflow.cancelWorkflow()">Cancel</lw-button>
                  @if (s.canRollDamage) {
                    <lw-button variant="gold" size="sm" (pressed)="workflow.rollDamageAndComplete()">
                      Roll Damage ({{ s.ability.damageFormula }})
                    </lw-button>
                  } @else {
                    <lw-button variant="primary" size="sm" (pressed)="workflow.rollDamageAndComplete()">
                      Complete Action
                    </lw-button>
                  }
                </footer>
              </div>
            }
          </div>
        </div>
      }
    }
  `,
  styles: [
    `
      .lw-combat-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 2400;
        background: rgba(3, 8, 6, 0.72);
        backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .lw-combat-modal {
        width: min(540px, 94vw);
        background: linear-gradient(180deg, rgba(10, 22, 17, 0.98), rgba(6, 14, 11, 0.99));
        border: 1px solid rgba(73, 232, 146, 0.32);
        border-radius: 14px;
        box-shadow: 0 22px 60px rgba(0, 0, 0, 0.78), 0 0 28px rgba(46, 230, 107, 0.12);
        color: #e6f2ec;
        overflow: hidden;
      }
      .lw-combat-modal__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: 16px 18px 12px;
        border-bottom: 1px solid rgba(73, 232, 146, 0.14);
      }
      .lw-combat-modal__badge {
        display: inline-block;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: #49e892;
        margin-bottom: 3px;
      }
      .lw-combat-modal__title-wrap h4 {
        margin: 0 0 2px;
        font-size: 18px;
        font-weight: 700;
        color: #f3faf6;
      }
      .lw-combat-modal__title-wrap small {
        color: #9ab3a6;
        font-size: 12px;
      }
      .lw-combat-modal__close {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #b7ccc1;
        border-radius: 8px;
        padding: 5px;
        cursor: pointer;
      }
      .lw-combat-modal__steps {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 18px;
        background: rgba(4, 10, 8, 0.65);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 11px;
        color: #7d9689;
      }
      .step-pill.active {
        color: #d9b77a;
        font-weight: 700;
      }
      .lw-combat-modal__body {
        padding: 16px 18px 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .lw-combat-modal__desc {
        margin: 0;
        font-size: 13px;
        color: #bfd1c7;
        line-height: 1.45;
      }
      .lw-combat-modal__section {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .section-label {
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.07em;
        color: #8eb09f;
      }
      .target-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .target-chip {
        display: flex;
        flex-direction: column;
        padding: 6px 10px;
        border-radius: 8px;
        background: rgba(153, 27, 27, 0.18);
        border: 1px solid rgba(239, 68, 68, 0.45);
        font-size: 12px;
      }
      .target-chip span {
        font-size: 11px;
        color: #cbd5e1;
      }
      .adv-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      .adv-btn {
        padding: 9px 10px;
        border-radius: 8px;
        background: rgba(15, 31, 24, 0.8);
        border: 1px solid rgba(73, 232, 146, 0.2);
        color: #c7dcd1;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .adv-btn.active {
        background: rgba(46, 230, 107, 0.18);
        border-color: #2ee66b;
        color: #ffffff;
        box-shadow: 0 0 12px rgba(46, 230, 107, 0.24);
      }
      .lw-combat-modal__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        padding: 9px 12px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.03);
        font-size: 12px;
        color: #a9c2b5;
      }
      .lw-combat-modal__meta strong {
        color: #e6f2ec;
      }
      .reaction-list,
      .outcome-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .reaction-card {
        text-align: left;
        padding: 10px 12px;
        border-radius: 9px;
        background: rgba(217, 183, 122, 0.1);
        border: 1px solid rgba(217, 183, 122, 0.4);
        color: #f3faf6;
        cursor: pointer;
      }
      .reaction-card__head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .reaction-tag {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(217, 183, 122, 0.22);
        color: #f3d79b;
      }
      .reaction-card p {
        margin: 0;
        font-size: 12px;
        color: #cbd5e1;
      }
      .outcome-banner {
        padding: 11px 14px;
        border-radius: 9px;
        font-size: 14px;
        text-align: center;
      }
      .outcome-banner--hit {
        background: rgba(46, 230, 107, 0.15);
        border: 1px solid rgba(46, 230, 107, 0.45);
        color: #86efac;
      }
      .outcome-banner--miss {
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.45);
        color: #fca5a5;
      }
      .outcome-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 11px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .outcome-row__left {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .outcome-row__left span {
        font-size: 11.5px;
        color: #9ab3a6;
      }
      .outcome-pill {
        font-size: 11px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 5px;
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
      }
      .outcome-pill.hit {
        background: rgba(46, 230, 107, 0.2);
        color: #86efac;
      }
      .outcome-pill.crit {
        background: rgba(217, 183, 122, 0.28);
        color: #fde68a;
      }
      .lw-combat-modal__foot {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding-top: 6px;
        border-top: 1px solid rgba(255, 255, 255, 0.07);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttCombatOrderModalComponent {
  readonly workflow = inject(VttCombatWorkflowService);
}
