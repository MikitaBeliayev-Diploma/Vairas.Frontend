import { localValue, schoolTimeToUtc } from '../../shared/school-date';

import { CatalogAssessment } from '../../domain/models/school-models';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Scheduling limits for an audited manual reason. */
export const ASSESSMENT_REASON_MAX = 500;
/** Learning Tracking limit for an assessment comment. */
export const ASSESSMENT_COMMENT_MAX = 2000;

/** Explanations for the Scheduling and Learning Tracking assessment codes the user can act on. */
export const assessmentCodeMessages: Record<string, string> = {
  ASSESSMENT_NOT_READY:
    'Learning Tracking does not allow this assessment: the requirement is already passed, or the readiness evaluation is not currently approved. Check results and readiness first.',
  INVALID_ASSESSMENT_EVIDENCE:
    'The readiness evidence no longer matches this enrollment and assessment. Reload readiness and try again.',
  ASSESSMENT_EVIDENCE_EXPIRED:
    'The readiness evidence expired while booking. Submit again to re-check it.',
  RULE_VERIFICATION_REQUIRED:
    'The legal applicability of the scheduling rules is not verified, so the appointment cannot be booked.',
  VEHICLE_GATE_REQUIRED:
    'A practical assessment needs an active vehicle of the learner category assigned to the chosen assessor at this branch.',
  CROSS_MIDNIGHT_SESSION: 'The appointment must start and end on the same Vilnius day.',
  TIMESTAMP_PRECISION_UNSUPPORTED: 'Choose whole minutes for the appointment interval.',
  BUSINESS_RULE_REJECTED:
    'The interval conflicts with another booking or a school scheduling rule. Choose another time or resources.',
  ACCESS_DENIED:
    'You or the chosen teacher are not allowed to do this. Assessment appointments need an Administrator, and the teacher must hold the Assessor grant.',
  RECONCILIATION_PENDING:
    'Scheduling has not finished this booking yet. Check the outcome with the same operation before trying again.',
  IDEMPOTENCY_KEY_REUSED:
    'This request was already used for different data. Change the values deliberately or start again.',
  REVISION_CONFLICT: 'The appointment changed. Reload it and review before trying again.',
  MARK_OUTSIDE_PINNED_SCALE: 'The mark is outside the scale of this assessment definition.',
  ASSESSMENT_PROGRAMME_MISMATCH:
    'This assessment does not belong to the learner’s programme, or it was performed before the training started.',
  CURRENT_READINESS_APPROVAL_REQUIRED:
    'A final assessment needs the current, approved and still valid readiness decision given before the assessment time.',
  MIDTERM_HAS_NO_FINAL_READINESS:
    'A midterm assessment is recorded without a final readiness decision.',
  APPOINTMENT_ALREADY_RECORDED: 'A result for this appointment is already recorded.',
  ASSESSMENT_APPOINTMENT_MISMATCH:
    'The appointment does not match: it must be your own, not cancelled, for this learner and assessment, and the assessment time must lie within it.',
  ASSESSMENT_TOPIC_MISMATCH: 'A topic mark does not belong to this assessment.',
  ENROLLMENT_NOT_ACTIVE: 'The enrollment is not active.',
};

export interface AppointmentInterval {
  startsAt: string;
  endsAt: string;
}

/**
 * Converts a Vilnius wall-clock start plus duration to UTC instants and applies the Scheduling shape
 * rules: a future start, whole minutes of 15–240, and both ends on the same Vilnius day.
 * Ambiguous or non-existent local times (DST) are rejected by `schoolTimeToUtc`.
 */
export function appointmentInterval(
  startLocal: string,
  durationMinutes: number | null,
  now = Date.now(),
): AppointmentInterval {
  const startsAt = schoolTimeToUtc(startLocal);
  if (Date.parse(startsAt) <= now) throw new Error('Choose a start time in the future.');
  if (
    durationMinutes === null ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 240
  )
    throw new Error('Enter a whole duration of 15–240 minutes.');
  const end = new Date(Date.parse(startsAt) + durationMinutes * 60000);
  if (localValue(end).slice(0, 10) !== startLocal.slice(0, 10))
    throw new Error(assessmentCodeMessages['CROSS_MIDNIGHT_SESSION']);
  return { startsAt, endsAt: end.toISOString() };
}

/** Mirrors the Learning Tracking result rules that can be checked before submitting. */
export function assessmentResultError(
  definitionId: string,
  definition: CatalogAssessment | undefined,
  mark: number | null,
  assessedAt: string | null,
  appointment: { startsAt?: string; endsAt?: string } | null,
  comment: string,
  now = Date.now(),
): string | null {
  if (!definitionId || !UUID.test(definitionId)) return 'Select the performed assessment.';
  if (mark === null || !Number.isInteger(mark)) return 'Enter the mark as a whole number.';
  if (definition?.minimumMark !== undefined && definition.maximumMark !== undefined)
    if (mark < definition.minimumMark || mark > definition.maximumMark)
      return `The mark must be between ${definition.minimumMark} and ${definition.maximumMark}.`;
  if (!assessedAt) return 'Enter when the assessment was performed.';
  if (Date.parse(assessedAt) > now) return 'The assessment time cannot be in the future.';
  if (
    appointment?.startsAt &&
    appointment.endsAt &&
    (Date.parse(assessedAt) < Date.parse(appointment.startsAt) ||
      Date.parse(assessedAt) > Date.parse(appointment.endsAt))
  )
    return 'The assessment time must lie within the selected appointment.';
  if (comment.length > ASSESSMENT_COMMENT_MAX)
    return `Use no more than ${ASSESSMENT_COMMENT_MAX} characters for the comment.`;
  return null;
}
