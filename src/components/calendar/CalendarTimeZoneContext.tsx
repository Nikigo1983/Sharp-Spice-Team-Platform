"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CALENDAR_TIMEZONE } from "@/lib/calendar/constants";
import {
  formatTimeZoneLabel,
  resolveBrowserTimeZone,
} from "@/lib/calendar/timezone";

type CalendarTimeZoneContextValue = {
  timeZone: string;
  timeZoneLabel: string;
};

const DEFAULT_TIME_ZONE_LABEL = CALENDAR_TIMEZONE.replace(/_/g, " ");

const CalendarTimeZoneContext = createContext<CalendarTimeZoneContextValue>({
  timeZone: CALENDAR_TIMEZONE,
  timeZoneLabel: DEFAULT_TIME_ZONE_LABEL,
});

export function CalendarTimeZoneProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [timeZone, setTimeZone] = useState(CALENDAR_TIMEZONE);

  useEffect(() => {
    setTimeZone(resolveBrowserTimeZone());
  }, []);

  const value = useMemo(
    () => ({
      timeZone,
      timeZoneLabel: formatTimeZoneLabel(timeZone),
    }),
    [timeZone],
  );

  return (
    <CalendarTimeZoneContext.Provider value={value}>
      {children}
    </CalendarTimeZoneContext.Provider>
  );
}

export function useCalendarTimeZone(): CalendarTimeZoneContextValue {
  return useContext(CalendarTimeZoneContext);
}
