"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Toast, type ToastMessage } from "@/components/tasks/Toast";
import type { SessionUser } from "@/lib/auth/types";
import {
  defaultFormValues,
  eventToFormValues,
  formValuesToCreatePayload,
  formValuesToUpdatePayload,
  type CalendarFormValues,
} from "@/lib/calendar/form";
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
import { CalendarEventForm } from "./CalendarEventForm";
import { CalendarEventModal } from "./CalendarEventModal";
import { CalendarLayerFilters } from "./CalendarLayerFilters";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import { CalendarToolbar } from "./CalendarToolbar";
import { CalendarViewPlaceholder } from "./CalendarViewPlaceholder";
import { CalendarWeekGrid } from "./CalendarWeekGrid";
import {
  CalendarTimeZoneProvider,
  useCalendarTimeZone,
} from "./CalendarTimeZoneContext";
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

function buildCalendarUrl(
  nextView: CalendarViewMode,
  nextAnchor: Date,
  timeZone: string,
  eventId?: string | null,
): string {
  const params = new URLSearchParams();
  params.set("view", nextView);
  params.set("date", formatDateKey(nextAnchor, timeZone));
  if (eventId) {
    params.set("event", eventId);
  }
  return `/calendar?${params.toString()}`;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function CalendarView({ user }: CalendarViewProps) {
  return (
    <CalendarTimeZoneProvider>
      <CalendarViewContent user={user} />
    </CalendarTimeZoneProvider>
  );
}

function CalendarViewContent({ user }: CalendarViewProps) {
  const { timeZone, timeZoneLabel } = useCalendarTimeZone();
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
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewEvent, setViewEvent] = useState<CalendarEvent | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [deleteEvent, setDeleteEvent] = useState<CalendarEvent | null>(null);

  const toolbarLabel = useMemo(
    () => formatToolbarLabel(view, anchorDate, timeZone),
    [view, anchorDate, timeZone],
  );

  const createInitialValues = useMemo(
    () => defaultFormValues(anchorDate, timeZone),
    [anchorDate, createOpen, timeZone],
  );

  const syncUrl = useCallback(
    (nextView: CalendarViewMode, nextAnchor: Date, eventId?: string | null) => {
      router.replace(buildCalendarUrl(nextView, nextAnchor, timeZone, eventId));
    },
    [router, timeZone],
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

  const refetchEvents = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

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
    const range = getRangeForView(view, anchorDate, timeZone);
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
  }, [anchorDate, layers, reloadToken, timeZone, view]);

  const handleLayersChange = useCallback((nextLayers: CalendarLayers) => {
    setLayers(nextLayers);
    writeCalendarLayers(nextLayers);
  }, []);

  const handlePrev = useCallback(() => {
    updateAnchorDate(shiftAnchorDate(view, anchorDate, -1, timeZone));
  }, [anchorDate, timeZone, updateAnchorDate, view]);

  const handleNext = useCallback(() => {
    updateAnchorDate(shiftAnchorDate(view, anchorDate, 1, timeZone));
  }, [anchorDate, timeZone, updateAnchorDate, view]);

  const handleToday = useCallback(() => {
    updateAnchorDate(new Date());
  }, [updateAnchorDate]);

  const openDayView = useCallback(
    (dateKey: string) => {
      const nextDate = parseDateKey(dateKey, timeZone);
      setView("day");
      setAnchorDate(nextDate);
      syncUrl("day", nextDate);
    },
    [syncUrl, timeZone],
  );

  const openCreate = useCallback(() => {
    setCreateOpen(true);
  }, []);

  const openEvent = useCallback((event: CalendarEvent) => {
    setViewEvent(event);
  }, []);

  const closeViewEvent = useCallback(() => {
    setViewEvent(null);
    const eventParam = searchParams.get("event");
    if (!eventParam) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("event");
    router.replace(`/calendar?${params.toString()}`);
  }, [router, searchParams]);

  const deepLinkEventId = searchParams.get("event");

  useEffect(() => {
    if (!deepLinkEventId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      let resolved = events.find((item) => item.id === deepLinkEventId);

      if (!resolved) {
        try {
          const response = await fetch(
            `/api/calendar/events/${encodeURIComponent(deepLinkEventId)}`,
          );
          if (!response.ok) {
            if (!cancelled) {
              setToast({
                text:
                  response.status === 404
                    ? "Событие не найдено"
                    : "Не удалось открыть событие",
                type: "error",
              });
              const params = new URLSearchParams(searchParams.toString());
              params.delete("event");
              router.replace(`/calendar?${params.toString()}`);
            }
            return;
          }
          const data = (await response.json()) as { event: CalendarEvent };
          resolved = data.event;
        } catch {
          if (!cancelled) {
            setToast({ text: "Не удалось открыть событие", type: "error" });
          }
          return;
        }
      }

      if (cancelled || !resolved) {
        return;
      }

      setViewEvent(resolved);

      const eventDateKey = formatDateKey(new Date(resolved.startAt), timeZone);
      const currentDateKey = formatDateKey(anchorDate, timeZone);
      if (eventDateKey !== currentDateKey) {
        const nextAnchor = parseDateKey(eventDateKey, timeZone);
        setAnchorDate(nextAnchor);
        syncUrl(view, nextAnchor, deepLinkEventId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    anchorDate,
    deepLinkEventId,
    events,
    reloadToken,
    router,
    searchParams,
    syncUrl,
    timeZone,
    view,
  ]);

  const handleCreate = useCallback(
    async (values: CalendarFormValues) => {
      const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValuesToCreatePayload(values, timeZone)),
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "Не удалось создать событие"),
        );
      }

      setCreateOpen(false);
      refetchEvents();
      setToast({ text: "Событие создано", type: "success" });
    },
    [refetchEvents, timeZone],
  );

  const handleUpdate = useCallback(
    async (values: CalendarFormValues) => {
      if (!editEvent) {
        return;
      }

      const response = await fetch(`/api/calendar/events/${editEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValuesToUpdatePayload(values, timeZone)),
      });

      if (!response.ok) {
        const message = await readApiError(response, "Не удалось обновить событие");
        if (response.status === 403) {
          throw new Error("Недостаточно прав для редактирования");
        }
        throw new Error(message);
      }

      setEditEvent(null);
      refetchEvents();
      setToast({ text: "Событие обновлено", type: "success" });
    },
    [editEvent, refetchEvents, timeZone],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteEvent) {
      return;
    }

    const response = await fetch(`/api/calendar/events/${deleteEvent.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const message = await readApiError(response, "Не удалось удалить событие");
      setToast({
        text: response.status === 403 ? "Недостаточно прав для удаления" : message,
        type: "error",
      });
      setDeleteEvent(null);
      return;
    }

    setDeleteEvent(null);
    refetchEvents();
    setToast({ text: "Событие удалено", type: "success" });
  }, [deleteEvent, refetchEvents]);

  const showEmptyState =
    view === "day" && events.length === 0 && hasActiveLayer(layers);

  return (
    <div className={styles.wrap}>
      <CalendarToolbar
        label={toolbarLabel}
        timeZoneLabel={timeZoneLabel}
        view={view}
        createDisabled={false}
        onCreate={openCreate}
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
          <CalendarEmptyState createDisabled={false} onCreate={openCreate} />
        ) : view === "day" ? (
          <CalendarDayAgenda events={events} onEventClick={openEvent} />
        ) : view === "month" ? (
          <CalendarMonthGrid
            anchorDate={anchorDate}
            events={events}
            onDayClick={openDayView}
            onEventClick={openEvent}
          />
        ) : view === "week" ? (
          <CalendarWeekGrid
            anchorDate={anchorDate}
            events={events}
            onDayClick={openDayView}
            onEventClick={openEvent}
          />
        ) : (
          <CalendarViewPlaceholder view={view} events={events} />
        )}
      </div>

      {createOpen ? (
        <CalendarDialog title="Новое событие" onClose={() => setCreateOpen(false)}>
          <CalendarEventForm
            mode="create"
            initial={createInitialValues}
            submitLabel="Создать"
            onCancel={() => setCreateOpen(false)}
            onSubmit={handleCreate}
          />
        </CalendarDialog>
      ) : null}

      {viewEvent ? (
        <CalendarEventModal
          event={viewEvent}
          user={user}
          onClose={closeViewEvent}
          onEdit={setEditEvent}
          onDelete={setDeleteEvent}
        />
      ) : null}

      {editEvent ? (
        <CalendarDialog
          title="Редактировать событие"
          onClose={() => setEditEvent(null)}
        >
          <CalendarEventForm
            mode="edit"
            initial={eventToFormValues(editEvent, timeZone)}
            submitLabel="Сохранить"
            scopeLocked
            onCancel={() => setEditEvent(null)}
            onSubmit={handleUpdate}
          />
        </CalendarDialog>
      ) : null}

      {deleteEvent ? (
        <CalendarDialog title="Удалить событие?" onClose={() => setDeleteEvent(null)}>
          <p className={styles.confirmText}>Вы уверены?</p>
          <p className={styles.confirmEvent}>{deleteEvent.title}</p>
          <div className={styles.confirmActions}>
            <Button type="button" variant="secondary" onClick={() => setDeleteEvent(null)}>
              Отмена
            </Button>
            <Button type="button" variant="danger" onClick={() => void confirmDelete()}>
              Удалить
            </Button>
          </div>
        </CalendarDialog>
      ) : null}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function CalendarDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <Card className={styles.modal}>
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        {children}
      </Card>
    </div>
  );
}
