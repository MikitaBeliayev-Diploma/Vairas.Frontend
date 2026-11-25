import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import {
  AvailabilitySlot,
  Lesson,
  SchoolRuleInput,
  SchoolRuleVersion,
} from '../models/scheduling-models';
import { ReviewItem } from '../models/school-models';
@Injectable({ providedIn: 'root' })
export class LessonAdminApi {
  private readonly api = inject(ApiClient);
  createTheory(
    input: {
      schoolId: string;
      branchId: string;
      teacherId: string;
      category: string;
      startsAt: string;
      endsAt: string;
      groupId: string;
    },
    key?: string,
  ) {
    return this.api.send<Lesson>('POST', '/api/v1/theory-lessons', input, key);
  }
  lesson(lesson: Pick<Lesson, 'lessonId' | 'kind'>) {
    return this.api.get<Lesson>(
      '/api/v1/' +
        (lesson.kind === 'Theory' ? 'theory-lessons/' : 'practical-lessons/') +
        lesson.lessonId,
    );
  }
  correctInterval(lesson: Lesson, actualStart: string, actualEnd: string, reason: string) {
    return this.api.send<Lesson>(
      'PATCH',
      '/api/v1/lessons/' + lesson.lessonId + '/actual-interval',
      {
        expectedVersion: lesson.version,
        actualStart,
        actualEnd,
        reason,
      },
    );
  }
  availability(
    schoolId: string,
    query: {
      branchId: string;
      teacherId: string;
      category: string;
      from: string;
      to: string;
      durationMinutes: number;
      enrollmentId?: string;
      studentId?: string;
      vehicleId?: string;
    },
  ) {
    const params = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => k + '=' + encodeURIComponent(String(v)))
      .join('&');
    return this.api.get<{ schoolId: string; slots: AvailabilitySlot[] }>(
      '/api/v1/schools/' + schoolId + '/availability?' + params,
    );
  }
  ruleHistory(schoolId: string) {
    return this.api.get<
      {
        ruleVersionId: string;
        ruleId: string;
        revision: number;
        ruleType: string;
        effectiveNow: boolean;
        superseded: boolean;
        verificationStatus: string;
      }[]
    >('/api/v1/schools/' + schoolId + '/scheduling-rule-versions');
  }
  createRule(input: SchoolRuleInput, key?: string) {
    return this.api.send<SchoolRuleVersion>(
      'POST',
      '/api/v1/schools/' + input.schoolId + '/scheduling-rule-versions',
      input,
      key,
    );
  }
  rule(schoolId: string, ruleVersionId: string) {
    return this.api.get<SchoolRuleVersion>(
      '/api/v1/schools/' + schoolId + '/scheduling-rule-versions/' + ruleVersionId,
    );
  }
  lessonReviews(schoolId: string, includeResolved = false) {
    return this.api.get<ReviewItem[]>(
      '/api/v1/schools/' + schoolId + '/lesson-reviews?includeResolved=' + includeResolved,
    );
  }
  resolveLessonReview(schoolId: string, reviewId: string, note: string) {
    return this.api.send<ReviewItem>(
      'POST',
      '/api/v1/schools/' + schoolId + '/lesson-reviews/' + reviewId + '/resolution',
      { note },
    );
  }
}

/** User Management role profiles. */
