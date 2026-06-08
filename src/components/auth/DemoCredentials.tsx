import styles from "./DemoCredentials.module.css";

const DEMO_ACCOUNTS = [
  {
    role: "Вероника (owner)",
    email: "virineya1983@gmail.com",
    password: "veronika-dev",
  },
  {
    role: "Злата",
    email: "gujenova220371@gmail.com",
    password: "manager1-dev",
  },
  {
    role: "Юля",
    email: "iuliia.zhdanovich@gmail.com",
    password: "manager2-dev",
  },
  {
    role: "Руслан",
    email: "selischev.ruslan@gmail.com",
    password: "manager3-dev",
  },
] as const;

export function DemoCredentials() {
  return (
    <aside className={styles.box} aria-label="Демо-доступ для разработки">
      <p className={styles.title}>Демо-вход (скопируйте точно)</p>
      <ul className={styles.list}>
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.email} className={styles.item}>
            <span className={styles.role}>{account.role}</span>
            <code className={styles.code}>{account.email}</code>
            <code className={styles.code}>{account.password}</code>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>
        Другие email не подойдут — в системе только эти 4 учётки.
      </p>
    </aside>
  );
}
