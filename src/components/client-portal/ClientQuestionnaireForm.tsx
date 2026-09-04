"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  QuestionnaireRecord,
  QuestionnaireSchema,
  QuestionDefinition,
  SectionDefinition,
} from "@/lib/client-portal/questionnaire-types";
import { pickLabel } from "@/lib/client-portal/questionnaire-types";
import styles from "./ClientQuestionnaire.module.css";

type LoadPayload = {
  schema: QuestionnaireSchema;
  questionnaire: QuestionnaireRecord;
  progress: number;
};

function renderInput(
  question: QuestionDefinition,
  value: unknown,
  onChange: (next: unknown) => void,
  disabled: boolean,
) {
  if (question.type === "information") {
    return <p className={styles.info}>{pickLabel(question.label)}</p>;
  }

  if (question.type === "boolean") {
    return (
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled || question.readOnly}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{pickLabel(question.label)}</span>
      </label>
    );
  }

  if (question.type === "select") {
    return (
      <select
        className={styles.input}
        value={String(value ?? "")}
        disabled={disabled || question.readOnly}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Выберите…</option>
        {(question.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {pickLabel(option.label)}
          </option>
        ))}
      </select>
    );
  }

  if (question.type === "textarea") {
    return (
      <textarea
        className={styles.textarea}
        rows={4}
        value={String(value ?? "")}
        disabled={disabled || question.readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  const inputType =
    question.type === "email"
      ? "email"
      : question.type === "date"
        ? "date"
        : question.type === "phone"
          ? "tel"
          : "text";

  return (
    <input
      className={styles.input}
      type={inputType}
      value={String(value ?? "")}
      disabled={disabled || question.readOnly}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function ClientQuestionnaireForm({
  mode = "edit",
}: {
  mode?: "edit" | "review";
}) {
  const [schema, setSchema] = useState<QuestionnaireSchema | null>(null);
  const [record, setRecord] = useState<QuestionnaireRecord | null>(null);
  const [progress, setProgress] = useState(0);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/client/questionnaire", { cache: "no-store" });
    if (!res.ok) {
      setError("Не удалось загрузить анкету.");
      return;
    }
    const data = (await res.json()) as LoadPayload;
    setSchema(data.schema);
    setRecord(data.questionnaire);
    setProgress(data.progress);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = useMemo(
    () =>
      [...(schema?.sections ?? [])].sort((a, b) => a.order - b.order) as SectionDefinition[],
    [schema],
  );
  const section = sections[sectionIndex] ?? null;
  const submitted = record?.status === "submitted";
  const readOnly = submitted || mode === "review";

  async function saveDraft(nextAnswers?: Record<string, unknown>) {
    if (!record || submitted) return false;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/client/questionnaire", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: record.id,
          expectedRevision: record.revision,
          answers: nextAnswers ?? record.answers,
        }),
      });
      const data = (await res.json()) as {
        questionnaire?: QuestionnaireRecord;
        progress?: number;
        error?: string;
      };
      if (!res.ok || !data.questionnaire) {
        setError(
          data.error === "REVISION_CONFLICT"
            ? "Анкета изменилась. Обновите страницу."
            : "Не удалось сохранить.",
        );
        return false;
      }
      setRecord(data.questionnaire);
      setProgress(data.progress ?? 0);
      setStatus("Сохранено");
      return true;
    } finally {
      setSaving(false);
    }
  }

  function updateAnswer(questionId: string, value: unknown) {
    if (!record || readOnly) return;
    const answers = { ...record.answers, [questionId]: value };
    setRecord({ ...record, answers });
  }

  async function onSubmit() {
    if (!record || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      const saved = await saveDraft(record.answers);
      if (!saved) return;
      const res = await fetch("/api/client/questionnaire/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id }),
      });
      const data = (await res.json()) as {
        questionnaire?: QuestionnaireRecord;
        progress?: number;
        error?: string;
        fields?: string[];
      };
      if (!res.ok) {
        if (data.error === "MISSING_REQUIRED" && data.fields?.length) {
          setError(`Заполните обязательные поля: ${data.fields.join(", ")}`);
        } else {
          setError("Не удалось отправить анкету.");
        }
        return;
      }
      if (data.questionnaire) {
        setRecord(data.questionnaire);
        setProgress(data.progress ?? 100);
        setStatus("Анкета отправлена");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!schema || !record || !section) {
    return (
      <div className={styles.wrap}>
        <p className={styles.muted}>{error ?? "Загрузка анкеты…"}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{pickLabel(schema.title)}</h1>
          <p className={styles.lead}>
            {schema.description ? pickLabel(schema.description) : null}
          </p>
        </div>
        <div className={styles.progressBox}>
          <span>{progress}%</span>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      <nav className={styles.tabs}>
        {sections.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={index === sectionIndex ? styles.tabActive : styles.tab}
            onClick={() => setSectionIndex(index)}
          >
            {pickLabel(item.title)}
          </button>
        ))}
      </nav>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{pickLabel(section.title)}</h2>
        {section.description ? (
          <p className={styles.muted}>{pickLabel(section.description)}</p>
        ) : null}

        <div className={styles.fields}>
          {[...section.questions]
            .sort((a, b) => a.order - b.order)
            .map((question) => (
              <div key={question.id} className={styles.field}>
                {question.type !== "information" &&
                question.type !== "boolean" ? (
                  <label className={styles.label}>
                    {pickLabel(question.label)}
                    {question.required ? " *" : ""}
                  </label>
                ) : null}
                {renderInput(
                  question,
                  record.answers[question.id],
                  (value) => updateAnswer(question.id, value),
                  readOnly,
                )}
              </div>
            ))}
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {status ? <p className={styles.status}>{status}</p> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={sectionIndex === 0}
            onClick={() => setSectionIndex((value) => Math.max(0, value - 1))}
          >
            Назад
          </button>
          {!readOnly ? (
            <button
              type="button"
              className={styles.secondary}
              disabled={saving}
              onClick={() => void saveDraft()}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          ) : null}
          {sectionIndex < sections.length - 1 ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() =>
                setSectionIndex((value) =>
                  Math.min(sections.length - 1, value + 1),
                )
              }
            >
              Далее
            </button>
          ) : !readOnly ? (
            <button
              type="button"
              className={styles.primary}
              disabled={submitting}
              onClick={() => void onSubmit()}
            >
              {submitting ? "Отправка…" : "Отправить анкету"}
            </button>
          ) : (
            <Link className={styles.primary} href="/client">
              В кабинет
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
