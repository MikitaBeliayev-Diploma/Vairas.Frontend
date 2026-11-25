export type Role = 'Administrator' | 'Instructor' | 'Student';

export interface AppConfig {
  apiBaseUrl: string;
}

export interface Session {
  name: string;
  role: Role;
  userId: string;
  schoolId: string;
  enrollmentId: string;
  assessor: boolean;
  accessToken: string;
  sessionId: string;
}

export interface Profile {
  userId: string;
  firstName: string;
  lastName: string;
  emailAddress: string | null;
  phoneNumber: string | null;
  revision: number | string;
  status: string;
  studentId?: string | null;
  teacherId?: string | null;
  administratorId?: string | null;
}
