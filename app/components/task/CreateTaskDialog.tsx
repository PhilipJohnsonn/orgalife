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
import { DatePicker } from "@/app/components/DatePicker";

export function CreateTaskDialog({
  columnId,
  open,
  onClose,
  onCreate,
  defaultDueDate = "",
}: {
  columnId: string;
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
  defaultDueDate?: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, priority, dueDate: dueDate || null, columnId }),
    });
    setLoading(false);
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueDate("");
    onCreate();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <Textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />

          <div>
            <label className="mb-1 block text-sm font-medium">
              Due date (optional)
            </label>
            <DatePicker value={dueDate} onChange={setDueDate} />
          </div>

          <div className="flex gap-2">
            {(["low", "medium", "high"] as const).map((p) => (
              <Button
                key={p}
                type="button"
                variant={priority === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPriority(p)}
              >
                {p === "low" ? "Low" : p === "medium" ? "Medium" : "High"}
              </Button>
            ))}
          </div>

          <Button type="submit" disabled={loading || !title.trim()}>
            {loading ? "Creating..." : "Create task"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
