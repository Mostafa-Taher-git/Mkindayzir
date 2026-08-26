
import * as React from "react";
import { Dialog, DialogContent } from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const commands = [
  { label: "Go to Projects", href: ROUTES.PROJECTS, shortcut: "G P" },
  { label: "Go to Boards", href: ROUTES.BOARDS, shortcut: "G B" },
  { label: "Go to Storm", href: ROUTES.STORM, shortcut: "G M" },
  { label: "Go to Vault", href: ROUTES.VAULT, shortcut: "G V" },
  { label: "Go to Assistant", href: ROUTES.ASSISTANT, shortcut: "G A" },
  { label: "Go to Guides", href: ROUTES.GUIDES, shortcut: "G U" },
  { label: "Go to Reports", href: ROUTES.REPORTS, shortcut: "G R" },
  { label: "Go to Settings", href: ROUTES.SETTINGS, shortcut: "G S" },
];

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const filtered = React.useMemo(() => {
    if (!query) return commands;
    return commands.filter((cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    const timeout = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timeout);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = filtered[selectedIndex];
        if (selected) {
          window.location.href = selected.href;
          onOpenChange(false);
        }
      } else if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, filtered, selectedIndex, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 w-full max-w-lg">
        <div className="flex items-center border-b px-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground mr-2 h-4 w-4 shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="border-none focus-visible:ring-0 h-11"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground text-sm px-2 py-6 text-center">
              No results found.
            </div>
          ) : (
            filtered.map((cmd, index) => (
              <a
                key={cmd.href}
                href={cmd.href}
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-2 text-sm cursor-pointer",
                  index === selectedIndex ? "bg-accent" : "hover:bg-accent"
                )}
              >
                <span>{cmd.label}</span>
                <kbd className="bg-muted text-muted-foreground pointer-events-none flex h-5 select-none items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100">
                  {cmd.shortcut}
                </kbd>
              </a>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { CommandPalette };
