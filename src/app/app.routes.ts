import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/public/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
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
        redirectTo: 'warehouse/inventory',
        pathMatch: 'full',
      },
      {
        path: 'warehouse/quality-control',
        redirectTo: 'warehouse/inventory',
        pathMatch: 'full',
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
        path: 'reports',
        canActivate: [
          roleGuard(['Administrador', 'Encargado de Almacén', 'Encargado de Ventas y Caja']),
        ],
        loadComponent: () =>
          import('./features/reports/pages/reports-center/reports-center.component').then(
            (m) => m.ReportsCenterComponent,
          ),
      },
      {
        path: 'account',
        loadComponent: () =>
          import('./features/auth/account/account.component').then((m) => m.AccountComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
