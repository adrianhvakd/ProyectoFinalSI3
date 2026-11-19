import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideBadgeCheck,
  lucideBuilding2,
  lucideClipboardCheck,
  lucideLayers,
  lucideMapPin,
  lucidePackageCheck,
  lucideShieldCheck,
  lucideTruck,
} from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';

@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSeparatorImports,
  ],
  providers: [
    provideIcons({
      lucideBuilding2,
      lucideArrowRight,
      lucideShieldCheck,
      lucideLayers,
      lucideBadgeCheck,
      lucideMapPin,
      lucideClipboardCheck,
      lucidePackageCheck,
      lucideTruck,
    }),
  ],
  templateUrl: './landing.component.html',
})
export class LandingComponent {}
