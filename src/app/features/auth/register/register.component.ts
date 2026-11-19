import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertCircle,
  lucideArrowLeft,
  lucideBuilding2,
  lucideEye,
  lucideEyeOff,
  lucideShieldCheck,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { AuthService } from '../../../core/services/auth.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';
import {
  sanitizeEmail,
  sanitizeNit,
  sanitizePhone,
  sanitizeText,
} from '../../../shared/utils/sanitizers.util';
import {
  nitValidator,
  phoneValidator,
  trimmedMinLengthValidator,
  trimmedRequiredValidator,
} from '../../../shared/utils/validators.util';

const passwordMatchValidator: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const password = group.get('password')?.value ?? '';
  const confirm = group.get('confirm_password')?.value ?? '';
  if (!confirm || password === confirm) {
    return null;
  }
  return { passwordMismatch: true };
};

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSeparatorImports,
    HlmSpinnerImports,
    HlmTextareaImports,
  ],
  providers: [
    provideIcons({
      lucideBuilding2,
      lucideShieldCheck,
      lucideAlertCircle,
      lucideEye,
      lucideEyeOff,
      lucideArrowLeft,
    }),
  ],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.group(
    {
      razon_social: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(3)]],
      nit: ['', [trimmedRequiredValidator(), nitValidator()]],
      telefono: ['', [trimmedRequiredValidator(), phoneValidator()]],
      direccion: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(5)]],
      nombre_completo: ['', [trimmedRequiredValidator(), trimmedMinLengthValidator(3)]],
      email: ['', [trimmedRequiredValidator(), Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm_password: ['', [Validators.required]],
    },
    { validators: [passwordMatchValidator] },
  );

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  async onSubmit(): Promise<void> {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    this.submitting.set(true);

    try {
      const profile = await this.authService.registerClientCompany({
        nombre_completo: sanitizeText(raw.nombre_completo),
        email: sanitizeEmail(raw.email),
        password: raw.password,
        nit: sanitizeNit(raw.nit),
        razon_social: sanitizeText(raw.razon_social),
        telefono: sanitizePhone(raw.telefono),
        direccion: sanitizeText(raw.direccion),
      });

      toast.success(`Empresa "${sanitizeText(raw.razon_social)}" registrada correctamente.`);
      await this.router.navigateByUrl(this.authService.getDefaultRouteForRole(profile.rol));
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudo completar el registro de su empresa.');
      this.errorMessage.set(msg);
      toast.error(msg);
    } finally {
      this.submitting.set(false);
    }
  }
}
