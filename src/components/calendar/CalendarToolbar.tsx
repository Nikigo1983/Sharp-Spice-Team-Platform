import styles from "./CalendarToolbar.module.css";

export type CalendarToolbarProps = {
  label: string;
  view: "day" | "week" | "month";
  createDisabled?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: "day" | "week" | "month") => void;
  onCreate?: () => void;
};

export function CalendarToolbar({
  label,
  view,
  createDisabled = true,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onCreate,
}: CalendarToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.navGroup}>
        <button type="button" className={styles.navButton} onClick={onPrev} aria-label="Назад">
          ◀
        </button>
        <h2 className={styles.periodLabel}>{label}</h2>
        <button type="button" className={styles.navButton} onClick={onNext} aria-label="Вперёд">
          ▶
        </button>
        <button type="button" className={styles.todayButton} onClick={onToday}>
          Сегодня
        </button>
      </div>

      <div className={styles.actions}>
        <div className={styles.viewSwitch} role="tablist" aria-label="Режим просмотра">
          {(["day", "week", "month"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={view === mode}
              className={[styles.viewButton, view === mode ? styles.viewButtonActive : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onViewChange(mode)}
            >
              {mode === "day" ? "День" : mode === "week" ? "Неделя" : "Месяц"}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={styles.createButton}
          disabled={createDisabled}
          title={createDisabled ? "Создание событий будет доступно в следующем релизе" : undefined}
          onClick={onCreate}
        >
          + Создать событие
        </button>
      </div>
    </div>
  );
}
