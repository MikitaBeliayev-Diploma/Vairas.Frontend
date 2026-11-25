import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect } from 'vitest';
import { filenameFrom } from '../domain/api/documents-api';
import { normalizeReadiness } from '../domain/api/learning-api';
import { SchoolApi } from '../domain/api/school-api';
import { ApiContext } from './api-context';
import { readChallenge } from '../features/login/login';
import { parseTopics } from '../features/admin/programs';
import { APP_CONFIG } from './config';

describe('Live contract adapters', () => {
  it('maps the Learning Tracking readiness response and keeps its revision for decisions', () => {
    const r = normalizeReadiness({
      enrollmentId: 'e',
      evaluationId: 'ev',
      revision: 4,
      formalStatus: 'Incomplete',
      requirements: [
        {
          requirementId: 'a',
          status: 'Satisfied',
          observedMinutes: 45,
          observedMark: null,
          explanation: 'ok',
        },
        {
          requirementId: 'b',
          status: 'Incomplete',
          observedMinutes: 0,
          observedMark: null,
          explanation: '45 theory minutes remain.',
        },
      ],
      decision: null,
    });
    expect(r.revision).toBe(4);
    expect(r.decision).toBe('Pending');
    expect(r.prerequisitesSatisfied).toBe(false);
    expect(r.outstandingRequirements).toEqual(['45 theory minutes remain.']);
  });
  it('reads download file names from Content-Disposition', () => {
    expect(filenameFrom('attachment; filename="journal.pdf"', 'x')).toBe('journal.pdf');
    expect(filenameFrom("attachment; filename*=UTF-8''%C5%BEurnalas.docx", 'x')).toBe(
      'žurnalas.docx',
    );
    expect(filenameFrom(null, 'fallback.pdf')).toBe('fallback.pdf');
  });
  it('reads challenge links from the fragment or the query', () => {
    expect(readChallenge('challengeToken=t1&purpose=ResetPassword', new URLSearchParams())).toEqual(
      {
        token: 't1',
        purpose: 'ResetPassword',
      },
    );
    expect(readChallenge(null, new URLSearchParams('challengeToken=t2'))).toEqual({
      token: 't2',
      purpose: 'VerifyEmail',
    });
  });
  it('scopes school routes by query and leaves identity routes unscoped', () => {
    const context = TestBed.inject(ApiContext);
    context.schoolId.set('s1');
    expect(context.scoped('/api/v1/practical-records/r')).toBe(
      '/api/v1/practical-records/r?schoolId=s1',
    );
    expect(context.scoped('/api/v1/users/me/lessons?from=a')).toBe(
      '/api/v1/users/me/lessons?from=a&schoolId=s1',
    );
    expect(context.scoped('/api/v1/users/me')).toBe('/api/v1/users/me');
    expect(context.scoped('/api/v1/users/me/student-profile')).toBe(
      '/api/v1/users/me/student-profile',
    );
    expect(context.scoped('/api/v1/schools/s1/branches')).toBe('/api/v1/schools/s1/branches');
    expect(context.scoped('/api/v1/auth/login')).toBe('/api/v1/auth/login');
  });
  it('keeps topic IDs stable when a curriculum draft is edited', () => {
    const first = parseTopics('city | City driving\nParking');
    expect(first.map((t) => t.key)).toEqual(['city', 'parking']);
    const again = parseTopics('city | City driving (updated)\nparking | Parking', first);
    expect(again[0].topicId).toBe(first[0].topicId);
    expect(again[1].topicId).toBe(first[1].topicId);
  });
  it('does not turn a missing school catalog endpoint into an empty live catalog', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: '' } },
      ],
    });
    const api = TestBed.inject(SchoolApi);
    const http = TestBed.inject(HttpTestingController);
    const catalog = api.catalog('school-1', {}, [
      {
        schoolId: 'school-1',
        name: 'Driving School',
        roles: ['Student'],
        permissions: [],
      },
    ]);

    http.expectOne('/api/v1/schools/school-1/enrollments').flush([]);
    http
      .expectOne('/api/v1/schools/school-1/branches')
      .flush({ title: 'Not Found' }, { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/v1/schools/school-1/groups').flush([]);

    await expect(catalog).rejects.toMatchObject({ status: 404 });
    http.verify();
  });
});
