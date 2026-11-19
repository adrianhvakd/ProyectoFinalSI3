import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const authService = inject(AuthService);
  const router = inject(Router);

  const user = await authService.ensureSessionLoaded();
  if (user) {
    return true;
  }

  return router.parseUrl('/login');
};

export const guestGuard: CanActivateFn = async () => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const authService = inject(AuthService);
  const router = inject(Router);

  const user = await authService.ensureSessionLoaded();
  if (!user) {
    return true;
  }

  return router.parseUrl(authService.getDefaultRouteForRole(user.rol));
};
