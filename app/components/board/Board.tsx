"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DragDropContext,
  type DropResult,
} from "@hello-pangea/dnd";
import { Column, type ColumnData } from "./Column";
import { TaskDetail } from "../task/TaskDetail";
import { CreateTaskDialog } from "../task/CreateTaskDialog";
import type { TaskData } from "./TaskCard";

type BoardData = {
  id: string;
  name: string;
  columns: ColumnData[];
};

export function Board() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null);
  const [createColumnId, setCreateColumnId] = useState<string | null>(null);

  const fetchBoard = useCallback(async () => {
    const res = await fetch("/api/boards");
    const boards = await res.json();

    if (boards.length === 0) {
      // Crear board default la primera vez
      const createRes = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Mi tablero" }),
      });
      const newBoard = await createRes.json();
      // Re-fetch para tener el board completo con tasks vacías
      const refetchRes = await fetch(`/api/boards/${newBoard.id}`);
      setBoard(await refetchRes.json());
    } else {
      setBoard(boards[0]);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination || !board) return;

    // Si no se movió a ningún lado
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    // Actualizar estado local inmediatamente (optimistic update)
    const newColumns = [...board.columns];

    const sourceCol = newColumns.find((c) => c.id === source.droppableId);
    const destCol = newColumns.find((c) => c.id === destination.droppableId);

    if (!sourceCol || !destCol) return;

    const sourceTasks = [...sourceCol.tasks];
    const [movedTask] = sourceTasks.splice(source.index, 1);

    if (source.droppableId === destination.droppableId) {
      // Mover dentro de la misma columna
      sourceTasks.splice(destination.index, 0, movedTask);
      sourceCol.tasks = sourceTasks;
    } else {
      // Mover a otra columna
      const destTasks = [...destCol.tasks];
      destTasks.splice(destination.index, 0, movedTask);
      sourceCol.tasks = sourceTasks;
      destCol.tasks = destTasks;
    }

    setBoard({ ...board, columns: newColumns });

    // Persistir en el backend
    await fetch(`/api/tasks/${draggableId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        columnId: destination.droppableId,
        position: destination.index,
      }),
    });
  };

  if (!board) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
          {board.columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              onTaskClick={setSelectedTask}
              onAddTask={setCreateColumnId}
            />
          ))}
        </div>
      </DragDropContext>

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          open={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={fetchBoard}
        />
      )}

      {createColumnId && (
        <CreateTaskDialog
          columnId={createColumnId}
          open={!!createColumnId}
          onClose={() => setCreateColumnId(null)}
          onCreate={fetchBoard}
        />
      )}
    </>
  );
}
