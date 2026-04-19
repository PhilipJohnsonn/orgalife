"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import type { TaskData } from "../board/TaskCard";

export function TaskDetail({
  task,
  open,
  onClose,
  onUpdate,
}: {
  task: TaskData;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState(task.priority);
  const [subtasks, setSubtasks] = useState(task.subtasks);
  const [newSubtask, setNewSubtask] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, priority }),
    });
    setSaving(false);
    onUpdate();
    onClose();
  };

  const handleDelete = async () => {
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onUpdate();
    onClose();
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;

    const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSubtask }),
    });
    const created = await res.json();
    setSubtasks([...subtasks, created]);
    setNewSubtask("");
    onUpdate();
  };

  const handleToggleSubtask = async (subtaskId: string, done: boolean) => {
    setSubtasks(
      subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !done } : s))
    );
    await fetch(`/api/subtasks/${subtaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !done }),
    });
    onUpdate();
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    setSubtasks(subtasks.filter((s) => s.id !== subtaskId));
    await fetch(`/api/subtasks/${subtaskId}`, { method: "DELETE" });
    onUpdate();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalle de tarea</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-semibold"
          />

          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción..."
            rows={4}
          />

          <div>
            <p className="mb-2 text-sm font-medium">Prioridad</p>
            <div className="flex gap-2">
              {(["low", "medium", "high"] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={priority === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPriority(p)}
                >
                  {p === "low" ? "Baja" : p === "medium" ? "Media" : "Alta"}
                </Button>
              ))}
            </div>
          </div>

          {task.tags.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Tags</p>
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    style={{ backgroundColor: tag.color, color: "#fff" }}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Subtareas</p>
            <div className="flex flex-col gap-1">
              {subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className="flex items-center gap-2 rounded p-1 hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={subtask.done}
                    onChange={() =>
                      handleToggleSubtask(subtask.id, subtask.done)
                    }
                    className="h-4 w-4"
                  />
                  <span
                    className={`flex-1 text-sm ${
                      subtask.done ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    {subtask.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleDeleteSubtask(subtask.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleAddSubtask}
              className="mt-2 flex items-center gap-2"
            >
              <Input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Nueva subtarea..."
                className="h-8 text-sm"
              />
              <Button type="submit" variant="ghost" size="icon" className="h-8 w-8">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-1 h-4 w-4" />
              Eliminar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
