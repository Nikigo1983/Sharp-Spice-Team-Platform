"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TaskForm, type TaskFormValues } from "@/components/tasks/TaskForm";
import styles from "./NewTaskPage.module.css";

export function NewTaskPageView() {
  const router = useRouter();

  async function handleCreate(values: TaskFormValues) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        dueDate: values.dueDate || null,
        status: values.status,
      }),
    });
    if (!res.ok) throw new Error("create failed");
    router.push("/tasks?created=1");
  }

  return (
    <div className={styles.wrap}>
      <SectionHeader
        title="Новая задача"
        subtitle="Создайте задачу для всей команды Sharp & Spice"
      />
      <Card className={styles.card}>
        <TaskForm
          submitLabel="Создать задачу"
          onCancel={() => router.push("/tasks")}
          onSubmit={handleCreate}
        />
      </Card>
    </div>
  );
}
