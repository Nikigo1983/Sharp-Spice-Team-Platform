"use client";

import { useMemo, useState } from "react";
import {
  SPIORA_ONBOARDING_CLIENT_INTRO,
  SPIORA_ONBOARDING_THANKS,
  type OnboardingField,
} from "@/lib/spiora-onboarding/schema";
import {
  groupFieldsBySection,
  validateOnboardingPayload,
} from "@/lib/spiora-onboarding/validation";
import type { OnboardingAnswers } from "@/lib/spiora-onboarding/types";
import { SPIORA_LOGO_PATH, SPIORA_PRODUCT_NAME } from "@/lib/spiora/brand";
import styles from "@/components/spiora-survey/SpioraSurveyPublicForm.module.css";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function BrandHeader() {
  return (
    <header className={styles.brand}>
      <div className={styles.logoChip}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={SPIORA_LOGO_PATH}
          alt={SPIORA_PRODUCT_NAME}
          className={styles.logo}
          width={360}
          height={120}
        />
      </div>
    </header>
  );
}

export function SpioraOnboardingPublicForm() {
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const sections = useMemo(() => groupFieldsBySection(), []);

  function setField(id: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setError(null);
  }

  function toggleMulti(field: OnboardingField, optionId: string) {
    const current = asStringArray(answers[field.id]);
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    setField(field.id, next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateOnboardingPayload(answers);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/spiora-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Не удалось отправить анкету.");
        return;
      }
      setDone(true);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderField(field: OnboardingField) {
    const options = (field.options ?? []).concat(
      field.allowOther ? [{ id: "other", label: "Другое" }] : [],
    );

    return (
      <section key={field.id} className={styles.fieldset}>
        <h3 className={styles.questionTitle}>
          <span className={styles.questionText}>{field.label}</span>
        </h3>
        {field.hint ? <p className={styles.hint}>{field.hint}</p> : null}

        {field.type === "text" || field.type === "date" ? (
          <input
            className={styles.input}
            type={field.type === "date" ? "date" : "text"}
            value={String(answers[field.id] ?? "")}
            onChange={(e) => setField(field.id, e.target.value)}
            placeholder={field.placeholder}
          />
        ) : null}

        {field.type === "textarea" ? (
          <textarea
            className={styles.textarea}
            rows={4}
            value={String(answers[field.id] ?? "")}
            onChange={(e) => setField(field.id, e.target.value)}
            placeholder={field.placeholder}
          />
        ) : null}

        {field.type === "single"
          ? options.map((opt) => (
              <label key={opt.id} className={styles.optionRow}>
                <input
                  type="radio"
                  name={field.id}
                  checked={answers[field.id] === opt.id}
                  onChange={() => setField(field.id, opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            ))
          : null}

        {field.type === "yes_no" ? (
          <>
            <label className={styles.optionRow}>
              <input
                type="radio"
                name={field.id}
                checked={answers[field.id] === "yes"}
                onChange={() => setField(field.id, "yes")}
              />
              <span>Да</span>
            </label>
            <label className={styles.optionRow}>
              <input
                type="radio"
                name={field.id}
                checked={answers[field.id] === "no"}
                onChange={() => setField(field.id, "no")}
              />
              <span>Нет</span>
            </label>
          </>
        ) : null}

        {field.type === "multi"
          ? options.map((opt) => (
              <label key={opt.id} className={styles.optionRow}>
                <input
                  type="checkbox"
                  checked={asStringArray(answers[field.id]).includes(opt.id)}
                  onChange={() => toggleMulti(field, opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            ))
          : null}

        {field.allowOther &&
        (answers[field.id] === "other" ||
          asStringArray(answers[field.id]).includes("other")) ? (
          <input
            className={styles.input}
            style={{ marginTop: "0.65rem" }}
            value={String(answers[`${field.id}_other`] ?? "")}
            onChange={(e) => setField(`${field.id}_other`, e.target.value)}
            placeholder="Уточните «Другое»"
          />
        ) : null}
      </section>
    );
  }

  if (done) {
    return (
      <div className={styles.shell}>
        <BrandHeader />
        <div className={styles.thanksCard}>
          <p className={styles.eyebrow}>SPIORA</p>
          <h1 className={styles.thanksTitle}>Готово</h1>
          <p className={styles.thanksText}>{SPIORA_ONBOARDING_THANKS}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <BrandHeader />

      <div className={styles.intro}>
        <p className={styles.introGreeting}>
          {SPIORA_ONBOARDING_CLIENT_INTRO.greeting}
        </p>
        <p className={styles.introLead}>{SPIORA_ONBOARDING_CLIENT_INTRO.lead}</p>
        <p className={styles.introBody}>{SPIORA_ONBOARDING_CLIENT_INTRO.body}</p>
        <p className={styles.introDuration}>
          {SPIORA_ONBOARDING_CLIENT_INTRO.duration}
        </p>
      </div>

      <form className={styles.form} onSubmit={onSubmit}>
        {sections.map((group) => (
          <div key={group.section} className={styles.sectionBlock}>
            <h2 className={styles.section}>{group.section}</h2>
            {group.fields.map((field) => renderField(field))}
          </div>
        ))}

        {error ? <p className={styles.error}>{error}</p> : null}

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? "Отправка…" : "Отправить анкету"}
        </button>
      </form>
    </div>
  );
}
