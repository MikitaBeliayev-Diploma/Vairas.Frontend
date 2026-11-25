import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { TheoryAttendanceForm, theoryAttendanceError } from './theory-attendance-form';
import { TheoryRosterEntry } from './theory';
const roster: TheoryRosterEntry[] = [
  { enrollmentId: 'e1', studentId: 's1', name: 'Learner one' },
  { enrollmentId: 'e2', studentId: 's2', name: 'Learner two' },
];
function setup(minutes = 90) {
  TestBed.configureTestingModule({ imports: [TheoryAttendanceForm] });
  const fixture = TestBed.createComponent(TheoryAttendanceForm);
  fixture.componentRef.setInput('roster', roster);
  fixture.componentRef.setInput('physicalMinutes', minutes);
  fixture.detectChanges();
  return fixture;
}
describe('theoryAttendanceError', () => {
  it('requires a complete roster with every learner Present or Absent', () => {
    expect(theoryAttendanceError([], 90, 90, '', [])).toContain('No learners');
    expect(theoryAttendanceError(roster, 90, 90, '', ['Present', null])).toContain(
      'Partial attendance',
    );
    expect(theoryAttendanceError(roster, 90, 90, '', ['Present', 'Absent'])).toBeNull();
  });
  it('keeps teaching minutes within the physical interval and explains shorter teaching', () => {
    const marks = ['Present', 'Present'] as const;
    expect(theoryAttendanceError(roster, 90, 0, '', [...marks])).toContain('greater than zero');
    expect(theoryAttendanceError(roster, 90, 45.5, '', [...marks])).toContain('whole');
    expect(theoryAttendanceError(roster, 90, 91, '', [...marks])).toContain('90 min');
    expect(theoryAttendanceError(roster, 90, 80, ' ', [...marks])).toContain('Explain');
    expect(theoryAttendanceError(roster, 90, 80, 'Break excluded', [...marks])).toBeNull();
  });
});
describe('TheoryAttendanceForm', () => {
  it('blocks submission until every learner is marked and shows the reason', () => {
    const fixture = setup();
    const emit = vi.fn();
    fixture.componentInstance.submitted.subscribe(emit);
    expect(fixture.componentInstance.form.controls.trainingMinutes.value).toBe(90);
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(emit).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Mark every learner',
    );
  });
  it('emits the complete roster with explicit attendance and no explanation at full length', () => {
    const fixture = setup();
    const emit = vi.fn();
    fixture.componentInstance.submitted.subscribe(emit);
    fixture.componentInstance.markAll('Present');
    fixture.componentInstance.form.controls.attendance.at(1).setValue('Absent');
    fixture.componentInstance.submit();
    expect(emit).toHaveBeenCalledWith({
      trainingMinutes: 90,
      durationExplanation: null,
      attendanceRows: [
        { enrollmentId: 'e1', studentId: 's1', attendance: 'Present' },
        { enrollmentId: 'e2', studentId: 's2', attendance: 'Absent' },
      ],
    });
  });
  it('requires a duration explanation when fewer minutes than the interval were taught', () => {
    const fixture = setup();
    const emit = vi.fn();
    fixture.componentInstance.submitted.subscribe(emit);
    fixture.componentInstance.markAll('Present');
    fixture.componentInstance.form.patchValue({ trainingMinutes: 75 });
    fixture.componentInstance.submit();
    expect(emit).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('Explain');
    fixture.componentInstance.form.patchValue({ durationExplanation: '  Break excluded ' });
    fixture.componentInstance.submit();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ trainingMinutes: 75, durationExplanation: 'Break excluded' }),
    );
  });
});
