import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBriefcase,
  lucideEye,
  lucideEyeOff,
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
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import {
  Camion,
  EmpresaCliente,
  ROLES_INTERNOS,
  ROLES_USUARIO,
  RolUsuario,
  UsuarioConRelaciones,
  unwrapOne,
} from '../../../../core/models/domain.models';
import { AuthService } from '../../../../core/services/auth.service';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { TablePaginationComponent } from '../../../../shared/components/table-pagination/table-pagination.component';
import {
  sanitizeEmail,
  sanitizeNit,
  sanitizePhone,
  sanitizePlate,
  sanitizeText,
} from '../../../../shared/utils/sanitizers.util';
import {
  nitValidator,
  phoneValidator,
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
    HlmTextareaImports,
    ConfirmDialogComponent,
    StatusBadgeComponent,
    TablePaginationComponent,
  ],
  providers: [
    provideIcons({
      lucideUsers,
      lucideTruck,
      lucideBriefcase,
      lucidePlus,
      lucidePencil,
      lucidePower,
      lucideSearch,
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
  readonly selectedEditRole = signal<RolUsuario>('Administrador');
  readonly roleChangeConfirmOpen = signal<boolean>(false);

  readonly confirmTarget = signal<UsuarioConRelaciones | null>(null);

  readonly isEditingSelf = computed(
    () => this.editingItem()?.id_usuario === this.authService.user()?.id_usuario,
  );

  readonly pendingRoleChangeSummary = computed(() => {
    const target = this.editingItem();
    const nextRole = this.selectedEditRole();
    if (!target) {
      return '';
    }
    let detail = `El usuario ${target.nombre_completo} pasará del rol "${target.rol}" a "${nextRole}".`;
    if (nextRole === 'Camionero' && !this.getCamion(target)) {
      detail += ' Se registrará automáticamente su unidad de camión asignada.';
    } else if (nextRole === 'Empresa Cliente' && !this.getEmpresa(target)) {
      detail += ' Se creará su ficha de empresa cliente asociada.';
    }
    return detail;
  });

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
    rol: ['Administrador' as RolUsuario, [Validators.required]],
    placa: [''],
    capacidad_kg: [0],
    disponible: [true],
    nit: [''],
    razon_social: [''],
    telefono: [''],
    direccion: [''],
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
      const empresa = this.getEmpresa(u);
      return (
        u.nombre_completo.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.rol.toLowerCase().includes(q) ||
        (camion?.placa.toLowerCase().includes(q) ?? false) ||
        (empresa?.razon_social.toLowerCase().includes(q) ?? false) ||
        (empresa?.nit.toLowerCase().includes(q) ?? false)
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

  constructor() {
    this.createForm.controls.rol.valueChanges.pipe(takeUntilDestroyed()).subscribe((rol) => {
      this.selectedCreateRole.set(rol);
      this.applyCreateTruckValidators(rol === 'Camionero');
    });

    this.editForm.controls.rol.valueChanges.pipe(takeUntilDestroyed()).subscribe((rol) => {
      this.selectedEditRole.set(rol);
      this.applyEditRoleValidators(rol);
    });
  }

  ngOnInit(): void {
    void this.loadItems();
  }

  getCamion(u: UsuarioConRelaciones): Camion | null {
    return unwrapOne(u.camion);
  }

  getEmpresa(u: UsuarioConRelaciones): EmpresaCliente | null {
    return unwrapOne(u.empresa_cliente);
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
    this.applyCreateTruckValidators(false);
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
    const empresa = this.getEmpresa(item);

    this.editForm.reset({
      nombre_completo: item.nombre_completo,
      rol: item.rol,
      placa: camion?.placa ?? '',
      capacidad_kg: Number(camion?.capacidad_kg ?? 0),
      disponible: camion?.disponible ?? true,
      nit: empresa?.nit ?? '',
      razon_social: empresa?.razon_social ?? '',
      telefono: empresa?.telefono ?? '',
      direccion: empresa?.direccion ?? '',
    });

    this.selectedEditRole.set(item.rol);
    this.applyEditRoleValidators(item.rol);

    if (item.id_usuario === this.authService.user()?.id_usuario) {
      this.editForm.controls.rol.disable({ emitEvent: false });
    } else {
      this.editForm.controls.rol.enable({ emitEvent: false });
    }

    this.roleChangeConfirmOpen.set(false);
    this.editDialogOpen.set(true);
  }

  closeEditDialog(): void {
    if (!this.saving()) {
      this.editDialogOpen.set(false);
      this.roleChangeConfirmOpen.set(false);
    }
  }

  onEditSubmit(): void {
    const target = this.editingItem();
    if (!target) {
      return;
    }
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const raw = this.editForm.getRawValue();
    if (this.isEditingSelf() && raw.rol !== target.rol) {
      toast.warning('No puede cambiar su propio rol mientras está en sesión.');
      return;
    }

    if (raw.rol !== target.rol) {
      this.roleChangeConfirmOpen.set(true);
      return;
    }

    void this.executeEditSave();
  }

  async executeEditSave(): Promise<void> {
    const target = this.editingItem();
    if (!target) {
      return;
    }

    const raw = this.editForm.getRawValue();
    const effectiveRole: RolUsuario = this.isEditingSelf() ? target.rol : raw.rol;

    this.saving.set(true);
    try {
      await this.service.updateUser(target.id_usuario, {
        nombre_completo: sanitizeText(raw.nombre_completo),
        rol: effectiveRole,
        placa: effectiveRole === 'Camionero' ? sanitizePlate(raw.placa) : undefined,
        capacidad_kg: effectiveRole === 'Camionero' ? Number(raw.capacidad_kg) : undefined,
        disponible: effectiveRole === 'Camionero' ? raw.disponible : undefined,
        nit: effectiveRole === 'Empresa Cliente' ? sanitizeNit(raw.nit) : undefined,
        razon_social:
          effectiveRole === 'Empresa Cliente' ? sanitizeText(raw.razon_social) : undefined,
        telefono: effectiveRole === 'Empresa Cliente' ? sanitizePhone(raw.telefono) : undefined,
        direccion: effectiveRole === 'Empresa Cliente' ? sanitizeText(raw.direccion) : undefined,
      });

      toast.success(
        effectiveRole !== target.rol
          ? `Usuario actualizado y rol cambiado a "${effectiveRole}".`
          : 'Usuario actualizado correctamente.',
      );
      this.roleChangeConfirmOpen.set(false);
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

  private applyCreateTruckValidators(isTruckDriver: boolean): void {
    const placaCtrl = this.createForm.controls.placa;
    const capCtrl = this.createForm.controls.capacidad_kg;

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

  private applyEditRoleValidators(role: RolUsuario): void {
    const { placa, capacidad_kg, nit, razon_social, telefono, direccion } = this.editForm.controls;

    if (role === 'Camionero') {
      placa.setValidators([trimmedRequiredValidator(), vehiclePlateValidator()]);
      capacidad_kg.setValidators([Validators.required, positiveDecimalValidator(false)]);
    } else {
      placa.clearValidators();
      capacidad_kg.clearValidators();
    }

    if (role === 'Empresa Cliente') {
      nit.setValidators([trimmedRequiredValidator(), nitValidator()]);
      razon_social.setValidators([trimmedRequiredValidator(), trimmedMinLengthValidator(3)]);
      telefono.setValidators([trimmedRequiredValidator(), phoneValidator()]);
      direccion.setValidators([trimmedRequiredValidator(), trimmedMinLengthValidator(5)]);
    } else {
      nit.clearValidators();
      razon_social.clearValidators();
      telefono.clearValidators();
      direccion.clearValidators();
    }

    placa.updateValueAndValidity({ emitEvent: false });
    capacidad_kg.updateValueAndValidity({ emitEvent: false });
    nit.updateValueAndValidity({ emitEvent: false });
    razon_social.updateValueAndValidity({ emitEvent: false });
    telefono.updateValueAndValidity({ emitEvent: false });
    direccion.updateValueAndValidity({ emitEvent: false });
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
