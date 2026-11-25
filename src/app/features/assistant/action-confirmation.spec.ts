import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { ActionConfirmation } from './action-confirmation';
import { ActionPreview } from '../../domain/models/chat-models';
const preview: ActionPreview = {
  previewId: 'preview',
  operationId: 'operation',
  kind: 'Booking',
  argumentsFingerprint: 'f'.repeat(64),
  expiresAt: '2099-01-01T00:00:00Z',
  arguments: {
    schoolId: 's',
    branchId: 'b',
    enrollmentId: 'e',
    studentId: 'student',
    teacherId: 'teacher',
    vehicleId: 'car',
    category: 'B',
    startsAt: '2030-01-15T10:00:00Z',
    endsAt: '2030-01-15T11:00:00Z',
  },
};
function setup() {
  TestBed.configureTestingModule({ imports: [ActionConfirmation] });
  const f = TestBed.createComponent(ActionConfirmation);
  f.componentRef.setInput('preview', preview);
  f.detectChanges();
  return f;
}
describe('ActionConfirmation', () => {
  it('requires deliberate approval before emitting the exact-preview confirmation', () => {
    const f = setup();
    const emit = vi.fn();
    f.componentInstance.approved.subscribe(emit);
    f.componentInstance.confirm();
    expect(emit).not.toHaveBeenCalled();
    f.componentInstance.checked.set(true);
    f.componentInstance.confirm();
    expect(emit).toHaveBeenCalledOnce();
  });
  it('rejects an expired or invalidated preview even after checking approval', () => {
    const f = setup();
    const emit = vi.fn();
    f.componentInstance.approved.subscribe(emit);
    f.componentInstance.checked.set(true);
    f.componentRef.setInput('preview', { ...preview, expiresAt: '2000-01-01T00:00:00Z' });
    f.componentInstance.confirm();
    expect(emit).not.toHaveBeenCalled();
    f.componentRef.setInput('preview', preview);
    f.componentRef.setInput('invalidated', true);
    f.componentInstance.confirm();
    expect(emit).not.toHaveBeenCalled();
  });
  it('prevents repeat confirmation while busy or after commit', () => {
    const f = setup();
    const emit = vi.fn();
    f.componentInstance.approved.subscribe(emit);
    f.componentInstance.checked.set(true);
    f.componentRef.setInput('busy', true);
    f.componentInstance.confirm();
    f.componentRef.setInput('busy', false);
    f.componentRef.setInput('completed', true);
    f.componentInstance.confirm();
    expect(emit).not.toHaveBeenCalled();
  });
});
