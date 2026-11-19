import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import {
  EmpresaClienteConUsuario,
  Usuario,
  unwrapOne,
} from '../../../../core/models/domain.models';
import { translateSupabaseError } from '../../../../core/utils/supabase-error.util';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { TablePaginationComponent } from '../../../../shared/components/table-pagination/table-pagination.component';
import {
  sanitizeEmail,
  sanitizeNit,
  sanitizePhone,
  sanitizeText,
} from '../../../../shared/utils/sanitizers.util';
import {
  nitValidator,
  phoneValidator,
  trimmedMinLengthValidator,
  trimmedRequiredValidator,
} from '../../../../shared/utils/validators.util';
import { ClientCompaniesService } from '../../services/client-companies.service';

@Component({
  selector: 'app-client-companies',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmEmptyImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTableImports,
    HlmTextareaImports,
    ConfirmDialogComponent,
    StatusBadgeComponent,
    TablePaginationComponent,
  ],
  providers: [
    provideIcons({
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
  templateUrl: './client-companies.component.html',
})
export class ClientCompaniesComponent implements OnInit {
  private readonly service = inject(ClientCompaniesService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly items = signal<EmpresaClienteConUsuario[]>([]);
  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly toggling = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly searchTerm = signal<string>('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  readonly createDialogOpen = signal<boolean>(false);
  readonly showCreatePassword = signal<boolean>(false);

  readonly editDialogOpen = signal<boolean>(false);
  readonly editingItem = signal<EmpresaClienteConUsuario | null>(null);

  readonly confirmTarget = signal<EmpresaClienteConUsuario | null>(null);
  readonly confirmTargetIsActive = computed(() => {
    const target = this.confirmTarget();
    return target ? (this.getUsuario(target)?.activo ?? false) : false;
  });

  readonly createForm = this.fb.group({
    nombre_completo: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(3)]],
    email: ['', [trimmedRequiredValidator(), Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    nit: ['', [trimmedRequiredValidator(), nitValidator()]],
    razon_social: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(3)]],
    telefono: ['', [trimmedRequiredValidator(), phoneValidator()]],
    direccion: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(5)]],
  });

  readonly editForm = this.fb.group({
    nombre_completo: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(3)]],
    nit: ['', [trimmedRequiredValidator(), nitValidator()]],
    razon_social: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(3)]],
    telefono: ['', [trimmedRequiredValidator(), phoneValidator()]],
    direccion: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(5)]],
  });

  readonly filteredItems = computed(() => {
    const q = sanitizeText(this.searchTerm()).toLowerCase();
    const sf = this.statusFilter();

    return this.items().filter((item) => {
      const usr = this.getUsuario(item);
      const isActive = usr?.activo ?? false;
      if (sf === 'active' && !isActive) {
        return false;
      }
      if (sf === 'inactive' && isActive) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        item.razon_social.toLowerCase().includes(q) ||
        item.nit.toLowerCase().includes(q) ||
        item.telefono.toLowerCase().includes(q) ||
        item.direccion.toLowerCase().includes(q) ||
        (usr?.nombre_completo.toLowerCase().includes(q) ?? false) ||
        (usr?.email.toLowerCase().includes(q) ?? false)
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

  ngOnInit(): void {
    void this.loadItems();
  }

  getUsuario(item: EmpresaClienteConUsuario): Usuario | null {
    return unwrapOne(item.usuario);
  }

  async loadItems(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.service.getAll();
      this.items.set(data);
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudo cargar las empresas clientes.');
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
      nit: '',
      razon_social: '',
      telefono: '',
      direccion: '',
    });
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
      await this.service.createClientCompany({
        nombre_completo: sanitizeText(raw.nombre_completo),
        email: sanitizeEmail(raw.email),
        password: raw.password,
        nit: sanitizeNit(raw.nit),
        razon_social: sanitizeText(raw.razon_social),
        telefono: sanitizePhone(raw.telefono),
        direccion: sanitizeText(raw.direccion),
      });
      toast.success(`Empresa cliente "${sanitizeText(raw.razon_social)}" registrada.`);
      this.createDialogOpen.set(false);
      await this.loadItems();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo registrar la empresa cliente.'));
    } finally {
      this.saving.set(false);
    }
  }

  openEditDialog(item: EmpresaClienteConUsuario): void {
    const usr = this.getUsuario(item);
    this.editingItem.set(item);
    this.editForm.reset({
      nombre_completo: usr?.nombre_completo ?? '',
      nit: item.nit,
      razon_social: item.razon_social,
      telefono: item.telefono,
      direccion: item.direccion,
    });
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
      await this.service.updateClientCompany(target.id_empresa_cliente, target.id_usuario, {
        nombre_completo: sanitizeText(raw.nombre_completo),
        nit: sanitizeNit(raw.nit),
        razon_social: sanitizeText(raw.razon_social),
        telefono: sanitizePhone(raw.telefono),
        direccion: sanitizeText(raw.direccion),
      });
      toast.success('Empresa cliente actualizada correctamente.');
      this.editDialogOpen.set(false);
      await this.loadItems();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo actualizar la empresa cliente.'));
    } finally {
      this.saving.set(false);
    }
  }

  requestToggleActive(item: EmpresaClienteConUsuario): void {
    this.confirmTarget.set(item);
  }

  async confirmToggleActive(): Promise<void> {
    const target = this.confirmTarget();
    if (!target) {
      return;
    }
    const usr = this.getUsuario(target);
    const nextState = !(usr?.activo ?? false);

    this.toggling.set(true);
    try {
      await this.service.toggleUserActive(target.id_usuario, nextState);
      toast.success(
        `Empresa "${target.razon_social}" ${nextState ? 'activada' : 'desactivada'}.`,
      );
      this.confirmTarget.set(null);
      await this.loadItems();
    } catch (err) {
      toast.error(translateSupabaseError(err, 'No se pudo cambiar el estado de la empresa.'));
    } finally {
      this.toggling.set(false);
    }
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
    this.page.set(1);
  }

  onStatusFilterChange(value: string | null | undefined): void {
    const v = value === 'active' || value === 'inactive' ? value : 'all';
    this.statusFilter.set(v);
    this.page.set(1);
  }
}
