import { Pipe, PipeTransform } from '@angular/core';
@Pipe({ name: 'schoolDate' })
export class SchoolDatePipe implements PipeTransform {
  transform(value: string | undefined | null, format: 'date' | 'time' | 'full' = 'full'): string {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Invalid date';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Vilnius',
      ...(format === 'time'
        ? { hour: '2-digit', minute: '2-digit' }
        : format === 'date'
          ? { day: 'numeric', month: 'short', year: 'numeric' }
          : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    }).format(date);
  }
}
export function localValue(date: Date) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return parts.replace(' ', 'T');
}
export function schoolTimeToUtc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Enter a valid date and time.');
  const base = Date.parse(value + 'Z');
  const candidates = [120, 180]
    .map((offset) => new Date(base - offset * 60000))
    .filter((date) => localValue(date) === value);
  if (candidates.length !== 1)
    throw new Error(
      'This Vilnius local time is ambiguous or does not exist due to daylight saving. Choose another time.',
    );
  return candidates[0]!.toISOString();
}
