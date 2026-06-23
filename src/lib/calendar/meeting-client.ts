export {
  formatMeetingOpensAtLabel,
  getMeetingAccessPhase,
  getMeetingAccessWindow,
  isWithinMeetingWindow,
  MEETING_EARLY_MINUTES,
  MEETING_LATE_MINUTES,
  type MeetingAccessPhase,
} from "./meeting-window";

import type { MeetingAccessPhase } from "./meeting-window";

export function formatMeetingStatusLabel(phase: MeetingAccessPhase): string {
  switch (phase) {
    case "waiting":
      return "Ожидание";
    case "open":
      return "Открыта";
    case "closed":
      return "Завершена";
  }
}
