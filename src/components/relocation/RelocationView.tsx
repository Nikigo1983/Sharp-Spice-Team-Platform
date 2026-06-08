import {
  RELOCATION_SECTIONS,
  type RelocationResource,
} from "@/lib/relocation/forms";
import { SectionHeader } from "@/components/ui/SectionHeader";
import styles from "./RelocationView.module.css";

function ResourceCard({ resource }: { resource: RelocationResource }) {
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
            <span className={styles.badgeCountry}>{resource.country}</span>
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

export function RelocationView() {
  return (
    <div className={styles.page}>
      <SectionHeader
        title="Эмиграция"
        subtitle="Хорватия, Европа: анкеты, данные, сайт Emigrant-SK и Telegram"
      />

      {RELOCATION_SECTIONS.map((section) => (
        <section
          key={section.id}
          className={styles.section}
          aria-labelledby={`section-${section.id}`}
        >
          <div className={styles.sectionHead}>
            <h2 id={`section-${section.id}`} className={styles.sectionTitle}>
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
