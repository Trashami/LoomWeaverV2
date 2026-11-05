import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import { LwNotificationService } from '../../../core/services/lw-notification.service';
import { CharacterSheetVm } from '../../../features/characters/models/character-studio.models';
import { CharacterStudioService } from '../../../features/characters/services/character-studio.service';

@Component({
  selector: 'lw-campaign-invite-modal',
  standalone: true,
  imports: [NgpButton],
  template: `
    @if (notifications.pendingInviteModal(); as modal) {
      <div class="lw-invite-modal-backdrop" role="dialog" aria-modal="true" aria-label="Campaign Invitation">
        <div class="lw-invite-modal">
          <header class="lw-invite-modal__head">
            <div>
              <span class="lw-invite-modal__kicker">CAMPAIGN INVITATION · {{ modal.systemLabel }}</span>
              <h2 class="lw-invite-modal__title">Join {{ modal.campaignName }}</h2>
              <p class="lw-invite-modal__sub">
                Invited by <strong>{{ modal.dmName }}</strong>. Select one of your characters to join this campaign or create a new character for the party.
              </p>
            </div>
            <button ngpButton type="button" class="lw-invite-modal__close" (click)="notifications.dismissInviteJoinModal()">
              Later
            </button>
          </header>

          <div class="lw-invite-modal__body">
            <div class="lw-invite-modal__section-head">
              <span>SELECT A CHARACTER TO BRING INTO {{ modal.campaignName.toUpperCase() }}</span>
              <span class="lw-invite-modal__rule-pill">
                ABILITY RULE: {{ store.activeCampaignAbilityRule() === 'roll_stats' ? 'DICE ROLLS (4D6 DROP LOWEST)' : 'POINT BUY (27 PTS)' }}
              </span>
            </div>

            <div class="lw-invite-modal__char-grid">
              @for (sheet of selectableCharacters(); track sheet.characterKey) {
                <button
                  type="button"
                  class="lw-invite-char-card"
                  [class.lw-invite-char-card--selected]="selectedKey() === sheet.characterKey"
                  (click)="selectedKey.set(sheet.characterKey)"
                >
                  <img
                    [src]="sheet.portraitUrl || '/assets/5e-tools/races/PHB/Human.webp'"
                    [alt]="sheet.name"
                    class="lw-invite-char-card__avatar"
                  />
                  <div class="lw-invite-char-card__info">
                    <div class="lw-invite-char-card__top">
                      <strong>{{ sheet.name }}</strong>
                      <span class="lw-invite-char-card__lvl">LV.{{ sheet.level }}</span>
                    </div>
                    <span class="lw-invite-char-card__meta">{{ sheet.ancestryOrClan }} · {{ sheet.classOrArchetype }}</span>
                    <span class="lw-invite-char-card__stats">HP {{ sheet.currentHp }}/{{ sheet.maxHp }} · AC {{ sheet.armorClass }}</span>
                  </div>
                </button>
              }
            </div>
          </div>

          <footer class="lw-invite-modal__foot">
            <button
              ngpButton
              type="button"
              class="lw-invite-modal__btn lw-invite-modal__btn--secondary"
              (click)="createNewCharacterForCampaign(modal.campaignId)"
            >
              + Create New Character for Campaign
            </button>
            <button
              ngpButton
              type="button"
              class="lw-invite-modal__btn lw-invite-modal__btn--primary"
              [disabled]="!selectedSheet()"
              (click)="confirmJoinWithSelectedCharacter(modal.campaignId)"
            >
              Join Campaign with {{ selectedSheet()?.name || 'Selected Character' }}
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    .lw-invite-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 320;
      background: rgba(2, 7, 5, 0.82);
      backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
    }
    .lw-invite-modal {
      width: 100%;
      max-width: 680px;
      background: linear-gradient(180deg, #0b1914 0%, #060e0b 100%);
      border: 1px solid rgba(217, 183, 122, 0.48);
      border-radius: 12px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.88), 0 0 28px rgba(46, 230, 107, 0.18);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .lw-invite-modal__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.15rem 1.35rem;
      background: rgba(4, 11, 8, 0.94);
      border-bottom: 1px solid rgba(217, 183, 122, 0.22);
    }
    .lw-invite-modal__kicker {
      display: block;
      font-size: 0.65rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #49e892;
    }
    .lw-invite-modal__title {
      margin: 0.2rem 0 0.3rem;
      font-family: var(--lw-font-display, Georgia, serif);
      font-size: 1.35rem;
      color: #f4e8cd;
    }
    .lw-invite-modal__sub {
      margin: 0;
      font-size: 0.8rem;
      color: #b7cbc0;
      line-height: 1.4;
    }
    .lw-invite-modal__close {
      padding: 0.35rem 0.7rem;
      border-radius: 6px;
      border: 1px solid rgba(217, 183, 122, 0.28);
      background: rgba(14, 28, 22, 0.85);
      color: #c5d4cd;
      font-size: 0.74rem;
      cursor: pointer;
    }
    .lw-invite-modal__body {
      padding: 1.1rem 1.35rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .lw-invite-modal__section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.5rem;
      font-size: 0.66rem;
      font-weight: 700;
      letter-spacing: 0.07em;
      color: #d9b77a;
    }
    .lw-invite-modal__rule-pill {
      padding: 0.16rem 0.52rem;
      border-radius: 999px;
      border: 1px solid rgba(73, 232, 146, 0.36);
      background: rgba(46, 230, 107, 0.12);
      color: #49e892;
      font-size: 0.62rem;
    }
    .lw-invite-modal__char-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 0.6rem;
      max-height: 290px;
      overflow-y: auto;
    }
    .lw-invite-char-card {
      appearance: none;
      -webkit-appearance: none;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.68rem 0.8rem;
      border-radius: 8px;
      border: 1px solid rgba(217, 183, 122, 0.22);
      background: rgba(11, 24, 19, 0.86);
      color: #f4e8cd;
      text-align: left;
      cursor: pointer;
      transition: all 130ms ease;
    }
    .lw-invite-char-card:hover {
      border-color: rgba(73, 232, 146, 0.5);
      background: rgba(18, 42, 31, 0.92);
    }
    .lw-invite-char-card--selected {
      border-color: #2ee66b;
      background: rgba(46, 230, 107, 0.16);
      box-shadow: 0 0 14px rgba(46, 230, 107, 0.22);
    }
    .lw-invite-char-card__avatar {
      width: 46px;
      height: 46px;
      border-radius: 7px;
      object-fit: cover;
      border: 1px solid rgba(217, 183, 122, 0.45);
      flex-shrink: 0;
    }
    .lw-invite-char-card__info {
      display: flex;
      flex-direction: column;
      gap: 0.14rem;
      min-width: 0;
      flex: 1;
    }
    .lw-invite-char-card__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
    }
    .lw-invite-char-card__top strong {
      font-size: 0.86rem;
      color: #f4e8cd;
    }
    .lw-invite-char-card__lvl {
      font-size: 0.64rem;
      font-weight: 800;
      padding: 0.1rem 0.38rem;
      border-radius: 4px;
      background: rgba(217, 183, 122, 0.2);
      color: #e9cf99;
    }
    .lw-invite-char-card__meta {
      font-size: 0.72rem;
      color: #a9beb4;
    }
    .lw-invite-char-card__stats {
      font-size: 0.68rem;
      color: #49e892;
      font-weight: 600;
    }
    .lw-invite-modal__foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.65rem;
      padding: 0.95rem 1.35rem;
      background: rgba(4, 11, 8, 0.94);
      border-top: 1px solid rgba(217, 183, 122, 0.2);
    }
    .lw-invite-modal__btn {
      padding: 0.55rem 1rem;
      border-radius: 7px;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
    }
    .lw-invite-modal__btn--secondary {
      border: 1px solid rgba(217, 183, 122, 0.38);
      background: rgba(16, 34, 26, 0.9);
      color: #f3e7cb;
    }
    .lw-invite-modal__btn--primary {
      border: 1px solid #2ee66b;
      background: linear-gradient(135deg, #2ee66b, #1aa34a);
      color: #04150c;
    }
    .lw-invite-modal__btn--primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwCampaignInviteModalComponent {
  readonly notifications = inject(LwNotificationService);
  readonly store = inject(LoomWeaverStoreService);
  private readonly charStudio = inject(CharacterStudioService);
  private readonly auth = inject(AuthSessionService);
  private readonly alertify = inject(LwAlertifyService);
  private readonly router = inject(Router);

  readonly selectedKey = signal<string>('');

  readonly selectableCharacters = computed<readonly CharacterSheetVm[]>(() => {
    const owned = this.charStudio.userOwnedSheets();
    const all = this.charStudio.campaignSheets();
    const list = owned.length > 0 ? [...owned, ...all.filter((a) => !owned.some((o) => o.characterKey === a.characterKey))] : all;
    return list;
  });

  readonly selectedSheet = computed<CharacterSheetVm | null>(() => {
    const list = this.selectableCharacters();
    const key = this.selectedKey();
    return list.find((s) => s.characterKey === key) ?? list[0] ?? null;
  });

  confirmJoinWithSelectedCharacter(campaignId: number): void {
    const sheet = this.selectedSheet();
    if (!sheet) return;
    const profile = this.auth.activeProfile();
    this.store.setCampaign(campaignId);
    this.charStudio.assignCharacterToPlayer(
      sheet.characterKey,
      profile.accountId,
      profile.username,
      profile.displayName || profile.username,
    );
    this.store.acceptCampaignInviteWithCharacter({
      campaignId,
      characterKey: sheet.characterKey,
      characterName: sheet.name,
      playerUsername: profile.username,
      playerDisplayName: profile.displayName || profile.username,
    });
    this.alertify.notifyStatus(
      this.store.activeCampaign().name,
      'Joined Campaign',
      `You joined ${this.store.activeCampaign().name} playing ${sheet.name}.`,
      'emerald',
    );
  }

  createNewCharacterForCampaign(campaignId: number): void {
    const profile = this.auth.activeProfile();
    this.store.setCampaign(campaignId);
    this.notifications.dismissInviteJoinModal();
    this.charStudio.openCreatorWizard(undefined, {
      accountId: profile.accountId,
      username: profile.username,
      displayName: profile.displayName || profile.username,
    });
    void this.router.navigate(['/characters'], {
      queryParams: { mode: 'create', joinCampaign: campaignId },
    });
  }
}
