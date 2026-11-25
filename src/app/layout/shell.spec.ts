import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { Feedback } from '../core/feedback';
import { SessionStore } from '../core/session';
import { Shell } from './shell';

describe('Workspace navigation feedback', () => {
  it('clears obsolete messages and closes navigation only after successful navigation', () => {
    const events = new Subject<NavigationStart | NavigationEnd>();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { url: '/assistant', events } },
        { provide: SessionStore, useValue: {} },
      ],
    });
    const shell = TestBed.runInInjectionContext(() => new Shell());
    const feedback = TestBed.inject(Feedback);
    feedback.fail('The booking conflicts with another lesson.');
    feedback.done('Previous operation completed.');
    shell.menu.set(true);
    events.next(new NavigationStart(1, '/documents'));
    expect(feedback.error()).not.toBe('');
    events.next(new NavigationEnd(1, '/documents', '/documents'));
    expect(feedback.error()).toBe('');
    expect(feedback.success()).toBe('');
    expect(shell.menu()).toBe(false);
    expect(shell.route()).toBe('/assistant');
    const main = document.createElement('main');
    main.id = 'main-content';
    main.tabIndex = -1;
    document.body.append(main);
    try {
      const event = new Event('click', { cancelable: true });
      shell.focusMain(event);
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(main);
    } finally {
      main.remove();
    }
  });
});
