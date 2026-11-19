import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideEye,
  lucideEyeOff,
  lucideFileBarChart2,
  lucidePencil,
  lucidePlus,
  lucidePower,
  lucideRefreshCw,
  lucideSearch,
  lucideTruck,
  lucideUsers,
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
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTableImports } from '@spartan-ng/helm/table';
import {
  Camion,
  ROLES_INTERNOS,
  ROLES_USUARIO,
  RolUsuario,
  UsuarioConRelaciones,
  unwrapOne,
} from '../../../../core/models/domain.models';
import { AuthService } from '../../../../core/services/auth.service';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { DynamicReportDrawerComponent } from '../../../../shared/components/dynamic-report/dynamic-report-drawer.component';
import { DynamicReportConfig } from '../../../../shared/components/dynamic-report/dynamic-report.models';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { TablePaginationComponent } from '../../../../shared/components/table-pagination/table-pagination.component';
import { sanitizeEmail, sanitizePlate, sanitizeText } from '../../../../shared/utils/sanitizers.util';
import {
  positiveDecimalValidator,
  trimmedMinLengthValidator,
  trimmedRequiredValidator,
  vehiclePlateValidator,
} from '../../../../shared/utils/validators.util';
import { UsersService } from '../../services/users.service';

@Component({
  selector: 'app-users-management',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
    HlmSwitchImports,
    HlmTableImports,
    ConfirmDialogComponent,
    StatusBadgeComponent,
    TablePaginationComponent,
    DynamicReportDrawerComponent,
  ],
  providers: [
    provideIcons({
      lucideUsers,
      lucideTruck,
      lucidePlus,
      lucidePencil,
      lucidePower,
      lucideSearch,
      lucideFileBarChart2,
      lucideRefreshCw,
      lucideEye,
      lucideEyeOff,
    }),
  ],
  templateUrl: './users-management.component.html',
})
export class UsersManagementComponent implements OnInit {
  private readonly service = inject(UsersService);
  readonly authService = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly allRoles = ROLES_USUARIO;
  readonly internalRoles = ROLES_INTERNOS;

  readonly items = signal<UsuarioConRelaciones[]>([]);
  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly toggling = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly searchTerm = signal<string>('');
  readonly roleFilter = signal<string>('all');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  readonly createDialogOpen = signal<boolean>(false);
  readonly showCreatePassword = signal<boolean>(false);
  readonly selectedCreateRole = signal<RolUsuario>('Encargado de Almacén');

  readonly editDialogOpen = signal<boolean>(false);
  readonly editingItem = signal<UsuarioConRelaciones | null>(null);

  readonly confirmTarget = signal<UsuarioConRelaciones | null>(null);
  readonly reportOpen = signal<boolean>(false);

  readonly createForm = this.fb.group({
    nombre_completo: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(3)]],
    email: ['', [trimmedRequiredValidator(), Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    rol: ['Encargado de Almacén' as RolUsuario, [Validators.required]],
    placa: [''],
    capacidad_kg: [0],
  });

  readonly editForm = this.fb.group({
    nombre_completo: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(3)]],
    placa: [''],
    capacidad_kg: [0],
    disponible: [true],
  });

  readonly filteredItems = computed(() => {
    const q = sanitizeText(this.searchTerm()).toLowerCase();
    const rf = this.roleFilter();
    const sf = this.statusFilter();

    return this.items().filter((u) => {
      if (rf !== 'all' && u.rol !== rf) {
        return false;
      }
      if (sf === 'active' && !u.activo) {
        return false;
      }
      if (sf === 'inactive' && u.activo) {
        return false;
      }
      if (!q) {
        return true;
      }
      const camion = this.getCamion(u);
      return (
        u.nombre_completo.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.rol.toLowerCase().includes(q) ||
        (camion?.placa.toLowerCase().includes(q) ?? false)
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

  readonly reportConfig: DynamicReportConfig<UsuarioConRelaciones> = {
    title: 'Reporte de Usuarios, Roles y Flota',
    subtitle: 'Personal operativo registrado, estado de acceso y camiones asignados.',
    filenamePrefix: 'usuarios-roles-flota',
    searchFields: [
      (r) => r.nombre_completo,
      (r) => r.email,
      (r) => r.rol,
      (r) => unwrapOne(r.camion)?.placa,
    ],
    columns: [
      { key: 'nombre_completo', label: 'Nombre Completo', getValue: (r) => r.nombre_completo },
      { key: 'email', label: 'Correo Electrónico', getValue: (r) => r.email },
      { key: 'rol', label: 'Rol', getValue: (r) => r.rol },
      {
        key: 'activo',
        label: 'Estado',
        getValue: (r) => r.activo,
        format: (r) => (r.activo ? 'Activo' : 'Inactivo'),
      },
      {
        key: 'placa',
        label: 'Placa Camión',
        getValue: (r) => unwrapOne(r.camion)?.placa ?? null,
        format: (r) => unwrapOne(r.camion)?.placa ?? '—',
      },
      {
        key: 'capacidad_kg',
        label: 'Capacidad (kg)',
        align: 'right',
        getValue: (r) => unwrapOne(r.camion)?.capacidad_kg ?? null,
        format: (r) => {
          const cap = unwrapOne(r.camion)?.capacidad_kg;
          return cap !== undefined && cap !== null ? `${Number(cap).toFixed(2)} kg` : '—';
        },
      },
      {
        key: 'disponible',
        label: 'Unidad Disponible',
        defaultVisible: false,
        getValue: (r) => unwrapOne(r.camion)?.disponible ?? null,
        format: (r) => {
          const cam = unwrapOne(r.camion);
          if (!cam) return '—';
          return cam.disponible ? 'Disponible' : 'Ocupado';
        },
      },
    ],
    filters: [
      {
        key: 'rol',
        label: 'Rol operativo',
        type: 'select',
        options: ROLES_USUARIO.map((r) => ({ label: r, value: r })),
        accessor: (r) => r.rol,
      },
      {
        key: 'activo',
        label: 'Estado de acceso',
        type: 'boolean',
        trueLabel: 'Activos',
        falseLabel: 'Inactivos',
        accessor: (r) => r.activo,
      },
    ],
    summaryCards: [
      {
        label: 'Usuarios activos',
        compute: (rows) => String(rows.filter((r) => r.activo).length),
      },
      {
        label: 'Camiones registrados',
        compute: (rows) => String(rows.filter((r) => unwrapOne(r.camion) !== null).length),
      },
      {
        label: 'Capacidad flota (kg)',
        compute: (rows) =>
          rows
            .reduce((acc, r) => acc + Number(unwrapOne(r.camion)?.capacidad_kg ?? 0), 0)
            .toFixed(2),
      },
    ],
  };

  constructor() {
    this.createForm.controls.rol.valueChanges.pipe(takeUntilDestroyed()).subscribe((rol) => {
      this.selectedCreateRole.set(rol);
      this.applyTruckValidators(this.createForm, rol === 'Camionero');
    });
  }

  ngOnInit(): void {
    void this.loadItems();
  }

  getCamion(u: UsuarioConRelaciones): Camion | null {
    return unwrapOne(u.camion);
  }

  async loadItems(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.service.getAll();
      this.items.set(data);
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudo cargar los usuarios.');
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  openCreateDialog(): void {
    this.showCreatePassword.set(false);
    this.createForm.reset({
      nombre_completo: '',
      email: '',
      password: '',
      rol: 'Encargado de Almacén',
      placa: '',
      capacidad_kg: 0,
    });
    this.selectedCreateRole.set('Encargado de Almacén');
    this.applyTruckValidators(this.createForm, false);
    this.createDialogOpen.set(true);
  }

  closeCreateDialog(): void {
    if (!this.saving()) {
      this.createDialogOpen.set(false);
    }
  }

  async onCreateSubmit(): Promise<void> {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const raw = this.createForm.getRawValue();
    this.saving.set(true);
    try {
      await this.service.createUser({
        nombre_completo: sanitizeText(raw.nombre_completo),
        email: sanitizeEmail(raw.email),
        password: raw.password,
        rol: raw.rol,
        placa: raw.rol === 'Camionero' ? sanitizePlate(raw.placa) : undefined,
        capacidad_kg: raw.rol === 'Camionero' ? Number(raw.capacidad_kg) : undefined,
      });
      toast.success(`Usuario "${sanitizeText(raw.nombre_completo)}" creado correctamente.`);
      this.createDialogOpen.set(false);
      await this.loadItems();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo crear el usuario.'));
    } finally {
      this.saving.set(false);
    }
  }

  openEditDialog(item: UsuarioConRelaciones): void {
    this.editingItem.set(item);
    const camion = this.getCamion(item);
    this.editForm.reset({
      nombre_completo: item.nombre_completo,
      placa: camion?.placa ?? '',
      capacidad_kg: Number(camion?.capacidad_kg ?? 0),
      disponible: camion?.disponible ?? true,
    });
    this.applyTruckValidators(this.editForm, item.rol === 'Camionero');
    this.editDialogOpen.set(true);
  }

  closeEditDialog(): void {
    if (!this.saving()) {
      this.editDialogOpen.set(false);
    }
  }

  async onEditSubmit(): Promise<void> {
    const target = this.editingItem();
    if (!target) {
      return;
    }
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const raw = this.editForm.getRawValue();
    this.saving.set(true);
    try {
      await this.service.updateUser(target.id_usuario, {
        nombre_completo: sanitizeText(raw.nombre_completo),
        rol: target.rol,
        placa: target.rol === 'Camionero' ? sanitizePlate(raw.placa) : undefined,
        capacidad_kg: target.rol === 'Camionero' ? Number(raw.capacidad_kg) : undefined,
        disponible: target.rol === 'Camionero' ? raw.disponible : undefined,
      });
      toast.success('Usuario actualizado correctamente.');
      this.editDialogOpen.set(false);
      await this.loadItems();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo actualizar el usuario.'));
    } finally {
      this.saving.set(false);
    }
  }

  requestToggleActive(item: UsuarioConRelaciones): void {
    if (item.id_usuario === this.authService.user()?.id_usuario) {
      toast.warning('No puede desactivar su propia cuenta mientras está en sesión.');
      return;
    }
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
      await this.service.toggleActive(target.id_usuario, nextState);
      this.items.update((list) =>
        list.map((u) => (u.id_usuario === target.id_usuario ? { ...u, activo: nextState } : u)),
      );
      toast.success(
        `Usuario "${target.nombre_completo}" ${nextState ? 'activado' : 'desactivado'}.`,
      );
      this.confirmTarget.set(null);
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo actualizar el estado del usuario.'));
    } finally {
      this.toggling.set(false);
    }
  }

  private applyTruckValidators(
    formGroup: typeof this.createForm | typeof this.editForm,
    isTruckDriver: boolean,
  ): void {
    const placaCtrl = formGroup.controls.placa;
    const capCtrl = formGroup.controls.capacidad_kg;

    if (isTruckDriver) {
      placaCtrl.setValidators([trimmedRequiredValidator(), vehiclePlateValidator()]);
      capCtrl.setValidators([Validators.required, positiveDecimalValidator(false)]);
    } else {
      placaCtrl.clearValidators();
      capCtrl.clearValidators();
    }
    placaCtrl.updateValueAndValidity({ emitEvent: false });
    capCtrl.updateValueAndValidity({ emitEvent: false });
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
    this.page.set(1);
  }

  onRoleFilterChange(value: string | null | undefined): void {
    this.roleFilter.set(value || 'all');
    this.page.set(1);
  }

  onStatusFilterChange(value: string | null | undefined): void {
    const v = value === 'active' || value === 'inactive' ? value : 'all';
    this.statusFilter.set(v);
    this.page.set(1);
  }
}
