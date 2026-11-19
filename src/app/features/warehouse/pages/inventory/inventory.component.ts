import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertTriangle,
  lucideFileBarChart2,
  lucideHistory,
  lucidePackagePlus,
  lucideRefreshCw,
  lucideSearch,
  lucideShieldCheck,
  lucideWarehouse,
  lucideWrench,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import {
  ControlCalidad,
  ESTADOS_LOTE,
  EstadoLote,
  Lote,
  MateriaPrima,
  Proveedor,
  ReporteLoteRow,
  unwrapOne,
} from '../../../../core/models/domain.models';
import { AuthService } from '../../../../core/services/auth.service';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { DynamicReportDrawerComponent } from '../../../../shared/components/dynamic-report/dynamic-report-drawer.component';
import { DynamicReportConfig } from '../../../../shared/components/dynamic-report/dynamic-report.models';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { TablePaginationComponent } from '../../../../shared/components/table-pagination/table-pagination.component';
import {
  sanitizeMultilineText,
  sanitizeText,
  toLocalDateIso,
} from '../../../../shared/utils/sanitizers.util';
import {
  trimmedMinLengthValidator,
  trimmedRequiredValidator,
} from '../../../../shared/utils/validators.util';
import { WarehouseService } from '../../services/warehouse.service';

type InventoryTab = 'all' | EstadoLote;

@Component({
  selector: 'app-inventory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmEmptyImports,
    HlmFieldImports,
    HlmInputImports,
    HlmRadioGroupImports,
    HlmSkeletonImports,
    HlmTableImports,
    HlmTabsImports,
    HlmTextareaImports,
    ConfirmDialogComponent,
    StatusBadgeComponent,
    TablePaginationComponent,
    DynamicReportDrawerComponent,
  ],
  providers: [
    provideIcons({
      lucideWarehouse,
      lucidePackagePlus,
      lucideShieldCheck,
      lucideFileBarChart2,
      lucideHistory,
      lucideWrench,
      lucideSearch,
      lucideRefreshCw,
      lucideAlertTriangle,
    }),
  ],
  templateUrl: './inventory.component.html',
})
export class InventoryComponent implements OnInit {
  private readonly warehouseService = inject(WarehouseService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly lots = signal<Lote[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  readonly activeTab = signal<InventoryTab>('all');
  readonly searchTerm = signal<string>('');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  readonly historyLot = signal<Lote | null>(null);

  readonly resolvingLot = signal<Lote | null>(null);
  readonly resolveApproved = signal<boolean>(true);
  readonly resolveConfirmOpen = signal<boolean>(false);
  readonly resolvingSubmitting = signal<boolean>(false);

  readonly reportOpen = signal<boolean>(false);
  readonly reportLoading = signal<boolean>(false);
  readonly reportRows = signal<ReporteLoteRow[]>([]);

  readonly resolveForm = this.fb.group({
    aprobado: [true, [Validators.required]],
    resolucion_secundaria: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(10)]],
  });

  constructor() {
    this.resolveForm.controls.aprobado.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((val) => this.resolveApproved.set(val));
  }

  readonly tabCounts = computed(() => {
    const all = this.lots();
    return {
      all: all.length,
      approved: all.filter((l) => l.estado === 'Aprobado / Disponible').length,
      observed: all.filter((l) => l.estado === 'Observado').length,
      review: all.filter((l) => l.estado === 'En revisión').length,
      returned: all.filter((l) => l.estado === 'Devuelto').length,
    };
  });

  readonly filteredLots = computed(() => {
    const tab = this.activeTab();
    const q = sanitizeText(this.searchTerm()).toLowerCase();

    return this.lots().filter((lote) => {
      if (tab !== 'all' && lote.estado !== tab) {
        return false;
      }
      if (!q) {
        return true;
      }
      const mp = this.getMaterial(lote);
      const prov = this.getProvider(lote);
      return (
        lote.codigo_unico.toLowerCase().includes(q) ||
        (mp?.nombre.toLowerCase().includes(q) ?? false) ||
        (mp?.codigo.toLowerCase().includes(q) ?? false) ||
        (prov?.razon_social.toLowerCase().includes(q) ?? false)
      );
    });
  });

  readonly paginatedLots = computed(() => {
    const list = this.filteredLots();
    const size = this.pageSize();
    const maxPage = Math.max(1, Math.ceil(list.length / size));
    const current = Math.min(this.page(), maxPage);
    const start = (current - 1) * size;
    return list.slice(start, start + size);
  });

  readonly reportConfig = computed<DynamicReportConfig<ReporteLoteRow>>(() => {
    const distinctProviders = Array.from(
      new Set(this.reportRows().map((r) => r.proveedor).filter(Boolean)),
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
            r.cumple_parametros === null ? 'Sin evaluar' : r.cumple_parametros ? 'Cumple' : 'No cumple',
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
          label: 'Estado del lote',
          type: 'select',
          options: ESTADOS_LOTE.map((e) => ({ label: e, value: e })),
          accessor: (r) => r.estado,
        },
        {
          key: 'proveedor',
          label: 'Proveedor',
          type: 'select',
          options: distinctProviders.map((p) => ({ label: p, value: p })),
          accessor: (r) => r.proveedor,
        },
        {
          key: 'cumple_parametros',
          label: 'Cumplimiento calidad',
          type: 'boolean',
          trueLabel: 'Cumple',
          falseLabel: 'No cumple',
          accessor: (r) => r.cumple_parametros,
        },
        {
          key: 'fecha_recepcion',
          label: 'Fecha recepción',
          type: 'date-range',
          accessor: (r) => r.fecha_recepcion,
        },
        {
          key: 'fecha_vencimiento',
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

  ngOnInit(): void {
    void this.loadLots();
  }

  getMaterial(lote: Lote): MateriaPrima | null {
    return unwrapOne(lote.materia_prima);
  }

  getProvider(lote: Lote): Proveedor | null {
    return unwrapOne(lote.proveedor);
  }

  getInspectorName(cc: ControlCalidad): string {
    return unwrapOne(cc.usuario)?.nombre_completo ?? 'Inspector';
  }

  isExpiringSoon(fechaVencimiento: string): boolean {
    const today = toLocalDateIso();
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + 30);
    const limitIso = toLocalDateIso(limitDate);
    return fechaVencimiento >= today && fechaVencimiento <= limitIso;
  }

  isExpired(fechaVencimiento: string): boolean {
    return fechaVencimiento <= toLocalDateIso();
  }

  async loadLots(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.warehouseService.getLots();
      this.lots.set(data);
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudo consultar el inventario.');
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  async openReportDrawer(): Promise<void> {
    this.reportOpen.set(true);
    this.reportLoading.set(true);
    try {
      const rows = await this.warehouseService.getReportLots();
      this.reportRows.set(rows);
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo cargar los datos para el reporte.'));
    } finally {
      this.reportLoading.set(false);
    }
  }

  openHistory(lote: Lote): void {
    this.historyLot.set(lote);
  }

  openResolveDialog(lote: Lote): void {
    this.resolvingLot.set(lote);
    this.resolveApproved.set(true);
    this.resolveForm.reset({
      aprobado: true,
      resolucion_secundaria: '',
    });
  }

  closeResolveDialog(): void {
    if (!this.resolvingSubmitting()) {
      this.resolvingLot.set(null);
      this.resolveConfirmOpen.set(false);
    }
  }

  requestConfirmResolve(): void {
    if (this.resolveForm.invalid) {
      this.resolveForm.markAllAsTouched();
      return;
    }
    this.resolveConfirmOpen.set(true);
  }

  async confirmResolve(): Promise<void> {
    const lote = this.resolvingLot();
    const userId = this.authService.user()?.id_usuario;
    if (!lote || !userId) {
      return;
    }

    const raw = this.resolveForm.getRawValue();
    this.resolvingSubmitting.set(true);
    try {
      await this.warehouseService.resolveObservedLot({
        p_id_lote: lote.id_lote,
        p_id_usuario: userId,
        p_aprobado: raw.aprobado,
        p_resolucion_secundaria: sanitizeMultilineText(raw.resolucion_secundaria),
      });

      toast.success(
        raw.aprobado
          ? `Lote ${lote.codigo_unico} reacondicionado y habilitado para venta.`
          : `Lote ${lote.codigo_unico} dado de baja / devuelto al proveedor.`,
      );
      this.resolveConfirmOpen.set(false);
      this.resolvingLot.set(null);
      await this.loadLots();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo resolver la observación del lote.'));
    } finally {
      this.resolvingSubmitting.set(false);
    }
  }

  onTabChanged(tab: string): void {
    this.activeTab.set(tab as InventoryTab);
    this.page.set(1);
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
    this.page.set(1);
  }
}
