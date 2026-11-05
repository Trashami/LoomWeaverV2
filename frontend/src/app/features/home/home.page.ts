import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CampaignAbilityScoreRule, CampaignPlayerMemberVm } from '../../core/models/loomweaver.models';
import { LwAlertifyService } from '../../core/services/lw-alertify.service';
import { AuthSessionService } from '../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { LwNotificationService } from '../../core/services/lw-notification.service';
import { CharacterSheetVm } from '../characters/models/character-studio.models';
import { CharacterStudioService } from '../characters/services/character-studio.service';
import { LwBadgeComponent, LwButtonComponent, LwPageHeaderComponent, LwPanelComponent } from '../../shared/ui/public-api';

export interface DashboardEncounterCardVm {
  readonly id: string;
  readonly title: string;
  readonly locationLabel: string;
  readonly difficultyLabel: string;
  readonly combatantsSummary: string;
  readonly statusLabel: string;
  readonly builderRoute: string;
  readonly vttRoute: string;
}

export interface DashboardQuestCardVm {
  readonly id: string;
  readonly title: string;
  readonly categoryLabel: string;
  readonly statusLabel: string;
  readonly summary: string;
  readonly routeLink: string;
}

const DEFAULT_CAMPAIGN_ENCOUNTERS: readonly DashboardEncounterCardVm[] = [
  {
    id: 'enc-plains-of-red-ambush',
    title: 'Ambush on the Plains of Red',
    locationLabel: 'The Plains of Red · Caravan Road',
    difficultyLabel: 'Hard · CR 6',
    combatantsSummary: '6 Cultist Raiders, 2 Dread Jackals, Caravan Wagons',
    statusLabel: 'Active / Ready',
    builderRoute: '/encounters',
    vttRoute: '/arcane-screen',
  },
  {
    id: 'enc-cinth-masquerade-court',
    title: 'Lord of Cinth Masquerade Ambush',
    locationLabel: 'Cinth · High Keep Ballroom',
    difficultyLabel: 'Deadly · CR 8',
    combatantsSummary: 'Vampire Court Thralls, Crimson Mist Stalkers, Noble Guests',
    statusLabel: 'Prepared',
    builderRoute: '/encounters',
    vttRoute: '/arcane-screen',
  },
  {
    id: 'enc-shadow-beneath-mountain',
    title: 'Runed Cavern Beneath the Southern Mountain',
    locationLabel: 'Southern Mountain · Containment Vault',
    difficultyLabel: 'Boss / Mythic · CR 11',
    combatantsSummary: 'Bound Elder Dragon, Runic Ward Pylons, Poisoned Fissures',
    statusLabel: 'Planned Finale',
    builderRoute: '/encounters',
    vttRoute: '/arcane-screen',
  },
];

const DEFAULT_CAMPAIGN_QUESTS: readonly DashboardQuestCardVm[] = [
  {
    id: 'quest-escort-cinth-caravan',
    title: 'The Road Across the Plains of Red',
    categoryLabel: 'Main Quest',
    statusLabel: 'In Progress',
    summary: 'Escort Decland wagons northeast toward Cinth while investigating the runic tremors beneath the southern mountain.',
    routeLink: '/campaigns',
  },
  {
    id: 'quest-cinth-artificers-accord',
    title: 'The Artificers Guild of Cinth',
    categoryLabel: 'Faction Quest',
    statusLabel: 'Active Thread',
    summary: 'Meet the non-magical engineers of Cinth building phosphor-bronze defenses that challenge the Council of Magic narrative.',
    routeLink: '/campaigns',
  },
  {
    id: 'quest-chokrah-priors-mystery',
    title: 'Whispers of Chokrah & The Priors',
    categoryLabel: 'Investigation',
    statusLabel: 'Open Clues',
    summary: 'Uncover why students taught by the Priors are told their magic ran out and how Chokrah shipments connect to the Lost Isles.',
    routeLink: '/campaigns',
  },
];

@Component({
  selector: 'lw-home-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    LwPanelComponent,
    LwPageHeaderComponent,
    LwBadgeComponent,
    LwButtonComponent,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly alertify = inject(LwAlertifyService);
  readonly auth = inject(AuthSessionService);
  readonly store = inject(LoomWeaverStoreService);
  readonly studio = inject(CharacterStudioService);
  readonly notifications = inject(LwNotificationService);

  readonly dashboard = computed(() => this.store.campaignDashboard());
  readonly isGm = computed(() => this.store.isGmForActiveCampaign() && this.store.viewerRole() === 'gm');
  readonly campaignCharacters = computed(() => this.studio.authorizedSheetsForActiveCampaign());
  readonly campaignPlayers = computed(() => this.store.activeCampaignPlayers());
  readonly abilityRule = computed(() => this.store.activeCampaignAbilityRule());
  readonly myMembership = computed(() => {
    const uname = (this.auth.activeProfile().username || '').toLowerCase();
    return this.campaignPlayers().find((p) => p.username.toLowerCase() === uname) ?? null;
  });
  readonly hasPendingInviteForActiveCampaign = computed(() => {
    if (this.isGm()) return false;
    const camp = this.store.activeCampaign();
    const myMember = this.myMembership();
    if (camp.myInviteStatus === 'pending' || myMember?.inviteStatus === 'pending') return true;
    if (myMember && !this.assignedCharacterForPlayer(myMember)) return true;
    return false;
  });

  openJoinAndSelectCharacterModal(): void {
    const camp = this.store.activeCampaign();
    this.notifications.openInviteJoinModal({
      campaignId: camp.id || 1,
      campaignName: camp.name || 'Shadow of the Mountain',
      systemLabel: camp.systemLabel || 'D&D 5e',
      dmName: 'Dungeon Master',
    });
  }

  readonly newPlayerUsername = signal<string>('');
  readonly newPlayerDisplayName = signal<string>('');
  readonly inviteCopied = signal<boolean>(false);

  readonly campaignSessions = computed(() => this.store.sessions());
  readonly campaignEncounters = signal<readonly DashboardEncounterCardVm[]>(DEFAULT_CAMPAIGN_ENCOUNTERS);

  readonly campaignQuests = computed<readonly DashboardQuestCardVm[]>(() => {
    const dashQuests = this.dashboard().activeQuests;
    if (dashQuests && dashQuests.length > 0) {
      return dashQuests.map((q) => ({
        id: q.id,
        title: q.title,
        categoryLabel: q.categoryBadge || 'Campaign Quest',
        statusLabel: 'Active',
        summary: q.summary,
        routeLink: q.routeLink || '/campaigns',
      }));
    }
    return DEFAULT_CAMPAIGN_QUESTS;
  });

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const joinCampaign = Number(params.get('joinCampaign') || '0');
      const invite = params.get('invite') || params.get('join') || '';
      if (invite || joinCampaign > 0) {
        const profile = this.auth.activeProfile();
        const joined = this.store.joinCampaignViaInviteLink(
          joinCampaign || this.store.activeCampaignId() || 1,
          invite,
          {
            accountId: profile.accountId,
            username: profile.username,
            displayName: profile.displayName,
            email: profile.email,
          },
        );
        this.alertify.notifyStatus(
          joined.displayName,
          'Joined Campaign via Invite Link',
          `${joined.displayName} (@${joined.username}) has joined ${this.store.activeCampaign().name}.`,
          'emerald',
        );
      }
    });
  }

  copyInviteUrl(): void {
    const url = this.store.activeCampaignInviteUrl();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(url);
      }
    } catch {}
    this.inviteCopied.set(true);
    setTimeout(() => this.inviteCopied.set(false), 2500);
    this.alertify.notifyStatus(
      this.store.activeCampaign().name,
      'Campaign Invite URL Copied',
      `Share ${url} with players so they can join ${this.store.activeCampaign().name}.`,
      'emerald',
    );
  }

  regenerateInviteUrl(): void {
    const nextUrl = this.store.generateNewInviteLink();
    this.alertify.notifyStatus(
      this.store.activeCampaign().name,
      'New Invite Link Generated',
      `Updated campaign invite URL: ${nextUrl}`,
      'gold',
    );
  }

  addPlayerViaDashboard(): void {
    const username = this.newPlayerUsername().trim();
    if (!username) return;
    const displayName = this.newPlayerDisplayName().trim() || username;
    const added = this.store.addPlayerToActiveCampaign({
      username,
      displayName,
      joinedViaInvite: true,
    });
    this.newPlayerUsername.set('');
    this.newPlayerDisplayName.set('');
    this.alertify.notifyStatus(
      added.displayName,
      'Player Added to Campaign',
      `${added.displayName} (@${added.username}) joined the campaign roster and can now be assigned a character.`,
      'emerald',
    );
  }

  removePlayerFromCampaign(player: CampaignPlayerMemberVm): void {
    this.store.removePlayerFromActiveCampaign(player.accountId);
    this.alertify.notifyStatus(
      player.displayName,
      'Player Removed',
      `${player.displayName} (@${player.username}) was removed from the campaign roster.`,
      'gold',
    );
  }

  setAbilityScoreRule(rule: CampaignAbilityScoreRule): void {
    this.store.setCampaignAbilityScoreRule(rule);
    this.alertify.notifyStatus(
      this.store.activeCampaign().name,
      'Campaign Rule Updated',
      rule === 'roll_stats'
        ? 'Ability Score Rule set to Dice Rolls (4d6 Drop Lowest · 1 Reroll Allowed, Keep Full Set).'
        : 'Ability Score Rule set to Point Buy (27 Points).',
      'emerald',
    );
  }

  onAssignCharacterToPlayer(sheet: CharacterSheetVm, selectedUsername: string): void {
    if (!selectedUsername) {
      this.studio.assignCharacterToPlayer(sheet.characterKey, '', '', 'Unassigned (GM Pool)');
      return;
    }
    const player = this.campaignPlayers().find(
      (p) => p.username.toLowerCase() === selectedUsername.toLowerCase() || p.accountId === selectedUsername,
    );
    if (!player) return;
    this.studio.assignCharacterToPlayer(sheet.characterKey, player.accountId, player.username, player.displayName);
  }

  removeCharacterFromCampaign(sheet: CharacterSheetVm): void {
    this.studio.removeCharacterFromCampaign(sheet.characterKey);
  }

  createCharacterAndAssign(player?: CampaignPlayerMemberVm): void {
    const allowed = this.studio.startNewCharacterCreation(
      player ? { accountId: player.accountId, username: player.username, displayName: player.displayName } : undefined,
    );
    if (allowed) {
      void this.router.navigate(['/characters'], {
        queryParams: {
          mode: 'creator',
          assignPlayer: player?.username || undefined,
        },
      });
    }
  }

  openCharacterSheet(sheet: CharacterSheetVm): void {
    this.studio.selectCharacter(sheet.characterKey, true);
    void this.router.navigate(['/characters'], { queryParams: { focus: sheet.characterKey } });
  }

  openCharacterStats(sheet: CharacterSheetVm): void {
    this.studio.selectCharacter(sheet.characterKey, true);
    void this.router.navigate(['/statistics'], { queryParams: { character: sheet.characterKey } });
  }

  editCharacterInWizard(sheet: CharacterSheetVm): void {
    this.studio.openCreatorWizard(sheet);
    void this.router.navigate(['/characters'], { queryParams: { focus: sheet.characterKey } });
  }

  assignedCharacterForPlayer(player: CampaignPlayerMemberVm): CharacterSheetVm | undefined {
    const ak = player.assignedCharacterKey || '';
    const altKey = ak.startsWith('char-') ? ak.replace(/^char-/, 'pc-') : ak.replace(/^pc-/, 'char-');
    return this.studio.campaignSheets().find(
      (c) =>
        c.ownerAccountId === player.accountId ||
        (c.ownerUsername && c.ownerUsername.toLowerCase() === player.username.toLowerCase()) ||
        (ak.length > 0 && (c.characterKey === ak || c.characterKey === altKey)),
    );
  }
}
