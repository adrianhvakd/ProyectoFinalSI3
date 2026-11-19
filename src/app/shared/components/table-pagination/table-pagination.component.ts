import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';

@Component({
  selector: 'app-table-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmNativeSelectImports],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  templateUrl: './table-pagination.component.html',
})
export class TablePaginationComponent {
  readonly totalItems = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input<number>(10);
  readonly pageSizeOptions = input<readonly number[]>([10, 25, 50]);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly totalPages = computed(() => {
    const total = this.totalItems();
    const size = Math.max(1, this.pageSize());
    return Math.max(1, Math.ceil(total / size));
  });

  readonly startItem = computed(() => {
    if (this.totalItems() === 0) {
      return 0;
    }
    return (this.page() - 1) * this.pageSize() + 1;
  });

  readonly endItem = computed(() => {
    return Math.min(this.totalItems(), this.page() * this.pageSize());
  });

  previous(): void {
    if (this.page() > 1) {
      this.pageChange.emit(this.page() - 1);
    }
  }

  next(): void {
    if (this.page() < this.totalPages()) {
      this.pageChange.emit(this.page() + 1);
    }
  }

  onPageSizeChanged(value: string | null | undefined): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      this.pageSizeChange.emit(parsed);
    }
  }
}
