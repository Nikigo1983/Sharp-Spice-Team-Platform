"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  SPIORA_SURVEY_PUBLIC_PATH,
  SPIORA_SURVEY_STAFF_TITLE,
} from "@/lib/spiora-survey/schema";
import styles from "./SpioraSurveyLinkPanel.module.css";

export function SpioraSurveyLinkPanel() {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}${SPIORA_SURVEY_PUBLIC_PATH}`);
  }, []);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <SectionHeader
        title={SPIORA_SURVEY_STAFF_TITLE}
        subtitle="Отправьте клиенту ссылку на исследование процессов."
      />

      <Card className={styles.card}>
        <p className={styles.label}>Публичная ссылка для клиента</p>
        <div className={styles.row}>
          <code className={styles.url}>{url || "…"}</code>
          <Button type="button" onClick={() => void copyLink()}>
            {copied ? "Скопировано" : "Копировать ссылку"}
          </Button>
        </div>
        <p className={styles.hint}>
          Клиент заполняет анкету без входа в платформу.
        </p>
      </Card>
    </div>
  );
}
