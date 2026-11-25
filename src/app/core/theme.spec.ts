import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeStore } from './theme';

describe('PrimeNG theme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('vairas-dark');
  });
  it('switches immediately without reload and persists only the UI preference', () => {
    localStorage.setItem('vairas.theme', 'light');
    const theme = TestBed.inject(ThemeStore);
    TestBed.tick();
    expect(theme.theme()).toBe('light');
    theme.toggle();
    TestBed.tick();
    expect(document.documentElement.classList.contains('vairas-dark')).toBe(true);
    expect(localStorage.getItem('vairas.theme')).toBe('dark');
    theme.toggle();
    TestBed.tick();
    expect(document.documentElement.classList.contains('vairas-dark')).toBe(false);
  });
  it('restores a valid saved dark preference', () => {
    localStorage.setItem('vairas.theme', 'dark');
    const theme = TestBed.inject(ThemeStore);
    TestBed.tick();
    expect(theme.theme()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
