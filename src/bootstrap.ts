import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { APP_CONFIG } from './app/core/config';
import { AppConfig } from './app/domain/models/session-models';

export async function bootstrapVairas() {
  try {
    const response = await fetch('/config.json');
    if (!response.ok) throw new Error('Application configuration is unavailable.');

    const config = (await response.json()) as AppConfig;
    if (typeof config.apiBaseUrl !== 'string')
      throw new Error('Application configuration is invalid.');

    if (config.apiBaseUrl) {
      const base = new URL(config.apiBaseUrl, window.location.origin);
      const localHosts = ['localhost', '127.0.0.1', '[::1]'];
      if (
        base.username ||
        base.password ||
        !['http:', 'https:'].includes(base.protocol) ||
        (base.protocol !== 'https:' && !localHosts.includes(base.hostname))
      )
        throw new Error('The API Gateway must use HTTPS.');

      config.apiBaseUrl = config.apiBaseUrl.replace(/\/$/, '');
    }

    await bootstrapApplication(App, {
      ...appConfig,
      providers: [...appConfig.providers, { provide: APP_CONFIG, useValue: config }],
    });
  } catch {
    renderStartupFailure();
  }
}

function renderStartupFailure() {
  const main = document.createElement('main');
  main.setAttribute('role', 'alert');
  main.style.cssText =
    'max-width:38rem;margin:12vh auto;padding:2rem;font:1rem/1.6 system-ui;color:#192c39';

  const heading = document.createElement('h1');
  heading.textContent = 'Vairas could not start';
  const message = document.createElement('p');
  message.textContent = 'Check the application configuration and local API Gateway, then retry.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => window.location.reload());

  main.append(heading, message, retry);
  document.body.replaceChildren(main);
}
