import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBuilding2,
  lucideFileBarChart2,
  lucidePencil,
  lucidePlus,
  lucidePower,
  lucideRefreshCw,
  lucideSearch,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
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
import { Proveedor } from '../../../../core/models/domain.models';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { DynamicReportDrawerComponent } from '../../../../shared/components/dynamic-report/dynamic-report-drawer.component';
import { DynamicReportConfig } from '../../../../shared/components/dynamic-report/dynamic-report.models';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { TablePaginationComponent } from '../../../../shared/components/table-pagination/table-pagination.component';
import {
  sanitizeMultilineText,
  sanitizeNit,
  sanitizeText,
} from '../../../../shared/utils/sanitizers.util';
import {
  nitValidator,
  trimmedMinLengthValidator,
  trimmedRequiredValidator,
} from '../../../../shared/utils/validators.util';
import { ProveedorPayload, ProvidersService } from '../../services/providers.service';

@Component({
  selector: 'app-providers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmAlertImports,
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
    ConfirmDialogComponent,
    StatusBadgeComponent,
    TablePaginationComponent,
    DynamicReportDrawerComponent,
  ],
  providers: [
    provideIcons({
      lucideBuilding2,
      lucidePlus,
      lucidePencil,
      lucidePower,
      lucideSearch,
      lucideFileBarChart2,
      lucideRefreshCw,
    }),
  ],
  templateUrl: './providers.component.html',
})
export class ProvidersComponent implements OnInit {
  private readonly service = inject(ProvidersService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly items = signal<Proveedor[]>([]);
  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly toggling = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly searchTerm = signal<string>('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly countryFilter = signal<string>('all');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  readonly dialogOpen = signal<boolean>(false);
  readonly editingItem = signal<Proveedor | null>(null);
  readonly confirmTarget = signal<Proveedor | null>(null);
  readonly reportOpen = signal<boolean>(false);

  readonly form = this.fb.group({
    identificacion_fiscal: ['', [trimmedRequiredValidator(), nitValidator()]],
    razon_social: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(3)]],
    pais_origen: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(2)]],
    datos_contacto: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(5)]],
  });

  readonly distinctCountries = computed(() =>
    Array.from(new Set(this.items().map((p) => p.pais_origen).filter(Boolean))).sort(),
  );

  readonly filteredItems = computed(() => {
    const q = sanitizeText(this.searchTerm()).toLowerCase();
    const sf = this.statusFilter();
    const cf = this.countryFilter();

    return this.items().filter((p) => {
      if (sf === 'active' && !p.activo) {
        return false;
      }
      if (sf === 'inactive' && p.activo) {
        return false;
      }
      if (cf !== 'all' && p.pais_origen !== cf) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        p.identificacion_fiscal.toLowerCase().includes(q) ||
        p.razon_social.toLowerCase().includes(q) ||
        p.pais_origen.toLowerCase().includes(q) ||
        p.datos_contacto.toLowerCase().includes(q)
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

  readonly reportConfig = computed<DynamicReportConfig<Proveedor>>(() => ({
    title: 'Reporte de Directorio de Proveedores',
    subtitle: 'Proveedores internacionales y locales habilitados para recepción de materias primas.',
    filenamePrefix: 'directorio-proveedores',
    searchFields: [
      (r) => r.identificacion_fiscal,
      (r) => r.razon_social,
      (r) => r.pais_origen,
      (r) => r.datos_contacto,
    ],
    columns: [
      { key: 'identificacion_fiscal', label: 'Identificación Fiscal', getValue: (r) => r.identificacion_fiscal },
      { key: 'razon_social', label: 'Razón Social', getValue: (r) => r.razon_social },
      { key: 'pais_origen', label: 'País de Origen', getValue: (r) => r.pais_origen },
      { key: 'datos_contacto', label: 'Datos de Contacto', getValue: (r) => r.datos_contacto },
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
        label: 'Estado',
        type: 'boolean',
        trueLabel: 'Activos',
        falseLabel: 'Inactivos',
        accessor: (r) => r.activo,
      },
      {
        key: 'pais_origen',
        label: 'País de origen',
        type: 'select',
        options: this.distinctCountries().map((c) => ({ label: c, value: c })),
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
  }));

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
      const msg = translateSupabaseError(err, 'No se pudo cargar los proveedores.');
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  openCreateDialog(): void {
    this.editingItem.set(null);
    this.form.reset({
      identificacion_fiscal: '',
      razon_social: '',
      pais_origen: '',
      datos_contacto: '',
    });
    this.dialogOpen.set(true);
  }

  openEditDialog(item: Proveedor): void {
    this.editingItem.set(item);
    this.form.reset({
      identificacion_fiscal: item.identificacion_fiscal,
      razon_social: item.razon_social,
      pais_origen: item.pais_origen,
      datos_contacto: item.datos_contacto,
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
    const payload: ProveedorPayload = {
      identificacion_fiscal: sanitizeNit(raw.identificacion_fiscal),
      razon_social: sanitizeText(raw.razon_social),
      pais_origen: sanitizeText(raw.pais_origen),
      datos_contacto: sanitizeMultilineText(raw.datos_contacto),
    };

    this.saving.set(true);
    try {
      const current = this.editingItem();
      if (current) {
        const updated = await this.service.update(current.id_proveedor, payload);
        this.items.update((list) =>
          list.map((i) => (i.id_proveedor === updated.id_proveedor ? updated : i)),
        );
        toast.success(`Proveedor "${updated.razon_social}" actualizado.`);
      } else {
        const created = await this.service.create(payload);
        this.items.update((list) =>
          [...list, created].sort((a, b) => a.razon_social.localeCompare(b.razon_social)),
        );
        toast.success(`Proveedor "${created.razon_social}" registrado.`);
      }
      this.dialogOpen.set(false);
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo guardar el proveedor.'));
    } finally {
      this.saving.set(false);
    }
  }

  requestToggleActive(item: Proveedor): void {
    this.confirmTarget.set(item);
  }

  async confirmToggleActive(): Promise<void> {
    const target = this.confirmTarget();
    if (!target) {
      return;
    }

    this.toggling.set(true);
    const nextState = !target.activo;
    try {
      const updated = await this.service.toggleActive(target.id_proveedor, nextState);
      this.items.update((list) =>
        list.map((i) => (i.id_proveedor === updated.id_proveedor ? updated : i)),
      );
      toast.success(
        `Proveedor "${updated.razon_social}" marcado como ${updated.activo ? 'Activo' : 'Inactivo'}.`,
      );
      this.confirmTarget.set(null);
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo actualizar el estado.'));
    } finally {
      this.toggling.set(false);
    }
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
    this.page.set(1);
  }

  onStatusFilterChange(value: string | null | undefined): void {
    const v = value === 'active' || value === 'inactive' ? value : 'all';
    this.statusFilter.set(v);
    this.page.set(1);
  }

  onCountryFilterChange(value: string | null | undefined): void {
    this.countryFilter.set(value || 'all');
    this.page.set(1);
  }
}
