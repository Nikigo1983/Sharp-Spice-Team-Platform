"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { CalendarFormValues } from "@/lib/calendar/form";
import { validateFormValues } from "@/lib/calendar/form";
import type { CalendarScope } from "@/lib/calendar/types";
import styles from "./CalendarEventForm.module.css";

export type { CalendarFormValues };

type CalendarEventFormProps = {
  initial: CalendarFormValues;
  mode: "create" | "edit";
  submitLabel: string;
  scopeLocked?: boolean;
  onSubmit: (values: CalendarFormValues) => Promise<void>;
  onCancel: () => void;
};

export function CalendarEventForm({
  initial,
  mode,
  submitLabel,
  scopeLocked = false,
  onSubmit,
  onCancel,
}: CalendarEventFormProps) {
  const [values, setValues] = useState<CalendarFormValues>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateFormValues(values);
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
    setValues((current) => ({ ...current, scope }));
  }

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
          onChange={(changeEvent) =>
            setValues({ ...values, allDay: changeEvent.target.checked })
          }
        />
        <span>Весь день</span>
      </label>

      <div className={styles.dateGrid}>
        <label className={styles.field}>
          <span className={styles.label}>Дата начала *</span>
          <input
            type="date"
            className={styles.input}
            value={values.startDate}
            onChange={(changeEvent) =>
              setValues({ ...values, startDate: changeEvent.target.value })
            }
            required
          />
        </label>

        {!values.allDay ? (
          <label className={styles.field}>
            <span className={styles.label}>Время начала *</span>
            <input
              type="time"
              className={styles.input}
              value={values.startTime}
              onChange={(changeEvent) =>
                setValues({ ...values, startTime: changeEvent.target.value })
              }
              required
            />
          </label>
        ) : null}

        <label className={styles.field}>
          <span className={styles.label}>Дата окончания *</span>
          <input
            type="date"
            className={styles.input}
            value={values.endDate}
            onChange={(changeEvent) =>
              setValues({ ...values, endDate: changeEvent.target.value })
            }
            required
          />
        </label>

        {!values.allDay ? (
          <label className={styles.field}>
            <span className={styles.label}>Время окончания *</span>
            <input
              type="time"
              className={styles.input}
              value={values.endTime}
              onChange={(changeEvent) =>
                setValues({ ...values, endTime: changeEvent.target.value })
              }
              required
            />
          </label>
        ) : null}
      </div>

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
