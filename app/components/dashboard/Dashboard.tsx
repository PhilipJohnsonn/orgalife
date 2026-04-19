"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { CheckCircle2, Circle, Clock, AlertTriangle } from "lucide-react";

type Task = {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  columnName: string;
};

type Stats = {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
};

const priorityColor: Record<string, string> = {
  high: "text-red-500",
  medium: "text-yellow-500",
  low: "text-blue-500",
};

export function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    todo: 0,
    inProgress: 0,
    done: 0,
    overdue: 0,
  });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );
  const [datesWithTasks, setDatesWithTasks] = useState<Date[]>([]);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/boards");
    const boards = await res.json();

    if (boards.length === 0) return;

    const board = boards[0];
    const allTasks: Task[] = [];
    let todo = 0;
    let inProgress = 0;
    let done = 0;

    for (const column of board.columns) {
      for (const task of column.tasks) {
        allTasks.push({
          id: task.id,
          title: task.title,
          priority: task.priority,
          dueDate: task.dueDate,
          columnName: column.name,
        });
      }

      const nameLower = column.name.toLowerCase();
      if (nameLower.includes("done") || nameLower.includes("hecho")) {
        done += column.tasks.length;
      } else if (
        nameLower.includes("progress") ||
        nameLower.includes("progreso")
      ) {
        inProgress += column.tasks.length;
      } else {
        todo += column.tasks.length;
      }
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const overdue = allTasks.filter((t) => {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due < now && !t.columnName.toLowerCase().includes("done");
    }).length;

    setTasks(allTasks);
    setStats({
      total: allTasks.length,
      todo,
      inProgress,
      done,
      overdue,
    });

    const dates = allTasks
      .filter((t) => t.dueDate)
      .map((t) => new Date(t.dueDate!));
    setDatesWithTasks(dates);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingTasks = tasks
    .filter((t) => {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due >= today && !t.columnName.toLowerCase().includes("done");
    })
    .sort(
      (a, b) =>
        new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
    )
    .slice(0, 10);

  const overdueTasks = tasks
    .filter((t) => {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due < today && !t.columnName.toLowerCase().includes("done");
    })
    .sort(
      (a, b) =>
        new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
    );

  const unscheduledTasks = tasks.filter(
    (t) => !t.dueDate && !t.columnName.toLowerCase().includes("done")
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const statCards = [
    {
      label: "To Do",
      value: stats.todo,
      icon: Circle,
      color: "text-muted-foreground",
    },
    {
      label: "In Progress",
      value: stats.inProgress,
      icon: Clock,
      color: "text-blue-500",
    },
    {
      label: "Done",
      value: stats.done,
      icon: CheckCircle2,
      color: "text-green-500",
    },
    {
      label: "Overdue",
      value: stats.overdue,
      icon: AlertTriangle,
      color: "text-red-500",
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calendar + Tasks */}
      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
        {/* Mini Calendar */}
        <Card className="h-fit">
          <CardContent className="p-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              modifiers={{ hasTasks: datesWithTasks }}
              modifiersClassNames={{
                hasTasks: "font-bold underline underline-offset-4",
              }}
            />
          </CardContent>
        </Card>

        {/* Task Lists */}
        <div className="flex flex-col gap-4">
          {overdueTasks.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  Overdue ({overdueTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {overdueTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-md border p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          priorityColor[task.priority]
                            ? `bg-${task.priority === "high" ? "red" : task.priority === "medium" ? "yellow" : "blue"}-500`
                            : "bg-yellow-500"
                        }`}
                      />
                      <span className="text-sm">{task.title}</span>
                    </div>
                    <span className="text-xs text-red-500">
                      {formatDate(task.dueDate!)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                Upcoming ({upcomingTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {upcomingTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upcoming tasks
                </p>
              ) : (
                upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-md border p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          task.priority === "high"
                            ? "bg-red-500"
                            : task.priority === "medium"
                              ? "bg-yellow-500"
                              : "bg-blue-500"
                        }`}
                      />
                      <span className="text-sm">{task.title}</span>
                      <Badge variant="secondary" className="text-xs">
                        {task.columnName}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(task.dueDate!)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {unscheduledTasks.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                  No date ({unscheduledTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {unscheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-md border p-2"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        task.priority === "high"
                          ? "bg-red-500"
                          : task.priority === "medium"
                            ? "bg-yellow-500"
                            : "bg-blue-500"
                      }`}
                    />
                    <span className="text-sm">{task.title}</span>
                    <Badge variant="secondary" className="text-xs">
                      {task.columnName}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
