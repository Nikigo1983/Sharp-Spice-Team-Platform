import {
  CHECKUP_SECTIONS,
  type CheckupResource,
} from "@/lib/checkups/resources";
import { SectionHeader } from "@/components/ui/SectionHeader";
import styles from "./CheckupsView.module.css";

function ResourceCard({ resource }: { resource: CheckupResource }) {
  return (
    <li className={styles.gridItem}>
      <article
        className={[
          styles.resourceCard,
          styles[`resourceCard_${resource.type}`],
        ].join(" ")}
      >
        <div className={styles.cardGlow} aria-hidden />
        <div className={styles.cardHeader}>
          <span
            className={[styles.iconWrap, styles[`icon_${resource.type}`]].join(
              " ",
            )}
            aria-hidden
          >
            <i className={resource.icon} />
          </span>
          <div className={styles.badges}>
            <span className={styles.badgeLocation}>{resource.location}</span>
            <span
              className={[
                styles.badgeAudience,
                styles[`badge_${resource.type}`],
              ].join(" ")}
            >
              {resource.audience}
            </span>
          </div>
        </div>

        <h3 className={styles.cardTitle}>{resource.title}</h3>
        <p className={styles.cardDesc}>{resource.description}</p>

        <div className={styles.actions}>
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              styles.openBtn,
              styles[`openBtn_${resource.type}`],
            ].join(" ")}
            title={resource.url}
          >
            {resource.actionLabel}
            <i
              className="fa-solid fa-arrow-up-right-from-square"
              aria-hidden
            />
          </a>
        </div>
      </article>
    </li>
  );
}

export function CheckupsView() {
  return (
    <div className={styles.page}>
      <SectionHeader
        title="Чекапы в Ереване"
        subtitle="Сайт с информацией о чекапах, документы команды и приложение «Формула Здоровья»"
      />

      {CHECKUP_SECTIONS.map((section) => (
        <section
          key={section.id}
          className={styles.section}
          aria-labelledby={`checkups-section-${section.id}`}
        >
          <div className={styles.sectionHead}>
            <h2
              id={`checkups-section-${section.id}`}
              className={styles.sectionTitle}
            >
              {section.title}
            </h2>
            {section.subtitle ? (
              <p className={styles.sectionSubtitle}>{section.subtitle}</p>
            ) : null}
          </div>
          <ul className={styles.grid}>
            {section.items.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
