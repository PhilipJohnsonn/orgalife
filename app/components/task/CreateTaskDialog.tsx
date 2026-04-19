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

export function CreateTaskDialog({
  columnId,
  open,
  onClose,
  onCreate,
}: {
  columnId: string;
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, priority, columnId }),
    });
    setLoading(false);
    setTitle("");
    setDescription("");
    setPriority("medium");
    onCreate();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Título de la tarea"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <Textarea
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />

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

          <Button type="submit" disabled={loading || !title.trim()}>
            {loading ? "Creando..." : "Crear tarea"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
