"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DragDropContext,
  type DropResult,
} from "@hello-pangea/dnd";
import { Column, type ColumnData } from "./Column";
import { TaskDetail } from "../task/TaskDetail";
import { CreateTaskDialog } from "../task/CreateTaskDialog";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import type { TaskData } from "./TaskCard";

type Tag = {
  id: string;
  name: string;
  color: string;
};

type BoardData = {
  id: string;
  name: string;
  columns: ColumnData[];
};

export function Board() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null);
  const [createColumnId, setCreateColumnId] = useState<string | null>(null);

  const fetchBoard = useCallback(async () => {
    const res = await fetch("/api/boards");
    const boards = await res.json();

    if (boards.length === 0) {
      const createRes = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Board" }),
      });
      const newBoard = await createRes.json();
      const refetchRes = await fetch(`/api/boards/${newBoard.id}`);
      setBoard(await refetchRes.json());
    } else {
      setBoard(boards[0]);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    setTags(await res.json());
  }, []);

  useEffect(() => {
    fetchBoard();
    fetchTags();
  }, [fetchBoard, fetchTags]);

  useEffect(() => {
    if (selectedTask || createColumnId) return;

    const interval = setInterval(() => {
      fetchBoard();
      fetchTags();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchBoard, fetchTags, selectedTask, createColumnId]);

  const filteredColumns = useMemo(() => {
    if (!board || !activeTagId) return board?.columns ?? [];

    return board.columns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((task) =>
        task.tags.some((t) => t.id === activeTagId)
      ),
    }));
  }, [board, activeTagId]);

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination || !board) return;

    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    const newColumns = [...board.columns];

    const sourceCol = newColumns.find((c) => c.id === source.droppableId);
    const destCol = newColumns.find((c) => c.id === destination.droppableId);

    if (!sourceCol || !destCol) return;

    const sourceTasks = [...sourceCol.tasks];
    const [movedTask] = sourceTasks.splice(source.index, 1);

    if (source.droppableId === destination.droppableId) {
      sourceTasks.splice(destination.index, 0, movedTask);
      sourceCol.tasks = sourceTasks;
    } else {
      const destTasks = [...destCol.tasks];
      destTasks.splice(destination.index, 0, movedTask);
      sourceCol.tasks = sourceTasks;
      destCol.tasks = destTasks;
    }

    setBoard({ ...board, columns: newColumns });

    await fetch(`/api/tasks/${draggableId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        columnId: destination.droppableId,
        position: destination.index,
      }),
    });
  };

  const handleAddColumn = async () => {
    if (!board) return;

    const res = await fetch("/api/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Column",
        boardId: board.id,
      }),
    });

    if (res.ok) fetchBoard();
  };

  const handleRenameColumn = async (columnId: string, name: string) => {
    await fetch(`/api/columns/${columnId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    fetchBoard();
  };

  const handleDeleteColumn = async (columnId: string) => {
    await fetch(`/api/columns/${columnId}`, { method: "DELETE" });
    fetchBoard();
  };

  if (!board) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <>
      {/* Tag filter tabs */}
      {tags.length > 0 && (
        <div className="flex items-center gap-2 border-b px-6 py-3">
          <Badge
            variant={activeTagId === null ? "default" : "outline"}
            className="cursor-pointer select-none"
            onClick={() => setActiveTagId(null)}
          >
            All
          </Badge>
          {tags.map((tag) => (
            <Badge
              key={tag.id}
              variant={activeTagId === tag.id ? "default" : "outline"}
              className="cursor-pointer select-none"
              style={
                activeTagId === tag.id
                  ? { backgroundColor: tag.color, color: "#fff", borderColor: tag.color }
                  : { borderColor: tag.color, color: tag.color }
              }
              onClick={() =>
                setActiveTagId(activeTagId === tag.id ? null : tag.id)
              }
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
          {filteredColumns.map((column) => (
            <Column
              key={column.id}
              column={column}
              onTaskClick={setSelectedTask}
              onAddTask={setCreateColumnId}
              onRename={handleRenameColumn}
              onDelete={handleDeleteColumn}
            />
          ))}
          <button
            onClick={handleAddColumn}
            className="flex h-10 w-72 shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add column
          </button>
        </div>
      </DragDropContext>

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          open={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => {
            fetchBoard();
            fetchTags();
          }}
        />
      )}

      {createColumnId && (
        <CreateTaskDialog
          columnId={createColumnId}
          open={!!createColumnId}
          onClose={() => setCreateColumnId(null)}
          onCreate={() => {
            fetchBoard();
            fetchTags();
          }}
        />
      )}
    </>
  );
}
