import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { PeoplePage } from './people';
import { SchoolAdminApi } from '../../domain/api/school-admin-api';
import { SessionStore } from '../../core/session';

function setup() {
  let resolveOld!: (page: { items: { invitationId: string }[]; nextCursor: null }) => void;
  const old = new Promise<{ items: { invitationId: string }[]; nextCursor: null }>((resolve) => {
    resolveOld = resolve;
  });
  const session = signal({ schoolId: 'school-a', userId: 'user-a' });
  const api = {
    memberships: vi.fn().mockResolvedValue([]),
    teachers: vi.fn().mockResolvedValue([]),
    invitations: vi.fn((school: string) =>
      school === 'school-a'
        ? old
        : Promise.resolve({ items: [{ invitationId: 'new-school-invitation' }], nextCursor: null }),
    ),
  };
  TestBed.configureTestingModule({
    imports: [PeoplePage],
    providers: [
      { provide: SchoolAdminApi, useValue: api },
      { provide: SessionStore, useValue: { session, profile: signal(null) } },
    ],
  });
  TestBed.overrideComponent(PeoplePage, { set: { template: '' } });
  const fixture = TestBed.createComponent(PeoplePage);
  return { fixture, page: fixture.componentInstance, session, api, resolveOld };
}

describe('School invitation discovery', () => {
  it('retrieves records from the current school without browser identifiers and discards an obsolete response', async () => {
    localStorage.clear();
    const { page, session, api, resolveOld } = setup();
    TestBed.tick();
    expect(api.invitations).toHaveBeenCalledWith('school-a', null);
    session.set({ schoolId: 'school-b', userId: 'user-b' });
    TestBed.tick();
    await vi.waitFor(() =>
      expect(page.invitations.value().map((i) => i.invitationId)).toEqual([
        'new-school-invitation',
      ]),
    );
    resolveOld({ items: [{ invitationId: 'old-school-invitation' }], nextCursor: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(page.invitations.value().map((i) => i.invitationId)).toEqual(['new-school-invitation']);
    expect(localStorage.length).toBe(0);
  });
});
