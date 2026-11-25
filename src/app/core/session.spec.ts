import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionStore } from './session';
import { AuthenticationApi } from './authentication-api';
import { SchoolApi } from '../domain/api/school-api';
import { UserApi } from '../domain/api/user-api';
import { APP_CONFIG } from './config';
import { ApiContext } from './api-context';
import { Catalog, Workspace } from '../domain/models/school-models';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup() {
  const pending = deferred<{ accessToken: string; refreshToken: string; expiresIn: number }>();
  const auth = {
    login: vi.fn().mockResolvedValue({
      accessToken: 'synthetic-old-token',
      refreshToken: 'synthetic-refresh',
      sessionId: 'synthetic-session',
      expiresIn: 900,
    }),
    refresh: vi.fn(() => pending.promise),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: { apiBaseUrl: '' } },
      { provide: AuthenticationApi, useValue: auth },
      {
        provide: SchoolApi,
        useValue: {
          workspaces: vi.fn().mockResolvedValue([]),
          catalog: vi.fn().mockResolvedValue({ schools: [], enrollments: [] }),
        },
      },
      {
        provide: UserApi,
        useValue: {
          profile: vi.fn().mockResolvedValue({
            userId: 'user',
            firstName: 'Alex',
            lastName: 'Example',
            revision: 1,
            status: 'Active',
            emailAddress: null,
            phoneNumber: null,
          }),
        },
      },
      { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
    ],
  });
  const store = TestBed.inject(SessionStore);
  await store.login('alex@example.test', '');
  return { store, auth, pending };
}
describe('SessionStore token refresh', () => {
  it('shares one refresh across concurrent GET failures and replaces the consumed token', async () => {
    const { store, auth, pending } = await setup();
    const first = store.refresh();
    const second = store.refresh();
    expect(auth.refresh).toHaveBeenCalledOnce();
    pending.resolve({
      accessToken: 'synthetic-new-token',
      refreshToken: 'synthetic-rotated-refresh',
      expiresIn: 900,
    });
    await expect(first).resolves.toBe('synthetic-new-token');
    await expect(second).resolves.toBe('synthetic-new-token');
    expect(store.session()?.accessToken).toBe('synthetic-new-token');
  });
  it('discards a refresh response after the session context changes', async () => {
    const { store, pending } = await setup();
    const refresh = store.refresh();
    const rejected = expect(refresh).rejects.toThrow('context changed');
    store.reset();
    pending.resolve({
      accessToken: 'abandoned-session-token',
      refreshToken: 'abandoned-refresh',
      expiresIn: 900,
    });
    await rejected;
    expect(store.session()).toBeNull();
  });
  it('never reuses a refresh token after an ambiguous transport failure', async () => {
    const { store, auth, pending } = await setup();
    const refresh = store.refresh();
    const rejected = expect(refresh).rejects.toThrow('lost acknowledgement');
    pending.reject(new Error('lost acknowledgement'));
    await rejected;
    await expect(store.refresh()).rejects.toThrow('sign in again');
    expect(auth.refresh).toHaveBeenCalledOnce();
  });
});

describe('SessionStore school context', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('ignores an older school catalog response after a newer school is selected', async () => {
    const oldCatalog = deferred<Catalog>();
    const newCatalog = deferred<Catalog>();
    const workspaces: Workspace[] = [];
    const school = {
      workspaces: vi.fn().mockResolvedValue(workspaces),
      catalog: vi.fn((schoolId: string) =>
        schoolId === 'school-a' ? oldCatalog.promise : newCatalog.promise,
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { apiBaseUrl: '' } },
        {
          provide: AuthenticationApi,
          useValue: {
            login: vi.fn().mockResolvedValue({
              accessToken: 'access',
              refreshToken: 'refresh',
              sessionId: 'session',
            }),
            refresh: vi.fn(),
          },
        },
        { provide: SchoolApi, useValue: school },
        {
          provide: UserApi,
          useValue: {
            profile: vi.fn().mockResolvedValue({
              userId: 'user',
              firstName: 'Alex',
              lastName: 'Example',
              revision: 1,
              status: 'Active',
              emailAddress: null,
              phoneNumber: null,
            }),
          },
        },
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
      ],
    });
    const store = TestBed.inject(SessionStore);
    await store.login('alex@example.test', '');
    workspaces.push(
      { schoolId: 'school-a', name: 'Old school', roles: ['Administrator'], permissions: [] },
      { schoolId: 'school-b', name: 'New school', roles: ['Administrator'], permissions: [] },
    );

    const selectOldSchool = store.changeSchool('school-a');
    await vi.waitFor(() =>
      expect(school.catalog).toHaveBeenCalledWith('school-a', expect.anything(), workspaces),
    );
    const selectNewSchool = store.changeSchool('school-b');
    await vi.waitFor(() =>
      expect(school.catalog).toHaveBeenCalledWith('school-b', expect.anything(), workspaces),
    );

    const emptyCatalog = {
      enrollments: [],
      teachers: [],
      vehicles: [],
      topics: [],
      programVersionId: '',
      branchId: '',
      assessmentDefinitionVersionId: '',
    };
    oldCatalog.resolve({
      ...emptyCatalog,
      schools: [{ schoolId: 'school-a', name: 'Old school' }],
    });
    await selectOldSchool;
    expect(store.catalog()).toBeNull();
    expect(store.busy()).toBe(true);

    newCatalog.resolve({
      ...emptyCatalog,
      schools: [{ schoolId: 'school-b', name: 'New school' }],
    });
    await selectNewSchool;

    expect(store.session()?.schoolId).toBe('school-b');
    expect(store.catalog()?.schools[0]?.schoolId).toBe('school-b');
    expect(TestBed.inject(ApiContext).schoolId()).toBe('school-b');
    school.catalog.mockRejectedValueOnce(new Error('Catalog unavailable'));
    await expect(store.changeSchool('school-a')).rejects.toThrow('Catalog unavailable');
    expect(store.session()).toBeNull();
    expect(store.catalog()).toBeNull();
    expect(TestBed.inject(ApiContext).schoolId()).toBe('');
    expect(store.busy()).toBe(false);
  });
});
