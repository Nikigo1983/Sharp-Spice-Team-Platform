"use client";

import { useState } from "react";
import { KnowledgeBaseDriveView } from "./KnowledgeBaseDriveView";
import { PlatformKnowledgeBaseView } from "./PlatformKnowledgeBaseView";
import styles from "./KnowledgeBaseView.module.css";

type Tab = "platform" | "drive";

export function KnowledgeBaseView() {
  const [tab, setTab] = useState<Tab>("platform");

  return (
    <div className={styles.shell}>
      <div className={styles.tabs} role="tablist" aria-label="Разделы Knowledge Base">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "platform"}
          className={tab === "platform" ? styles.tabActive : styles.tab}
          onClick={() => setTab("platform")}
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
      {tab === "platform" ? (
        <PlatformKnowledgeBaseView />
      ) : (
        <KnowledgeBaseDriveView />
      )}
    </div>
  );
}
