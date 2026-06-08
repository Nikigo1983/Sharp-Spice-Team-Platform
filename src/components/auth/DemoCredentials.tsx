import styles from "./DemoCredentials.module.css";

const DEMO_ACCOUNTS = [
  {
    role: "Owner",
    email: "veronika@sharpandspice.com",
    password: "veronika-dev",
  },
  {
    role: "Менеджер 1",
    email: "manager1@sharpandspice.com",
    password: "manager1-dev",
  },
  {
    role: "Менеджер 2",
    email: "manager2@sharpandspice.com",
    password: "manager2-dev",
  },
  {
    role: "Менеджер 3",
    email: "manager3@sharpandspice.com",
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
