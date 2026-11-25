import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { RecordReview } from './record-review';
import { PracticalRecord } from '../../domain/models/learning-models';
const record: PracticalRecord = {
  recordId: 'r',
  enrollmentId: 'e',
  revision: 4,
  factVersion: 2,
  status: 'Pending',
  facts: {
    schoolId: 's',
    enrollmentId: 'e',
    lessonId: 'l',
    programVersionId: 'p',
    sourceSnapshotId: 'snapshot',
    trainingMinutes: 50,
    distanceKm: 12,
    topicIds: ['topic'],
  },
  responses: [{ role: 'Instructor', response: 'Confirm', factVersion: 2 }],
};
function setup(value = record) {
  TestBed.configureTestingModule({ imports: [RecordReview] });
  const fixture = TestBed.createComponent(RecordReview);
  fixture.componentRef.setInput('record', structuredClone(value));
  fixture.componentRef.setInput('role', 'Student');
  fixture.detectChanges();
  return fixture;
}
describe('RecordReview', () => {
  it('shows the exact fact version and allows the missing participant confirmation', () => {
    const f = setup();
    const confirmed = vi.fn();
    f.componentInstance.confirmed.subscribe(confirmed);
    expect(f.nativeElement.textContent).toContain('Fact version 2');
    f.componentInstance.confirm();
    expect(confirmed).toHaveBeenCalledOnce();
  });
  it('requires a reason before disputing a version', () => {
    const f = setup();
    const emit = vi.fn();
    f.componentInstance.disputed.subscribe(emit);
    f.componentInstance.dispute();
    expect(emit).not.toHaveBeenCalled();
    expect(f.componentInstance.error()).toContain('Explain');
    f.componentInstance.reason.set('Distance is incorrect');
    f.componentInstance.dispute();
    expect(emit).toHaveBeenCalledWith('Distance is incorrect');
  });
  it('blocks confirmation of disputed facts and duplicate participant confirmation', () => {
    const f = setup({ ...record, status: 'Disputed' });
    const emit = vi.fn();
    f.componentInstance.confirmed.subscribe(emit);
    f.componentInstance.confirm();
    expect(emit).not.toHaveBeenCalled();
    f.componentRef.setInput('record', {
      ...record,
      responses: [...record.responses, { role: 'Student', response: 'Confirm', factVersion: 2 }],
    });
    f.detectChanges();
    f.componentInstance.confirm();
    expect(emit).not.toHaveBeenCalled();
  });
  it('does not carry a participant confirmation into a corrected fact version', () => {
    const f = setup({
      ...record,
      responses: [{ role: 'Student', response: 'Confirm', factVersion: 1 }],
    });
    expect(f.componentInstance.alreadyConfirmed()).toBe(false);
    expect(f.componentInstance.canConfirm()).toBe(true);
  });
});
