"use client";

import { useState } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { TaskCard, type TaskData } from "./TaskCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

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
  onRename,
  onDelete,
}: {
  column: ColumnData;
  onTaskClick: (task: TaskData) => void;
  onAddTask: (columnId: string) => void;
  onRename: (columnId: string, name: string) => void;
  onDelete: (columnId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);

  const handleRename = () => {
    if (name.trim() && name !== column.name) {
      onRename(column.id, name.trim());
    } else {
      setName(column.name);
    }
    setEditing(false);
  };

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/50 p-3">
      <div className="mb-3 flex items-center justify-between">
        {editing ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") {
                setName(column.name);
                setEditing(false);
              }
            }}
            className="h-7 text-sm font-semibold"
            autoFocus
          />
        ) : (
          <h3 className="text-sm font-semibold">
            {column.name}{" "}
            <span className="text-muted-foreground">
              ({column.tasks.length})
            </span>
          </h3>
        )}
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(column.id)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onAddTask(column.id)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
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
