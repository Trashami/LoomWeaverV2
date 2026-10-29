import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { NgpInput } from 'ng-primitives/input';
import { NgpTabButton, NgpTabList, NgpTabset } from 'ng-primitives/tabs';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import { LwIconComponent } from '../icon/icon.component';

@Component({
  selector: 'lw-auth-modal',
  standalone: true,
  imports: [
    FormsModule,
    NgpButton,
    NgpInput,
    NgpTabset,
    NgpTabList,
    NgpTabButton,
    LwBadgeComponent,
    LwButtonComponent,
    LwIconComponent,
  ],
  templateUrl: './auth-modal.component.html',
  styleUrl: './auth-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwAuthModalComponent {
  readonly auth = inject(AuthSessionService);

  readonly loginIdentifier = signal<string>('');
  readonly loginPassword = signal<string>('');

  readonly registerEmail = signal<string>('');
  readonly registerUsername = signal<string>('');
  readonly registerDisplayName = signal<string>('');
  readonly registerPassword = signal<string>('');

  readonly reqEmail = signal<string>('');
  readonly reqUsername = signal<string>('');
  readonly reqDisplayName = signal<string>('');
  readonly reqNotes = signal<string>('');

  constructor() {
    effect(() => {
      const open = this.auth.authModalOpen();
      const tab = this.auth.authModalTab();
      if (open && tab === 'login') {
        setTimeout(() => this.auth.initGoogleButton('lw-google-btn-container'), 60);
      }
    });
  }

  selectTab(tab: 'login' | 'register' | 'request'): void {
    this.auth.authModalTab.set(tab);
    this.auth.authError.set('');
    this.auth.authNotice.set('');
  }

  submitLogin(): void {
    this.auth.loginWithCredentials(this.loginIdentifier(), this.loginPassword());
  }

  submitRegister(): void {
    this.auth.registerAccount(
      this.registerEmail(),
      this.registerUsername(),
      this.registerDisplayName(),
      this.registerPassword(),
    );
  }

  submitAccessRequest(): void {
    this.auth.requestAccountAccess(
      this.reqEmail(),
      this.reqUsername(),
      this.reqDisplayName(),
      this.reqNotes(),
    );
  }
}
