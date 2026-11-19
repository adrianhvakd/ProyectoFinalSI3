import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeCheck,
  lucideBarChart3,
  lucideBriefcase,
  lucideBuilding2,
  lucideClipboardList,
  lucideFileBarChart2,
  lucideLogOut,
  lucideMenu,
  lucideNavigation,
  lucidePackage,
  lucidePackageCheck,
  lucidePackagePlus,
  lucideRoute,
  lucideShieldCheck,
  lucideShoppingCart,
  lucideTruck,
  lucideUserCheck,
  lucideUsers,
  lucideWarehouse,
} from '@ng-icons/lucide';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { NAVIGATION_ITEMS, NavItem } from '../../core/models/navigation.models';
import { AuthService } from '../../core/services/auth.service';

interface NavSectionGroup {
  section: string;
  items: NavItem[];
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmAlertDialogImports,
    HlmAvatarImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmSeparatorImports,
    HlmSheetImports,
  ],
  providers: [
    provideIcons({
      lucidePackage,
      lucideBuilding2,
      lucideUsers,
      lucideBriefcase,
      lucideBarChart3,
      lucideFileBarChart2,
      lucideWarehouse,
      lucidePackagePlus,
      lucideShieldCheck,
      lucideBadgeCheck,
      lucideShoppingCart,
      lucideClipboardList,
      lucidePackageCheck,
      lucideRoute,
      lucideTruck,
      lucideNavigation,
      lucideUserCheck,
      lucideMenu,
      lucideLogOut,
    }),
  ],
  templateUrl: './app-shell.component.html',
})
export class AppShellComponent {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly mobileMenuOpen = signal(false);
  readonly logoutConfirmOpen = signal(false);
  readonly loggingOut = signal(false);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly navSections = computed<NavSectionGroup[]>(() => {
    const role = this.authService.role();
    if (!role) {
      return [];
    }

    const visibleItems = NAVIGATION_ITEMS.filter((item) => item.roles.includes(role));
    const groups = new Map<string, NavItem[]>();

    for (const item of visibleItems) {
      const list = groups.get(item.section);
      if (list) {
        list.push(item);
      } else {
        groups.set(item.section, [item]);
      }
    }

    return Array.from(groups.entries()).map(([section, items]) => ({ section, items }));
  });

  readonly activePageTitle = computed(() => {
    const url = this.currentUrl();
    const match = NAVIGATION_ITEMS.find((item) => item.route && url.startsWith(item.route));
    return match?.label ?? 'Panel Operativo';
  });

  readonly userInitials = computed(() => {
    const name = this.authService.user()?.nombre_completo?.trim() ?? '';
    if (!name) {
      return 'US';
    }
    const parts = name.split(/\s+/);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  });

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  requestLogout(): void {
    this.logoutConfirmOpen.set(true);
  }

  cancelLogout(): void {
    if (!this.loggingOut()) {
      this.logoutConfirmOpen.set(false);
    }
  }

  async confirmLogout(): Promise<void> {
    this.loggingOut.set(true);
    try {
      await this.authService.signOut();
      this.logoutConfirmOpen.set(false);
    } finally {
      this.loggingOut.set(false);
    }
  }
}
