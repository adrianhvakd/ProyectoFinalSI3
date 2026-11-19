import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { PROCESADORES_PAGO } from './features/orders/contracts/procesador-pago.interface';
import { PagoEfectivoService } from './features/orders/services/pago-efectivo.service';
import { PagoQRService } from './features/orders/services/pago-qr.service';

registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(),
    { provide: LOCALE_ID, useValue: 'es' },
    { provide: PROCESADORES_PAGO, useExisting: PagoQRService, multi: true },
    { provide: PROCESADORES_PAGO, useExisting: PagoEfectivoService, multi: true },
  ],
};
