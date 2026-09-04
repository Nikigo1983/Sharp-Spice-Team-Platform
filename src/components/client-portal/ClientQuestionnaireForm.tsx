"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  FileAnswer,
  QuestionnaireRecord,
  QuestionnaireSchema,
  QuestionDefinition,
  SectionDefinition,
} from "@/lib/client-portal/questionnaire-types";
import {
  containsCyrillic,
  isFileAnswer,
  isQuestionVisible,
  pickLabel,
} from "@/lib/client-portal/questionnaire-types";
import {
  calculateProgress,
  validateRequiredAnswers,
} from "@/lib/client-portal/questionnaire-progress";
import styles from "./ClientQuestionnaire.module.css";

type LoadPayload = {
  schema: QuestionnaireSchema;
  questionnaire: QuestionnaireRecord;
  progress: number;
};

function scriptError(question: QuestionDefinition, value: unknown): string | null {
  if (question.script !== "latin") return null;
  if (!containsCyrillic(value)) return null;
  return "Пожалуйста, заполните латиницей";
}

function LabelWithLink({ question }: { question: QuestionDefinition }) {
  const text = pickLabel(question.label);
  if (!question.linkHref || !question.linkLabel) {
    return <>{text}{question.required ? " *" : ""}</>;
  }
  const linkText = pickLabel(question.linkLabel);
  const idx = text.indexOf(linkText);
  if (idx < 0) {
    return (
      <>
        {text}{" "}
        <Link href={question.linkHref} className={styles.inlineLink}>
          {linkText}
        </Link>
        {question.required ? " *" : ""}
      </>
    );
  }
  return (
    <>
      {text.slice(0, idx)}
      <Link href={question.linkHref} className={styles.inlineLink}>
        {linkText}
      </Link>
      {text.slice(idx + linkText.length)}
      {question.required ? " *" : ""}
    </>
  );
}

function YesNoButtons({
  value,
  disabled,
  onChange,
}: {
  value: unknown;
  disabled: boolean;
  onChange: (next: "yes" | "no") => void;
}) {
  return (
    <div className={styles.yesNo}>
      <button
        type="button"
        className={value === "yes" ? styles.yesNoActive : styles.yesNoBtn}
        disabled={disabled}
        onClick={() => onChange("yes")}
      >
        Да
      </button>
      <button
        type="button"
        className={value === "no" ? styles.yesNoActive : styles.yesNoBtn}
        disabled={disabled}
        onClick={() => onChange("no")}
      >
        Нет
      </button>
    </div>
  );
}

function FileField({
  question,
  value,
  disabled,
  prepareUpload,
  onUploaded,
  onRemoved,
}: {
  question: QuestionDefinition;
  value: unknown;
  disabled: boolean;
  prepareUpload: () => Promise<{
    ok: boolean;
    answers: Record<string, unknown>;
  }>;
  onUploaded: (
    file: FileAnswer,
    questionnaire: QuestionnaireRecord,
    progress?: number,
  ) => void;
  onRemoved: (questionnaire: QuestionnaireRecord, progress?: number) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = isFileAnswer(value) ? value : null;
  const maxMb = question.maxSizeMb ?? 10;
  const accept = question.accept ?? ".pdf";

  async function onPick(fileList: FileList | null) {
    const picked = fileList?.[0];
    if (!picked || disabled) return;
    setUploading(true);
    setError(null);
    try {
      const prep = await prepareUpload();
      if (!prep.ok) {
        setError("Сначала сохраните анкету и попробуйте снова");
        return;
      }
      const body = new FormData();
      body.set("questionId", question.id);
      body.set("file", picked);
      body.set("answers", JSON.stringify(prep.answers));
      const res = await fetch("/api/client/questionnaire/attachments", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as {
        attachment?: FileAnswer;
        questionnaire?: QuestionnaireRecord;
        progress?: number;
        error?: string;
      };
      if (!res.ok || !data.attachment || !data.questionnaire) {
        setError(
          data.error === "FILE_TOO_LARGE"
            ? `Файл больше ${maxMb} МБ`
            : data.error === "UNSUPPORTED_FILE_TYPE"
              ? "Недопустимый формат файла"
              : data.error === "REVISION_CONFLICT"
                ? "Анкета изменилась. Обновите страницу."
                : "Не удалось загрузить файл",
        );
        return;
      }
      onUploaded(data.attachment, data.questionnaire, data.progress);
    } finally {
      setUploading(false);
    }
  }

  async function onRemove() {
    if (!file || disabled) return;
    setUploading(true);
    setError(null);
    try {
      const prep = await prepareUpload();
      if (!prep.ok) {
        setError("Сначала сохраните анкету и попробуйте снова");
        return;
      }
      const res = await fetch(
        `/api/client/questionnaire/attachments?id=${encodeURIComponent(file.id)}&questionId=${encodeURIComponent(question.id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as {
        questionnaire?: QuestionnaireRecord;
        progress?: number;
        error?: string;
      };
      if (!res.ok || !data.questionnaire) {
        setError("Не удалось удалить файл");
        return;
      }
      onRemoved(data.questionnaire, data.progress);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.fileBox}>
      {file ? (
        <div className={styles.fileReady}>
          <a
            href={`/api/client/questionnaire/attachments/${encodeURIComponent(file.id)}`}
            className={styles.inlineLink}
          >
            {file.fileName}
          </a>
          {!disabled ? (
            <button
              type="button"
              className={styles.secondary}
              disabled={uploading}
              onClick={() => void onRemove()}
            >
              Удалить
            </button>
          ) : null}
        </div>
      ) : (
        <label className={styles.fileDrop}>
          <input
            type="file"
            accept={accept}
            disabled={disabled || uploading}
            onChange={(event) => {
              void onPick(event.target.files);
              event.target.value = "";
            }}
          />
          <span>{uploading ? "Загрузка…" : "Выбрать файл"}</span>
          <span className={styles.fileHint}>
            Допустимые форматы: {accept.replace(/application\/pdf/gi, ".pdf").replace(/image\//gi, ".")}
          </span>
          <span className={styles.fileHint}>Максимальный размер: {maxMb} МБ</span>
        </label>
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
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
  const recordRef = useRef<QuestionnaireRecord | null>(null);

  const setRecordSync = useCallback((next: QuestionnaireRecord) => {
    recordRef.current = next;
    setRecord(next);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/client/questionnaire", { cache: "no-store" });
    if (!res.ok) {
      setError("Не удалось загрузить анкету.");
      return;
    }
    const data = (await res.json()) as LoadPayload;
    setSchema(data.schema);
    setRecordSync(data.questionnaire);
    setProgress(data.progress);
  }, [setRecordSync]);

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

  const visibleQuestions = useMemo(() => {
    if (!section || !record) return [];
    return [...section.questions]
      .sort((a, b) => a.order - b.order)
      .filter((question) => isQuestionVisible(question, record.answers));
  }, [section, record]);

  async function saveDraft(
    nextAnswers?: Record<string, unknown>,
    options?: { silent?: boolean },
  ) {
    const current = recordRef.current;
    if (!current || current.status === "submitted") return false;
    setSaving(true);
    if (!options?.silent) {
      setStatus(null);
      setError(null);
    }
    try {
      const res = await fetch("/api/client/questionnaire", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: current.id,
          expectedRevision: current.revision,
          answers: nextAnswers ?? current.answers,
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
      setRecordSync(data.questionnaire);
      setProgress(data.progress ?? 0);
      if (!options?.silent) setStatus("Сохранено");
      return true;
    } finally {
      setSaving(false);
    }
  }

  function updateAnswer(questionId: string, value: unknown) {
    const current = recordRef.current;
    if (!current || readOnly) return;
    const answers = { ...current.answers, [questionId]: value };
    const next = { ...current, answers };
    setRecordSync(next);
    setProgress(calculateProgress(answers));
  }

  async function onSubmit() {
    const current = recordRef.current;
    if (!current || current.status === "submitted") return;
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const missing = validateRequiredAnswers(current.answers, "ru");
      if (missing.length > 0) {
        setError(
          `Заполните обязательные поля: ${missing.join(", ")}. Проверьте все вкладки — ответы могли не сохраниться.`,
        );
        return;
      }
      const res = await fetch("/api/client/questionnaire/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: current.id,
          expectedRevision: current.revision,
          answers: current.answers,
        }),
      });
      const data = (await res.json()) as {
        questionnaire?: QuestionnaireRecord;
        progress?: number;
        error?: string;
        fields?: string[];
      };
      if (!res.ok) {
        if (data.error === "MISSING_REQUIRED" && data.fields?.length) {
          setError(
            `Заполните обязательные поля: ${data.fields.join(", ")}. Проверьте все вкладки.`,
          );
        } else if (data.error === "REVISION_CONFLICT") {
          setError("Анкета изменилась. Обновите страницу.");
        } else {
          setError("Не удалось отправить анкету.");
        }
        return;
      }
      if (data.questionnaire) {
        setRecordSync(data.questionnaire);
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
          {visibleQuestions.map((question) => {
            const fieldClass =
              question.layout === "half" ? styles.fieldHalf : styles.field;

            if (question.type === "information") {
              return (
                <div key={question.id} className={styles.field}>
                  <p className={styles.info}>{pickLabel(question.label)}</p>
                </div>
              );
            }

            if (question.type === "boolean") {
              return (
                <div key={question.id} className={styles.field}>
                  <p className={styles.label}>
                    <LabelWithLink question={question} />
                  </p>
                  <div className={styles.yesNo}>
                    <button
                      type="button"
                      className={
                        record.answers[question.id] === true
                          ? styles.yesNoActive
                          : styles.yesNoBtn
                      }
                      disabled={readOnly}
                      onClick={() => updateAnswer(question.id, true)}
                    >
                      Да
                    </button>
                  </div>
                </div>
              );
            }

            if (question.type === "yes_no") {
              return (
                <div key={question.id} className={styles.field}>
                  <label className={styles.label}>
                    {pickLabel(question.label)}
                    {question.required ? " *" : ""}
                  </label>
                  <YesNoButtons
                    value={record.answers[question.id]}
                    disabled={readOnly}
                    onChange={(next) => updateAnswer(question.id, next)}
                  />
                </div>
              );
            }

            if (question.type === "file") {
              return (
                <div key={question.id} className={styles.field}>
                  <label className={styles.label}>
                    {pickLabel(question.label)}
                    {question.required ? " *" : ""}
                  </label>
                  <FileField
                    question={question}
                    value={record.answers[question.id]}
                    disabled={readOnly}
                    prepareUpload={async () => {
                      const answers = recordRef.current?.answers ?? {};
                      const ok = await saveDraft(answers, { silent: true });
                      return {
                        ok,
                        answers: recordRef.current?.answers ?? answers,
                      };
                    }}
                    onUploaded={(_file, questionnaire, nextProgress) => {
                      setRecordSync(questionnaire);
                      if (typeof nextProgress === "number") {
                        setProgress(nextProgress);
                      }
                      setStatus("Файл загружен");
                    }}
                    onRemoved={(questionnaire, nextProgress) => {
                      setRecordSync(questionnaire);
                      if (typeof nextProgress === "number") {
                        setProgress(nextProgress);
                      }
                      setStatus("Файл удалён");
                    }}
                  />
                </div>
              );
            }

            const placeholder = question.placeholder
              ? pickLabel(question.placeholder)
              : undefined;

            if (question.type === "select") {
              return (
                <div key={question.id} className={fieldClass}>
                  <label className={styles.label}>
                    {pickLabel(question.label)}
                    {question.required ? " *" : ""}
                  </label>
                  <select
                    className={styles.input}
                    value={String(record.answers[question.id] ?? "")}
                    disabled={readOnly || question.readOnly}
                    onChange={(event) =>
                      updateAnswer(question.id, event.target.value)
                    }
                  >
                    <option value="">Выберите…</option>
                    {(question.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {pickLabel(option.label)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            if (question.type === "textarea") {
              const value = record.answers[question.id];
              const latinHint = scriptError(question, value);
              return (
                <div key={question.id} className={fieldClass}>
                  <label className={styles.label}>
                    {pickLabel(question.label)}
                    {question.required ? " *" : ""}
                  </label>
                  <textarea
                    className={
                      latinHint
                        ? `${styles.textarea} ${styles.inputInvalid}`
                        : styles.textarea
                    }
                    rows={4}
                    name={question.id}
                    autoComplete="off"
                    placeholder={placeholder}
                    value={String(value ?? "")}
                    disabled={readOnly || question.readOnly}
                    onChange={(event) =>
                      updateAnswer(question.id, event.target.value)
                    }
                    aria-invalid={Boolean(latinHint)}
                  />
                  {latinHint ? (
                    <p className={styles.fieldHint} role="alert">
                      {latinHint}
                    </p>
                  ) : null}
                </div>
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

            const value = record.answers[question.id];
            const latinHint = scriptError(question, value);

            return (
              <div key={question.id} className={fieldClass}>
                <label className={styles.label}>
                  {pickLabel(question.label)}
                  {question.required ? " *" : ""}
                </label>
                <input
                  className={
                    latinHint
                      ? `${styles.input} ${styles.inputInvalid}`
                      : styles.input
                  }
                  type={inputType}
                  name={question.id}
                  autoComplete={
                    question.type === "email"
                      ? "email"
                      : question.type === "phone"
                        ? "tel"
                        : "off"
                  }
                  placeholder={placeholder}
                  value={String(value ?? "")}
                  disabled={readOnly || question.readOnly}
                  onChange={(event) =>
                    updateAnswer(question.id, event.target.value)
                  }
                  aria-invalid={Boolean(latinHint)}
                />
                {latinHint ? (
                  <p className={styles.fieldHint} role="alert">
                    {latinHint}
                  </p>
                ) : null}
              </div>
            );
          })}
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
