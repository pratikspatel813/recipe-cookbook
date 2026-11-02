"use client";

import { useEffect, useState } from "react";
import { chapterErrorMessage, createCollection, listCollections, type Collection } from "@/lib/db";
import { track } from "@/lib/analytics";

// A row of tappable chips, one per collection ("chapter"), plus a way to make
// a new one. The parent page decides what happens when a chip is toggled.
export function ChapterPicker({
  selectedIds,
  onToggle,
  source,
}: {
  selectedIds: Set<string>;
  onToggle: (collectionId: string, nowSelected: boolean) => void;
  source: "add_page" | "recipe_page"; // where chapters get created, for analytics
}) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCollections().then(setCollections).catch(console.error);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    let created: Collection;
    try {
      created = await createCollection(newName);
    } catch (err) {
      setError(chapterErrorMessage(err, newName));
      return;
    }
    track("chapter_created", { chapter_id: created.id, source });
    setCollections((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    onToggle(created.id, true); // a chapter you just made is one you want this recipe in
    setNewName("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {collections.map((c) => {
        const selected = selectedIds.has(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id, !selected)}
            aria-pressed={selected}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              selected ? "border-accent bg-accent text-on-accent" : "border-rule bg-page hover:border-accent"
            }`}
          >
            {c.name}
          </button>
        );
      })}

      {adding ? (
        <form onSubmit={handleCreate} className="flex gap-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setAdding(false), setNewName(""), setError(null))}
            maxLength={60}
            placeholder="Chapter name"
            aria-label="New chapter name"
            className="w-36 rounded-full border border-accent bg-page px-3 py-1 text-sm outline-none"
          />
          <button type="submit" disabled={!newName.trim()}
            className="rounded-full bg-accent px-3 py-1 text-sm text-on-accent disabled:opacity-40">
            Add
          </button>
          <button type="button" onClick={() => (setAdding(false), setNewName(""), setError(null))}
            aria-label="Cancel" className="px-1 text-sm text-ink-soft hover:text-accent">
            ✕
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-ink-soft/50 px-3 py-1 text-sm text-ink-soft hover:border-accent hover:text-accent"
        >
          + New chapter
        </button>
      )}
      {error && <p className="w-full text-sm text-accent">{error}</p>}
    </div>
  );
}
