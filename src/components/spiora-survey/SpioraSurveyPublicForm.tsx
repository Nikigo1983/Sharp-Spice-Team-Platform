"use client";

import { useMemo, useState } from "react";
import {
  SPIORA_SURVEY_CLIENT_SUBTITLE,
  SPIORA_SURVEY_CLIENT_TITLE,
  SPIORA_SURVEY_INTRO,
  SPIORA_SURVEY_THANKS,
  type SpioraQuestion,
} from "@/lib/spiora-survey/schema";
import {
  getQ8Options,
  getVisibleQuestions,
  validateSurveyPayload,
} from "@/lib/spiora-survey/validation";
import type { SpioraSurveyAnswers } from "@/lib/spiora-survey/types";
import {
  SPIORA_PRODUCT_NAME,
  SPIORA_SLOGAN,
} from "@/lib/spiora/brand";
import { SpioraWordmark } from "@/components/spiora/SpioraWordmark";
import styles from "./SpioraSurveyPublicForm.module.css";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function BrandHeader() {
  return (
    <header className={styles.brand}>
      <div className={styles.logoChip}>
        <SpioraWordmark className={styles.logo} title={SPIORA_PRODUCT_NAME} />
      </div>
      <p className={styles.brandSlogan}>{SPIORA_SLOGAN}</p>
    </header>
  );
}

export function SpioraSurveyPublicForm() {
  const [anonymous, setAnonymous] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [answers, setAnswers] = useState<SpioraSurveyAnswers>({});
  const [contactName, setContactName] = useState("");
  const [contactChannel, setContactChannel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const visible = useMemo(() => getVisibleQuestions(answers), [answers]);

  const sections = useMemo(() => {
    const groups: { section: string | null; questions: typeof visible }[] = [];
    for (const question of visible) {
      const section = question.section ?? null;
      const last = groups[groups.length - 1];
      if (last && last.section === section) {
        last.questions.push(question);
      } else {
        groups.push({ section, questions: [question] });
      }
    }
    return groups;
  }, [visible]);

  function setAnswer(id: string, value: unknown) {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      if (id === "q7_problems") {
        const allowed = new Set(
          asStringArray(value).filter((x) => x !== "no_major_problems"),
        );
        const top = asStringArray(prev.q8_top_problems).filter((x) =>
          allowed.has(x),
        );
        next.q8_top_problems = top;
      }
      if (id === "q12_tried_crm" && value === "never_tried") {
        delete next.q13_crm_issues;
        delete next.q13_crm_issues_other;
      }
      return next;
    });
    setError(null);
  }

  function toggleMulti(question: SpioraQuestion, optionId: string) {
    const current = asStringArray(answers[question.id]);
    const max = question.maxSelect;
    let next: string[];
    if (current.includes(optionId)) {
      next = current.filter((id) => id !== optionId);
    } else if (max && current.length >= max) {
      next = [...current.slice(1), optionId];
    } else {
      next = [...current, optionId];
    }

    if (question.id === "q7_problems") {
      if (optionId === "no_major_problems" && !current.includes(optionId)) {
        next = ["no_major_problems"];
      } else if (optionId !== "no_major_problems") {
        next = next.filter((id) => id !== "no_major_problems");
      }
    }

    setAnswer(question.id, next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const contact =
      answers.q18_contact_ok === "yes" || answers.q18_contact_ok === "maybe"
        ? { name: contactName.trim(), channel: contactChannel.trim() }
        : null;

    const validation = validateSurveyPayload({
      anonymous,
      companyName,
      answers,
      contact,
    });
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/spiora-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymous,
          companyName: anonymous ? null : companyName.trim(),
          answers,
          contact,
        }),
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

  if (done) {
    return (
      <div className={styles.shell}>
        <BrandHeader />
        <div className={styles.thanksCard}>
          <p className={styles.eyebrow}>SPIORA</p>
          <h1 className={styles.thanksTitle}>Готово</h1>
          <p className={styles.thanksText}>{SPIORA_SURVEY_THANKS}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <BrandHeader />

      <div className={styles.hero}>
        <p className={styles.eyebrow}>Исследование процессов</p>
        <h1 className={styles.title}>{SPIORA_SURVEY_CLIENT_TITLE}</h1>
        <p className={styles.subtitle}>{SPIORA_SURVEY_CLIENT_SUBTITLE}</p>
      </div>

      <div className={styles.intro}>
        <p className={styles.introGreeting}>{SPIORA_SURVEY_INTRO.greeting}</p>
        <p className={styles.introLead}>{SPIORA_SURVEY_INTRO.lead}</p>
        <p className={styles.introBody}>{SPIORA_SURVEY_INTRO.body}</p>
        <p className={styles.introDuration}>{SPIORA_SURVEY_INTRO.duration}</p>
      </div>

      <form className={styles.form} onSubmit={onSubmit}>
        {sections.map((group) => (
          <div key={group.section ?? "default"} className={styles.sectionBlock}>
            {group.section ? (
              <h2 className={styles.section}>{group.section}</h2>
            ) : null}

            {group.section === "О компании" ? (
              <section className={styles.fieldset}>
                <h3 className={styles.questionTitle}>
                  <span className={styles.qNum}>1</span>
                  <span className={styles.questionText}>
                    Наименование компании
                  </span>
                </h3>
                <p className={styles.hint}>
                  Укажите название или пройдите опрос анонимно
                </p>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={anonymous}
                    onChange={(e) => {
                      setAnonymous(e.target.checked);
                      setError(null);
                    }}
                  />
                  <span>Предпочитаю проходить опрос анонимно</span>
                </label>
                {!anonymous ? (
                  <label className={styles.field}>
                    <span className={styles.label}>Наименование компании</span>
                    <input
                      className={styles.input}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Например, Acme Relocate"
                      autoComplete="organization"
                    />
                  </label>
                ) : null}
              </section>
            ) : null}

            {group.questions.map((question) => (
              <section key={question.id} className={styles.fieldset}>
                <h3 className={styles.questionTitle}>
                  {question.number ? (
                    <span className={styles.qNum}>{question.number}</span>
                  ) : null}
                  <span className={styles.questionText}>{question.title}</span>
                </h3>
                {question.hint ? (
                  <p className={styles.hint}>{question.hint}</p>
                ) : null}

                {question.type === "single" && question.options
                  ? question.options
                      .concat(
                        question.allowOther
                          ? [{ id: "other", label: "Другое" }]
                          : [],
                      )
                      .map((opt) => (
                        <label key={opt.id} className={styles.optionRow}>
                          <input
                            type="radio"
                            name={question.id}
                            checked={answers[question.id] === opt.id}
                            onChange={() => setAnswer(question.id, opt.id)}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))
                  : null}

                {question.type === "multi"
                  ? (question.id === "q8_top_problems"
                      ? getQ8Options(answers)
                      : (question.options ?? []).concat(
                          question.allowOther
                            ? [{ id: "other", label: "Другое" }]
                            : [],
                        )
                    ).map((opt) => (
                      <label key={opt.id} className={styles.optionRow}>
                        <input
                          type="checkbox"
                          checked={asStringArray(answers[question.id]).includes(
                            opt.id,
                          )}
                          onChange={() => toggleMulti(question, opt.id)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))
                  : null}

                {question.type === "text" ? (
                  <textarea
                    className={styles.textarea}
                    rows={4}
                    value={String(answers[question.id] ?? "")}
                    onChange={(e) => setAnswer(question.id, e.target.value)}
                    placeholder="Ваш ответ"
                  />
                ) : null}

                {question.type === "scale" ? (
                  <div className={styles.scale}>
                    <div className={styles.scaleLabels}>
                      <span>
                        {question.scaleMin} — {question.scaleMinLabel}
                      </span>
                      <span>
                        {question.scaleMax} — {question.scaleMaxLabel}
                      </span>
                    </div>
                    <div className={styles.scaleRow}>
                      {Array.from(
                        {
                          length:
                            (question.scaleMax ?? 10) -
                            (question.scaleMin ?? 1) +
                            1,
                        },
                        (_, i) => (question.scaleMin ?? 1) + i,
                      ).map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={[
                            styles.scaleBtn,
                            answers[question.id] === n ? styles.scaleActive : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => setAnswer(question.id, n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {question.type === "contact" ? (
                  <div className={styles.contactGrid}>
                    <label className={styles.field}>
                      <span className={styles.label}>Имя</span>
                      <input
                        className={styles.input}
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        autoComplete="name"
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>
                        Email / WhatsApp / Telegram
                      </span>
                      <input
                        className={styles.input}
                        value={contactChannel}
                        onChange={(e) => setContactChannel(e.target.value)}
                        autoComplete="email"
                      />
                    </label>
                  </div>
                ) : null}

                {question.allowOther &&
                (answers[question.id] === "other" ||
                  asStringArray(answers[question.id]).includes("other")) ? (
                  <input
                    className={styles.input}
                    style={{ marginTop: "0.65rem" }}
                    value={String(answers[`${question.id}_other`] ?? "")}
                    onChange={(e) =>
                      setAnswer(`${question.id}_other`, e.target.value)
                    }
                    placeholder="Уточните «Другое»"
                  />
                ) : null}
              </section>
            ))}
          </div>
        ))}

        {error ? <p className={styles.error}>{error}</p> : null}

        <button
          type="submit"
          className={styles.submit}
          disabled={submitting}
        >
          {submitting ? "Отправка…" : "Отправить ответы"}
        </button>
      </form>
    </div>
  );
}
