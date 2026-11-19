import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { AuthService } from './core/services/auth.service';

const roleRedirectGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = await authService.ensureSessionLoaded();
  if (!user) {
    return router.parseUrl('/login');
  }
  return router.parseUrl(authService.getDefaultRouteForRole(user.rol));
};

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shared/layout/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      {
        path: 'catalog',
        canActivate: [roleGuard(['Administrador'])],
        loadComponent: () =>
          import('./features/catalog/pages/raw-materials/raw-materials.component').then(
            (m) => m.RawMaterialsComponent,
          ),
      },
      {
        path: 'providers',
        canActivate: [roleGuard(['Administrador'])],
        loadComponent: () =>
          import('./features/providers/pages/providers/providers.component').then(
            (m) => m.ProvidersComponent,
          ),
      },
      {
        path: 'users',
        canActivate: [roleGuard(['Administrador'])],
        loadComponent: () =>
          import('./features/users/pages/users-management/users-management.component').then(
            (m) => m.UsersManagementComponent,
          ),
      },
      {
        path: 'clients',
        canActivate: [roleGuard(['Administrador'])],
        loadComponent: () =>
          import('./features/users/pages/client-companies/client-companies.component').then(
            (m) => m.ClientCompaniesComponent,
          ),
      },
      {
        path: 'warehouse/inventory',
        canActivate: [roleGuard(['Encargado de Almacén'])],
        loadComponent: () =>
          import('./features/warehouse/pages/inventory/inventory.component').then(
            (m) => m.InventoryComponent,
          ),
      },
      {
        path: 'warehouse/reception',
        canActivate: [roleGuard(['Encargado de Almacén'])],
        loadComponent: () =>
          import('./features/warehouse/pages/lot-reception/lot-reception.component').then(
            (m) => m.LotReceptionComponent,
          ),
      },
      {
        path: 'warehouse/quality-control',
        canActivate: [roleGuard(['Encargado de Almacén'])],
        loadComponent: () =>
          import('./features/warehouse/pages/quality-control/quality-control.component').then(
            (m) => m.QualityControlComponent,
          ),
      },
      {
        path: 'orders/catalog',
        canActivate: [roleGuard(['Empresa Cliente'])],
        loadComponent: () =>
          import('./features/orders/pages/wholesale-catalog/wholesale-catalog.component').then(
            (m) => m.WholesaleCatalogComponent,
          ),
      },
      {
        path: 'orders/my-orders',
        canActivate: [roleGuard(['Empresa Cliente'])],
        loadComponent: () =>
          import('./features/orders/pages/my-orders/my-orders.component').then(
            (m) => m.MyOrdersComponent,
          ),
      },
      {
        path: 'sales/payments',
        canActivate: [roleGuard(['Encargado de Ventas y Caja'])],
        loadComponent: () =>
          import('./features/sales/pages/payment-verification/payment-verification.component').then(
            (m) => m.PaymentVerificationComponent,
          ),
      },
      {
        path: 'account',
        loadComponent: () =>
          import('./features/auth/account/account.component').then((m) => m.AccountComponent),
      },
      {
        path: '',
        pathMatch: 'full',
        canActivate: [roleRedirectGuard],
        children: [],
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
