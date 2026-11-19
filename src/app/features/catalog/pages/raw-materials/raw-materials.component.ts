import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFileBarChart2,
  lucidePackage,
  lucidePencil,
  lucidePlus,
  lucideRefreshCw,
  lucideSearch,
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
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { MateriaPrima } from '../../../../core/models/domain.models';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { DynamicReportDrawerComponent } from '../../../../shared/components/dynamic-report/dynamic-report-drawer.component';
import { DynamicReportConfig } from '../../../../shared/components/dynamic-report/dynamic-report.models';
import { TablePaginationComponent } from '../../../../shared/components/table-pagination/table-pagination.component';
import {
  sanitizeCode,
  sanitizeMultilineText,
  sanitizeText,
} from '../../../../shared/utils/sanitizers.util';
import {
  positiveDecimalValidator,
  trimmedMinLengthValidator,
  trimmedRequiredValidator,
  uniqueCodeFormatValidator,
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
    HlmTableImports,
    HlmTextareaImports,
    TablePaginationComponent,
    DynamicReportDrawerComponent,
  ],
  providers: [
    provideIcons({
      lucidePackage,
      lucidePlus,
      lucidePencil,
      lucideSearch,
      lucideFileBarChart2,
      lucideRefreshCw,
    }),
  ],
  templateUrl: './raw-materials.component.html',
})
export class RawMaterialsComponent implements OnInit {
  private readonly service = inject(RawMaterialsService);
  private readonly fb = inject(NonNullableFormBuilder);

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
  readonly reportOpen = signal<boolean>(false);

  readonly form = this.fb.group({
    codigo: ['', [trimmedRequiredValidator(), uniqueCodeFormatValidator()]],
    nombre: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(2)]],
    unidad_medida: ['', [trimmedRequiredValidator()]],
    precio_mayorista: [0, [Validators.required, positiveDecimalValidator(false)]],
    cantidad_minima_venta: [1, [Validators.required, positiveDecimalValidator(false)]],
    parametros_calidad_exigidos: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(5)]],
  });

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

  readonly reportConfig = computed<DynamicReportConfig<MateriaPrima>>(() => {
    const distinctUnits = Array.from(
      new Set(this.items().map((i) => i.unidad_medida).filter(Boolean)),
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
          getValue: (r) => r.parametros_calidad_exigidos,
        },
      ],
      filters: [
        {
          key: 'stock',
          label: 'Disponibilidad de stock',
          type: 'boolean',
          trueLabel: 'Con stock disponible',
          falseLabel: 'Sin stock (0)',
          accessor: (r) => Number(r.stock_disponible_total) > 0,
        },
        {
          key: 'unidad_medida',
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

  openCreateDialog(): void {
    this.editingItem.set(null);
    this.form.reset({
      codigo: '',
      nombre: '',
      unidad_medida: 'kg',
      precio_mayorista: 0,
      cantidad_minima_venta: 1,
      parametros_calidad_exigidos: '',
    });
    this.dialogOpen.set(true);
  }

  openEditDialog(item: MateriaPrima): void {
    this.editingItem.set(item);
    this.form.reset({
      codigo: item.codigo,
      nombre: item.nombre,
      unidad_medida: item.unidad_medida,
      precio_mayorista: Number(item.precio_mayorista),
      cantidad_minima_venta: Number(item.cantidad_minima_venta),
      parametros_calidad_exigidos: item.parametros_calidad_exigidos,
    });
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    if (!this.saving()) {
      this.dialogOpen.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload: MateriaPrimaPayload = {
      codigo: sanitizeCode(raw.codigo),
      nombre: sanitizeText(raw.nombre),
      unidad_medida: sanitizeText(raw.unidad_medida),
      precio_mayorista: Number(raw.precio_mayorista),
      cantidad_minima_venta: Number(raw.cantidad_minima_venta),
      parametros_calidad_exigidos: sanitizeMultilineText(raw.parametros_calidad_exigidos),
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
        toast.success(`Materia prima "${created.nombre}" registrada.`);
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
}
