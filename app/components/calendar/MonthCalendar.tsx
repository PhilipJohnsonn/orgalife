"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { CreateTaskDialog } from "@/app/components/task/CreateTaskDialog";

type Task = {
  id: string;
  title: string;
  priority: string;
  dueDate: string;
  column: {
    name: string;
  };
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const priorityDot: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};

const priorityBar: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-yellow-500",
  low: "border-l-blue-500",
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function formatDateFromParts(year: number, month: number, day: number): string {
  return formatDate(new Date(year, month, day));
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function MonthCalendar() {
  const today = new Date();
  const [view, setView] = useState<"month" | "week">("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [firstColumnId, setFirstColumnId] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/boards");
    const boards = await res.json();
    if (boards.length === 0) return;

    const board = boards[0];
    if (board.columns.length > 0) setFirstColumnId(board.columns[0].id);

    const allTasks: Task[] = [];
    for (const column of board.columns) {
      for (const task of column.tasks) {
        if (task.dueDate) {
          allTasks.push({ ...task, column: { name: column.name } });
        }
      }
    }
    setTasks(allTasks);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Navigation
  const prevPeriod = () => {
    if (view === "month") {
      if (month === 0) { setMonth(11); setYear(year - 1); }
      else setMonth(month - 1);
    } else {
      const d = new Date(weekStart);
      d.setDate(d.getDate() - 7);
      setWeekStart(d);
    }
  };

  const nextPeriod = () => {
    if (view === "month") {
      if (month === 11) { setMonth(0); setYear(year + 1); }
      else setMonth(month + 1);
    } else {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + 7);
      setWeekStart(d);
    }
  };

  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setWeekStart(getWeekStart(today));
  };

  const switchView = (v: "month" | "week") => {
    if (v === "week") setWeekStart(getWeekStart(today));
    setView(v);
  };

  // Month helpers
  const getTasksForDay = (day: number) =>
    tasks.filter((t) => {
      const d = new Date(t.dueDate);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  // Header label
  const headerLabel =
    view === "month"
      ? new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : (() => {
          const dates = getWeekDates(weekStart);
          const start = dates[0];
          const end = dates[6];
          const sameMonth = start.getMonth() === end.getMonth();
          const sameYear = start.getFullYear() === end.getFullYear();
          const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const endStr = end.toLocaleDateString("en-US", {
            month: sameMonth ? undefined : "short",
            day: "numeric",
            year: sameYear ? "numeric" : undefined,
          });
          const yearStr = sameYear ? `, ${start.getFullYear()}` : "";
          return `${startStr} – ${endStr}${yearStr}`;
        })();

  // Month grid cells
  const monthCells = [];
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  for (let i = 0; i < firstDay; i++) {
    monthCells.push(<div key={`empty-${i}`} className="border-r border-b p-1" />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dayTasks = getTasksForDay(day);
    monthCells.push(
      <div
        key={day}
        className="group relative border-r border-b p-1 min-h-[100px] flex flex-col cursor-pointer hover:bg-muted/30"
        onClick={() => setCreateDate(formatDateFromParts(year, month, day))}
      >
        <div className="mb-1 flex items-center justify-between">
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
              isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
            }`}
          >
            {day}
          </span>
          <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {dayTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-muted"
              onClick={(e) => e.stopPropagation()}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityDot[task.priority] || priorityDot.medium}`} />
              <span className="truncate">{task.title}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Week view
  const weekDates = getWeekDates(weekStart);
  const weekColumns = weekDates.map((date) => {
    const dayTasks = tasks.filter((t) => isSameDay(new Date(t.dueDate), date));
    const isCurrentDay = isSameDay(date, today);
    return (
      <div
        key={date.toISOString()}
        className="group flex flex-1 flex-col border-r cursor-pointer hover:bg-muted/20"
        onClick={() => setCreateDate(formatDate(date))}
      >
        <div
          className={`border-b px-2 py-2 text-center ${
            isCurrentDay ? "bg-primary/10" : "bg-muted/50"
          }`}
        >
          <p className="text-xs font-medium text-muted-foreground">
            {date.toLocaleDateString("en-US", { weekday: "short" })}
          </p>
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
              isCurrentDay ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            {date.getDate()}
          </span>
        </div>
        <div
          className="flex flex-1 flex-col gap-1 p-2 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {dayTasks.map((task) => (
            <div
              key={task.id}
              className={`rounded border-l-2 bg-background px-2 py-1 text-xs shadow-sm ${
                priorityBar[task.priority] || priorityBar.medium
              }`}
            >
              <p className="font-medium truncate">{task.title}</p>
              <p className="text-muted-foreground truncate">{task.column.name}</p>
            </div>
          ))}
          <div
            className="mt-auto flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity py-1"
            onClick={(e) => {
              e.stopPropagation();
              setCreateDate(formatDate(date));
            }}
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  });

  return (
    <div className="flex flex-1 flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{headerLabel}</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border text-sm">
            <button
              className={`px-3 py-1 rounded-l-md transition-colors ${
                view === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
              onClick={() => switchView("month")}
            >
              Month
            </button>
            <button
              className={`px-3 py-1 rounded-r-md border-l transition-colors ${
                view === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
              onClick={() => switchView("week")}
            >
              Week
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={prevPeriod}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={nextPeriod}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {view === "month" ? (
        <div className="grid flex-1 grid-cols-7 border-l border-t">
          {DAYS.map((day) => (
            <div
              key={day}
              className="border-r border-b bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
          {monthCells}
        </div>
      ) : (
        <div className="flex flex-1 border-l border-t overflow-hidden">
          {weekColumns}
        </div>
      )}

      {createDate && firstColumnId && (
        <CreateTaskDialog
          columnId={firstColumnId}
          open={!!createDate}
          onClose={() => setCreateDate(null)}
          onCreate={fetchData}
          defaultDueDate={createDate}
        />
      )}
    </div>
  );
}
