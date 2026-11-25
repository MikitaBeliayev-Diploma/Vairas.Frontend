import { TheoryAttendance, TheoryRecord } from '../../domain/models/learning-models';

/** One learner the teacher marks for a theory lesson. */
export interface TheoryRosterEntry {
  enrollmentId: string;
  studentId: string;
  name: string;
}

/** Whole minutes of the verified actual interval, or null when the lesson has no actual interval. */
export function physicalMinutes(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return null;
  const minutes = (Date.parse(end) - Date.parse(start)) / 60000;
  return Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : null;
}

/** Credited minutes per row: Present earns the full teaching minutes, Absent earns zero. */
export function creditedMinutes(record: TheoryRecord, attendance: TheoryAttendance) {
  return attendance === 'Present' ? record.facts.trainingMinutes : 0;
}
