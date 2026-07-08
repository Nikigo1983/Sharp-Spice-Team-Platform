"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { CalendarFormValues } from "@/lib/calendar/form";
import { validateFormValues } from "@/lib/calendar/form";
import { CALENDAR_EVENT_TYPE_LABELS } from "@/lib/calendar/constants";
import type { CalendarEventType, CalendarScope, VideoInviteMode } from "@/lib/calendar/types";
import { CalendarDateSelect } from "./CalendarDateSelect";
import { CalendarTimeSelect } from "./CalendarTimeSelect";
import { useCalendarTimeZone } from "./CalendarTimeZoneContext";
import styles from "./CalendarEventForm.module.css";

export type { CalendarFormValues };

type TeamMemberOption = { id: string; name: string };

type CalendarEventFormProps = {
  initial: CalendarFormValues;
  mode: "create" | "edit";
  submitLabel: string;
  scopeLocked?: boolean;
  currentUserId: string;
  teamMembers: TeamMemberOption[];
  onSubmit: (values: CalendarFormValues) => Promise<void>;
  onCancel: () => void;
};

export function CalendarEventForm({
  initial,
  mode,
  submitLabel,
  scopeLocked = false,
  currentUserId,
  teamMembers,
  onSubmit,
  onCancel,
}: CalendarEventFormProps) {
  const { timeZone } = useCalendarTimeZone();
  const [values, setValues] = useState<CalendarFormValues>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateFormValues(values, timeZone);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");
    try {
      await onSubmit(values);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Не удалось сохранить событие";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function setScope(scope: CalendarScope) {
    if (scopeLocked) {
      return;
    }
    setValues((current) => ({
      ...current,
      scope,
      videoInviteMode: scope === "personal" ? "selected" : current.videoInviteMode,
    }));
  }

  function setEventType(eventType: CalendarEventType) {
    if (mode !== "create") {
      return;
    }
    setValues((current) => ({
      ...current,
      eventType,
      allDay: eventType === "video_meeting" ? false : current.allDay,
      videoInviteMode:
        eventType === "video_meeting"
          ? current.scope === "personal"
            ? "selected"
            : current.videoInviteMode
          : "all_team",
      participantUserIds:
        eventType === "video_meeting" ? current.participantUserIds : [],
    }));
  }

  function setVideoInviteMode(videoInviteMode: VideoInviteMode) {
    setValues((current) => ({
      ...current,
      videoInviteMode,
      participantUserIds:
        videoInviteMode === "all_team" ? [] : current.participantUserIds,
    }));
  }

  const inviteCandidates = teamMembers.filter(
    (member) => member.id !== currentUserId,
  );
  const showInviteModeSwitch =
    values.eventType === "video_meeting" && values.scope === "company";
  const showParticipantPicker =
    values.eventType === "video_meeting" &&
    (values.scope === "personal" || values.videoInviteMode === "selected");

  return (
    <form className={styles.form} onSubmit={(submitEvent) => void handleSubmit(submitEvent)}>
      {mode === "create" ? (
        <fieldset className={styles.scopeFieldset}>
          <legend className={styles.label}>Тип события</legend>
          <div className={styles.scopeSwitch}>
            <button
              type="button"
              className={[
                styles.scopeButton,
                values.scope === "personal" ? styles.scopePersonal : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={values.scope === "personal"}
              onClick={() => setScope("personal")}
            >
              Личное
            </button>
            <button
              type="button"
              className={[
                styles.scopeButton,
                values.scope === "company" ? styles.scopeCompany : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={values.scope === "company"}
              onClick={() => setScope("company")}
            >
              Компания
            </button>
          </div>
        </fieldset>
      ) : (
        <div className={styles.readonlyScope}>
          <span className={styles.label}>Тип</span>
          <span
            className={[
              styles.scopeBadge,
              values.scope === "personal" ? styles.scopePersonal : styles.scopeCompany,
            ].join(" ")}
          >
            {values.scope === "personal" ? "Личное" : "Компания"}
          </span>
        </div>
      )}

      {mode === "create" ? (
        <fieldset className={styles.formatFieldset}>
          <legend className={styles.label}>Формат встречи</legend>
          <div className={styles.formatSwitch}>
            <button
              type="button"
              className={[
                styles.formatButton,
                values.eventType === "general" ? styles.formatGeneral : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={values.eventType === "general"}
              onClick={() => setEventType("general")}
            >
              {CALENDAR_EVENT_TYPE_LABELS.general}
            </button>
            <button
              type="button"
              className={[
                styles.formatButton,
                values.eventType === "video_meeting" ? styles.formatVideo : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={values.eventType === "video_meeting"}
              onClick={() => setEventType("video_meeting")}
            >
              {CALENDAR_EVENT_TYPE_LABELS.video_meeting}
            </button>
          </div>
          {values.eventType === "video_meeting" ? (
            <p className={styles.fieldHint}>
              Комната создаётся на платформе. После сохранения в карточке встречи
              появится ссылка для клиентов без аккаунта.
            </p>
          ) : null}
        </fieldset>
      ) : values.eventType === "video_meeting" ? (
        <div className={styles.readonlyScope}>
          <span className={styles.label}>Формат</span>
          <span className={[styles.formatBadge, styles.formatVideo].join(" ")}>
            {CALENDAR_EVENT_TYPE_LABELS.video_meeting}
          </span>
        </div>
      ) : null}

      {showInviteModeSwitch ? (
        <fieldset className={styles.inviteFieldset}>
          <legend className={styles.label}>Кого пригласить</legend>
          <div className={styles.inviteSwitch}>
            <button
              type="button"
              className={[
                styles.inviteButton,
                values.videoInviteMode === "all_team" ? styles.inviteAllTeam : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={values.videoInviteMode === "all_team"}
              onClick={() => setVideoInviteMode("all_team")}
            >
              Вся команда
            </button>
            <button
              type="button"
              className={[
                styles.inviteButton,
                values.videoInviteMode === "selected" ? styles.inviteSelected : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={values.videoInviteMode === "selected"}
              onClick={() => setVideoInviteMode("selected")}
            >
              Выбранные
            </button>
          </div>
        </fieldset>
      ) : null}

      {showParticipantPicker ? (
        <fieldset className={styles.inviteFieldset}>
          <legend className={styles.label}>Участники</legend>
          <p className={styles.fieldHintInline}>
            Вы участвуете автоматически. Отметьте коллег, которым будет доступна
            встреча и напоминание.
          </p>
          <div className={styles.participantList}>
            {inviteCandidates.map((member) => {
              const checked = values.participantUserIds.includes(member.id);
              return (
                <label key={member.id} className={styles.participantItem}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(changeEvent) => {
                      setValues((current) => ({
                        ...current,
                        participantUserIds: changeEvent.target.checked
                          ? [...current.participantUserIds, member.id]
                          : current.participantUserIds.filter(
                              (id) => id !== member.id,
                            ),
                      }));
                    }}
                  />
                  <span>{member.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {values.eventType === "video_meeting" ? (
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={values.guestWaitingRoom}
            onChange={(changeEvent) =>
              setValues({
                ...values,
                guestWaitingRoom: changeEvent.target.checked,
              })
            }
          />
          <span>Зал ожидания для гостей по ссылке</span>
        </label>
      ) : null}

      {values.eventType === "video_meeting" ? (
        <label className={styles.field}>
          <span className={styles.label}>Максимум гостей по ссылке</span>
          <input
            className={styles.input}
            type="number"
            min={1}
            max={50}
            value={values.guestMaxCount ?? 10}
            onChange={(changeEvent) =>
              setValues({
                ...values,
                guestMaxCount: Number(changeEvent.target.value) || 10,
              })
            }
          />
        </label>
      ) : null}

      {values.eventType === "video_meeting" ? (
        <label className={styles.field}>
          <span className={styles.label}>Пароль для гостей (необязательно)</span>
          <input
            className={styles.input}
            type="password"
            value={values.guestAccessPassword}
            onChange={(changeEvent) =>
              setValues({
                ...values,
                guestAccessPassword: changeEvent.target.value,
              })
            }
            placeholder={
              mode === "edit"
                ? "Оставьте пустым, чтобы не менять"
                : "Без пароля — вход только по ссылке"
            }
            autoComplete="new-password"
          />
        </label>
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>Название *</span>
        <input
          className={styles.input}
          value={values.title}
          onChange={(changeEvent) =>
            setValues({ ...values, title: changeEvent.target.value })
          }
          placeholder="Например: Консультация с клиентом"
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Описание</span>
        <textarea
          className={styles.textarea}
          value={values.description}
          onChange={(changeEvent) =>
            setValues({ ...values, description: changeEvent.target.value })
          }
          rows={3}
          placeholder="Дополнительные детали…"
        />
      </label>

      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={values.allDay}
          disabled={values.eventType === "video_meeting"}
          onChange={(changeEvent) =>
            setValues({ ...values, allDay: changeEvent.target.checked })
          }
        />
        <span>Весь день</span>
      </label>

      <section className={styles.dateTimeSection} aria-labelledby="calendar-datetime-heading">
        <h3 id="calendar-datetime-heading" className={styles.sectionTitle}>
          Когда
        </h3>

        <div className={styles.dateTimeGrid}>
          <div className={styles.field}>
            <span className={styles.label}>Начало *</span>
            <CalendarDateSelect
              value={values.startDate}
              onChange={(startDate) => setValues({ ...values, startDate })}
            />
            {!values.allDay ? (
              <CalendarTimeSelect
                value={values.startTime}
                onChange={(startTime) => setValues({ ...values, startTime })}
              />
            ) : null}
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Окончание *</span>
            <CalendarDateSelect
              value={values.endDate}
              onChange={(endDate) => setValues({ ...values, endDate })}
            />
            {!values.allDay ? (
              <CalendarTimeSelect
                value={values.endTime}
                onChange={(endTime) => setValues({ ...values, endTime })}
              />
            ) : null}
          </div>
        </div>
      </section>

      <label className={styles.field}>
        <span className={styles.label}>Место</span>
        <input
          className={styles.input}
          value={values.location}
          onChange={(changeEvent) =>
            setValues({ ...values, location: changeEvent.target.value })
          }
          placeholder="Офис, онлайн, адрес…"
        />
      </label>

      <div className={styles.remindersField}>
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={values.sendReminders}
            onChange={(changeEvent) =>
              setValues({ ...values, sendReminders: changeEvent.target.checked })
            }
          />
          <span>Напоминания за 24 часа и за 1 час</span>
        </label>
        <p className={styles.fieldHint}>
          Уведомление в колокольчике. Только на платформе.
        </p>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Отмена
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Сохранение…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
