import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { ProgramApi } from '../../domain/api/program-api';
import { ProgramRegistry } from './program-registry';
import { TrainingProgram } from '../../domain/models/programme-models';

describe('Programme version discovery', () => {
  it('reuses the authorized programme list supplied by its caller', async () => {
    const api = { list: vi.fn(), versions: vi.fn().mockResolvedValue([]) };
    TestBed.configureTestingModule({ providers: [{ provide: ProgramApi, useValue: api }] });
    await TestBed.inject(ProgramRegistry).versions([{ programId: 'existing' } as TrainingProgram]);
    expect(api.list).not.toHaveBeenCalled();
    expect(api.versions).toHaveBeenCalledWith('existing');
  });
  it('discovers server programmes and retained versions without browser storage', async () => {
    localStorage.clear();
    const api = {
      list: vi.fn().mockResolvedValue([{ programId: 'programme-a' }, { programId: 'programme-b' }]),
      versions: vi.fn((id: string) => Promise.resolve([{ programVersionId: id + '-version' }])),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ProgramApi, useValue: api }] });
    const versions = await TestBed.inject(ProgramRegistry).versions();
    expect(versions.map((v) => v.programVersionId)).toEqual([
      'programme-a-version',
      'programme-b-version',
    ]);
    expect(api.versions).toHaveBeenCalledWith('programme-a');
    expect(api.versions).toHaveBeenCalledWith('programme-b');
    expect(localStorage.length).toBe(0);
  });
  it('exposes backend failure instead of presenting an incomplete version list', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProgramApi,
          useValue: {
            list: vi.fn().mockResolvedValue([{ programId: 'programme-a' }]),
            versions: vi.fn().mockRejectedValue(new Error('service unavailable')),
          },
        },
      ],
    });
    await expect(TestBed.inject(ProgramRegistry).versions()).rejects.toThrow('service unavailable');
  });
});
