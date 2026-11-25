import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect, vi } from 'vitest';
import { SchedulingApi } from '../../domain/api/scheduling-api';
import { LessonAdminApi } from '../../domain/api/lesson-admin-api';
import { Feedback } from '../../core/feedback';
import { Booking } from '../../domain/models/scheduling-models';
import { SessionStore } from '../../core/session';
import { WorkspaceStore } from '../../core/workspace';
import { SchedulePage, bookingCodeMessages } from './schedule';

const booking: Booking = {
  schoolId: 's1',
  branchId: 'b1',
  enrollmentId: 'e1',
  studentId: 'st1',
  teacherId: 't1',
  vehicleId: 'v1',
  category: 'B',
  startsAt: '2099-01-15T08:00:00.000Z',
  endsAt: '2099-01-15T08:45:00.000Z',
  reason: 'Additional lesson',
};

function setup(book: SchedulingApi['book']) {
  TestBed.configureTestingModule({
    imports: [SchedulePage],
    providers: [
      provideRouter([]),
      {
        provide: SessionStore,
        useValue: {
          has: () => true,
          session: signal({ schoolId: 's1' }),
          catalog: signal(null),
          profile: signal(null),
        },
      },
      { provide: WorkspaceStore, useValue: { load: vi.fn(), lessons: signal([]) } },
      { provide: SchedulingApi, useValue: { book } },
      { provide: LessonAdminApi, useValue: {} },
      { provide: Feedback, useValue: { done: vi.fn(), fail: vi.fn() } },
    ],
  });
  return TestBed.createComponent(SchedulePage).componentInstance;
}

describe('SchedulePage practical booking', () => {
  it('reuses the Idempotency-Key for an identical retry and changes it with the reason', async () => {
    const keys: string[] = [];
    const book = vi.fn((_: Booking, key: string) => {
      keys.push(key);
      return Promise.reject(new HttpErrorResponse({ status: 400 }));
    });
    const page = setup(book as unknown as SchedulingApi['book']);
    await page.book(booking);
    await page.book({ ...booking });
    await page.book({ ...booking, reason: 'Another reason' });
    await page.book({ ...booking, reason: undefined });
    expect(book.mock.calls[0][0].reason).toBe('Additional lesson');
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(keys[3]).not.toBe(keys[2]);
  });
  it('explains IDEMPOTENCY_KEY_REUSED and uses a new key on the next submit', async () => {
    const keys: string[] = [];
    const book = vi.fn((_: Booking, key: string) => {
      keys.push(key);
      return Promise.reject(
        new HttpErrorResponse({ status: 409, error: { code: 'IDEMPOTENCY_KEY_REUSED' } }),
      );
    });
    const page = setup(book as unknown as SchedulingApi['book']);
    page.dialog.set(true);
    await page.book(booking);
    expect(page.bookingError()).toBe(bookingCodeMessages['IDEMPOTENCY_KEY_REUSED']);
    expect(page.dialog()).toBe(true);
    await page.book(booking);
    expect(keys[1]).not.toBe(keys[0]);
  });
  it('explains an inapplicable additional-lesson requirement without claiming a booking', async () => {
    const book = vi.fn(() =>
      Promise.reject(
        new HttpErrorResponse({ status: 422, error: { code: 'REQUIREMENT_NOT_APPLICABLE' } }),
      ),
    );
    const page = setup(book as unknown as SchedulingApi['book']);
    page.dialog.set(true);
    await page.book({ ...booking, reason: 'Additional lesson' });
    expect(page.bookingError()).toBe(bookingCodeMessages['REQUIREMENT_NOT_APPLICABLE']);
    expect(page.bookingError()).toContain('Nothing was booked');
    expect(page.dialog()).toBe(true);
  });
});
