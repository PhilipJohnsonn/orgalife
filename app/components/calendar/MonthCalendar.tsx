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

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDate(year: number, month: number, day: number) {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function MonthCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [firstColumnId, setFirstColumnId] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/boards");
    const boards = await res.json();

    if (boards.length === 0) return;

    const board = boards[0];
    if (board.columns.length > 0) {
      setFirstColumnId(board.columns[0].id);
    }

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

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const getTasksForDay = (day: number) => {
    return tasks.filter((t) => {
      const d = new Date(t.dueDate);
      return (
        d.getFullYear() === year &&
        d.getMonth() === month &&
        d.getDate() === day
      );
    });
  };

  const monthName = new Date(year, month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const isToday = (day: number) => {
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} className="border-r border-b p-1" />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dayTasks = getTasksForDay(day);
    cells.push(
      <div
        key={day}
        className="group relative border-r border-b p-1 min-h-[100px] flex flex-col cursor-pointer hover:bg-muted/30"
        onClick={() => setCreateDate(formatDate(year, month, day))}
      >
        <div className="mb-1 flex items-center justify-between">
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
              isToday(day)
                ? "bg-primary text-primary-foreground"
                : "text-foreground"
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
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  priorityDot[task.priority] || priorityDot.medium
                }`}
              />
              <span className="truncate">{task.title}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold capitalize">{monthName}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-7 border-l border-t">
        {DAYS.map((day) => (
          <div
            key={day}
            className="border-r border-b bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {cells}
      </div>

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
