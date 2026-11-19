import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

export type StatusKind = 'lote' | 'pago' | 'pedido' | 'entrega' | 'boolean' | 'calidad';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports],
  templateUrl: './status-badge.component.html',
})
export class StatusBadgeComponent {
  readonly status = input.required<string>();
  readonly kind = input<StatusKind>('lote');

  readonly badgeStyle = computed<{
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    extraClass: string;
  }>(() => {
    const val = this.status();

    switch (val) {
      case 'Aprobado / Disponible':
      case 'Aprobado':
      case 'Aprobado / Recibido':
      case 'Entregado':
      case 'Activo':
      case 'Disponible':
      case 'Cumple':
        return {
          variant: 'outline',
          extraClass:
            'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
        };

      case 'Observado':
      case 'Pendiente de verificación':
      case 'Pendiente (a que el camión lo recoja)':
        return {
          variant: 'outline',
          extraClass:
            'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
        };

      case 'En revisión':
      case 'Pendiente':
      case 'Enviado':
        return {
          variant: 'secondary',
          extraClass: 'border-border bg-secondary text-secondary-foreground',
        };

      case 'Devuelto':
      case 'Rechazado':
      case 'Inactivo':
      case 'No cumple':
      case 'Ocupado':
        return {
          variant: 'destructive',
          extraClass: 'border-destructive/30',
        };

      default:
        return {
          variant: 'outline',
          extraClass: '',
        };
    }
  });
}
