"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SessionUser } from "@/lib/auth/types";
import {
  hasActiveLayer,
  layersToScopes,
  readCalendarLayers,
  writeCalendarLayers,
  type CalendarLayers,
} from "@/lib/calendar/layers";
import {
  formatDateKey,
  formatToolbarLabel,
  getRangeForView,
  isCalendarViewMode,
  parseDateKey,
  shiftAnchorDate,
  type CalendarViewMode,
} from "@/lib/calendar/range";
import type { CalendarEvent } from "@/lib/calendar/types";
import { CalendarDayAgenda } from "./CalendarDayAgenda";
import { CalendarEmptyState } from "./CalendarEmptyState";
import { CalendarLayerFilters } from "./CalendarLayerFilters";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import { CalendarToolbar } from "./CalendarToolbar";
import { CalendarViewPlaceholder } from "./CalendarViewPlaceholder";
import styles from "./CalendarView.module.css";

type CalendarViewProps = {
  user: SessionUser;
};

function readViewFromParams(searchParams: URLSearchParams): CalendarViewMode {
  const raw = searchParams.get("view");
  return raw && isCalendarViewMode(raw) ? raw : "month";
}

function readDateFromParams(searchParams: URLSearchParams): Date {
  const raw = searchParams.get("date");
  if (!raw) {
    return new Date();
  }
  return parseDateKey(raw);
}

export function CalendarView({ user: _user }: CalendarViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<CalendarViewMode>(() =>
    readViewFromParams(searchParams),
  );
  const [anchorDate, setAnchorDate] = useState<Date>(() =>
    readDateFromParams(searchParams),
  );
  const [layers, setLayers] = useState<CalendarLayers>(() => readCalendarLayers());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toolbarLabel = useMemo(
    () => formatToolbarLabel(view, anchorDate),
    [view, anchorDate],
  );

  const syncUrl = useCallback(
    (nextView: CalendarViewMode, nextAnchor: Date) => {
      const params = new URLSearchParams();
      params.set("view", nextView);
      params.set("date", formatDateKey(nextAnchor));
      router.replace(`/calendar?${params.toString()}`);
    },
    [router],
  );

  const updateView = useCallback(
    (nextView: CalendarViewMode) => {
      setView(nextView);
      syncUrl(nextView, anchorDate);
    },
    [anchorDate, syncUrl],
  );

  const updateAnchorDate = useCallback(
    (nextAnchor: Date) => {
      setAnchorDate(nextAnchor);
      syncUrl(view, nextAnchor);
    },
    [syncUrl, view],
  );

  useEffect(() => {
    const nextView = readViewFromParams(searchParams);
    const nextAnchor = readDateFromParams(searchParams);
    setView(nextView);
    setAnchorDate(nextAnchor);
  }, [searchParams]);

  useEffect(() => {
    if (!hasActiveLayer(layers)) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const range = getRangeForView(view, anchorDate);
    const scopes = layersToScopes(layers);
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
    });
    if (scopes.length === 1) {
      params.set("scopes", scopes[0]);
    }

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(`/api/calendar/events?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("fetch failed");
        }
        const data = (await response.json()) as { events?: CalendarEvent[] };
        setEvents(data.events ?? []);
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setEvents([]);
        setError("Не удалось загрузить события");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [anchorDate, layers, view]);

  const handleLayersChange = useCallback((nextLayers: CalendarLayers) => {
    setLayers(nextLayers);
    writeCalendarLayers(nextLayers);
  }, []);

  const handlePrev = useCallback(() => {
    updateAnchorDate(shiftAnchorDate(view, anchorDate, -1));
  }, [anchorDate, updateAnchorDate, view]);

  const handleNext = useCallback(() => {
    updateAnchorDate(shiftAnchorDate(view, anchorDate, 1));
  }, [anchorDate, updateAnchorDate, view]);

  const handleToday = useCallback(() => {
    updateAnchorDate(new Date());
  }, [updateAnchorDate]);

  const openDayView = useCallback(
    (dateKey: string) => {
      const nextDate = parseDateKey(dateKey);
      setView("day");
      setAnchorDate(nextDate);
      syncUrl("day", nextDate);
    },
    [syncUrl],
  );

  const showEmptyState =
    view === "day" && events.length === 0 && hasActiveLayer(layers);

  return (
    <div className={styles.wrap}>
      <CalendarToolbar
        label={toolbarLabel}
        view={view}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onViewChange={updateView}
      />

      <CalendarLayerFilters layers={layers} onChange={handleLayersChange} />

      {error ? (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      ) : null}

      <div className={styles.body}>
        {loading ? (
          <div className={styles.loading} role="status">
            Загрузка событий…
          </div>
        ) : !hasActiveLayer(layers) ? (
          <div className={styles.loading} role="status">
            Выберите хотя бы один слой событий, чтобы загрузить календарь.
          </div>
        ) : showEmptyState ? (
          <CalendarEmptyState />
        ) : view === "day" ? (
          <CalendarDayAgenda events={events} />
        ) : view === "month" ? (
          <CalendarMonthGrid
            anchorDate={anchorDate}
            events={events}
            onDayClick={openDayView}
          />
        ) : (
          <CalendarViewPlaceholder view={view} events={events} />
        )}
      </div>
    </div>
  );
}
