import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { routes } from './app.routes';
import { GlobalErrorHandler } from './core/feedback';
import { apiInterceptor } from './core/http';
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([apiInterceptor])),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.vairas-dark',
          cssLayer: { name: 'primeng', order: 'theme,base,primeng,components,utilities' },
        },
      },
    }),
  ],
};
