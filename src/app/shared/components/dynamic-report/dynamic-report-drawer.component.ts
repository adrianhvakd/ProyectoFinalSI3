import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideColumns3,
  lucideDownload,
  lucideFileSpreadsheet,
  lucideFileText,
  lucideFilter,
  lucideRotateCcw,
  lucideSearch,
  lucideSlidersHorizontal,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { extractDateKey, sanitizeText } from '../../utils/sanitizers.util';
import { TablePaginationComponent } from '../table-pagination/table-pagination.component';
import {
  AppliedFilterSummary,
  ComputedSummaryItem,
  DynamicReportConfig,
  ReportColumn,
  ReportFilterDef,
} from './dynamic-report.models';
import { ReportExportService } from './report-export.service';

function omitRecordKeys<V>(record: Record<string, V>, keysToRemove: Set<string>): Record<string, V> {
  const next: Record<string, V> = {};
  for (const [k, v] of Object.entries(record)) {
    if (!keysToRemove.has(k)) {
      next[k] = v;
    }
  }
  return next;
}

@Component({
  selector: 'app-dynamic-report-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmCheckboxImports,
    HlmEmptyImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSeparatorImports,
    HlmSheetImports,
    HlmSpinnerImports,
    HlmTableImports,
    TablePaginationComponent,
  ],
  providers: [
    provideIcons({
      lucideColumns3,
      lucideFilter,
      lucideSearch,
      lucideRotateCcw,
      lucideFileSpreadsheet,
      lucideFileText,
      lucideDownload,
      lucideSlidersHorizontal,
    }),
  ],
  templateUrl: './dynamic-report-drawer.component.html',
})
export class DynamicReportDrawerComponent<T> {
  private readonly exportService = inject(ReportExportService);

  readonly open = input<boolean>(false);
  readonly config = input.required<DynamicReportConfig<T>>();
  readonly data = input.required<readonly T[]>();
  readonly loading = input<boolean>(false);

  readonly openChange = output<boolean>();

  readonly selectedColumnKeys = signal<string[]>([]);
  readonly searchText = signal<string>('');
  readonly selectFilterValues = signal<Record<string, string>>({});
  readonly booleanFilterValues = signal<Record<string, string>>({});
  readonly dateRangeValues = signal<Record<string, { from: string; to: string }>>({});
  readonly previewPage = signal<number>(1);
  readonly previewPageSize = signal<number>(10);
  readonly exportingFormat = signal<'xlsx' | 'csv' | 'pdf' | null>(null);

  constructor() {
    effect(() => {
      const cfg = this.config();
      untracked(() => {
        this.resetColumns(cfg);
        this.clearFilters();
      });
    });
  }

  readonly visibleColumns = computed<ReportColumn<T>[]>(() => {
    const selected = new Set(this.selectedColumnKeys());
    return this.config().columns.filter((col) => selected.has(col.key));
  });

  readonly filteredRows = computed<T[]>(() => {
    const cfg = this.config();
    const rows = this.data();
    const visibleSet = new Set(this.selectedColumnKeys());
    const query = sanitizeText(this.searchText()).toLowerCase();
    const selects = this.selectFilterValues();
    const booleans = this.booleanFilterValues();
    const ranges = this.dateRangeValues();

    return rows.filter((row) => {
      if (query) {
        const matchesSearch = cfg.searchFields.some((getter) =>
          String(getter(row) ?? '')
            .toLowerCase()
            .includes(query),
        );
        if (!matchesSearch) {
          return false;
        }
      }

      for (const filter of cfg.filters) {
        if (!visibleSet.has(filter.columnKey)) {
          continue;
        }

        if (filter.type === 'select') {
          const val = selects[filter.key] ?? 'all';
          if (val !== 'all') {
            const actual = String(filter.accessor(row) ?? '');
            if (actual !== val) {
              return false;
            }
          }
        } else if (filter.type === 'boolean') {
          const val = booleans[filter.key] ?? 'all';
          if (val !== 'all') {
            const actual = filter.accessor(row);
            const expected = val === 'true';
            if (actual !== expected) {
              return false;
            }
          }
        } else if (filter.type === 'date-range') {
          const range = ranges[filter.key];
          if (range && (range.from || range.to)) {
            const actualDate = extractDateKey(filter.accessor(row));
            if (!actualDate) {
              return false;
            }
            if (range.from && actualDate < range.from) {
              return false;
            }
            if (range.to && actualDate > range.to) {
              return false;
            }
          }
        }
      }

      return true;
    });
  });

  readonly previewRows = computed<T[]>(() => {
    const rows = this.filteredRows();
    const size = this.previewPageSize();
    const totalPages = Math.max(1, Math.ceil(rows.length / size));
    const safePage = Math.min(this.previewPage(), totalPages);
    const start = (safePage - 1) * size;
    return rows.slice(start, start + size);
  });

  readonly computedSummary = computed<ComputedSummaryItem[]>(() => {
    const rows = this.filteredRows();
    const base: ComputedSummaryItem[] = [
      { label: 'Registros filtrados', value: String(rows.length) },
    ];
    const extra = (this.config().summaryCards ?? []).map((card) => ({
      label: card.label,
      value: card.compute(rows),
    }));
    return [...base, ...extra];
  });

  readonly appliedFiltersSummary = computed<AppliedFilterSummary[]>(() => {
    const cfg = this.config();
    const visibleSet = new Set(this.selectedColumnKeys());
    const summary: AppliedFilterSummary[] = [];
    const query = sanitizeText(this.searchText());
    if (query) {
      summary.push({ label: 'Búsqueda', value: query });
    }

    const selects = this.selectFilterValues();
    const booleans = this.booleanFilterValues();
    const ranges = this.dateRangeValues();

    for (const filter of cfg.filters) {
      if (!visibleSet.has(filter.columnKey)) {
        continue;
      }

      if (filter.type === 'select') {
        const val = selects[filter.key] ?? 'all';
        if (val !== 'all') {
          const opt = filter.options.find((o) => o.value === val);
          summary.push({ label: filter.label, value: opt?.label ?? val });
        }
      } else if (filter.type === 'boolean') {
        const val = booleans[filter.key] ?? 'all';
        if (val !== 'all') {
          summary.push({
            label: filter.label,
            value:
              val === 'true' ? (filter.trueLabel ?? 'Sí') : (filter.falseLabel ?? 'No'),
          });
        }
      } else if (filter.type === 'date-range') {
        const range = ranges[filter.key];
        if (range && (range.from || range.to)) {
          summary.push({
            label: filter.label,
            value: `${range.from || 'Inicio'} a ${range.to || 'Actual'}`,
          });
        }
      }
    }

    return summary;
  });

  isColumnVisible(key: string): boolean {
    return this.selectedColumnKeys().includes(key);
  }

  isFilterEnabled(filter: ReportFilterDef<T>): boolean {
    return this.selectedColumnKeys().includes(filter.columnKey);
  }

  toggleColumn(key: string, checked: boolean): void {
    const current = this.selectedColumnKeys();
    if (!checked && current.length <= 1) {
      toast.warning('Debe mantener al menos una columna visible en el reporte.');
      return;
    }

    if (checked) {
      if (!current.includes(key)) {
        const order = this.config().columns.map((c) => c.key);
        const next = [...current, key].sort((a, b) => order.indexOf(a) - order.indexOf(b));
        this.selectedColumnKeys.set(next);
      }
    } else {
      const next = current.filter((k) => k !== key);
      this.selectedColumnKeys.set(next);
      this.pruneDisabledFilters(next);
    }
  }

  selectAllColumns(): void {
    this.selectedColumnKeys.set(this.config().columns.map((c) => c.key));
  }

  resetColumns(cfg = this.config()): void {
    const defaults = cfg.columns
      .filter((c) => c.defaultVisible !== false)
      .map((c) => c.key);
    const next = defaults.length > 0 ? defaults : cfg.columns.map((c) => c.key);
    this.selectedColumnKeys.set(next);
    this.pruneDisabledFilters(next, cfg);
  }

  onSearchChange(value: string): void {
    this.searchText.set(value);
    this.previewPage.set(1);
  }

  onSelectFilterChange(filter: ReportFilterDef<T>, value: string | null | undefined): void {
    if (!this.isFilterEnabled(filter)) {
      return;
    }
    this.selectFilterValues.update((prev) => ({ ...prev, [filter.key]: value || 'all' }));
    this.previewPage.set(1);
  }

  onBooleanFilterChange(filter: ReportFilterDef<T>, value: string | null | undefined): void {
    if (!this.isFilterEnabled(filter)) {
      return;
    }
    this.booleanFilterValues.update((prev) => ({ ...prev, [filter.key]: value || 'all' }));
    this.previewPage.set(1);
  }

  onDateRangeChange(filter: ReportFilterDef<T>, bound: 'from' | 'to', value: string): void {
    if (!this.isFilterEnabled(filter)) {
      return;
    }
    this.dateRangeValues.update((prev) => {
      const existing = prev[filter.key] ?? { from: '', to: '' };
      return {
        ...prev,
        [filter.key]: {
          ...existing,
          [bound]: value,
        },
      };
    });
    this.previewPage.set(1);
  }

  getDateBound(filter: ReportFilterDef<T>, bound: 'from' | 'to'): string {
    if (!this.isFilterEnabled(filter)) {
      return '';
    }
    return this.dateRangeValues()[filter.key]?.[bound] ?? '';
  }

  clearFilters(): void {
    this.searchText.set('');
    this.selectFilterValues.set({});
    this.booleanFilterValues.set({});
    this.dateRangeValues.set({});
    this.previewPage.set(1);
  }

  formatCell(col: ReportColumn<T>, row: T): string {
    return this.exportService.formatCell(col, row);
  }

  async exportXlsx(): Promise<void> {
    if (this.filteredRows().length === 0 || this.exportingFormat()) {
      return;
    }
    this.exportingFormat.set('xlsx');
    try {
      await this.exportService.exportXlsx(
        this.config(),
        this.visibleColumns(),
        this.filteredRows(),
      );
      toast.success('Archivo Excel (.xlsx) generado correctamente.');
    } catch {
      toast.error('No se pudo generar el archivo Excel.');
    } finally {
      this.exportingFormat.set(null);
    }
  }

  exportCsv(): void {
    if (this.filteredRows().length === 0 || this.exportingFormat()) {
      return;
    }
    this.exportingFormat.set('csv');
    try {
      this.exportService.exportCsv(
        this.config(),
        this.visibleColumns(),
        this.filteredRows(),
      );
      toast.success('Archivo CSV UTF-8 generado correctamente.');
    } catch {
      toast.error('No se pudo generar el archivo CSV.');
    } finally {
      this.exportingFormat.set(null);
    }
  }

  async exportPdf(): Promise<void> {
    if (this.filteredRows().length === 0 || this.exportingFormat()) {
      return;
    }
    this.exportingFormat.set('pdf');
    try {
      await this.exportService.exportPdf(
        this.config(),
        this.visibleColumns(),
        this.filteredRows(),
        this.appliedFiltersSummary(),
        this.computedSummary(),
      );
      toast.success('Documento PDF institucional generado correctamente.');
    } catch {
      toast.error('No se pudo generar el reporte PDF.');
    } finally {
      this.exportingFormat.set(null);
    }
  }

  close(): void {
    if (!this.exportingFormat()) {
      this.openChange.emit(false);
    }
  }

  private pruneDisabledFilters(
    visibleKeys: readonly string[],
    cfg = this.config(),
  ): void {
    const visibleSet = new Set(visibleKeys);
    const disabledFilterKeys = new Set(
      cfg.filters.filter((f) => !visibleSet.has(f.columnKey)).map((f) => f.key),
    );
    if (disabledFilterKeys.size === 0) {
      return;
    }

    this.selectFilterValues.update((prev) => omitRecordKeys(prev, disabledFilterKeys));
    this.booleanFilterValues.update((prev) => omitRecordKeys(prev, disabledFilterKeys));
    this.dateRangeValues.update((prev) => omitRecordKeys(prev, disabledFilterKeys));
    this.previewPage.set(1);
  }
}
