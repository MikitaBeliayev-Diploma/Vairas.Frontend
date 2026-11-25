// Smoke test against the running local stack (Backend/local/Start.ps1 + Run-Scenarios.ps1)
// and the API-mode dev server (`npm start`, https://localhost:4200).
// Uses the synthetic users the scenario script registers in Backend/local/.state/scenario-state.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseURL = process.env.LIVE_URL ?? 'https://localhost:4200';
const statePath =
  process.env.SCENARIO_STATE ??
  new URL('../../Backend/local/.state/scenario-state.json', import.meta.url);
let state;
let browser;

before(async () => {
  state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    headless: true,
  });
  await fs.mkdir('test-results', { recursive: true });
});
after(async () => {
  for (const { browserContext } of sessions.values()) await browserContext.close();
  await browser?.close();
});

/**
 * One signed-in tab per role for the whole run: Authentication allows 10 logins per account in 5 minutes and the
 * Gateway 20 anonymous auth calls per minute. The refresh token lives in the tab's sessionStorage, so later tests
 * reuse the tab and navigate (a full load restores the session through the rotating refresh token).
 */
const sessions = new Map();
/** The Gateway allows 300 requests per minute per IP (fixed window); the heaviest tests start in a fresh window. */
const freshRateWindow = () => new Promise((resolve) => setTimeout(resolve, 61000));

/** In-app navigation (Angular router listens to popstate); avoids a full load and a refresh-token rotation. */
async function open(page, path) {
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }, path);
  await page.waitForURL((url) => url.pathname === path.split('?')[0], { timeout: 30000 });
}
async function signIn(role) {
  const known = sessions.get(role);
  if (known) {
    known.failures.length = 0;
    await open(known.page, '/dashboard');
    return known;
  }
  // The local CA is not in the browser trust store of the test profile.
  const browserContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = await browserContext.newPage();
  let accessToken;
  page.on('request', (request) => {
    if (request.url().startsWith(baseURL + '/api/')) {
      const authorization = request.headers().authorization;
      if (authorization) accessToken = authorization;
    }
  });
  const failures = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) failures.push(r.status() + ' ' + r.url());
  });
  await page.goto(baseURL + '/login');
  const { email, password } = state[role + ':credentials'];
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  try {
    await page.waitForURL(/\/dashboard$/, { timeout: 30000, waitUntil: 'commit' });
  } catch (error) {
    const alerts = (await page.locator('[role=alert]').allTextContents()).join(' | ');
    throw new Error('Sign-in as ' + role + ' did not reach the dashboard. ' + alerts, {
      cause: error,
    });
  }
  // Tests "close" their session; the tab stays open for the next test of the same role.
  const session = {
    context: { close: async () => {} },
    page,
    failures,
    browserContext,
    authorization: () => accessToken,
  };
  sessions.set(role, session);
  return session;
}

async function noErrorBanner(page, where) {
  await page.waitForLoadState('networkidle');
  const alert = page.locator('main .feedback.error[role="alert"]');
  assert.equal(
    await alert.count(),
    0,
    where + ': ' + ((await alert.allTextContents()).join(' ') || ''),
  );
}

test('administrator works through the live administration pages', { timeout: 180000 }, async () => {
  const { context, page, failures } = await signIn('administrator');
  await noErrorBanner(page, 'dashboard');
  // Navigate inside the SPA: full reloads rotate the refresh token, and the Gateway rate-limits
  // anonymous authentication calls (20 per minute per IP).
  for (const [link, heading, file] of [
    ['Enrollments', 'Enrollments', 'enrollments'],
    ['People & invitations', 'People & invitations', 'people'],
    ['Branches & groups', 'Branches', 'school'],
    ['Vehicles', 'Vehicles', 'vehicles'],
    ['Training programmes', 'Training programmes', 'programs'],
    ['Reviews & audit', 'Reviews & audit', 'audit'],
    ['Schedule', 'Schedule', 'schedule'],
    ['Schedule planning', 'Schedule planning', 'planning'],
    ['Documents', 'Training documents', 'documents'],
    ['Learners', 'Learners', 'learners'],
  ]) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await page
      .getByRole('heading', { name: heading, exact: true })
      .first()
      .waitFor({ timeout: 20000 });
    await noErrorBanner(page, link);
    await page.screenshot({ path: 'test-results/live-admin-' + file + '.png', fullPage: true });
  }
  await page.getByRole('link', { name: 'Branches & groups', exact: true }).click();
  await page.getByRole('heading', { level: 2, name: 'Branches' }).waitFor({ timeout: 20000 });
  // A reload restores the session from the rotating refresh token.
  await page.reload();
  await page.getByRole('heading', { level: 2, name: 'Branches' }).waitFor({ timeout: 30000 });
  assert.deepEqual(failures, []);
  await context.close();
});

test('administrator creates a branch, a group and a programme', { timeout: 120000 }, async () => {
  const { context, page, failures } = await signIn('administrator');
  const suffix = Date.now().toString(36);
  const success = page.locator('main .feedback.success');
  await page.getByRole('link', { name: 'Branches & groups', exact: true }).click();
  await page.getByRole('button', { name: 'Add branch' }).click();
  await page.getByLabel('Name').fill('E2E branch ' + suffix);
  await page.getByLabel('City').fill('Vilnius');
  await page.getByRole('button', { name: 'Save branch' }).click();
  await success.filter({ hasText: 'Branch saved.' }).waitFor({ timeout: 20000 });
  await page.getByText('E2E branch ' + suffix).waitFor();

  await page.getByRole('button', { name: 'Add group' }).click();
  await page.getByLabel('Name').fill('E2E group ' + suffix);
  await page.getByRole('button', { name: 'Save group' }).click();
  await success.filter({ hasText: 'Group saved.' }).waitFor({ timeout: 20000 });
  await page.getByText('E2E group ' + suffix).waitFor();

  await page.getByRole('link', { name: 'Training programmes', exact: true }).click();
  await page.getByRole('button', { name: 'New programme' }).click();
  await page.getByLabel('Name').fill('E2E programme ' + suffix);
  await page.getByRole('button', { name: 'Create programme' }).click();
  await success.filter({ hasText: 'Programme created.' }).waitFor({ timeout: 20000 });
  await page.getByRole('heading', { name: 'E2E programme ' + suffix }).waitFor();
  await noErrorBanner(page, 'admin writes');
  assert.deepEqual(failures, []);
  await context.close();
});

test(
  'teacher and student see live training records and readiness',
  { timeout: 120000 },
  async () => {
    const enrollmentId = state.enrollment.resultId;
    const teacher = await signIn('teacher');
    await open(teacher.page, '/training/' + enrollmentId);
    await teacher.page
      .getByRole('heading', { name: 'Practical training records' })
      .waitFor({ timeout: 20000 });
    assert.ok(
      (await teacher.page.locator('.record-row').count()) > 0,
      'records are listed in API mode',
    );
    await teacher.page.getByRole('heading', { name: 'Assessment readiness' }).waitFor();
    await noErrorBanner(teacher.page, 'teacher training');
    await teacher.page.screenshot({
      path: 'test-results/live-teacher-training.png',
      fullPage: true,
    });
    assert.deepEqual(teacher.failures, []);
    await teacher.context.close();

    const student = await signIn('student');
    await student.page.getByRole('link', { name: 'My training' }).click();
    await student.page.waitForURL(new RegExp('/training/' + enrollmentId));
    await student.page
      .getByRole('heading', { name: 'Practical training records' })
      .waitFor({ timeout: 20000 });
    await noErrorBanner(student.page, 'student training');
    await open(student.page, '/assistant');
    await student.page.getByRole('note').first().waitFor();
    await student.page.screenshot({
      path: 'test-results/live-student-assistant.png',
      fullPage: true,
    });
    assert.deepEqual(student.failures, []);
    await student.context.close();
  },
);

// --- New screens (API mode). Inputs come from Backend/local/scenarios.py (scenario-state.json). ---

const salt = Math.floor(Date.now() / 60000);
/**
 * Future slots inside the Schedule window (-7..+23 days). Each run adds bookings, so day and hour rotate with the
 * minute; the three writing tests use disjoint hours to avoid overlapping their own earlier runs.
 */
const slots = {
  booking: [6 + (salt % 16), 12 + (Math.floor(salt / 16) % 4)],
  assistant: [6 + ((salt + 8) % 16), 8 + (Math.floor(salt / 16) % 3)],
  appointment: [6 + ((salt + 4) % 16), 6 + (Math.floor(salt / 16) % 2)],
};
function futureUtc([days, hour]) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}
async function availableBookingStart(session, from) {
  const query = new URLSearchParams({
    branchId: state.branch.resource.branchId,
    enrollmentId: state.enrollment.resultId,
    studentId: state.participants.studentId,
    teacherId: state.participants.teacherId,
    vehicleId: state.vehicle.resource.vehicleId,
    category: 'B',
    durationMinutes: '45',
    from: from.toISOString(),
    to: new Date(from.getTime() + 8 * 3600000).toISOString(),
  });
  const response = await session.browserContext.request.get(
    `${baseURL}/api/v1/schools/${state.schoolId}/availability?${query}`,
    { headers: { Authorization: session.authorization() } },
  );
  assert.equal(response.status(), 200, 'owner availability succeeds');
  const { slots: available } = await response.json();
  assert.ok(available.length, 'synthetic resources have an available slot');
  return new Date(available[0].startsAt);
}
/** `datetime-local` value in the school time zone. */
function vilniusLocal(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(date)
    .replace(' ', 'T');
}
const learnerLabel = () => 'Learner ' + state.participants.studentId.slice(0, 8);

test(
  'additional-lesson reason is refused without an outstanding requirement (AC-025); the booking without it reaches the teacher',
  { timeout: 180000 },
  async () => {
    // The scenario learner's practical requirement is already fully credited, so a reason that claims additional training is not
    // applicable (US-010 / AC-025): Scheduling verifies it with Learning Tracking and books nothing.
    const reason = 'E2E additional lesson ' + salt.toString(36);
    // The preceding read scenarios share the configured fixed-window Gateway budget.
    await freshRateWindow();
    const admin = await signIn('administrator');
    const bookingStart = await availableBookingStart(admin, futureUtc(slots.booking));
    await admin.page.getByRole('link', { name: 'Schedule', exact: true }).click();
    await admin.page.getByRole('heading', { name: 'Schedule', exact: true }).first().waitFor();
    const book = admin.page.getByRole('button', { name: 'Book a lesson' });
    await book.and(admin.page.locator(':enabled')).waitFor({ timeout: 30000 });
    await book.click();
    const dialog = admin.page.getByRole('dialog', { name: 'Book a lesson' });
    // Earlier tests add branches; the scenario's teacher and vehicle belong to the synthetic branch.
    await dialog.getByLabel('Branch').selectOption({ label: 'Synthetic branch' });
    await dialog.getByRole('combobox', { name: 'Learner' }).click();
    await admin.page
      .getByRole('listbox')
      .getByRole('option', { name: new RegExp('^' + learnerLabel()) })
      .click();
    await dialog.getByRole('combobox', { name: 'Instructor' }).click();
    // The school may have further teachers (acceptance fixtures); the scenario teacher is the one asserted below.
    await admin.page
      .getByRole('listbox')
      .getByRole('option', {
        name: new RegExp('^Teacher ' + state.participants.teacherId.slice(0, 8)),
      })
      .click();
    await dialog.getByRole('combobox', { name: 'Vehicle' }).click();
    await admin.page.getByRole('listbox').getByRole('option').first().click();
    await dialog.getByLabel('Starts · Vilnius').fill(vilniusLocal(bookingStart));
    await dialog.getByLabel('Reason · optional').fill(reason);
    await dialog.getByRole('button', { name: 'Book practical lesson' }).click();
    const booked = admin.page
      .locator('main .feedback.success')
      .filter({ hasText: 'Practical lesson booked.' });
    const rejected = dialog.locator('[role=alert]');
    await booked.or(rejected).first().waitFor({ timeout: 30000 });
    assert.equal(await booked.count(), 0, 'an inapplicable additional-lesson reason must not book');
    assert.match(
      (await rejected.allTextContents()).join(' '),
      /no outstanding practical requirement/,
      'the dialog explains the refusal',
    );
    // The same lesson without an additional-training claim is an ordinary booking.
    await dialog.getByLabel('Reason · optional').fill('');
    await dialog.getByRole('button', { name: 'Book practical lesson' }).click();
    await booked
      .or(rejected.filter({ hasNotText: 'no outstanding' }))
      .first()
      .waitFor({ timeout: 30000 });
    assert.equal(
      await booked.count(),
      1,
      'booking rejected: ' + (await rejected.allTextContents()).join(' | '),
    );
    assert.deepEqual(admin.failures, []);
    await admin.context.close();
    sessions.delete('administrator');

    // The administrator's calendar lists only own lessons; the assigned teacher sees the booking at its Vilnius time.
    const time = vilniusLocal(bookingStart).slice(11, 16);
    const teacher = await signIn('teacher');
    await teacher.page.getByRole('link', { name: 'Schedule', exact: true }).click();
    await teacher.page
      .getByRole('button', { name: 'Scheduled', exact: true })
      .click({ timeout: 20000 });
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vilnius', day: 'numeric', month: 'short', year: 'numeric' }).format(bookingStart);
    const row = teacher.page.getByRole('row').filter({ hasText: date }).filter({ hasText: time + ' –' });
    for (let pageNo = 0; pageNo < 6 && !(await row.count()); pageNo++) {
      const next = teacher.page.getByRole('button', { name: 'Next Page' });
      if (!(await next.isEnabled().catch(() => false))) break;
      await next.click();
    }
    await row.waitFor({ timeout: 20000 });
    await noErrorBanner(teacher.page, 'teacher schedule');
    await teacher.page.screenshot({ path: 'test-results/live-teacher-reason.png', fullPage: true });
    assert.deepEqual(teacher.failures, []);
    await teacher.context.close();
  },
);

test('teacher records and confirms theory attendance', { timeout: 180000 }, async () => {
  const lessonId = state.theoryLesson.lessonId;
  const { context, page, failures } = await signIn('teacher');
  await open(page, '/theory-lessons/' + lessonId + '/attendance');
  await page.getByRole('heading', { name: 'Theory attendance' }).waitFor({ timeout: 30000 });
  const known = page.getByRole('link', { name: 'Open the theory record' });
  const submit = page.getByRole('button', { name: 'Submit theory attendance' });
  await known.or(submit).first().waitFor({ timeout: 30000 });
  if (await submit.isVisible()) {
    await page.getByRole('button', { name: 'Mark all present' }).click();
    await submit.click();
    // On a re-run the record already exists; a fresh browser does not know its ID (no list endpoint).
    const exists = page.getByRole('heading', { name: 'Open the existing record' });
    await Promise.race([
      page.waitForURL(/\/records\/theory\//, { timeout: 30000 }),
      exists.waitFor({ timeout: 30000 }),
    ]);
    if (await exists.isVisible()) {
      await noErrorBanner(page, 'existing theory record').catch(() => {});
      await page.screenshot({ path: 'test-results/live-teacher-theory.png', fullPage: true });
      assert.deepEqual(failures, []);
      await context.close();
      return;
    }
  } else {
    await known.click();
  }
  await page.waitForURL(/\/records\/theory\//, { timeout: 30000 });
  const confirm = page.getByRole('button', { name: 'Confirm theory attendance' });
  const confirmed = page
    .locator('main p')
    .filter({ hasText: /Confirmed .*Present learners receive/ });
  await confirm.or(confirmed).first().waitFor({ timeout: 30000 });
  if (await confirm.isVisible()) await confirm.click();
  await confirmed.waitFor({ timeout: 30000 });
  await noErrorBanner(page, 'theory record');
  await page.screenshot({ path: 'test-results/live-teacher-theory.png', fullPage: true });
  assert.deepEqual(failures, []);
  await context.close();
});

test(
  'administrator books a lesson through the assistant after explicit confirmation',
  { timeout: 180000 },
  async () => {
    // The preceding booking and attendance tests use most of the per-client Gateway/Chat budget.
    await freshRateWindow();
    const session = await signIn('administrator');
    const { context, page, failures } = session;
    await page.getByRole('link', { name: 'AI Assistance', exact: true }).click();
    await page.getByRole('heading', { name: 'AI Assistance' }).waitFor();
    await page.waitForLoadState('networkidle');
    const fresh = page.getByRole('button', { name: 'New conversation' });
    if (await fresh.isVisible()) await fresh.click();
    const from = futureUtc(slots.assistant);
    const query = new URLSearchParams({
      branchId: state.branch.resource.branchId,
      enrollmentId: state.enrollment.resultId,
      studentId: state.participants.studentId,
      teacherId: state.participants.teacherId,
      vehicleId: state.vehicle.resource.vehicleId,
      category: 'B',
      durationMinutes: '45',
      from: from.toISOString(),
      to: new Date(from.getTime() + 8 * 3600000).toISOString(),
    });
    const available = await session.browserContext.request.get(
      `${baseURL}/api/v1/schools/${state.schoolId}/availability?${query}`,
      { headers: { Authorization: session.authorization() } },
    );
    assert.equal(available.status(), 200, 'authoritative availability must succeed');
    const { slots: availableSlots } = await available.json();
    assert.ok(availableSlots.length, 'synthetic resources must have an available slot');
    const starts = new Date(availableSlots[0].startsAt);
    const args = {
      branchId: state.branch.resource.branchId,
      enrollmentId: state.enrollment.resultId,
      studentId: state.participants.studentId,
      teacherId: state.participants.teacherId,
      vehicleId: state.vehicle.resource.vehicleId,
      category: 'B',
      startsAt: starts.toISOString(),
      endsAt: new Date(starts.getTime() + 45 * 60000).toISOString(),
    };
    // The local model double executes only explicit synthetic tool prompts.
    await page
      .getByLabel('Message the assistant')
      .fill('Synthetic tool preview_lesson_booking ' + JSON.stringify(args));
    await page.getByRole('button', { name: 'Send message' }).click();
    await page
      .getByRole('heading', { name: 'Book a practical lesson' })
      .waitFor({ timeout: 60000 });
    assert.equal(await page.getByText('can preview the action but not execute it').count(), 0);
    const confirm = page.getByRole('button', { name: 'Confirm this action', exact: true });
    assert.equal(await confirm.isDisabled(), true, 'confirmation requires the explicit checkbox');
    await page.getByLabel('I reviewed these details and approve this exact action.').check();
    await confirm.click();
    await page.getByText('Action committed successfully.').waitFor({ timeout: 60000 });
    await noErrorBanner(page, 'assistant');
    await page.screenshot({ path: 'test-results/live-admin-assistant.png', fullPage: true });
    assert.deepEqual(failures, []);
    await context.close();
  },
);

test(
  'readiness re-evaluation, assessment appointment and assessor result',
  { timeout: 300000 },
  async () => {
    await freshRateWindow();
    const enrollmentId = state.enrollment.resultId;
    const training = '/training/' + enrollmentId;
    // 1. A recorded result invalidates the previous approval: the administrator evaluates prerequisites again.
    let admin = await signIn('administrator');
    await open(admin.page, training);
    await admin.page
      .getByRole('heading', { name: 'Assessment readiness' })
      .waitFor({ timeout: 30000 });
    await admin.page
      .getByLabel('Assessment definition', { exact: true })
      .selectOption(state.finalAssessment);
    const evaluate = admin.page.getByRole('button', { name: 'Evaluate prerequisites' });
    await evaluate.and(admin.page.locator(':enabled')).waitFor({ timeout: 30000 });
    await evaluate.click();
    await admin.page
      .locator('.readiness-panel')
      .getByText('Pending', { exact: true })
      .first()
      .waitFor({ timeout: 30000 });
    await noErrorBanner(admin.page, 'readiness evaluation');
    assert.deepEqual(admin.failures, []);
    await admin.context.close();

    // 2. The teacher with the Assessor grant approves readiness.
    let teacher = await signIn('teacher');
    await open(teacher.page, training);
    await teacher.page
      .getByLabel('Assessment definition', { exact: true })
      .selectOption(state.finalAssessment);
    await teacher.page.getByLabel('Decision reason').fill('E2E prerequisites reviewed');
    await teacher.page.getByRole('button', { name: 'Approve readiness' }).click();
    await teacher.page
      .getByRole('heading', { name: 'Record a performed assessment' })
      .waitFor({ timeout: 30000 });
    await teacher.page
      .locator('.readiness-panel')
      .getByText('Approved', { exact: true })
      .first()
      .waitFor({ timeout: 30000 });
    // The result must be performed after this decision; the form takes minute precision.
    const performedAt = Math.ceil((Date.now() + 1000) / 60000) * 60000;
    assert.deepEqual(teacher.failures, []);
    await teacher.context.close();

    // 3. The administrator books the assessment appointment.
    admin = await signIn('administrator');
    await open(admin.page, training);
    await admin.page
      .getByLabel('Assessment definition', { exact: true })
      .selectOption(state.finalAssessment);
    const submit = admin.page.getByRole('button', { name: 'Book assessment appointment' });
    await submit.waitFor({ timeout: 30000 });
    await admin.page.getByLabel('Assessor').selectOption({ index: 1 });
    await admin.page.getByLabel('Branch').selectOption({ label: 'Synthetic branch' });
    await admin.page
      .getByLabel('Starts · Vilnius')
      .fill(vilniusLocal(futureUtc(slots.appointment)));
    await admin.page.getByLabel('Duration · minutes').fill('45');
    await admin.page
      .getByLabel('Reason')
      .fill('E2E repeated final assessment ' + salt.toString(36));
    await submit.click();
    const booked = admin.page.getByText(/^Booked appointment /);
    const rejected = admin.page.locator(
      'section[aria-labelledby="assessment-booking-heading"] [role=alert]',
    );
    await booked.or(rejected).first().waitFor({ timeout: 30000 });
    const refusal = (await rejected.allTextContents()).join(' | ');
    await admin.page.screenshot({ path: 'test-results/live-admin-assessment.png', fullPage: true });
    assert.deepEqual(admin.failures, []);
    await admin.context.close();
    sessions.delete('administrator');
    if (!(await booked.count())) {
      // US-010 / AC-025: once the final assessment is passed and recorded, a repeated assessment is not applicable;
      // Scheduling refuses it (Learning Tracking evidence) and books nothing. No new result is recorded then.
      assert.match(refusal, /already passed/, 'appointment rejected: ' + refusal);
      return;
    }

    // 4. The assessor records the performed assessment against the approved readiness.
    teacher = await signIn('teacher');
    await open(teacher.page, training);
    await teacher.page
      .getByRole('heading', { name: 'Record a performed assessment' })
      .waitFor({ timeout: 30000 });
    const rows = teacher.page.locator(
      'section[aria-labelledby="assessment-results-heading"] .record-row',
    );
    await rows.first().waitFor({ timeout: 30000 });
    const before = await rows.count();
    const wait = performedAt + 1000 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    await teacher.page.getByLabel('Performed assessment').selectOption({ index: 1 });
    await teacher.page.getByLabel('Mark').fill('9');
    await teacher.page
      .getByLabel('Performed at · Vilnius')
      .fill(vilniusLocal(new Date(performedAt)));
    await teacher.page.getByRole('button', { name: 'Record assessment result' }).click();
    const failed = teacher.page.locator(
      'section[aria-labelledby="assessment-results-heading"] [role=alert]',
    );
    await rows.nth(before).or(failed).first().waitFor({ timeout: 30000 });
    assert.equal(
      await failed.count(),
      0,
      'result rejected: ' + (await failed.allTextContents()).join(' | '),
    );
    await teacher.page.screenshot({
      path: 'test-results/live-assessor-result.png',
      fullPage: true,
    });
    assert.deepEqual(teacher.failures, []);
    await teacher.context.close();
  },
);

test(
  'administrator publishes a ready completion report and records manual external reporting',
  { timeout: 300000 },
  async () => {
    await freshRateWindow();
    // Needs confirmed theory attendance (run after the theory test) and a passed final assessment.
    const { context, page, failures } = await signIn('administrator');
    await page.getByRole('link', { name: 'Documents', exact: true }).click();
    await page.getByRole('heading', { name: 'Training documents' }).waitFor();
    await page.getByLabel('Learner enrollment').selectOption(state.enrollment.resultId);
    await page.getByRole('button', { name: 'Generate completion report' }).click();
    const generated = page.locator('main .feedback').filter({ hasText: /Document generat/ });
    const alert = page.locator('main [role=alert]').filter({ hasText: /document|too many/i });
    await generated.or(alert).first().waitFor({ timeout: 90000 });
    const message =
      ((await generated
        .first()
        .textContent()
        .catch(() => '')) ?? '') + (await alert.allTextContents()).join(' | ');
    assert.match(message, /Review it before publishing/, 'completion report evidence: ' + message);
    const card = page
      .locator('article')
      .filter({ hasText: /completion report/i })
      .first();
    await card.getByText('Evidence is complete for this version.').waitFor({ timeout: 20000 });
    for (const [action, note] of [
      ['Mark reviewed', 'E2E checked the evidence summary'],
      ['Publish', 'E2E publish ready report'],
    ]) {
      // Unchanged evidence reuses the current version, which an earlier run may already have published.
      const button = card.getByRole('button', { name: action });
      await button
        .or(card.getByRole('button', { name: 'Withdraw' }))
        .first()
        .waitFor({ timeout: 20000 });
      if (!(await button.isVisible())) continue;
      await button.click();
      await page.getByLabel('Note (what you checked)').fill(note);
      await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
    }
    await page.screenshot({ path: 'test-results/live-admin-published.png', fullPage: true });
    await card.getByRole('button', { name: 'Record manual external reporting' }).click();
    const statement = 'E2E reported manually in the Regitra portal, reference ' + salt.toString(36);
    await page.getByLabel('Statement').fill(statement);
    await page.getByLabel(/I understand that Vairas sends nothing/).check();
    await page.getByRole('button', { name: 'Record declaration' }).click();
    await card.getByText(statement, { exact: false }).waitFor({ timeout: 30000 });
    await noErrorBanner(page, 'documents');
    await page.screenshot({ path: 'test-results/live-admin-declaration.png', fullPage: true });
    assert.deepEqual(failures, []);
    await context.close();
  },
);

test(
  'authenticated desktop, tablet and mobile layouts retain navigation and theme controls',
  { timeout: 120000 },
  async () => {
    const { page } = await signIn('administrator');
    for (const [name, width, height] of [
      ['desktop', 1440, 900],
      ['tablet', 768, 1024],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await open(page, '/dashboard');
      await page.waitForLoadState('networkidle');
      for (const dark of [false, true]) {
        const target = page.getByRole('button', {
          name: dark ? 'Dark theme' : 'Light theme',
          exact: true,
        });
        if (await target.count()) await target.click();
        await page.waitForFunction(
          (expected) => document.documentElement.classList.contains('vairas-dark') === expected,
          dark,
        );
        await page.screenshot({
          path: `test-results/live-dashboard-${name}-${dark ? 'dark' : 'light'}.png`,
          fullPage: true,
        });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          name +
            ' has no page overflow: ' +
            JSON.stringify(
              await page.evaluate(() =>
                [...document.querySelectorAll('main *, header *, footer *')]
                  .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
                  .slice(0, 8)
                  .map((el) => ({
                    tag: el.tagName,
                    class: el.className,
                    right: el.getBoundingClientRect().right,
                  })),
              ),
            ),
        );
      }
      const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
      await skip.focus();
      await page.keyboard.press('Enter');
      assert.equal(
        await page.locator('#main-content').evaluate((el) => document.activeElement === el),
        true,
        'keyboard skip link focuses main content',
      );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  },
);
