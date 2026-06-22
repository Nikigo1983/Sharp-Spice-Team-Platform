import { Button } from "@/components/ui/Button";
import styles from "./CalendarEmptyState.module.css";

type CalendarEmptyStateProps = {
  onCreate?: () => void;
  createDisabled?: boolean;
};

export function CalendarEmptyState({
  onCreate,
  createDisabled = true,
}: CalendarEmptyStateProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden>
          📅
        </div>
        <h3 className={styles.title}>Нет событий на этот период</h3>
        <p className={styles.text}>
          Создайте личное или корпоративное событие, чтобы оно появилось в
          календаре.
        </p>
        <Button
          type="button"
          disabled={createDisabled}
          title={
            createDisabled
              ? "Создание событий будет доступно в следующем релизе"
              : undefined
          }
          onClick={onCreate}
        >
          + Создать событие
        </Button>
      </div>
    </div>
  );
}
