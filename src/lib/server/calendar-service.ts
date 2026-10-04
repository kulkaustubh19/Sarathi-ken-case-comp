import type { LoginUser } from "./login-store";
import { ensureDemoRepository, localEvents, type LocalEvent } from "./local-health-data";
import { eventsThisWeek } from "./dashboard-summary";

export type CalendarTask = { id: string; title: string; description: string; starts_at: string; url?: string; own: boolean; calendar_status?: string };
export async function upcomingCalendarTasks(user: LoginUser): Promise<CalendarTask[]> {
  await ensureDemoRepository(user);
  return eventsThisWeek(await localEvents(user.id)).filter(event => Date.parse(event.starts_at) >= Date.now()).map((event: LocalEvent) => ({ id: event.id, title: event.title, description: event.description, starts_at: event.starts_at, url: event.url, own: event.owner_id === user.id, calendar_status: event.calendar_status }));
}
export function isLabTask(task: CalendarTask) { return /\b(blood|lab|test|scan|ct|cbc|lipid|glucose|pathology|sample collection)\b/i.test(`${task.title} ${task.description}`); }
