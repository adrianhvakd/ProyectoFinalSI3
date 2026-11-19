import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideInfo,
  lucidePackagePlus,
  lucideRefreshCw,
  lucideShieldCheck,
  lucideWarehouse,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { MateriaPrima, Proveedor } from '../../../../core/models/domain.models';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import {
  sanitizeCode,
  toLocalDateIso,
} from '../../../../shared/utils/sanitizers.util';
import {
  dateAfterFieldValidator,
  notExpiredDateValidator,
  positiveDecimalValidator,
  trimmedRequiredValidator,
  uniqueCodeFormatValidator,
} from '../../../../shared/utils/validators.util';
import { RawMaterialsService } from '../../../catalog/services/raw-materials.service';
import { ProvidersService } from '../../../providers/services/providers.service';
import { WarehouseService } from '../../services/warehouse.service';

@Component({
  selector: 'app-lot-reception',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
  ],
  providers: [
    provideIcons({
      lucidePackagePlus,
      lucideInfo,
      lucideShieldCheck,
      lucideWarehouse,
      lucideRefreshCw,
    }),
  ],
  templateUrl: './lot-reception.component.html',
})
export class LotReceptionComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly warehouseService = inject(WarehouseService);
  private readonly rawMaterialsService = inject(RawMaterialsService);
  private readonly providersService = inject(ProvidersService);

  readonly materials = signal<MateriaPrima[]>([]);
  readonly activeProviders = signal<Proveedor[]>([]);
  readonly loadingCatalogs = signal<boolean>(true);
  readonly submitting = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);
  readonly selectedMaterialId = signal<string>('');
  readonly lastCreatedCode = signal<string | null>(null);

  readonly todayIso = toLocalDateIso();

  readonly form = this.fb.group({
    codigo_unico: ['', [trimmedRequiredValidator(), uniqueCodeFormatValidator()]],
    id_materia_prima: ['', [Validators.required]],
    id_proveedor: ['', [Validators.required]],
    cantidad_recibida: [0, [Validators.required, positiveDecimalValidator(false)]],
    fecha_recepcion: [this.todayIso, [Validators.required]],
    fecha_vencimiento: [
      '',
      [
        Validators.required,
        notExpiredDateValidator(),
        dateAfterFieldValidator('fecha_recepcion'),
      ],
    ],
  });

  readonly selectedMaterial = computed<MateriaPrima | null>(() => {
    const id = this.selectedMaterialId();
    return this.materials().find((m) => m.id_materia_prima === id) ?? null;
  });

  constructor() {
    this.form.controls.id_materia_prima.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => this.selectedMaterialId.set(id));

    this.form.controls.fecha_recepcion.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.form.controls.fecha_vencimiento.updateValueAndValidity({ emitEvent: false });
    });
  }

  ngOnInit(): void {
    void this.loadCatalogs();
  }

  async loadCatalogs(): Promise<void> {
    this.loadingCatalogs.set(true);
    this.loadError.set(null);
    try {
      const [mats, provs] = await Promise.all([
        this.rawMaterialsService.getAll(),
        this.providersService.getActive(),
      ]);
      this.materials.set(mats);
      this.activeProviders.set(provs);
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudieron cargar materias primas y proveedores.');
      this.loadError.set(msg);
      toast.error(msg);
    } finally {
      this.loadingCatalogs.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    this.lastCreatedCode.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    if (raw.fecha_vencimiento <= this.todayIso) {
      this.form.controls.fecha_vencimiento.setErrors({ expiredDate: true });
      this.form.controls.fecha_vencimiento.markAsTouched();
      return;
    }
    if (raw.fecha_vencimiento <= raw.fecha_recepcion) {
      this.form.controls.fecha_vencimiento.setErrors({ dateOrder: true });
      this.form.controls.fecha_vencimiento.markAsTouched();
      return;
    }

    const activeProvider = this.activeProviders().find(
      (p) => p.id_proveedor === raw.id_proveedor && p.activo,
    );
    if (!activeProvider) {
      toast.error('Debe seleccionar un proveedor activo.');
      return;
    }

    this.submitting.set(true);
    try {
      const created = await this.warehouseService.receiveLot({
        codigo_unico: sanitizeCode(raw.codigo_unico),
        id_materia_prima: raw.id_materia_prima,
        id_proveedor: raw.id_proveedor,
        cantidad_recibida: Number(raw.cantidad_recibida),
        fecha_recepcion: raw.fecha_recepcion,
        fecha_vencimiento: raw.fecha_vencimiento,
      });

      this.lastCreatedCode.set(created.codigo_unico);
      toast.success(`Lote ${created.codigo_unico} recepcionado en estado "En revisión".`);
      this.form.reset({
        codigo_unico: '',
        id_materia_prima: '',
        id_proveedor: '',
        cantidad_recibida: 0,
        fecha_recepcion: this.todayIso,
        fecha_vencimiento: '',
      });
      this.selectedMaterialId.set('');
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo registrar el lote.'));
    } finally {
      this.submitting.set(false);
    }
  }
}
