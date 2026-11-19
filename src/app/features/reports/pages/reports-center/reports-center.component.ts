import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFileBarChart2 } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import {
  ESTADOS_LOTE,
  ESTADOS_PAGO,
  ESTADOS_PEDIDO,
  EmpresaClienteConUsuario,
  MateriaPrima,
  Proveedor,
  ROLES_USUARIO,
  ReporteLoteRow,
  ReporteVentasPagosRow,
  UsuarioConRelaciones,
  formatActiveQualityParameters,
  unwrapOne,
} from '../../../../core/models/domain.models';
import { AuthService } from '../../../../core/services/auth.service';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { DynamicReportBuilderComponent } from '../../../../shared/components/dynamic-report/dynamic-report-builder.component';
import { DynamicReportConfig } from '../../../../shared/components/dynamic-report/dynamic-report.models';
import { RawMaterialsService } from '../../../catalog/services/raw-materials.service';
import { ProvidersService } from '../../../providers/services/providers.service';
import { SalesService } from '../../../sales/services/sales.service';
import { ClientCompaniesService } from '../../../users/services/client-companies.service';
import { UsersService } from '../../../users/services/users.service';
import { WarehouseService } from '../../../warehouse/services/warehouse.service';

export type ReportTabKey = 'materials' | 'providers' | 'users' | 'clients' | 'lots' | 'sales';

interface ReportTabMeta {
  key: ReportTabKey;
  label: string;
}

const ALL_TABS: readonly ReportTabMeta[] = [
  { key: 'materials', label: 'Materias Primas' },
  { key: 'providers', label: 'Proveedores' },
  { key: 'users', label: 'Usuarios y Flota' },
  { key: 'clients', label: 'Empresas Clientes' },
  { key: 'lots', label: 'Lotes y Calidad' },
  { key: 'sales', label: 'Ventas y Pagos' },
];

@Component({
  selector: 'app-reports-center',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmAlertImports, HlmTabsImports, DynamicReportBuilderComponent],
  providers: [provideIcons({ lucideFileBarChart2 })],
  templateUrl: './reports-center.component.html',
})
export class ReportsCenterComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly rawMaterialsService = inject(RawMaterialsService);
  private readonly providersService = inject(ProvidersService);
  private readonly usersService = inject(UsersService);
  private readonly clientCompaniesService = inject(ClientCompaniesService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly salesService = inject(SalesService);

  readonly availableTabs = computed<readonly ReportTabMeta[]>(() => {
    const role = this.authService.role();
    if (role === 'Administrador') {
      return ALL_TABS;
    }
    if (role === 'Encargado de Almacén') {
      return ALL_TABS.filter((t) => t.key === 'lots');
    }
    if (role === 'Encargado de Ventas y Caja') {
      return ALL_TABS.filter((t) => t.key === 'sales');
    }
    return [];
  });

  readonly selectedTab = signal<ReportTabKey>('materials');
  readonly effectiveTab = computed<ReportTabKey>(() => {
    const tabs = this.availableTabs();
    const current = this.selectedTab();
    if (tabs.some((t) => t.key === current)) {
      return current;
    }
    return tabs[0]?.key ?? 'materials';
  });

  readonly loadingTab = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  private readonly loadedTabs = new Set<ReportTabKey>();

  readonly materialsData = signal<MateriaPrima[]>([]);
  readonly providersData = signal<Proveedor[]>([]);
  readonly usersData = signal<UsuarioConRelaciones[]>([]);
  readonly clientsData = signal<EmpresaClienteConUsuario[]>([]);
  readonly lotsData = signal<ReporteLoteRow[]>([]);
  readonly salesData = signal<ReporteVentasPagosRow[]>([]);

  readonly materialsConfig = computed<DynamicReportConfig<MateriaPrima>>(() => {
    const distinctUnits = Array.from(
      new Set(this.materialsData().map((i) => i.unidad_medida).filter(Boolean)),
    ).sort();

    return {
      title: 'Reporte de Catálogo de Materias Primas',
      subtitle: 'Inventario maestro, precios mayoristas, mínimos de venta y estándares de calidad.',
      filenamePrefix: 'catalogo-materias-primas',
      searchFields: [(r) => r.codigo, (r) => r.nombre, (r) => r.unidad_medida],
      columns: [
        { key: 'codigo', label: 'Código', getValue: (r) => r.codigo },
        { key: 'nombre', label: 'Materia Prima', getValue: (r) => r.nombre },
        { key: 'unidad_medida', label: 'Unidad', getValue: (r) => r.unidad_medida },
        {
          key: 'precio_mayorista',
          label: 'Precio Mayorista',
          align: 'right',
          getValue: (r) => Number(r.precio_mayorista),
          format: (r) => `Bs ${Number(r.precio_mayorista).toFixed(2)}`,
        },
        {
          key: 'cantidad_minima_venta',
          label: 'Mín. Venta',
          align: 'right',
          getValue: (r) => Number(r.cantidad_minima_venta),
          format: (r) => `${Number(r.cantidad_minima_venta).toFixed(2)} ${r.unidad_medida}`,
        },
        {
          key: 'stock_disponible_total',
          label: 'Stock Disponible',
          align: 'right',
          getValue: (r) => Number(r.stock_disponible_total),
          format: (r) => `${Number(r.stock_disponible_total).toFixed(2)} ${r.unidad_medida}`,
        },
        {
          key: 'parametros_calidad_exigidos',
          label: 'Parámetros de Calidad',
          defaultVisible: false,
          getValue: (r) => formatActiveQualityParameters(r.parametros_calidad_exigidos),
        },
      ],
      filters: [
        {
          key: 'stock',
          columnKey: 'stock_disponible_total',
          label: 'Disponibilidad de stock',
          type: 'boolean',
          trueLabel: 'Con stock disponible',
          falseLabel: 'Sin stock (0)',
          accessor: (r) => Number(r.stock_disponible_total) > 0,
        },
        {
          key: 'unidad_medida',
          columnKey: 'unidad_medida',
          label: 'Unidad de medida',
          type: 'select',
          options: distinctUnits.map((u) => ({ label: u, value: u })),
          accessor: (r) => r.unidad_medida,
        },
      ],
      summaryCards: [
        {
          label: 'Con stock disponible',
          compute: (rows) =>
            String(rows.filter((r) => Number(r.stock_disponible_total) > 0).length),
        },
        {
          label: 'Stock total acumulado',
          compute: (rows) =>
            rows.reduce((acc, r) => acc + Number(r.stock_disponible_total || 0), 0).toFixed(2),
        },
      ],
    };
  });

  readonly providersConfig = computed<DynamicReportConfig<Proveedor>>(() => {
    const distinctCountries = Array.from(
      new Set(this.providersData().map((p) => p.pais_origen).filter(Boolean)),
    ).sort();

    return {
      title: 'Reporte de Directorio de Proveedores',
      subtitle: 'Proveedores internacionales y locales habilitados para recepción en almacén.',
      filenamePrefix: 'directorio-proveedores',
      searchFields: [
        (r) => r.identificacion_fiscal,
        (r) => r.razon_social,
        (r) => r.pais_origen,
        (r) => r.datos_contacto,
      ],
      columns: [
        {
          key: 'identificacion_fiscal',
          label: 'Identificación Fiscal',
          getValue: (r) => r.identificacion_fiscal,
        },
        { key: 'razon_social', label: 'Razón Social', getValue: (r) => r.razon_social },
        { key: 'pais_origen', label: 'País de Origen', getValue: (r) => r.pais_origen },
        { key: 'datos_contacto', label: 'Número de Contacto', getValue: (r) => r.datos_contacto },
        {
          key: 'activo',
          label: 'Estado',
          getValue: (r) => r.activo,
          format: (r) => (r.activo ? 'Activo' : 'Inactivo'),
        },
      ],
      filters: [
        {
          key: 'activo',
          columnKey: 'activo',
          label: 'Estado',
          type: 'boolean',
          trueLabel: 'Activos',
          falseLabel: 'Inactivos',
          accessor: (r) => r.activo,
        },
        {
          key: 'pais_origen',
          columnKey: 'pais_origen',
          label: 'País de origen',
          type: 'select',
          options: distinctCountries.map((c) => ({ label: c, value: c })),
          accessor: (r) => r.pais_origen,
        },
      ],
      summaryCards: [
        {
          label: 'Proveedores activos',
          compute: (rows) => String(rows.filter((r) => r.activo).length),
        },
        {
          label: 'Países representados',
          compute: (rows) => String(new Set(rows.map((r) => r.pais_origen)).size),
        },
      ],
    };
  });

  readonly usersConfig: DynamicReportConfig<UsuarioConRelaciones> = {
    title: 'Reporte de Usuarios, Roles y Flota',
    subtitle: 'Personal operativo registrado, estado de acceso y vehículos asignados.',
    filenamePrefix: 'usuarios-roles-flota',
    searchFields: [
      (r) => r.nombre_completo,
      (r) => r.email,
      (r) => r.rol,
      (r) => unwrapOne(r.camion)?.placa,
    ],
    columns: [
      { key: 'nombre_completo', label: 'Nombre Completo', getValue: (r) => r.nombre_completo },
      { key: 'email', label: 'Correo Electrónico', getValue: (r) => r.email },
      { key: 'rol', label: 'Rol', getValue: (r) => r.rol },
      {
        key: 'activo',
        label: 'Estado',
        getValue: (r) => r.activo,
        format: (r) => (r.activo ? 'Activo' : 'Inactivo'),
      },
      {
        key: 'placa',
        label: 'Placa Camión',
        getValue: (r) => unwrapOne(r.camion)?.placa ?? null,
        format: (r) => unwrapOne(r.camion)?.placa ?? '—',
      },
      {
        key: 'capacidad_kg',
        label: 'Capacidad (kg)',
        align: 'right',
        getValue: (r) => unwrapOne(r.camion)?.capacidad_kg ?? null,
        format: (r) => {
          const cap = unwrapOne(r.camion)?.capacidad_kg;
          return cap !== undefined && cap !== null ? `${Number(cap).toFixed(2)} kg` : '—';
        },
      },
      {
        key: 'disponible',
        label: 'Unidad Disponible',
        defaultVisible: false,
        getValue: (r) => unwrapOne(r.camion)?.disponible ?? null,
        format: (r) => {
          const cam = unwrapOne(r.camion);
          if (!cam) return '—';
          return cam.disponible ? 'Disponible' : 'Ocupado';
        },
      },
    ],
    filters: [
      {
        key: 'rol',
        columnKey: 'rol',
        label: 'Rol operativo',
        type: 'select',
        options: ROLES_USUARIO.map((r) => ({ label: r, value: r })),
        accessor: (r) => r.rol,
      },
      {
        key: 'activo',
        columnKey: 'activo',
        label: 'Estado de acceso',
        type: 'boolean',
        trueLabel: 'Activos',
        falseLabel: 'Inactivos',
        accessor: (r) => r.activo,
      },
      {
        key: 'disponible',
        columnKey: 'disponible',
        label: 'Disponibilidad de unidad',
        type: 'boolean',
        trueLabel: 'Disponible',
        falseLabel: 'Ocupado',
        accessor: (r) => unwrapOne(r.camion)?.disponible ?? null,
      },
    ],
    summaryCards: [
      {
        label: 'Usuarios activos',
        compute: (rows) => String(rows.filter((r) => r.activo).length),
      },
      {
        label: 'Camiones registrados',
        compute: (rows) => String(rows.filter((r) => unwrapOne(r.camion) !== null).length),
      },
    ],
  };

  readonly clientsConfig: DynamicReportConfig<EmpresaClienteConUsuario> = {
    title: 'Reporte de Empresas Clientes',
    subtitle: 'Clientes mayoristas registrados, datos fiscales, dirección y estado de cuenta.',
    filenamePrefix: 'empresas-clientes',
    searchFields: [
      (r) => r.razon_social,
      (r) => r.nit,
      (r) => unwrapOne(r.usuario)?.nombre_completo,
      (r) => unwrapOne(r.usuario)?.email,
      (r) => r.direccion,
    ],
    columns: [
      { key: 'razon_social', label: 'Razón Social', getValue: (r) => r.razon_social },
      { key: 'nit', label: 'NIT', getValue: (r) => r.nit },
      {
        key: 'contacto',
        label: 'Representante',
        getValue: (r) => unwrapOne(r.usuario)?.nombre_completo ?? '—',
      },
      {
        key: 'email',
        label: 'Correo Acceso',
        getValue: (r) => unwrapOne(r.usuario)?.email ?? '—',
      },
      { key: 'telefono', label: 'Teléfono', getValue: (r) => r.telefono },
      { key: 'direccion', label: 'Dirección', getValue: (r) => r.direccion },
      {
        key: 'activo',
        label: 'Estado',
        getValue: (r) => unwrapOne(r.usuario)?.activo ?? false,
        format: (r) => (unwrapOne(r.usuario)?.activo ? 'Activo' : 'Inactivo'),
      },
    ],
    filters: [
      {
        key: 'activo',
        columnKey: 'activo',
        label: 'Estado de acceso',
        type: 'boolean',
        trueLabel: 'Activos',
        falseLabel: 'Inactivos',
        accessor: (r) => unwrapOne(r.usuario)?.activo ?? false,
      },
    ],
    summaryCards: [
      {
        label: 'Empresas activas',
        compute: (rows) =>
          String(rows.filter((r) => unwrapOne(r.usuario)?.activo === true).length),
      },
      {
        label: 'Empresas inactivas',
        compute: (rows) =>
          String(rows.filter((r) => unwrapOne(r.usuario)?.activo !== true).length),
      },
    ],
  };

  readonly lotsConfig = computed<DynamicReportConfig<ReporteLoteRow>>(() => {
    const distinctProviders = Array.from(
      new Set(this.lotsData().map((r) => r.proveedor).filter(Boolean)),
    ).sort();

    return {
      title: 'Reporte de Inventario de Lotes y Calidad',
      subtitle: 'Trazabilidad consolidada de lotes, proveedores, stock disponible y evaluación técnica.',
      filenamePrefix: 'inventario-lotes-calidad',
      searchFields: [
        (r) => r.codigo_unico,
        (r) => r.codigo_materia_prima,
        (r) => r.materia_prima,
        (r) => r.proveedor,
        (r) => r.pais_origen,
      ],
      columns: [
        { key: 'codigo_unico', label: 'Código Lote', getValue: (r) => r.codigo_unico },
        { key: 'codigo_materia_prima', label: 'Código MP', getValue: (r) => r.codigo_materia_prima },
        { key: 'materia_prima', label: 'Materia Prima', getValue: (r) => r.materia_prima },
        { key: 'unidad_medida', label: 'Unidad', getValue: (r) => r.unidad_medida },
        { key: 'proveedor', label: 'Proveedor', getValue: (r) => r.proveedor },
        { key: 'pais_origen', label: 'País', defaultVisible: false, getValue: (r) => r.pais_origen },
        {
          key: 'cantidad_recibida',
          label: 'Cant. Recibida',
          align: 'right',
          getValue: (r) => Number(r.cantidad_recibida),
          format: (r) => Number(r.cantidad_recibida).toFixed(2),
        },
        {
          key: 'cantidad_disponible',
          label: 'Cant. Disponible',
          align: 'right',
          getValue: (r) => Number(r.cantidad_disponible),
          format: (r) => Number(r.cantidad_disponible).toFixed(2),
        },
        { key: 'fecha_recepcion', label: 'F. Recepción', getValue: (r) => r.fecha_recepcion },
        { key: 'fecha_vencimiento', label: 'F. Vencimiento', getValue: (r) => r.fecha_vencimiento },
        { key: 'estado', label: 'Estado Lote', getValue: (r) => r.estado },
        {
          key: 'cumple_parametros',
          label: 'Cumplimiento QC',
          getValue: (r) => r.cumple_parametros,
          format: (r) =>
            r.cumple_parametros === null
              ? 'Sin evaluar'
              : r.cumple_parametros
                ? 'Cumple'
                : 'No cumple',
        },
        {
          key: 'informe_tecnico_hallazgos',
          label: 'Informe Técnico',
          defaultVisible: false,
          getValue: (r) => r.informe_tecnico_hallazgos,
        },
        {
          key: 'resolucion_secundaria',
          label: 'Resolución Secundaria',
          defaultVisible: false,
          getValue: (r) => r.resolucion_secundaria,
        },
        {
          key: 'fecha_evaluacion',
          label: 'Fecha Evaluación',
          defaultVisible: false,
          getValue: (r) => r.fecha_evaluacion,
        },
      ],
      filters: [
        {
          key: 'estado',
          columnKey: 'estado',
          label: 'Estado del lote',
          type: 'select',
          options: ESTADOS_LOTE.map((e) => ({ label: e, value: e })),
          accessor: (r) => r.estado,
        },
        {
          key: 'proveedor',
          columnKey: 'proveedor',
          label: 'Proveedor',
          type: 'select',
          options: distinctProviders.map((p) => ({ label: p, value: p })),
          accessor: (r) => r.proveedor,
        },
        {
          key: 'cumple_parametros',
          columnKey: 'cumple_parametros',
          label: 'Cumplimiento calidad',
          type: 'boolean',
          trueLabel: 'Cumple',
          falseLabel: 'No cumple',
          accessor: (r) => r.cumple_parametros,
        },
        {
          key: 'fecha_recepcion',
          columnKey: 'fecha_recepcion',
          label: 'Fecha recepción',
          type: 'date-range',
          accessor: (r) => r.fecha_recepcion,
        },
        {
          key: 'fecha_vencimiento',
          columnKey: 'fecha_vencimiento',
          label: 'Fecha vencimiento',
          type: 'date-range',
          accessor: (r) => r.fecha_vencimiento,
        },
      ],
      summaryCards: [
        {
          label: 'Lotes aprobados',
          compute: (rows) =>
            String(rows.filter((r) => r.estado === 'Aprobado / Disponible').length),
        },
        {
          label: 'Stock disponible (aprobado)',
          compute: (rows) =>
            rows
              .filter((r) => r.estado === 'Aprobado / Disponible')
              .reduce((acc, r) => acc + Number(r.cantidad_disponible || 0), 0)
              .toFixed(2),
        },
      ],
    };
  });

  readonly salesConfig: DynamicReportConfig<ReporteVentasPagosRow> = {
    title: 'Reporte de Ventas y Verificación de Pagos',
    subtitle: 'Consolidado comercial de pedidos mayoristas, cobros QR/Efectivo, ubicación y entregas.',
    filenamePrefix: 'reporte-ventas-pagos',
    searchFields: [
      (r) => String(r.numero_pedido),
      (r) => r.empresa_cliente,
      (r) => r.nit_cliente,
      (r) => r.metodo_pago,
      (r) => r.celular_contacto,
    ],
    columns: [
      {
        key: 'numero_pedido',
        label: 'N° Pedido',
        getValue: (r) => r.numero_pedido,
        format: (r) => `#${r.numero_pedido}`,
      },
      { key: 'empresa_cliente', label: 'Empresa Cliente', getValue: (r) => r.empresa_cliente },
      { key: 'nit_cliente', label: 'NIT', getValue: (r) => r.nit_cliente },
      { key: 'metodo_pago', label: 'Método Pago', getValue: (r) => r.metodo_pago },
      {
        key: 'subtotal_mayorista',
        label: 'Monto Total',
        align: 'right',
        getValue: (r) => Number(r.subtotal_mayorista),
        format: (r) => `Bs ${Number(r.subtotal_mayorista).toFixed(2)}`,
      },
      { key: 'estado_pago', label: 'Estado Pago', getValue: (r) => r.estado_pago },
      { key: 'estado_pedido', label: 'Estado Pedido', getValue: (r) => r.estado_pedido },
      { key: 'modalidad_entrega', label: 'Modalidad Entrega', getValue: (r) => r.modalidad_entrega },
      {
        key: 'estado_entrega',
        label: 'Estado Entrega',
        defaultVisible: false,
        getValue: (r) => r.estado_entrega,
      },
      {
        key: 'direccion_destino',
        label: 'Dirección Destino',
        defaultVisible: false,
        getValue: (r) => r.direccion_destino,
      },
      {
        key: 'celular_contacto',
        label: 'Celular Entrega',
        defaultVisible: false,
        getValue: (r) => r.celular_contacto,
      },
      {
        key: 'coordenadas',
        label: 'Coordenadas GPS',
        defaultVisible: false,
        getValue: (r) =>
          r.latitud !== null && r.longitud !== null
            ? `${Number(r.latitud).toFixed(5)}, ${Number(r.longitud).toFixed(5)}`
            : null,
      },
      { key: 'fecha_creacion', label: 'Fecha Pedido', getValue: (r) => r.fecha_creacion },
      {
        key: 'fecha_verificacion',
        label: 'Fecha Verificación',
        getValue: (r) => r.fecha_verificacion,
      },
      {
        key: 'motivo_observacion',
        label: 'Motivo Observación',
        defaultVisible: false,
        getValue: (r) => r.motivo_observacion,
      },
    ],
    filters: [
      {
        key: 'metodo_pago',
        columnKey: 'metodo_pago',
        label: 'Método de pago',
        type: 'select',
        options: [
          { label: 'QR', value: 'QR' },
          { label: 'Efectivo', value: 'Efectivo' },
        ],
        accessor: (r) => r.metodo_pago,
      },
      {
        key: 'estado_pago',
        columnKey: 'estado_pago',
        label: 'Estado de pago',
        type: 'select',
        options: ESTADOS_PAGO.map((e) => ({ label: e, value: e })),
        accessor: (r) => r.estado_pago,
      },
      {
        key: 'estado_pedido',
        columnKey: 'estado_pedido',
        label: 'Estado de pedido',
        type: 'select',
        options: ESTADOS_PEDIDO.map((e) => ({ label: e, value: e })),
        accessor: (r) => r.estado_pedido,
      },
      {
        key: 'modalidad_entrega',
        columnKey: 'modalidad_entrega',
        label: 'Modalidad de entrega',
        type: 'select',
        options: [
          { label: 'Recojo en el local', value: 'Recojo en el local' },
          { label: 'Envío a dirección en camión', value: 'Envío a dirección en camión' },
        ],
        accessor: (r) => r.modalidad_entrega,
      },
      {
        key: 'fecha_creacion',
        columnKey: 'fecha_creacion',
        label: 'Fecha de creación',
        type: 'date-range',
        accessor: (r) => r.fecha_creacion,
      },
      {
        key: 'fecha_verificacion',
        columnKey: 'fecha_verificacion',
        label: 'Fecha de verificación',
        type: 'date-range',
        accessor: (r) => r.fecha_verificacion,
      },
    ],
    summaryCards: [
      {
        label: 'Pagos aprobados',
        compute: (rows) => String(rows.filter((r) => r.estado_pago === 'Aprobado').length),
      },
      {
        label: 'Monto recaudado (aprobado)',
        compute: (rows) =>
          'Bs ' +
          rows
            .filter((r) => r.estado_pago === 'Aprobado')
            .reduce((acc, r) => acc + Number(r.subtotal_mayorista || 0), 0)
            .toFixed(2),
      },
    ],
  };

  ngOnInit(): void {
    const initial = this.effectiveTab();
    this.selectedTab.set(initial);
    void this.loadTab(initial);
  }

  onTabActivated(tabKey: string): void {
    const tab = tabKey as ReportTabKey;
    this.selectedTab.set(tab);
    void this.loadTab(tab, false);
  }

  async loadTab(tab: ReportTabKey, forceReload = true): Promise<void> {
    if (!forceReload && this.loadedTabs.has(tab)) {
      return;
    }

    this.loadingTab.set(true);
    this.error.set(null);
    try {
      switch (tab) {
        case 'materials':
          this.materialsData.set(await this.rawMaterialsService.getAll());
          break;
        case 'providers':
          this.providersData.set(await this.providersService.getAll());
          break;
        case 'users':
          this.usersData.set(await this.usersService.getAll());
          break;
        case 'clients':
          this.clientsData.set(await this.clientCompaniesService.getAll());
          break;
        case 'lots':
          this.lotsData.set(await this.warehouseService.getReportLots());
          break;
        case 'sales':
          this.salesData.set(await this.salesService.getReportSalesPayments());
          break;
      }
      this.loadedTabs.add(tab);
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudieron cargar los datos del reporte.');
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loadingTab.set(false);
    }
  }
}
