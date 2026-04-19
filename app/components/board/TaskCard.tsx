"use client";

import { Draggable } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckSquare } from "lucide-react";

type Subtask = {
  id: string;
  title: string;
  done: boolean;
};

type Tag = {
  id: string;
  name: string;
  color: string;
};

export type TaskData = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  position: number;
  dueDate: string | null;
  subtasks: Subtask[];
  tags: Tag[];
};

const priorityColors: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-yellow-500",
  low: "border-l-blue-500",
};

export function TaskCard({
  task,
  index,
  onClick,
}: {
  task: TaskData;
  index: number;
  onClick: () => void;
}) {
  const doneCount = task.subtasks.filter((s) => s.done).length;
  const totalCount = task.subtasks.length;

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          <Card
            onClick={onClick}
            className={`cursor-pointer border-l-4 p-3 transition-all duration-200 hover:shadow-md ${
              priorityColors[task.priority] || priorityColors.medium
            } ${snapshot.isDragging ? "shadow-lg rotate-2" : "rotate-0"}`}
          >
            {task.tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {task.tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="text-xs"
                    style={{ backgroundColor: tag.color, color: "#fff" }}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}

            <p className="text-sm font-medium">{task.title}</p>

            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              {totalCount > 0 && (
                <span className="flex items-center gap-1">
                  <CheckSquare className="h-3 w-3" />
                  {doneCount}/{totalCount}
                </span>
              )}
              {task.dueDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(task.dueDate).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              )}
            </div>
          </Card>
        </div>
      )}
    </Draggable>
  );
}
