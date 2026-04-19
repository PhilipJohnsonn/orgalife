"use client";

import { Droppable } from "@hello-pangea/dnd";
import { TaskCard, type TaskData } from "./TaskCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export type ColumnData = {
  id: string;
  name: string;
  position: number;
  tasks: TaskData[];
};

export function Column({
  column,
  onTaskClick,
  onAddTask,
}: {
  column: ColumnData;
  onTaskClick: (task: TaskData) => void;
  onAddTask: (columnId: string) => void;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {column.name}{" "}
          <span className="text-muted-foreground">({column.tasks.length})</span>
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onAddTask(column.id)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Droppable droppableId={column.id}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex min-h-[100px] flex-1 flex-col gap-2"
          >
            {column.tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={() => onTaskClick(task)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
