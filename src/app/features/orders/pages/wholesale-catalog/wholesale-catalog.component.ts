import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertCircle,
  lucideBanknote,
  lucideCheckCircle2,
  lucideClipboardList,
  lucideMapPin,
  lucidePackageCheck,
  lucidePlus,
  lucideQrCode,
  lucideRefreshCw,
  lucideSearch,
  lucideShoppingCart,
  lucideTrash2,
  lucideTruck,
  lucideUpload,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import {
  MateriaPrima,
  MetodoPago,
  ModalidadEntrega,
  RpcPedidoItemParam,
} from '../../../../core/models/domain.models';
import { AuthService } from '../../../../core/services/auth.service';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { sanitizeText } from '../../../../shared/utils/sanitizers.util';
import {
  trimmedMinLengthValidator,
  trimmedRequiredValidator,
  validateAttachmentFile,
} from '../../../../shared/utils/validators.util';
import {
  PROCESADORES_PAGO,
  ResultadoProcesamientoPago,
  SolicitudPedidoPago,
} from '../../contracts/procesador-pago.interface';
import {
  AsignacionLote,
  CatalogoProductoDisponible,
  LoteDisponibleFEFO,
  OrdersService,
} from '../../services/orders.service';

export interface CartItem {
  materiaPrima: MateriaPrima;
  cantidad: number;
  stockEfectivo: number;
  lotesDisponibles: LoteDisponibleFEFO[];
  asignaciones: AsignacionLote[];
  subtotal: number;
}

@Component({
  selector: 'app-wholesale-catalog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmEmptyImports,
    HlmFieldImports,
    HlmInputImports,
    HlmRadioGroupImports,
    HlmSeparatorImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTextareaImports,
    ConfirmDialogComponent,
  ],
  providers: [
    provideIcons({
      lucideShoppingCart,
      lucideSearch,
      lucideRefreshCw,
      lucidePlus,
      lucideTrash2,
      lucideTruck,
      lucidePackageCheck,
      lucideMapPin,
      lucideQrCode,
      lucideBanknote,
      lucideUpload,
      lucideAlertCircle,
      lucideCheckCircle2,
      lucideClipboardList,
    }),
  ],
  templateUrl: './wholesale-catalog.component.html',
})
export class WholesaleCatalogComponent implements OnInit, OnDestroy {
  private readonly ordersService = inject(OrdersService);
  private readonly procesadores = inject(PROCESADORES_PAGO);
  readonly authService = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly catalog = signal<CatalogoProductoDisponible[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal<string>('');

  readonly draftQuantities = signal<Record<string, number>>({});
  readonly productErrors = signal<Record<string, string>>({});
  readonly cartItems = signal<CartItem[]>([]);

  readonly selectedDelivery = signal<ModalidadEntrega>('Recojo en el local');
  readonly selectedPaymentMethod = signal<MetodoPago>('QR');
  readonly selectedFile = signal<File | null>(null);
  readonly filePreviewUrl = signal<string | null>(null);
  readonly fileError = signal<string | null>(null);

  readonly confirmOrderOpen = signal<boolean>(false);
  readonly submittingOrder = signal<boolean>(false);
  readonly lastOrderResult = signal<ResultadoProcesamientoPago | null>(null);

  readonly checkoutForm = this.fb.group({
    modalidad_entrega: ['Recojo en el local' as ModalidadEntrega, [Validators.required]],
    direccion_destino: [''],
    metodo_pago: ['QR' as MetodoPago, [Validators.required]],
  });

  readonly filteredCatalog = computed(() => {
    const q = sanitizeText(this.searchTerm()).toLowerCase();
    if (!q) {
      return this.catalog();
    }
    return this.catalog().filter(
      (item) =>
        item.materiaPrima.nombre.toLowerCase().includes(q) ||
        item.materiaPrima.codigo.toLowerCase().includes(q) ||
        item.materiaPrima.unidad_medida.toLowerCase().includes(q),
    );
  });

  readonly totalMayorista = computed(() =>
    Math.round(this.cartItems().reduce((acc, item) => acc + item.subtotal, 0) * 100) / 100,
  );

  constructor() {
    this.checkoutForm.controls.modalidad_entrega.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((modalidad) => {
        this.selectedDelivery.set(modalidad);
        const dirCtrl = this.checkoutForm.controls.direccion_destino;
        if (modalidad === 'Envío a dirección en camión') {
          dirCtrl.setValidators([trimmedRequiredValidator(), trimmedMinLengthValidator(5)]);
          if (!dirCtrl.value.trim()) {
            const defaultAddr = this.authService.empresaCliente()?.direccion_entrega ?? '';
            dirCtrl.setValue(defaultAddr, { emitEvent: false });
          }
        } else {
          dirCtrl.clearValidators();
        }
        dirCtrl.updateValueAndValidity({ emitEvent: false });
      });

    this.checkoutForm.controls.metodo_pago.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((metodo) => {
        this.selectedPaymentMethod.set(metodo);
        this.fileError.set(null);
      });
  }

  ngOnInit(): void {
    void this.loadCatalog();
  }

  ngOnDestroy(): void {
    this.revokePreviewUrl();
  }

  async loadCatalog(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.ordersService.getAvailableWholesaleCatalog();
      this.catalog.set(data);
      const defaults: Record<string, number> = {};
      for (const entry of data) {
        defaults[entry.materiaPrima.id_materia_prima] = Number(
          entry.materiaPrima.cantidad_minima_venta,
        );
      }
      this.draftQuantities.set(defaults);
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudo cargar el catálogo mayorista.');
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  getDraftQuantity(idMateriaPrima: string, fallback: number): number {
    return this.draftQuantities()[idMateriaPrima] ?? fallback;
  }

  onDraftQuantityInput(idMateriaPrima: string, rawValue: string): void {
    const parsed = Number(rawValue);
    this.draftQuantities.update((prev) => ({
      ...prev,
      [idMateriaPrima]: Number.isFinite(parsed) ? parsed : 0,
    }));
    this.productErrors.update((prev) => {
      const copy = { ...prev };
      delete copy[idMateriaPrima];
      return copy;
    });
  }

  addToCart(product: CatalogoProductoDisponible): void {
    const mp = product.materiaPrima;
    const requestedQty = Number(this.getDraftQuantity(mp.id_materia_prima, mp.cantidad_minima_venta));

    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      const msg = 'Ingrese una cantidad numérica válida mayor a 0.';
      this.setProductError(mp.id_materia_prima, msg);
      toast.error(msg);
      return;
    }

    if (requestedQty < Number(mp.cantidad_minima_venta)) {
      const msg = `La cantidad mínima de venta mayorista es ${Number(mp.cantidad_minima_venta)} ${mp.unidad_medida}.`;
      this.setProductError(mp.id_materia_prima, msg);
      toast.error(msg);
      return;
    }

    const existing = this.cartItems().find((c) => c.materiaPrima.id_materia_prima === mp.id_materia_prima);
    const totalRequested = existing
      ? Math.round((existing.cantidad + requestedQty) * 100) / 100
      : Math.round(requestedQty * 100) / 100;

    if (totalRequested > product.stockEfectivo) {
      const msg = `Cantidad solicitada (${totalRequested} ${mp.unidad_medida}) supera el stock efectivo disponible (${product.stockEfectivo} ${mp.unidad_medida}).`;
      this.setProductError(mp.id_materia_prima, msg);
      toast.error(msg);
      return;
    }

    const asignaciones = this.ordersService.allocateLotsFEFO(
      product.lotesDisponibles,
      totalRequested,
    );
    const subtotal = Math.round(totalRequested * Number(mp.precio_mayorista) * 100) / 100;

    this.cartItems.update((items) => {
      const idx = items.findIndex((i) => i.materiaPrima.id_materia_prima === mp.id_materia_prima);
      const nextItem: CartItem = {
        materiaPrima: mp,
        cantidad: totalRequested,
        stockEfectivo: product.stockEfectivo,
        lotesDisponibles: product.lotesDisponibles,
        asignaciones,
        subtotal,
      };
      if (idx >= 0) {
        return items.map((item, i) => (i === idx ? nextItem : item));
      }
      return [...items, nextItem];
    });

    this.setProductError(mp.id_materia_prima, '');
    toast.success(`${mp.nombre} agregado al pedido.`);
  }

  updateCartItemQuantity(idMateriaPrima: string, rawValue: string): void {
    const qty = Number(rawValue);
    const item = this.cartItems().find((c) => c.materiaPrima.id_materia_prima === idMateriaPrima);
    if (!item) {
      return;
    }

    if (!Number.isFinite(qty) || qty < Number(item.materiaPrima.cantidad_minima_venta)) {
      toast.error(
        `El mínimo mayorista para ${item.materiaPrima.nombre} es ${item.materiaPrima.cantidad_minima_venta} ${item.materiaPrima.unidad_medida}.`,
      );
      return;
    }

    if (qty > item.stockEfectivo) {
      toast.error(
        `Stock máximo disponible para ${item.materiaPrima.nombre}: ${item.stockEfectivo} ${item.materiaPrima.unidad_medida}.`,
      );
      return;
    }

    const rounded = Math.round(qty * 100) / 100;
    const asignaciones = this.ordersService.allocateLotsFEFO(item.lotesDisponibles, rounded);
    const subtotal =
      Math.round(rounded * Number(item.materiaPrima.precio_mayorista) * 100) / 100;

    this.cartItems.update((list) =>
      list.map((c) =>
        c.materiaPrima.id_materia_prima === idMateriaPrima
          ? { ...c, cantidad: rounded, asignaciones, subtotal }
          : c,
      ),
    );
  }

  removeFromCart(idMateriaPrima: string): void {
    this.cartItems.update((list) =>
      list.filter((c) => c.materiaPrima.id_materia_prima !== idMateriaPrima),
    );
  }

  onReceiptFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.revokePreviewUrl();
    this.fileError.set(null);

    if (!file) {
      this.selectedFile.set(null);
      return;
    }

    const err = validateAttachmentFile(file);
    if (err) {
      this.selectedFile.set(null);
      this.fileError.set(err);
      toast.error(err);
      input.value = '';
      return;
    }

    this.selectedFile.set(file);
    if (file.type.startsWith('image/')) {
      this.filePreviewUrl.set(URL.createObjectURL(file));
    }
  }

  clearSelectedFile(): void {
    this.revokePreviewUrl();
    this.selectedFile.set(null);
    this.fileError.set(null);
  }

  requestSubmitOrder(): void {
    this.lastOrderResult.set(null);
    if (this.cartItems().length === 0) {
      toast.error('Agregue al menos una materia prima al pedido.');
      return;
    }

    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      return;
    }

    const solicitud = this.buildPaymentRequest();
    if (!solicitud) {
      return;
    }

    const procesador = this.procesadores.find((p) => p.metodo === this.selectedPaymentMethod());
    if (!procesador) {
      toast.error('Método de pago no disponible.');
      return;
    }

    const validationError = procesador.validar(solicitud);
    if (validationError) {
      if (this.selectedPaymentMethod() === 'QR') {
        this.fileError.set(validationError);
      }
      toast.error(validationError);
      return;
    }

    this.confirmOrderOpen.set(true);
  }

  async confirmSubmitOrder(): Promise<void> {
    const solicitud = this.buildPaymentRequest();
    const procesador = this.procesadores.find((p) => p.metodo === this.selectedPaymentMethod());
    if (!solicitud || !procesador) {
      return;
    }

    this.submittingOrder.set(true);
    try {
      const result = await procesador.procesarPago(solicitud);
      this.lastOrderResult.set(result);
      this.cartItems.set([]);
      this.clearSelectedFile();
      this.confirmOrderOpen.set(false);
      toast.success(`Pedido #${result.numeroPedido} registrado correctamente.`);
      await this.loadCatalog();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo procesar el pedido.'));
    } finally {
      this.submittingOrder.set(false);
    }
  }

  private buildPaymentRequest(): SolicitudPedidoPago | null {
    const empresa = this.authService.empresaCliente();
    if (!empresa) {
      toast.error('Su usuario no tiene una empresa cliente vinculada.');
      return null;
    }

    const raw = this.checkoutForm.getRawValue();
    const items: RpcPedidoItemParam[] = this.cartItems().flatMap((c) =>
      c.asignaciones.map((a) => ({
        id_lote: a.id_lote,
        cantidad: a.cantidad,
      })),
    );

    return {
      idEmpresaCliente: empresa.id_empresa_cliente,
      modalidadEntrega: raw.modalidad_entrega,
      direccionDestino:
        raw.modalidad_entrega === 'Envío a dirección en camión'
          ? sanitizeText(raw.direccion_destino)
          : null,
      items,
      archivoComprobante: raw.metodo_pago === 'QR' ? this.selectedFile() : null,
    };
  }

  private setProductError(idMateriaPrima: string, message: string): void {
    this.productErrors.update((prev) => {
      const next = { ...prev };
      if (!message) {
        delete next[idMateriaPrima];
      } else {
        next[idMateriaPrima] = message;
      }
      return next;
    });
  }

  private revokePreviewUrl(): void {
    const url = this.filePreviewUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.filePreviewUrl.set(null);
    }
  }
}
