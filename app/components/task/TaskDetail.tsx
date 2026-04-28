"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, Eye, EyeOff } from "lucide-react";
import { DatePicker } from "@/app/components/DatePicker";
import { TagPicker } from "./TagPicker";
import type { TaskData } from "../board/TaskCard";

const PANEL_WIDTH = "w-[460px]";

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
  const [dueDate, setDueDate] = useState(
    task.dueDate ? task.dueDate.slice(0, 10) : ""
  );
  const [tags, setTags] = useState(task.tags);
  const [subtasks, setSubtasks] = useState(task.subtasks);
  const [newSubtask, setNewSubtask] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        priority,
        dueDate: dueDate || null,
        tagIds: tags.map((t) => t.id),
      }),
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
      <DialogContent className="sm:max-w-fit h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Task Detail</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="mr-6 text-xs text-muted-foreground"
            >
              {showPreview ? (
                <><EyeOff className="mr-1 h-3.5 w-3.5" /> Hide preview</>
              ) : (
                <><Eye className="mr-1 h-3.5 w-3.5" /> Show preview</>
              )}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-6">
          {/* Detail panel */}
          <div className={`${PANEL_WIDTH} shrink-0 flex flex-col gap-4`}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-semibold"
            />

            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (supports markdown)..."
              rows={6}
              className="max-h-[180px] resize-none overflow-y-auto overflow-x-hidden break-words"
            />

            <div>
              <p className="mb-2 text-sm font-medium">Priority</p>
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
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Due date</p>
              <DatePicker value={dueDate} onChange={setDueDate} />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Tags</p>
              <TagPicker selectedTags={tags} onChange={setTags} />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Subtasks</p>
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
                  placeholder="New subtask..."
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
                Delete
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          {/* Preview panel */}
          {showPreview && (
            <div className={`${PANEL_WIDTH} shrink-0 flex flex-col rounded-lg border bg-muted/30 p-4`}>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Preview
              </p>
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {description.trim() ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {description}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    No description yet
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
