import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertTriangle,
  lucideClipboardList,
  lucideExternalLink,
  lucideEye,
  lucideMapPin,
  lucidePhone,
  lucideRefreshCw,
  lucideSearch,
  lucideShoppingCart,
  lucideUpload,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import {
  ESTADOS_PEDIDO,
  Lote,
  MateriaPrima,
  Pago,
  Pedido,
  unwrapOne,
} from '../../../../core/models/domain.models';
import { AuthService } from '../../../../core/services/auth.service';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { LocationPickerMapComponent } from '../../../../shared/components/location-picker-map/location-picker-map.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { TablePaginationComponent } from '../../../../shared/components/table-pagination/table-pagination.component';
import { sanitizeText } from '../../../../shared/utils/sanitizers.util';
import { validateAttachmentFile } from '../../../../shared/utils/validators.util';
import { OrdersService } from '../../services/orders.service';

@Component({
  selector: 'app-my-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    RouterLink,
    NgIcon,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmEmptyImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTableImports,
    StatusBadgeComponent,
    TablePaginationComponent,
    LocationPickerMapComponent,
  ],
  providers: [
    provideIcons({
      lucideClipboardList,
      lucideShoppingCart,
      lucideSearch,
      lucideRefreshCw,
      lucideEye,
      lucideUpload,
      lucideAlertTriangle,
      lucideMapPin,
      lucidePhone,
      lucideExternalLink,
    }),
  ],
  templateUrl: './my-orders.component.html',
})
export class MyOrdersComponent implements OnInit, OnDestroy {
  private readonly ordersService = inject(OrdersService);
  private readonly authService = inject(AuthService);

  readonly estadosPedido = ESTADOS_PEDIDO;

  readonly orders = signal<Pedido[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  readonly searchTerm = signal<string>('');
  readonly statusFilter = signal<string>('all');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  readonly detailOrder = signal<Pedido | null>(null);

  readonly resubmitOrder = signal<Pedido | null>(null);
  readonly resubmitFile = signal<File | null>(null);
  readonly resubmitPreviewUrl = signal<string | null>(null);
  readonly resubmitFileError = signal<string | null>(null);
  readonly resubmitting = signal<boolean>(false);

  readonly filteredOrders = computed(() => {
    const q = sanitizeText(this.searchTerm()).toLowerCase();
    const sf = this.statusFilter();

    return this.orders().filter((order) => {
      if (sf !== 'all' && order.estado_pedido !== sf) {
        return false;
      }
      if (!q) {
        return true;
      }
      const pago = this.getPago(order);
      return (
        String(order.numero_pedido).includes(q) ||
        order.modalidad_entrega.toLowerCase().includes(q) ||
        (order.celular_contacto?.toLowerCase().includes(q) ?? false) ||
        (pago?.metodo.toLowerCase().includes(q) ?? false) ||
        (pago?.estado.toLowerCase().includes(q) ?? false)
      );
    });
  });

  readonly paginatedOrders = computed(() => {
    const list = this.filteredOrders();
    const size = this.pageSize();
    const maxPage = Math.max(1, Math.ceil(list.length / size));
    const current = Math.min(this.page(), maxPage);
    const start = (current - 1) * size;
    return list.slice(start, start + size);
  });

  ngOnInit(): void {
    void this.loadOrders();
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  getPago(order: Pedido): Pago | null {
    return unwrapOne(order.pago);
  }

  getOsmUrl(lat: number, lng: number): string {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  }

  getItemMaterialName(
    mp:
      | Pick<MateriaPrima, 'codigo' | 'nombre' | 'unidad_medida'>
      | Pick<MateriaPrima, 'codigo' | 'nombre' | 'unidad_medida'>[]
      | null
      | undefined,
  ): string {
    return unwrapOne(mp)?.nombre ?? '—';
  }

  getItemUnit(
    mp:
      | Pick<MateriaPrima, 'codigo' | 'nombre' | 'unidad_medida'>
      | Pick<MateriaPrima, 'codigo' | 'nombre' | 'unidad_medida'>[]
      | null
      | undefined,
  ): string {
    return unwrapOne(mp)?.unidad_medida ?? '';
  }

  getItemLotCode(
    lote:
      | Pick<Lote, 'id_lote' | 'codigo_unico'>
      | Pick<Lote, 'id_lote' | 'codigo_unico'>[]
      | null
      | undefined,
  ): string {
    return unwrapOne(lote)?.codigo_unico ?? '—';
  }

  async loadOrders(): Promise<void> {
    const empresa = this.authService.empresaCliente();
    if (!empresa) {
      this.error.set('No se encontró una empresa cliente vinculada a su cuenta.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.ordersService.getMyOrders(empresa.id_empresa_cliente);
      this.orders.set(data);
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudo cargar sus pedidos.');
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  openResubmitDialog(order: Pedido): void {
    this.revokePreview();
    this.resubmitFile.set(null);
    this.resubmitFileError.set(null);
    this.resubmitOrder.set(order);
  }

  closeResubmitDialog(): void {
    if (!this.resubmitting()) {
      this.revokePreview();
      this.resubmitOrder.set(null);
      this.resubmitFile.set(null);
      this.resubmitFileError.set(null);
    }
  }

  onResubmitFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.revokePreview();
    this.resubmitFileError.set(null);

    if (!file) {
      this.resubmitFile.set(null);
      return;
    }

    const err = validateAttachmentFile(file);
    if (err) {
      this.resubmitFile.set(null);
      this.resubmitFileError.set(err);
      toast.error(err);
      input.value = '';
      return;
    }

    this.resubmitFile.set(file);
    if (file.type.startsWith('image/')) {
      this.resubmitPreviewUrl.set(URL.createObjectURL(file));
    }
  }

  async submitNewReceipt(): Promise<void> {
    const order = this.resubmitOrder();
    const empresa = this.authService.empresaCliente();
    const pago = order ? this.getPago(order) : null;
    const file = this.resubmitFile();

    if (!order || !empresa || !pago) {
      return;
    }

    const validationError = validateAttachmentFile(file);
    if (validationError || !file) {
      this.resubmitFileError.set(validationError ?? 'Debe adjuntar un archivo.');
      return;
    }

    this.resubmitting.set(true);
    try {
      await this.ordersService.resubmitQrReceipt(
        pago.id_pago,
        empresa.id_empresa_cliente,
        file,
      );
      toast.success(
        `Nuevo comprobante QR enviado para el Pedido #${order.numero_pedido}. Quedó en revisión de Caja.`,
      );
      this.resubmitting.set(false);
      this.closeResubmitDialog();
      await this.loadOrders();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo reenviar el comprobante QR.'));
      this.resubmitting.set(false);
    }
  }

  private revokePreview(): void {
    const url = this.resubmitPreviewUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.resubmitPreviewUrl.set(null);
    }
  }
}
