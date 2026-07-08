"use client";

import { useEffect, useState } from "react";
import type { Client } from "@/lib/google-sheets/types";
import styles from "./CalendarClientPicker.module.css";

type CalendarClientPickerProps = {
  clientId: string | null;
  clientName: string | null;
  onChange: (next: { clientId: string | null; clientName: string | null }) => void;
  disabled?: boolean;
};

export function CalendarClientPicker({
  clientId,
  clientName,
  onChange,
  disabled = false,
}: CalendarClientPickerProps) {
  const [query, setQuery] = useState(clientName ?? "");
  const [results, setResults] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(clientName ?? "");
  }, [clientName, clientId]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      void fetch(
        `/api/clients?search=${encodeURIComponent(query.trim())}&pageSize=8`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          const payload = (await response.json()) as { clients?: Client[] };
          if (response.ok) {
            setResults(payload.clients ?? []);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResults([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, query]);

  function handleSelect(client: Client) {
    onChange({ clientId: client.id, clientName: client.name });
    setQuery(client.name);
    setOpen(false);
    setResults([]);
  }

  function handleClear() {
    onChange({ clientId: null, clientName: null });
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="calendar-client-picker">
        Клиент (опционально)
      </label>
      <div className={styles.inputRow}>
        <input
          id="calendar-client-picker"
          className={styles.input}
          value={query}
          placeholder="Начните вводить имя клиента"
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(changeEvent) => {
            setQuery(changeEvent.target.value);
            setOpen(true);
            if (clientId) {
              onChange({ clientId: null, clientName: null });
            }
          }}
        />
        {clientId ? (
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            disabled={disabled}
          >
            Сбросить
          </button>
        ) : null}
      </div>
      {open && query.trim().length >= 2 ? (
        <div className={styles.dropdown} role="listbox">
          {loading ? (
            <p className={styles.hint}>Поиск…</p>
          ) : results.length > 0 ? (
            results.map((client) => (
              <button
                key={client.id}
                type="button"
                className={styles.option}
                onClick={() => handleSelect(client)}
              >
                <span className={styles.optionName}>{client.name}</span>
                {client.email ? (
                  <span className={styles.optionMeta}>{client.email}</span>
                ) : null}
              </button>
            ))
          ) : (
            <p className={styles.hint}>Клиенты не найдены</p>
          )}
        </div>
      ) : null}
      <p className={styles.help}>
        Привязка помогает быстро отправить ссылку клиенту и видеть контекст встречи в CRM.
      </p>
    </div>
  );
}
