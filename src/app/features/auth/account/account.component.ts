import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBriefcase,
  lucideMail,
  lucideMapPin,
  lucidePhone,
  lucideShieldCheck,
  lucideTruck,
  lucideUser,
} from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmBadgeImports, HlmCardImports, HlmSeparatorImports],
  providers: [
    provideIcons({
      lucideUser,
      lucideMail,
      lucideShieldCheck,
      lucideBriefcase,
      lucidePhone,
      lucideMapPin,
      lucideTruck,
    }),
  ],
  templateUrl: './account.component.html',
})
export class AccountComponent {
  readonly authService = inject(AuthService);
}
