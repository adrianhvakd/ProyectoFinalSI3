import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideClipboardCheck,
  lucidePackagePlus,
  lucideRefreshCw,
  lucideSearch,
  lucideShieldCheck,
  lucideWarehouse,
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
import { HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import {
  Lote,
  MateriaPrima,
  Proveedor,
  unwrapOne,
} from '../../../../core/models/domain.models';
import { AuthService } from '../../../../core/services/auth.service';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { TablePaginationComponent } from '../../../../shared/components/table-pagination/table-pagination.component';
import { sanitizeMultilineText, sanitizeText } from '../../../../shared/utils/sanitizers.util';
import {
  trimmedMinLengthValidator,
  trimmedRequiredValidator,
} from '../../../../shared/utils/validators.util';
import { WarehouseService } from '../../services/warehouse.service';

interface ChecklistItem {
  label: string;
  checked: boolean;
}

@Component({
  selector: 'app-quality-control',
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
    HlmCheckboxImports,
    HlmDialogImports,
    HlmEmptyImports,
    HlmFieldImports,
    HlmInputImports,
    HlmRadioGroupImports,
    HlmSkeletonImports,
    HlmTableImports,
    HlmTextareaImports,
    ConfirmDialogComponent,
    StatusBadgeComponent,
    TablePaginationComponent,
  ],
  providers: [
    provideIcons({
      lucideShieldCheck,
      lucideClipboardCheck,
      lucidePackagePlus,
      lucideWarehouse,
      lucideSearch,
      lucideRefreshCw,
    }),
  ],
  templateUrl: './quality-control.component.html',
})
export class QualityControlComponent implements OnInit {
  private readonly warehouseService = inject(WarehouseService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly lots = signal<Lote[]>([]);
  readonly loading = signal<boolean>(true);
  readonly submitting = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly searchTerm = signal<string>('');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  readonly inspectingLot = signal<Lote | null>(null);
  readonly checklist = signal<ChecklistItem[]>([]);
  readonly confirmOpen = signal<boolean>(false);
  readonly decisionSelected = signal<boolean>(true);

  readonly inspectionForm = this.fb.group({
    cumple_parametros: [true, [Validators.required]],
    informe_tecnico_hallazgos: [''],
  });

  readonly filteredLots = computed(() => {
    const q = sanitizeText(this.searchTerm()).toLowerCase();
    return this.lots().filter((lote) => {
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

  readonly allChecklistChecked = computed(
    () => this.checklist().length === 0 || this.checklist().every((item) => item.checked),
  );

  constructor() {
    this.inspectionForm.controls.cumple_parametros.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((cumple) => {
        this.decisionSelected.set(cumple);
        const reportCtrl = this.inspectionForm.controls.informe_tecnico_hallazgos;
        if (!cumple) {
          reportCtrl.setValidators([trimmedRequiredValidator(), trimmedMinLengthValidator(10)]);
        } else {
          reportCtrl.clearValidators();
        }
        reportCtrl.updateValueAndValidity({ emitEvent: false });
      });
  }

  ngOnInit(): void {
    void this.loadPendingLots();
  }

  getMaterial(lote: Lote): MateriaPrima | null {
    return unwrapOne(lote.materia_prima);
  }

  getProvider(lote: Lote): Proveedor | null {
    return unwrapOne(lote.proveedor);
  }

  async loadPendingLots(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.warehouseService.getLots('En revisión');
      this.lots.set(data);
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudo cargar los lotes en revisión.');
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  openInspection(lote: Lote): void {
    this.inspectingLot.set(lote);
    const rawParams = this.getMaterial(lote)?.parametros_calidad_exigidos ?? '';
    const parsed = this.parseChecklist(rawParams);
    this.checklist.set(parsed);

    this.inspectionForm.reset({
      cumple_parametros: true,
      informe_tecnico_hallazgos: '',
    });
    this.decisionSelected.set(true);
    this.inspectionForm.controls.informe_tecnico_hallazgos.clearValidators();
    this.inspectionForm.controls.informe_tecnico_hallazgos.updateValueAndValidity({
      emitEvent: false,
    });
  }

  closeInspection(): void {
    if (!this.submitting()) {
      this.inspectingLot.set(null);
      this.confirmOpen.set(false);
    }
  }

  toggleChecklistItem(index: number, checked: boolean): void {
    this.checklist.update((list) =>
      list.map((item, idx) => (idx === index ? { ...item, checked } : item)),
    );
  }

  checkAllCriteria(): void {
    this.checklist.update((list) => list.map((item) => ({ ...item, checked: true })));
  }

  requestSubmitInspection(): void {
    if (this.inspectionForm.invalid) {
      this.inspectionForm.markAllAsTouched();
      return;
    }

    const cumple = this.inspectionForm.controls.cumple_parametros.value;
    if (cumple && !this.allChecklistChecked()) {
      toast.warning(
        'Verifique todos los criterios del checklist antes de aprobar el lote, o seleccione "No cumple".',
      );
      return;
    }

    this.confirmOpen.set(true);
  }

  async confirmInspection(): Promise<void> {
    const lote = this.inspectingLot();
    const userId = this.authService.user()?.id_usuario;
    if (!lote || !userId) {
      return;
    }

    const raw = this.inspectionForm.getRawValue();
    const reportText = sanitizeMultilineText(raw.informe_tecnico_hallazgos);

    this.submitting.set(true);
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
      this.confirmOpen.set(false);
      this.inspectingLot.set(null);
      await this.loadPendingLots();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo completar el control de calidad.'));
    } finally {
      this.submitting.set(false);
    }
  }

  private parseChecklist(raw: string): ChecklistItem[] {
    const cleaned = raw.trim();
    if (!cleaned) {
      return [];
    }
    const separator = cleaned.includes('\n') || cleaned.includes(';') ? /[\n;]+/ : /[,]+/;
    return cleaned
      .split(separator)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((label) => ({ label, checked: false }));
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
    this.page.set(1);
  }
}
