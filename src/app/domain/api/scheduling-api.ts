import { RequestPage } from '../models/scheduling-models';
import type { KnownAppointment } from '../models/assessment-models';
import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import { AssessmentAppointment, AssessmentAppointmentRequest } from '../models/assessment-models';
import {
  Booking,
  DraftInputSet,
  Lesson,
  ScheduleProposal,
  SchedulingOperation,
  SchedulingRequest,
} from '../models/scheduling-models';
@Injectable({ providedIn: 'root' })
export class SchedulingApi {
  assessmentAppointments(enrollmentId: string) {
    return this.api.get<KnownAppointment[]>(
      '/api/v1/assessment-appointments?enrollmentId=' + encodeURIComponent(enrollmentId),
    );
  }
  private readonly api = inject(ApiClient);
  lessons(from: string, to: string) {
    return this.api.get<Lesson[]>(
      '/api/v1/users/me/lessons?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to),
    );
  }
  requests(offset = 0) {
    return this.api.get<RequestPage>('/api/v1/scheduling-requests?offset=' + offset + '&limit=20');
  }
  savedProposal(id: string, revision: number) {
    return this.api.get<ScheduleProposal>(
      '/api/v1/scheduling-requests/' + id + '/proposals/' + revision,
    );
  }
  request(id: string) {
    return this.api.get<SchedulingRequest>('/api/v1/scheduling-requests/' + id);
  }
  requestInputs(id: string) {
    return this.api.get<DraftInputSet>('/api/v1/scheduling-requests/' + id + '/inputs');
  }
  createDraft(inputs: DraftInputSet) {
    return this.api.send<SchedulingRequest>('POST', '/api/v1/scheduling-requests', inputs);
  }
  updateDraft(request: SchedulingRequest, inputs: DraftInputSet) {
    return this.api.send<SchedulingRequest>(
      'PUT',
      '/api/v1/scheduling-requests/' + request.requestId,
      { ...inputs, expectedRevision: request.revision },
    );
  }
  submit(request: SchedulingRequest) {
    return this.api.send<SchedulingRequest>(
      'POST',
      '/api/v1/scheduling-requests/' + request.requestId + '/submissions',
      { expectedRevision: request.revision },
    );
  }
  proposal(request: SchedulingRequest) {
    return this.api.send<ScheduleProposal>(
      'POST',
      '/api/v1/scheduling-requests/' + request.requestId + '/proposals',
      { expectedRevision: request.revision },
    );
  }
  confirm(proposal: ScheduleProposal, key: string) {
    return this.api.send<SchedulingOperation>(
      'POST',
      '/api/v1/scheduling-requests/' + proposal.requestId + '/confirmations',
      { expectedRevision: proposal.revision },
      key,
    );
  }
  operation(id: string) {
    return this.api.get<SchedulingOperation>('/api/v1/scheduling-operations/' + id);
  }
  /**
   * US-010: books an assessment appointment (Administrator). A replay with the same Idempotency-Key and
   * payload returns the saved appointment; an unfinished operation answers 202 `RECONCILIATION_PENDING`.
   */
  scheduleAssessment(request: AssessmentAppointmentRequest, key: string) {
    return this.api.send<AssessmentAppointment | { code?: string; status?: number }>(
      'POST',
      '/api/v1/assessment-appointments',
      request,
      key,
    );
  }
  assessmentAppointment(appointmentId: string) {
    return this.api.quiet<AssessmentAppointment>(
      '/api/v1/assessment-appointments/' + appointmentId,
    );
  }
  cancelAssessment(appointment: AssessmentAppointment, reason: string, key: string) {
    return this.api.send<AssessmentAppointment>(
      'POST',
      '/api/v1/assessment-appointments/' + appointment.appointmentId + '/cancellation',
      { expectedVersion: appointment.version, reason },
      key,
    );
  }
  book(booking: Booking, key: string) {
    return this.api.send<Lesson | SchedulingOperation>(
      'POST',
      '/api/v1/practical-lessons',
      booking,
      key,
    );
  }
  reschedule(lesson: Lesson, startsAt: string, endsAt: string, reason: string, key: string) {
    return this.api.send<Lesson | SchedulingOperation>(
      'POST',
      '/api/v1/' +
        (lesson.kind === 'Theory' ? 'theory-lessons/' : 'practical-lessons/') +
        lesson.lessonId +
        '/rescheduling',
      { expectedVersion: lesson.version, startsAt, endsAt, reason },
      key,
    );
  }
  cancel(lesson: Lesson, reason: string, key: string) {
    return this.api.send<Lesson>(
      'POST',
      '/api/v1/' +
        (lesson.kind === 'Theory' ? 'theory-lessons/' : 'practical-lessons/') +
        lesson.lessonId +
        '/cancellation',
      { expectedVersion: lesson.version, reason },
      key,
    );
  }
  complete(lesson: Lesson, actualStart: string, actualEnd: string) {
    return this.api.send<Lesson>(
      'POST',
      '/api/v1/' +
        (lesson.kind === 'Theory' ? 'theory-lessons/' : 'practical-lessons/') +
        lesson.lessonId +
        '/completion',
      { expectedVersion: lesson.version, actualStart, actualEnd },
    );
  }
}
