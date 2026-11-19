import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertCircle,
  lucideBuilding2,
  lucideEye,
  lucideEyeOff,
  lucideLock,
  lucideMail,
  lucideShieldCheck,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { AuthService } from '../../../core/services/auth.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSpinnerImports,
  ],
  providers: [
    provideIcons({
      lucideBuilding2,
      lucideMail,
      lucideLock,
      lucideEye,
      lucideEyeOff,
      lucideAlertCircle,
      lucideShieldCheck,
    }),
  ],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  async onSubmit(): Promise<void> {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.submitting.set(true);

    try {
      const profile = await this.authService.signIn(email.trim().toLowerCase(), password);
      toast.success(`Sesión iniciada como ${profile.nombre_completo}`);
      await this.router.navigateByUrl(this.authService.getDefaultRouteForRole(profile.rol));
    } catch (err) {
      const msg = translateSupabaseError(err, 'No se pudo validar las credenciales.');
      this.errorMessage.set(msg);
      toast.error(msg);
    } finally {
      this.submitting.set(false);
    }
  }
}
