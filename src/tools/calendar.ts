import { google } from 'googleapis';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

function fixYear(date: string): string {
  const currentYear = new Date().getFullYear();
  const [year, month, day] = date.split('-').map(Number);
  if (year < currentYear) return `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return date;
}

function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(process.env.GOOGLE_CREDENTIALS_PATH ?? './google-credentials.json'),
    scopes: SCOPES,
  });
  return google.calendar({ version: 'v3', auth });
}

// Check available slots for a given date (returns up to 5 free 30-min slots)
export async function getAvailableSlots(date: string): Promise<string[]> {
  date = fixYear(date);
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;

  const startOfDay = new Date(`${date}T08:00:00`);
  const endOfDay = new Date(`${date}T18:00:00`);

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const busy = response.data.calendars?.[calendarId]?.busy ?? [];

  // Generate 30-min slots between 9am and 5pm
  const slots: string[] = [];
  const current = new Date(`${date}T09:00:00`);
  const end = new Date(`${date}T17:00:00`);

  while (current < end && slots.length < 5) {
    const slotEnd = new Date(current.getTime() + 30 * 60 * 1000);

    const isbusy = busy.some((b) => {
      const busyStart = new Date(b.start!);
      const busyEnd = new Date(b.end!);
      return current < busyEnd && slotEnd > busyStart;
    });

    if (!isbusy) {
      slots.push(
        current.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      );
    }

    current.setMinutes(current.getMinutes() + 30);
  }

  return slots;
}

// Book a slot on the calendar
export async function bookSlot(
  date: string,
  time: string,
  candidateName: string,
  candidatePhone: string
): Promise<string> {
  date = fixYear(date);
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;

  const [hours, minutes] = time.split(':').map(Number);
  const start = new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Recruiter Call — ${candidateName}`,
      description: `Candidate phone: ${candidatePhone}\nBooked via AI voice agent.`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });

  return `${date} at ${time}`;
}
