import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeCheck,
  lucideCheck,
  lucideExternalLink,
  lucideEye,
  lucideFileBarChart2,
  lucideRefreshCw,
  lucideSearch,
  lucideX,
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
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import {
  ESTADOS_PAGO,
  ESTADOS_PEDIDO,
  EmpresaCliente,
  Pago,
  PedidoConEmpresa,
  ReporteVentasPagosRow,
  unwrapOne,
} from '../../../../core/models/domain.models';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { DynamicReportDrawerComponent } from '../../../../shared/components/dynamic-report/dynamic-report-drawer.component';
import { DynamicReportConfig } from '../../../../shared/components/dynamic-report/dynamic-report.models';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { TablePaginationComponent } from '../../../../shared/components/table-pagination/table-pagination.component';
import { sanitizeMultilineText, sanitizeText } from '../../../../shared/utils/sanitizers.util';
import {
  trimmedMinLengthValidator,
  trimmedRequiredValidator,
} from '../../../../shared/utils/validators.util';
import { SalesService } from '../../services/sales.service';

@Component({
  selector: 'app-payment-verification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
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
    HlmTableImports,
    HlmTabsImports,
    HlmTextareaImports,
    ConfirmDialogComponent,
    StatusBadgeComponent,
    TablePaginationComponent,
    DynamicReportDrawerComponent,
  ],
  providers: [
    provideIcons({
      lucideBadgeCheck,
      lucideFileBarChart2,
      lucideSearch,
      lucideRefreshCw,
      lucideEye,
      lucideCheck,
      lucideX,
      lucideExternalLink,
    }),
  ],
  templateUrl: './payment-verification.component.html',
})
export class PaymentVerificationComponent implements OnInit {
  private readonly salesService = inject(SalesService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly sanitizer = inject(DomSanitizer);

  readonly estadosPago = ESTADOS_PAGO;

  readonly payments = signal<Pago[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  readonly activeTab = signal<'pending' | 'all'>('pending');
  readonly methodFilter = signal<string>('all');
  readonly stateFilter = signal<string>('all');
  readonly searchTerm = signal<string>('');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  readonly viewingPayment = signal<Pago | null>(null);
  readonly approveTarget = signal<Pago | null>(null);
  readonly rejectTarget = signal<Pago | null>(null);
  readonly rejectConfirmOpen = signal<boolean>(false);
  readonly processingVerification = signal<boolean>(false);

  readonly reportOpen = signal<boolean>(false);
  readonly reportLoading = signal<boolean>(false);
  readonly reportRows = signal<ReporteVentasPagosRow[]>([]);

  readonly rejectForm = this.fb.group({
    motivo_observacion: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(8)]],
  });

  readonly pendingCount = computed(
    () =>
      this.payments().filter(
        (p) => p.estado === 'Pendiente' || p.estado === 'Pendiente de verificación',
      ).length,
  );

  readonly filteredPayments = computed(() => {
    const tab = this.activeTab();
    const mf = this.methodFilter();
    const sf = this.stateFilter();
    const q = sanitizeText(this.searchTerm()).toLowerCase();

    return this.payments().filter((pago) => {
      if (
        tab === 'pending' &&
        pago.estado !== 'Pendiente' &&
        pago.estado !== 'Pendiente de verificación'
      ) {
        return false;
      }
      if (mf !== 'all' && pago.metodo !== mf) {
        return false;
      }
      if (sf !== 'all' && pago.estado !== sf) {
        return false;
      }
      if (!q) {
        return true;
      }
      const empresa = this.getEmpresa(pago);
      return (
        String(pago.numero_pedido).includes(q) ||
        (empresa?.razon_social.toLowerCase().includes(q) ?? false) ||
        (empresa?.nit.toLowerCase().includes(q) ?? false) ||
        pago.metodo.toLowerCase().includes(q)
      );
    });
  });

  readonly paginatedPayments = computed(() => {
    const list = this.filteredPayments();
    const size = this.pageSize();
    const maxPage = Math.max(1, Math.ceil(list.length / size));
    const current = Math.min(this.page(), maxPage);
    const start = (current - 1) * size;
    return list.slice(start, start + size);
  });

  readonly viewingSafePdfUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.viewingPayment()?.url_comprobante_qr;
    if (!url || !this.isPdfUrl(url) || !url.startsWith('https://')) {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  readonly reportConfig: DynamicReportConfig<ReporteVentasPagosRow> = {
    title: 'Reporte de Ventas y Verificación de Pagos',
    subtitle: 'Consolidado comercial de pedidos mayoristas, cobros QR/Efectivo y estados de caja.',
    filenamePrefix: 'reporte-ventas-pagos',
    searchFields: [
      (r) => String(r.numero_pedido),
      (r) => r.empresa_cliente,
      (r) => r.nit_cliente,
      (r) => r.metodo_pago,
    ],
    columns: [
      {
        key: 'numero_pedido',
        label: 'N° Pedido',
        getValue: (r) => r.numero_pedido,
        format: (r) => `#${r.numero_pedido}`,
      },
      { key: 'empresa_cliente', label: 'Empresa Cliente', getValue: (r) => r.empresa_cliente },
      { key: 'nit_cliente', label: 'NIT', getValue: (r) => r.nit_cliente },
      { key: 'metodo_pago', label: 'Método Pago', getValue: (r) => r.metodo_pago },
      {
        key: 'subtotal_mayorista',
        label: 'Monto Total',
        align: 'right',
        getValue: (r) => Number(r.subtotal_mayorista),
        format: (r) => `Bs ${Number(r.subtotal_mayorista).toFixed(2)}`,
      },
      { key: 'estado_pago', label: 'Estado Pago', getValue: (r) => r.estado_pago },
      { key: 'estado_pedido', label: 'Estado Pedido', getValue: (r) => r.estado_pedido },
      { key: 'modalidad_entrega', label: 'Modalidad Entrega', getValue: (r) => r.modalidad_entrega },
      {
        key: 'estado_entrega',
        label: 'Estado Entrega',
        defaultVisible: false,
        getValue: (r) => r.estado_entrega,
      },
      {
        key: 'direccion_destino',
        label: 'Dirección Destino',
        defaultVisible: false,
        getValue: (r) => r.direccion_destino,
      },
      { key: 'fecha_creacion', label: 'Fecha Pedido', getValue: (r) => r.fecha_creacion },
      {
        key: 'fecha_verificacion',
        label: 'Fecha Verificación',
        getValue: (r) => r.fecha_verificacion,
      },
      {
        key: 'motivo_observacion',
        label: 'Motivo Observación',
        defaultVisible: false,
        getValue: (r) => r.motivo_observacion,
      },
    ],
    filters: [
      {
        key: 'metodo_pago',
        label: 'Método de pago',
        type: 'select',
        options: [
          { label: 'QR', value: 'QR' },
          { label: 'Efectivo', value: 'Efectivo' },
        ],
        accessor: (r) => r.metodo_pago,
      },
      {
        key: 'estado_pago',
        label: 'Estado de pago',
        type: 'select',
        options: ESTADOS_PAGO.map((e) => ({ label: e, value: e })),
        accessor: (r) => r.estado_pago,
      },
      {
        key: 'estado_pedido',
        label: 'Estado de pedido',
        type: 'select',
        options: ESTADOS_PEDIDO.map((e) => ({ label: e, value: e })),
        accessor: (r) => r.estado_pedido,
      },
      {
        key: 'fecha_creacion',
        label: 'Fecha de creación',
        type: 'date-range',
        accessor: (r) => r.fecha_creacion,
      },
      {
        key: 'fecha_verificacion',
        label: 'Fecha de verificación',
        type: 'date-range',
        accessor: (r) => r.fecha_verificacion,
      },
    ],
    summaryCards: [
      {
        label: 'Pagos aprobados',
        compute: (rows) => String(rows.filter((r) => r.estado_pago === 'Aprobado').length),
      },
      {
        label: 'Monto recaudado (aprobado)',
        compute: (rows) =>
          'Bs ' +
          rows
            .filter((r) => r.estado_pago === 'Aprobado')
            .reduce((acc, r) => acc + Number(r.subtotal_mayorista || 0), 0)
            .toFixed(2),
      },
    ],
  };

  ngOnInit(): void {
    void this.loadPayments();
  }

  getPedido(pago: Pago): PedidoConEmpresa | null {
    return unwrapOne(pago.pedido);
  }

  getEmpresa(pago: Pago): Pick<EmpresaCliente, 'id_empresa_cliente' | 'nit' | 'razon_social' | 'telefono'> | null {
    return unwrapOne(this.getPedido(pago)?.empresa_cliente);
  }

  canApprove(pago: Pago): boolean {
    return pago.estado === 'Pendiente' || pago.estado === 'Pendiente de verificación';
  }

  canReject(pago: Pago): boolean {
    return pago.metodo === 'QR' && pago.estado === 'Pendiente de verificación';
  }

  isPdfUrl(url: string | null | undefined): boolean {
    if (!url) {
      return false;
    }
    return url.toLowerCase().split('?')[0].endsWith('.pdf');
  }

  async loadPayments(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.salesService.getPayments();
      this.payments.set(data);
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudo cargar la bandeja de pagos.');
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  async openReportDrawer(): Promise<void> {
    this.reportOpen.set(true);
    this.reportLoading.set(true);
    try {
      const rows = await this.salesService.getReportSalesPayments();
      this.reportRows.set(rows);
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo cargar los datos del reporte de ventas.'));
    } finally {
      this.reportLoading.set(false);
    }
  }

  requestApprove(pago: Pago): void {
    this.approveTarget.set(pago);
  }

  async confirmApprove(): Promise<void> {
    const target = this.approveTarget();
    if (!target) {
      return;
    }

    this.processingVerification.set(true);
    try {
      await this.salesService.verifyPayment({
        p_id_pago: target.id_pago,
        p_aprobado: true,
        p_motivo_observacion: null,
      });

      toast.success(
        `Pago de Pedido #${target.numero_pedido} aprobado. Pedido actualizado a "Aprobado / Recibido".`,
      );
      this.approveTarget.set(null);
      this.viewingPayment.set(null);
      await this.loadPayments();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo aprobar el pago.'));
    } finally {
      this.processingVerification.set(false);
    }
  }

  openRejectDialog(pago: Pago): void {
    this.rejectForm.reset({ motivo_observacion: '' });
    this.rejectTarget.set(pago);
  }

  closeRejectDialog(): void {
    if (!this.processingVerification()) {
      this.rejectTarget.set(null);
      this.rejectConfirmOpen.set(false);
    }
  }

  requestConfirmReject(): void {
    if (this.rejectForm.invalid) {
      this.rejectForm.markAllAsTouched();
      return;
    }
    this.rejectConfirmOpen.set(true);
  }

  async confirmReject(): Promise<void> {
    const target = this.rejectTarget();
    if (!target) {
      return;
    }

    const motivo = sanitizeMultilineText(this.rejectForm.controls.motivo_observacion.value);
    this.processingVerification.set(true);
    try {
      await this.salesService.verifyPayment({
        p_id_pago: target.id_pago,
        p_aprobado: false,
        p_motivo_observacion: motivo,
      });

      toast.success(
        `Comprobante QR del Pedido #${target.numero_pedido} rechazado con motivo registrado.`,
      );
      this.rejectConfirmOpen.set(false);
      this.rejectTarget.set(null);
      this.viewingPayment.set(null);
      await this.loadPayments();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo rechazar el comprobante QR.'));
    } finally {
      this.processingVerification.set(false);
    }
  }

  onTabChanged(tab: string): void {
    this.activeTab.set(tab === 'all' ? 'all' : 'pending');
    this.page.set(1);
  }
}
