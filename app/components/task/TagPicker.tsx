"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, X, Check } from "lucide-react";

type Tag = {
  id: string;
  name: string;
  color: string;
};

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // gray
];

export function TagPicker({
  selectedTags,
  onChange,
}: {
  selectedTags: Tag[];
  onChange: (tags: Tag[]) => void;
}) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[4]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/tags")
      .then((res) => res.json())
      .then(setAllTags);
  }, []);

  const selectedIds = new Set(selectedTags.map((t) => t.id));

  const toggleTag = (tag: Tag) => {
    if (selectedIds.has(tag.id)) {
      onChange(selectedTags.filter((t) => t.id !== tag.id));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
    });
    const tag = await res.json();

    setAllTags([...allTags, tag]);
    onChange([...selectedTags, tag]);
    setNewTagName("");
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {selectedTags.map((tag) => (
          <Badge
            key={tag.id}
            style={{ backgroundColor: tag.color, color: "#fff" }}
            className="cursor-pointer"
            onClick={() => toggleTag(tag)}
          >
            {tag.name}
            <X className="ml-1 h-3 w-3" />
          </Badge>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 text-xs">
              <Plus className="mr-1 h-3 w-3" />
              Add tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start">
            {/* Existing tags */}
            {allTags.length > 0 && (
              <div className="mb-3 flex flex-col gap-1">
                {allTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag)}
                    className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span>{tag.name}</span>
                    </div>
                    {selectedIds.has(tag.id) && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Create new tag */}
            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Create new tag
              </p>
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Tag name"
                className="mb-2 h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTag();
                }}
              />
              <div className="mb-2 flex gap-1">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className={`h-5 w-5 rounded-full border-2 ${
                      newTagColor === color
                        ? "border-foreground"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={handleCreateTag}
                disabled={!newTagName.trim()}
              >
                Create
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
