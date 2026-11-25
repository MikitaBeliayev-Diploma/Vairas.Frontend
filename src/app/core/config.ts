import { InjectionToken } from '@angular/core';
import { AppConfig } from '../domain/models/session-models';
export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
