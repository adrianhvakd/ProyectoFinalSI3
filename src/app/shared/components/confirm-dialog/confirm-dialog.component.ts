import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmAlertDialogImports, HlmSpinnerImports],
  templateUrl: './confirm-dialog.component.html',
})
export class ConfirmDialogComponent {
  readonly open = input<boolean>(false);
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly confirmLabel = input<string>('Confirmar');
  readonly cancelLabel = input<string>('Cancelar');
  readonly variant = input<'default' | 'destructive'>('default');
  readonly loading = input<boolean>(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  onClosed(): void {
    if (!this.loading()) {
      this.cancelled.emit();
    }
  }

  onConfirm(): void {
    if (!this.loading()) {
      this.confirmed.emit();
    }
  }
}
