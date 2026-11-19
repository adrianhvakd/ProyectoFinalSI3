import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucidePackage,
  lucidePencil,
  lucidePlus,
  lucideRefreshCw,
  lucideSearch,
  lucideTrash2,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTableImports } from '@spartan-ng/helm/table';
import {
  MateriaPrima,
  ParametroCalidad,
  STANDARD_QUALITY_PARAMETERS,
  UNIDADES_MEDIDA_INDUSTRIALES,
  formatActiveQualityParameters,
  normalizeQualityParameters,
} from '../../../../core/models/domain.models';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { TablePaginationComponent } from '../../../../shared/components/table-pagination/table-pagination.component';
import { sanitizeText } from '../../../../shared/utils/sanitizers.util';
import {
  positiveDecimalValidator,
  trimmedMinLengthValidator,
  trimmedRequiredValidator,
} from '../../../../shared/utils/validators.util';
import { MateriaPrimaPayload, RawMaterialsService } from '../../services/raw-materials.service';

@Component({
  selector: 'app-raw-materials',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DecimalPipe,
    ReactiveFormsModule,
    NgIcon,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmEmptyImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmSwitchImports,
    HlmTableImports,
    TablePaginationComponent,
  ],
  providers: [
    provideIcons({
      lucidePackage,
      lucidePlus,
      lucidePencil,
      lucideSearch,
      lucideRefreshCw,
      lucideTrash2,
    }),
  ],
  templateUrl: './raw-materials.component.html',
})
export class RawMaterialsComponent implements OnInit {
  private readonly service = inject(RawMaterialsService);
  private readonly fb = inject(NonNullableFormBuilder);

  private readonly standardKeys = new Set(STANDARD_QUALITY_PARAMETERS.map((p) => p.key));

  readonly items = signal<MateriaPrima[]>([]);
  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly searchTerm = signal<string>('');
  readonly stockFilter = signal<'all' | 'with-stock' | 'no-stock'>('all');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  readonly dialogOpen = signal<boolean>(false);
  readonly editingItem = signal<MateriaPrima | null>(null);
  readonly qualityParams = signal<ParametroCalidad[]>([]);
  readonly customParamLabel = signal<string>('');
  readonly qualityParamsError = signal<string | null>(null);

  readonly form = this.fb.group({
    nombre: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(2)]],
    unidad_medida: ['Kilogramo (kg)', [trimmedRequiredValidator()]],
    precio_mayorista: [0, [Validators.required, positiveDecimalValidator(false)]],
    cantidad_minima_venta: [1, [Validators.required, positiveDecimalValidator(false)]],
  });

  readonly unitOptions = computed<string[]>(() => {
    const base: string[] = [...UNIDADES_MEDIDA_INDUSTRIALES];
    const currentUnit = this.editingItem()?.unidad_medida?.trim();
    if (currentUnit && !base.includes(currentUnit)) {
      return [currentUnit, ...base];
    }
    return base;
  });

  readonly activeParamsCount = computed(
    () => this.qualityParams().filter((p) => p.requerido).length,
  );

  readonly filteredItems = computed(() => {
    const q = sanitizeText(this.searchTerm()).toLowerCase();
    const sf = this.stockFilter();
    return this.items().filter((item) => {
      if (sf === 'with-stock' && Number(item.stock_disponible_total) <= 0) {
        return false;
      }
      if (sf === 'no-stock' && Number(item.stock_disponible_total) > 0) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        item.codigo.toLowerCase().includes(q) ||
        item.nombre.toLowerCase().includes(q) ||
        item.unidad_medida.toLowerCase().includes(q)
      );
    });
  });

  readonly paginatedItems = computed(() => {
    const list = this.filteredItems();
    const size = this.pageSize();
    const maxPage = Math.max(1, Math.ceil(list.length / size));
    const current = Math.min(this.page(), maxPage);
    const start = (current - 1) * size;
    return list.slice(start, start + size);
  });

  ngOnInit(): void {
    void this.loadItems();
  }

  async loadItems(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.service.getAll();
      this.items.set(data);
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudo cargar el catálogo.');
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  getActiveQualityCount(item: MateriaPrima): number {
    return normalizeQualityParameters(item.parametros_calidad_exigidos).filter((p) => p.requerido)
      .length;
  }

  getActiveQualitySummary(item: MateriaPrima): string {
    return formatActiveQualityParameters(item.parametros_calidad_exigidos);
  }

  isStandardParam(key: string): boolean {
    return this.standardKeys.has(key);
  }

  openCreateDialog(): void {
    this.editingItem.set(null);
    this.customParamLabel.set('');
    this.qualityParamsError.set(null);
    this.qualityParams.set(STANDARD_QUALITY_PARAMETERS.map((p) => ({ ...p })));
    this.form.reset({
      nombre: '',
      unidad_medida: 'Kilogramo (kg)',
      precio_mayorista: 0,
      cantidad_minima_venta: 1,
    });
    this.dialogOpen.set(true);
  }

  openEditDialog(item: MateriaPrima): void {
    this.editingItem.set(item);
    this.customParamLabel.set('');
    this.qualityParamsError.set(null);
    this.qualityParams.set(this.mergeQualityParameters(item.parametros_calidad_exigidos));
    this.form.reset({
      nombre: item.nombre,
      unidad_medida: item.unidad_medida || 'Kilogramo (kg)',
      precio_mayorista: Number(item.precio_mayorista),
      cantidad_minima_venta: Number(item.cantidad_minima_venta),
    });
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    if (!this.saving()) {
      this.dialogOpen.set(false);
    }
  }

  toggleQualityParam(key: string, requerido: boolean): void {
    this.qualityParamsError.set(null);
    this.qualityParams.update((list) =>
      list.map((param) => (param.key === key ? { ...param, requerido } : param)),
    );
  }

  addCustomParam(): void {
    const label = sanitizeText(this.customParamLabel());
    if (label.length < 3) {
      toast.warning('Ingrese al menos 3 caracteres para el parámetro personalizado.');
      return;
    }

    const baseKey = label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const keyBase = baseKey || 'parametro_personalizado';
    const existingKeys = new Set(this.qualityParams().map((p) => p.key));

    let uniqueKey = keyBase;
    let suffix = 2;
    while (existingKeys.has(uniqueKey)) {
      uniqueKey = `${keyBase}_${suffix++}`;
    }

    this.qualityParams.update((list) => [...list, { key: uniqueKey, label, requerido: true }]);
    this.customParamLabel.set('');
    this.qualityParamsError.set(null);
  }

  removeCustomParam(key: string): void {
    if (this.standardKeys.has(key)) {
      return;
    }
    this.qualityParams.update((list) => list.filter((p) => p.key !== key));
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const currentParams = this.qualityParams();
    if (!currentParams.some((p) => p.requerido)) {
      this.qualityParamsError.set(
        'Active al menos un parámetro de calidad requerido para Control de Calidad.',
      );
      return;
    }

    const raw = this.form.getRawValue();
    const payload: MateriaPrimaPayload = {
      nombre: sanitizeText(raw.nombre),
      unidad_medida: sanitizeText(raw.unidad_medida),
      precio_mayorista: Number(raw.precio_mayorista),
      cantidad_minima_venta: Number(raw.cantidad_minima_venta),
      parametros_calidad_exigidos: currentParams,
    };

    this.saving.set(true);
    try {
      const current = this.editingItem();
      if (current) {
        const updated = await this.service.update(current.id_materia_prima, payload);
        this.items.update((list) =>
          list.map((i) => (i.id_materia_prima === updated.id_materia_prima ? updated : i)),
        );
        toast.success(`Materia prima "${updated.nombre}" actualizada.`);
      } else {
        const created = await this.service.create(payload);
        this.items.update((list) =>
          [...list, created].sort((a, b) => a.nombre.localeCompare(b.nombre)),
        );
        toast.success(`Materia prima "${created.nombre}" registrada (${created.codigo}).`);
      }
      this.dialogOpen.set(false);
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo guardar la materia prima.'));
    } finally {
      this.saving.set(false);
    }
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
    this.page.set(1);
  }

  onStockFilterChange(value: string | null | undefined): void {
    const v = value === 'with-stock' || value === 'no-stock' ? value : 'all';
    this.stockFilter.set(v);
    this.page.set(1);
  }

  private mergeQualityParameters(existingRaw: unknown): ParametroCalidad[] {
    const existing = normalizeQualityParameters(existingRaw);
    const byKey = new Map(existing.map((p) => [p.key, p]));

    const merged: ParametroCalidad[] = STANDARD_QUALITY_PARAMETERS.map((std) => {
      const saved = byKey.get(std.key);
      return {
        key: std.key,
        label: std.label,
        requerido: saved ? saved.requerido : false,
      };
    });

    for (const custom of existing) {
      if (!this.standardKeys.has(custom.key)) {
        merged.push({ ...custom });
      }
    }

    return merged;
  }
}
