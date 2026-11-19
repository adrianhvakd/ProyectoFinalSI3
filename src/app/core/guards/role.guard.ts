import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RolUsuario } from '../models/domain.models';
import { AuthService } from '../services/auth.service';

export function roleGuard(allowedRoles: readonly RolUsuario[]): CanActivateFn {
  return async () => {
    const platformId = inject(PLATFORM_ID);
    if (!isPlatformBrowser(platformId)) {
      return true;
    }

    const authService = inject(AuthService);
    const router = inject(Router);

    const user = await authService.ensureSessionLoaded();
    if (!user) {
      return router.parseUrl('/login');
    }

    if (allowedRoles.includes(user.rol)) {
      return true;
    }

    return router.parseUrl(authService.getDefaultRouteForRole(user.rol));
  };
}
