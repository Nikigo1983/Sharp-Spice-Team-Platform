"use client";

import { useState } from "react";
import { KnowledgeBaseDriveView } from "./KnowledgeBaseDriveView";
import { PlatformKnowledgeBaseView } from "./PlatformKnowledgeBaseView";
import styles from "./KnowledgeBaseView.module.css";

type Tab = "company" | "clients" | "drive";

export function KnowledgeBaseView() {
  const [tab, setTab] = useState<Tab>("company");

  return (
    <div className={styles.shell}>
      <div className={styles.tabs} role="tablist" aria-label="Разделы Knowledge Base">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "company"}
          className={tab === "company" ? styles.tabActive : styles.tab}
          onClick={() => setTab("company")}
        >
          База знаний для компании
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "clients"}
          className={tab === "clients" ? styles.tabActive : styles.tab}
          onClick={() => setTab("clients")}
        >
          База знаний для клиентов
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "drive"}
          className={tab === "drive" ? styles.tabActive : styles.tab}
          onClick={() => setTab("drive")}
        >
          Google Drive
        </button>
      </div>
      {tab === "company" ? (
        <PlatformKnowledgeBaseView library="company_knowledge" />
      ) : tab === "clients" ? (
        <PlatformKnowledgeBaseView library="client_knowledge" />
      ) : (
        <KnowledgeBaseDriveView />
      )}
    </div>
  );
}
