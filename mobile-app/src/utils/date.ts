import { format, parseISO } from 'date-fns';

export function formatDate(date: string | Date, formatStr: string = 'MMM d, yyyy'): string {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return format(dateObj, formatStr);
  } catch (error) {
    console.error('Date format error:', error);
    return '';
  }
}

export function formatTime(date: string | Date, formatStr: string = 'h:mm a'): string {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return format(dateObj, formatStr);
  } catch (error) {
    console.error('Time format error:', error);
    return '';
  }
}

export function formatDateTime(date: string | Date, formatStr: string = 'MMM d, yyyy h:mm a'): string {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return format(dateObj, formatStr);
  } catch (error) {
    console.error('DateTime format error:', error);
    return '';
  }
}

export function toISODate(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}
