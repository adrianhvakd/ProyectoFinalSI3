import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertTriangle,
  lucideClipboardCheck,
  lucideHistory,
  lucideInfo,
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
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import {
  ControlCalidad,
  EstadoLote,
  Lote,
  MateriaPrima,
  ParametroCalidad,
  Proveedor,
  normalizeQualityParameters,
  unwrapOne,
} from '../../../../core/models/domain.models';
import { AuthService } from '../../../../core/services/auth.service';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { TablePaginationComponent } from '../../../../shared/components/table-pagination/table-pagination.component';
import {
  sanitizeCode,
  sanitizeMultilineText,
  sanitizeText,
  toLocalDateIso,
} from '../../../../shared/utils/sanitizers.util';
import {
  dateAfterFieldValidator,
  notExpiredDateValidator,
  positiveDecimalValidator,
  trimmedMinLengthValidator,
  trimmedRequiredValidator,
  uniqueCodeFormatValidator,
} from '../../../../shared/utils/validators.util';
import { RawMaterialsService } from '../../../catalog/services/raw-materials.service';
import { ProvidersService } from '../../../providers/services/providers.service';
import { WarehouseService } from '../../services/warehouse.service';

type InventoryTab = 'all' | EstadoLote;

interface QcChecklistItem {
  key: string;
  label: string;
  checked: boolean;
}

@Component({
  selector: 'app-inventory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    NgIcon,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCheckboxImports,
    HlmDialogImports,
    HlmEmptyImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmRadioGroupImports,
    HlmSheetImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTableImports,
    HlmTabsImports,
    HlmTextareaImports,
    ConfirmDialogComponent,
    StatusBadgeComponent,
    TablePaginationComponent,
  ],
  providers: [
    provideIcons({
      lucideWarehouse,
      lucidePackagePlus,
      lucideShieldCheck,
      lucideClipboardCheck,
      lucideHistory,
      lucideWrench,
      lucideSearch,
      lucideRefreshCw,
      lucideAlertTriangle,
      lucideInfo,
    }),
  ],
  templateUrl: './inventory.component.html',
})
export class InventoryComponent implements OnInit {
  private readonly warehouseService = inject(WarehouseService);
  private readonly rawMaterialsService = inject(RawMaterialsService);
  private readonly providersService = inject(ProvidersService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly todayIso = toLocalDateIso();

  // Inventario principal
  readonly lots = signal<Lote[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  readonly activeTab = signal<InventoryTab>('all');
  readonly searchTerm = signal<string>('');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  // Drawer Recepción de Lote
  readonly receptionSheetOpen = signal<boolean>(false);
  readonly materials = signal<MateriaPrima[]>([]);
  readonly activeProviders = signal<Proveedor[]>([]);
  readonly loadingCatalogs = signal<boolean>(false);
  readonly catalogLoadError = signal<string | null>(null);
  readonly submittingReception = signal<boolean>(false);
  readonly selectedMaterialId = signal<string>('');

  readonly receptionForm = this.fb.group({
    codigo_unico: ['', [trimmedRequiredValidator(), uniqueCodeFormatValidator()]],
    id_materia_prima: ['', [Validators.required]],
    id_proveedor: ['', [Validators.required]],
    cantidad_recibida: [0, [Validators.required, positiveDecimalValidator(false)]],
    fecha_recepcion: [this.todayIso, [Validators.required]],
    fecha_vencimiento: [
      '',
      [
        Validators.required,
        notExpiredDateValidator(),
        dateAfterFieldValidator('fecha_recepcion'),
      ],
    ],
  });

  readonly selectedMaterial = computed<MateriaPrima | null>(() => {
    const id = this.selectedMaterialId();
    return this.materials().find((m) => m.id_materia_prima === id) ?? null;
  });

  readonly selectedMaterialRequiredParams = computed<ParametroCalidad[]>(() =>
    this.getRequiredParams(this.selectedMaterial()),
  );

  // Drawer Control de Calidad
  readonly inspectingLot = signal<Lote | null>(null);
  readonly qcChecklist = signal<QcChecklistItem[]>([]);
  readonly qcDecisionSelected = signal<boolean>(true);
  readonly qcConfirmOpen = signal<boolean>(false);
  readonly submittingQc = signal<boolean>(false);

  readonly qcForm = this.fb.group({
    cumple_parametros: [true, [Validators.required]],
    informe_tecnico_hallazgos: [''],
  });

  readonly qcCheckedCount = computed(
    () => this.qcChecklist().filter((item) => item.checked).length,
  );

  readonly allQcChecklistChecked = computed(
    () => this.qcChecklist().length === 0 || this.qcChecklist().every((item) => item.checked),
  );

  // Historial y resolución de observados
  readonly historyLot = signal<Lote | null>(null);
  readonly resolvingLot = signal<Lote | null>(null);
  readonly resolveApproved = signal<boolean>(true);
  readonly resolveConfirmOpen = signal<boolean>(false);
  readonly resolvingSubmitting = signal<boolean>(false);

  readonly resolveForm = this.fb.group({
    aprobado: [true, [Validators.required]],
    resolucion_secundaria: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(10)]],
  });

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

  constructor() {
    this.resolveForm.controls.aprobado.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((val) => this.resolveApproved.set(val));

    this.receptionForm.controls.id_materia_prima.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => this.selectedMaterialId.set(id));

    this.receptionForm.controls.fecha_recepcion.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.receptionForm.controls.fecha_vencimiento.updateValueAndValidity({ emitEvent: false });
      });

    this.qcForm.controls.cumple_parametros.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((cumple) => {
        this.qcDecisionSelected.set(cumple);
        const reportCtrl = this.qcForm.controls.informe_tecnico_hallazgos;
        if (!cumple) {
          reportCtrl.setValidators([trimmedRequiredValidator(), trimmedMinLengthValidator(10)]);
        } else {
          reportCtrl.clearValidators();
        }
        reportCtrl.updateValueAndValidity({ emitEvent: false });
      });
  }

  ngOnInit(): void {
    void this.loadLots();
  }

  getMaterial(lote: Lote): MateriaPrima | null {
    return unwrapOne(lote.materia_prima);
  }

  getProvider(lote: Lote): Proveedor | null {
    return unwrapOne(lote.proveedor);
  }

  getRequiredParams(mp: MateriaPrima | null | undefined): ParametroCalidad[] {
    return normalizeQualityParameters(mp?.parametros_calidad_exigidos).filter((p) => p.requerido);
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

  // ---- Drawer Recepción de Lote ----
  async openReceptionSheet(): Promise<void> {
    this.receptionForm.reset({
      codigo_unico: '',
      id_materia_prima: '',
      id_proveedor: '',
      cantidad_recibida: 0,
      fecha_recepcion: this.todayIso,
      fecha_vencimiento: '',
    });
    this.selectedMaterialId.set('');
    this.catalogLoadError.set(null);
    this.receptionSheetOpen.set(true);
    await this.loadReceptionCatalogs();
  }

  closeReceptionSheet(): void {
    if (!this.submittingReception()) {
      this.receptionSheetOpen.set(false);
    }
  }

  async loadReceptionCatalogs(): Promise<void> {
    this.loadingCatalogs.set(true);
    this.catalogLoadError.set(null);
    try {
      const [mats, provs] = await Promise.all([
        this.rawMaterialsService.getAll(),
        this.providersService.getActive(),
      ]);
      this.materials.set(mats);
      this.activeProviders.set(provs);
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudieron cargar materias primas y proveedores.');
      this.catalogLoadError.set(msg);
      toast.error(msg);
    } finally {
      this.loadingCatalogs.set(false);
    }
  }

  async onSubmitReception(): Promise<void> {
    if (this.receptionForm.invalid) {
      this.receptionForm.markAllAsTouched();
      return;
    }

    const raw = this.receptionForm.getRawValue();
    if (raw.fecha_vencimiento <= this.todayIso) {
      this.receptionForm.controls.fecha_vencimiento.setErrors({ expiredDate: true });
      this.receptionForm.controls.fecha_vencimiento.markAsTouched();
      return;
    }
    if (raw.fecha_vencimiento <= raw.fecha_recepcion) {
      this.receptionForm.controls.fecha_vencimiento.setErrors({ dateOrder: true });
      this.receptionForm.controls.fecha_vencimiento.markAsTouched();
      return;
    }

    const activeProvider = this.activeProviders().find(
      (p) => p.id_proveedor === raw.id_proveedor && p.activo,
    );
    if (!activeProvider) {
      toast.error('Debe seleccionar un proveedor activo.');
      return;
    }

    this.submittingReception.set(true);
    try {
      const created = await this.warehouseService.receiveLot({
        codigo_unico: sanitizeCode(raw.codigo_unico),
        id_materia_prima: raw.id_materia_prima,
        id_proveedor: raw.id_proveedor,
        cantidad_recibida: Number(raw.cantidad_recibida),
        fecha_recepcion: raw.fecha_recepcion,
        fecha_vencimiento: raw.fecha_vencimiento,
      });

      toast.success(`Lote ${created.codigo_unico} recepcionado en estado "En revisión".`);
      this.receptionSheetOpen.set(false);
      await this.loadLots();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo registrar el lote.'));
    } finally {
      this.submittingReception.set(false);
    }
  }

  // ---- Drawer Control de Calidad ----
  openQualityControlSheet(lote: Lote): void {
    this.inspectingLot.set(lote);
    const requiredParams = this.getRequiredParams(this.getMaterial(lote));
    this.qcChecklist.set(
      requiredParams.map((param) => ({
        key: param.key,
        label: param.label,
        checked: false,
      })),
    );

    this.qcForm.reset({
      cumple_parametros: true,
      informe_tecnico_hallazgos: '',
    });
    this.qcDecisionSelected.set(true);
    this.qcForm.controls.informe_tecnico_hallazgos.clearValidators();
    this.qcForm.controls.informe_tecnico_hallazgos.updateValueAndValidity({ emitEvent: false });
    this.qcConfirmOpen.set(false);
  }

  closeQualityControlSheet(): void {
    if (!this.submittingQc()) {
      this.inspectingLot.set(null);
      this.qcConfirmOpen.set(false);
    }
  }

  toggleQcChecklistItem(key: string, checked: boolean): void {
    this.qcChecklist.update((list) =>
      list.map((item) => (item.key === key ? { ...item, checked } : item)),
    );
  }

  checkAllQcCriteria(): void {
    this.qcChecklist.update((list) => list.map((item) => ({ ...item, checked: true })));
  }

  requestSubmitQc(): void {
    if (this.qcForm.invalid) {
      this.qcForm.markAllAsTouched();
      return;
    }

    const cumple = this.qcForm.controls.cumple_parametros.value;
    if (cumple && !this.allQcChecklistChecked()) {
      toast.warning(
        'Verifique todos los parámetros obligatorios del checklist antes de aprobar el lote, o seleccione "No cumple".',
      );
      return;
    }

    this.qcConfirmOpen.set(true);
  }

  async confirmQcInspection(): Promise<void> {
    const lote = this.inspectingLot();
    const userId = this.authService.user()?.id_usuario;
    if (!lote || !userId) {
      return;
    }

    const raw = this.qcForm.getRawValue();
    const reportText = sanitizeMultilineText(raw.informe_tecnico_hallazgos);

    this.submittingQc.set(true);
    try {
      await this.warehouseService.executeQualityControl({
        p_id_lote: lote.id_lote,
        p_id_usuario: userId,
        p_cumple_parametros: raw.cumple_parametros,
        p_informe_tecnico: reportText.length > 0 ? reportText : null,
      });

      toast.success(
        raw.cumple_parametros
          ? `Lote ${lote.codigo_unico} aprobado e incorporado al stock vendible.`
          : `Lote ${lote.codigo_unico} marcado como Observado con informe técnico.`,
      );
      this.qcConfirmOpen.set(false);
      this.inspectingLot.set(null);
      await this.loadLots();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo completar el control de calidad.'));
    } finally {
      this.submittingQc.set(false);
    }
  }

  // ---- Historial y Observados ----
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
