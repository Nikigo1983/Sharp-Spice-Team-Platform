"use client";

import { PERIOD_PRESETS, type PeriodPreset } from "@/lib/analytics/period";
import styles from "./PeriodFilter.module.css";

type PeriodFilterProps = {
  preset: PeriodPreset;
  customFrom: string;
  customTo: string;
  onPresetChange: (preset: PeriodPreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  periodLabel: string;
};

export function PeriodFilter({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
  periodLabel,
}: PeriodFilterProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.presets}>
        {PERIOD_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              preset === item.id ? styles.presetActive : styles.preset
            }
            onClick={() => onPresetChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className={styles.customRow}>
          <label className={styles.dateField}>
            <span>С</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
            />
          </label>
          <label className={styles.dateField}>
            <span>По</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
            />
          </label>
        </div>
      ) : null}
      <p className={styles.periodLabel}>
        <i className="fa-solid fa-calendar-days" aria-hidden />
        Период: <strong>{periodLabel}</strong>
      </p>
    </div>
  );
}
