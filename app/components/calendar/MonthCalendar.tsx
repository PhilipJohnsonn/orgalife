"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { CreateTaskDialog } from "@/app/components/task/CreateTaskDialog";

type Tag = { id: string; name: string; color: string };

type Task = {
  id: string;
  title: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  tags: Tag[];
  column: { name: string };
};

type WeekCell = { date: Date; inMonth: boolean } | null;

type EventBar = {
  task: Task;
  startCol: number;
  colSpan: number;
  lane: number;
  startsHere: boolean;
  endsHere: boolean;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BAR_H = 18;
const WEEK_BAR_H = 42;
const DAY_NUM_H = 26;

function taskColor(task: Task) {
  if (task.tags.length > 0) return task.tags[0].color;
  return ({ high: "#ef4444", medium: "#eab308", low: "#3b82f6" })[task.priority] ?? "#eab308";
}

function s0(d: Date) {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}

function isSame(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmt(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

function buildMonthWeeks(year: number, month: number): WeekCell[][] {
  const first = getFirstDayOfMonth(year, month);
  const total = getDaysInMonth(year, month);
  const cells: WeekCell[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push({ date: new Date(year, month, d), inMonth: true });
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: WeekCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function getWeekStart(date: Date): Date {
  const d = s0(new Date(date));
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function isMultiDay(task: Task) {
  if (!task.startDate || !task.dueDate) return false;
  return !isSame(new Date(task.startDate), new Date(task.dueDate));
}

function getBarsForDates(tasks: Task[], dates: (Date | null)[]): EventBar[] {
  const nonNull = dates.filter(Boolean) as Date[];
  if (!nonNull.length) return [];

  const weekStart = s0(nonNull[0]);
  const weekEnd = s0(nonNull[nonNull.length - 1]);

  const relevant = tasks.filter(t => {
    if (!isMultiDay(t)) return false;
    const s = s0(new Date(t.startDate!));
    const e = s0(new Date(t.dueDate!));
    return s <= weekEnd && e >= weekStart;
  });

  const raw = relevant.map(t => {
    const ts = s0(new Date(t.startDate!));
    const te = s0(new Date(t.dueDate!));
    const cs = ts < weekStart ? weekStart : ts;
    const ce = te > weekEnd ? weekEnd : te;

    let startCol = -1, endCol = -1;
    dates.forEach((d, ci) => {
      if (!d) return;
      const dd = s0(d);
      if (startCol === -1 && dd >= cs) startCol = ci;
      if (dd <= ce) endCol = ci;
    });
    if (startCol === -1) startCol = dates.findIndex(d => d !== null);
    if (endCol === -1) {
      for (let i = dates.length - 1; i >= 0; i--) {
        if (dates[i]) { endCol = i; break; }
      }
    }

    return {
      task: t,
      startCol,
      colSpan: Math.max(endCol - startCol + 1, 1),
      lane: 0,
      startsHere: isSame(ts, cs),
      endsHere: isSame(te, ce),
    };
  });

  // assign lanes (greedy)
  const laneEnd: number[] = [];
  return raw
    .sort((a, b) => a.startCol - b.startCol)
    .map(bar => {
      let lane = 0;
      while (laneEnd[lane] !== undefined && laneEnd[lane] >= bar.startCol) lane++;
      laneEnd[lane] = bar.startCol + bar.colSpan - 1;
      return { ...bar, lane };
    });
}

function BarEl({ bar, cols }: { bar: EventBar; cols: number }) {
  const color = taskColor(bar.task);
  const r = bar.startsHere && bar.endsHere ? "9999px"
    : bar.startsHere ? "9999px 0 0 9999px"
    : bar.endsHere ? "0 9999px 9999px 0"
    : "0";
  return (
    <div
      title={bar.task.title}
      className="absolute text-[10px] text-white overflow-hidden whitespace-nowrap leading-none flex items-center select-none"
      style={{
        left: `calc(${(bar.startCol / cols) * 100}% + 2px)`,
        width: `calc(${(bar.colSpan / cols) * 100}% - 4px)`,
        top: `${DAY_NUM_H + bar.lane * BAR_H}px`,
        height: `${BAR_H - 2}px`,
        backgroundColor: color,
        borderRadius: r,
        paddingLeft: bar.startsHere ? "8px" : "4px",
        paddingRight: "4px",
      }}
    >
      {bar.startsHere && bar.task.title}
    </div>
  );
}

export function MonthCalendar() {
  const today = new Date();
  const [view, setView] = useState<"month" | "week">("week");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [firstColumnId, setFirstColumnId] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/boards");
    const boards = await res.json();
    if (!boards.length) return;
    const board = boards[0];
    if (board.columns.length > 0) setFirstColumnId(board.columns[0].id);
    const all: Task[] = [];
    for (const col of board.columns) {
      for (const task of col.tasks) {
        if (task.dueDate || task.startDate) {
          all.push({ ...task, column: { name: col.name } });
        }
      }
    }
    setTasks(all);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevPeriod = () => {
    if (view === "month") { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
    else { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }
  };
  const nextPeriod = () => {
    if (view === "month") { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }
    else { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }
  };
  const goToday = () => {
    setYear(today.getFullYear()); setMonth(today.getMonth());
    setWeekStart(getWeekStart(today));
  };
  const switchView = (v: "month" | "week") => {
    if (v === "week") setWeekStart(getWeekStart(today));
    setView(v);
  };

  // single-day tasks for a given date
  const singleDayTasks = (date: Date) =>
    tasks.filter(t => {
      if (!t.dueDate) return false;
      if (isMultiDay(t)) return false;
      return isSame(new Date(t.dueDate), date);
    });

  const isToday = (date: Date) => isSame(date, today);

  const headerLabel = view === "month"
    ? new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : (() => {
        const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
        const s = dates[0], e = dates[6];
        return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: s.getMonth() === e.getMonth() ? undefined : "short", day: "numeric" })}, ${s.getFullYear()}`;
      })();

  // ── MONTH VIEW ──────────────────────────────────────────────────────
  const monthWeeks = buildMonthWeeks(year, month);

  const monthView = (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-l border-t">
        {DAYS.map(d => (
          <div key={d} className="border-r border-b bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="flex flex-col flex-1 border-l overflow-hidden">
        {monthWeeks.map((week, wi) => {
          const bars = getBarsForDates(tasks, week.map(c => c ? c.date : null));
          const maxLane = bars.length ? Math.max(...bars.map(b => b.lane)) : -1;
          const topPad = DAY_NUM_H + (maxLane + 1) * BAR_H;

          return (
            <div key={wi} className="relative grid grid-cols-7 flex-1 border-t">
              {week.map((cell, ci) => (
                <div
                  key={ci}
                  className={`border-r overflow-hidden ${cell ? "cursor-pointer hover:bg-muted/20" : ""}`}
                  style={{ paddingTop: `${topPad}px` }}
                  onClick={cell ? () => setCreateDate(fmt(cell.date)) : undefined}
                >
                  {cell && (
                    <>
                      {/* Day number — absolutely positioned at top */}
                      <div className="absolute flex items-center justify-between px-1" style={{ top: `${(wi * 0) + 2}px`, width: "calc(100% / 7)", left: `calc(${ci} * 100% / 7)` }}>
                        {/* empty, day number rendered below */}
                      </div>
                      <div className="flex flex-col gap-0.5 px-1 pb-1">
                        {singleDayTasks(cell.date).map(t => (
                          <div
                            key={t.id}
                            className="flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-muted"
                            onClick={e => e.stopPropagation()}
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: taskColor(t) }} />
                            <span className="truncate">{t.title}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}

              {/* Day numbers — one per cell, absolutely positioned */}
              {week.map((cell, ci) => cell && (
                <div
                  key={`n-${ci}`}
                  className="absolute flex items-center justify-between px-1 pt-1 pointer-events-none"
                  style={{
                    top: 0,
                    left: `calc(${ci / 7 * 100}%)`,
                    width: `calc(${1 / 7 * 100}%)`,
                    height: `${DAY_NUM_H}px`,
                  }}
                >
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${isToday(cell.date) ? "bg-primary text-primary-foreground" : ""}`}>
                    {cell.date.getDate()}
                  </span>
                  <Plus className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </div>
              ))}

              {/* Multi-day bars */}
              {bars.map((bar, bi) => (
                <BarEl key={bi} bar={bar} cols={7} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── WEEK VIEW ──────────────────────────────────────────────────────
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  });
  const weekBars = getBarsForDates(tasks, weekDates);
  const weekMaxLane = weekBars.length ? Math.max(...weekBars.map(b => b.lane)) : -1;
  const stripHeight = weekBars.length ? (weekMaxLane + 1) * WEEK_BAR_H + 6 : 0;

  const weekView = (
    <div className="flex flex-1 flex-col border-l border-t overflow-hidden">
      {/* Day headers — always at the top */}
      <div className="flex shrink-0 border-b">
        {weekDates.map((date, di) => (
          <div
            key={di}
            className={`flex-1 border-r px-2 py-2 text-center ${isToday(date) ? "bg-primary/10" : "bg-muted/50"}`}
          >
            <p className="text-xs font-medium text-muted-foreground">
              {date.toLocaleDateString("en-US", { weekday: "short" })}
            </p>
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday(date) ? "bg-primary text-primary-foreground" : ""}`}>
              {date.getDate()}
            </span>
          </div>
        ))}
      </div>

      {/* Multi-day strip — below headers */}
      {stripHeight > 0 && (
        <div className="relative shrink-0 border-b" style={{ height: `${stripHeight}px` }}>
          <div className="absolute inset-0 flex pointer-events-none">
            {weekDates.map((_, i) => <div key={i} className="flex-1 border-r" />)}
          </div>
          {weekBars.map((bar, bi) => {
            const color = taskColor(bar.task);
            return (
              <div
                key={`wb-${bi}`}
                title={bar.task.title}
                className="absolute overflow-hidden rounded border-l-2 bg-background shadow-sm"
                style={{
                  left: `calc(${(bar.startCol / 7) * 100}% + 2px)`,
                  width: `calc(${(bar.colSpan / 7) * 100}% - 4px)`,
                  top: `${3 + bar.lane * WEEK_BAR_H}px`,
                  height: `${WEEK_BAR_H - 4}px`,
                  borderLeftColor: color,
                }}
              >
                <div className="flex flex-col justify-center h-full px-2">
                  <p className="text-xs font-medium truncate leading-tight">{bar.task.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate leading-tight">{bar.task.column.name}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Day content columns — no headers, those are above */}
      <div className="flex flex-1">
        {weekDates.map((date, di) => {
          const dayTasks = singleDayTasks(date);
          return (
            <div
              key={di}
              className="group flex flex-1 flex-col border-r cursor-pointer hover:bg-muted/20"
              onClick={() => setCreateDate(fmt(date))}
            >
              <div className="flex flex-1 flex-col gap-1 p-2 overflow-y-auto" onClick={e => e.stopPropagation()}>
                {dayTasks.map(t => (
                  <div
                    key={t.id}
                    className="rounded border-l-2 bg-background px-2 py-1 text-xs shadow-sm"
                    style={{ borderLeftColor: taskColor(t) }}
                  >
                    <p className="font-medium truncate">{t.title}</p>
                    <p className="text-muted-foreground truncate">{t.column.name}</p>
                  </div>
                ))}
                <div
                  className="mt-auto flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity py-1"
                  onClick={e => { e.stopPropagation(); setCreateDate(fmt(date)); }}
                >
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col p-6 overflow-hidden">
      <div className="mb-4 flex items-center justify-between shrink-0">
        <h2 className="text-xl font-semibold">{headerLabel}</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border text-sm">
            <button
              className={`px-3 py-1 rounded-l-md transition-colors ${view === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => switchView("month")}
            >
              Month
            </button>
            <button
              className={`px-3 py-1 rounded-r-md border-l transition-colors ${view === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => switchView("week")}
            >
              Week
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
          <Button variant="ghost" size="icon" onClick={prevPeriod}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={nextPeriod}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {view === "month" ? monthView : weekView}

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
