import { CALENDAR_SCOPE_COLORS } from "@/lib/calendar/constants";
import type { CalendarLayers } from "@/lib/calendar/layers";
import styles from "./CalendarLayerFilters.module.css";

export type CalendarLayerFiltersProps = {
  layers: CalendarLayers;
  onChange: (layers: CalendarLayers) => void;
};

export function CalendarLayerFilters({
  layers,
  onChange,
}: CalendarLayerFiltersProps) {
  const bothOff = !layers.personal && !layers.company;

  return (
    <div className={styles.row}>
      <div className={styles.filters}>
        <label className={styles.filterItem}>
          <input
            type="checkbox"
            checked={layers.personal}
            onChange={(event) =>
              onChange({ ...layers, personal: event.target.checked })
            }
          />
          <span>
            <strong>Мои события</strong>
            <small>Личный календарь</small>
          </span>
        </label>

        <label className={styles.filterItem}>
          <input
            type="checkbox"
            checked={layers.company}
            onChange={(event) =>
              onChange({ ...layers, company: event.target.checked })
            }
          />
          <span>
            <strong>События компании</strong>
            <small>Видны всей команде</small>
          </span>
        </label>

        {bothOff ? (
          <p className={styles.warning} role="status">
            Выберите хотя бы один слой: Мои события или События компании
          </p>
        ) : null}
      </div>

      <div className={styles.legend} aria-label="Легенда">
        <span className={styles.legendItem}>
          <span
            className={styles.legendDot}
            style={{ backgroundColor: CALENDAR_SCOPE_COLORS.personal }}
          />
          Личное
        </span>
        <span className={styles.legendItem}>
          <span
            className={styles.legendDot}
            style={{ backgroundColor: CALENDAR_SCOPE_COLORS.company }}
          />
          Компания
        </span>
      </div>
    </div>
  );
}
