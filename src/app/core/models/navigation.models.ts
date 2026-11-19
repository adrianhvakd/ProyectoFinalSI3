import { RolUsuario } from './domain.models';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  roles: RolUsuario[];
  inactive?: boolean;
  section: string;
}

export const NAVIGATION_ITEMS: readonly NavItem[] = [
  {
    id: 'catalog',
    label: 'Materias Primas',
    icon: 'lucidePackage',
    route: '/catalog',
    roles: ['Administrador'],
    section: 'Administración',
  },
  {
    id: 'providers',
    label: 'Proveedores',
    icon: 'lucideBuilding2',
    route: '/providers',
    roles: ['Administrador'],
    section: 'Administración',
  },
  {
    id: 'users',
    label: 'Usuarios y Flota',
    icon: 'lucideUsers',
    route: '/users',
    roles: ['Administrador'],
    section: 'Administración',
  },
  {
    id: 'clients',
    label: 'Empresas Clientes',
    icon: 'lucideBriefcase',
    route: '/clients',
    roles: ['Administrador'],
    section: 'Administración',
  },
  {
    id: 'warehouse-inventory',
    label: 'Inventario de Lotes',
    icon: 'lucideWarehouse',
    route: '/warehouse/inventory',
    roles: ['Encargado de Almacén'],
    section: 'Almacén y Calidad',
  },
  {
    id: 'sales-payments',
    label: 'Verificación de Pagos',
    icon: 'lucideBadgeCheck',
    route: '/sales/payments',
    roles: ['Encargado de Ventas y Caja'],
    section: 'Ventas y Caja',
  },
  {
    id: 'reports',
    label: 'Reportes',
    icon: 'lucideFileBarChart2',
    route: '/reports',
    roles: ['Administrador', 'Encargado de Almacén', 'Encargado de Ventas y Caja'],
    section: 'Reportes',
  },
  {
    id: 'orders-catalog',
    label: 'Catálogo Mayorista',
    icon: 'lucideShoppingCart',
    route: '/orders/catalog',
    roles: ['Empresa Cliente'],
    section: 'Portal Mayorista',
  },
  {
    id: 'orders-my-orders',
    label: 'Mis Pedidos',
    icon: 'lucideClipboardList',
    route: '/orders/my-orders',
    roles: ['Empresa Cliente'],
    section: 'Portal Mayorista',
  },
  {
    id: 'dispatch-local',
    label: 'Despacho y Recojo en Local',
    icon: 'lucidePackageCheck',
    roles: ['Encargado de Despacho'],
    inactive: true,
    section: 'Logística',
  },
  {
    id: 'dispatch-routes',
    label: 'Planificación de Rutas',
    icon: 'lucideRoute',
    roles: ['Encargado de Despacho'],
    inactive: true,
    section: 'Logística',
  },
  {
    id: 'dispatch-fleet',
    label: 'Seguimiento de Flota',
    icon: 'lucideTruck',
    roles: ['Encargado de Despacho'],
    inactive: true,
    section: 'Logística',
  },
  {
    id: 'driver-route',
    label: 'Hoja de Ruta y Entregas',
    icon: 'lucideNavigation',
    roles: ['Camionero'],
    inactive: true,
    section: 'Operación en Ruta',
  },
  {
    id: 'account',
    label: 'Perfil Operativo',
    icon: 'lucideUserCheck',
    route: '/account',
    roles: [
      'Administrador',
      'Encargado de Almacén',
      'Encargado de Ventas y Caja',
      'Encargado de Despacho',
      'Camionero',
      'Empresa Cliente',
    ],
    section: 'Cuenta',
  },
] as const;
