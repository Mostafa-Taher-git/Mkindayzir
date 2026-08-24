/**
 * BackgroundPicker — board background control.
 *
 * Solid colors OR an uploaded image. When an image is used, a dark overlay
 * sits between the image and the content:
 *
 *     image -> overlay -> header/text -> opaque cards
 *
 * so the photo shows through while everything stays readable.
 */
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BOARD_BACKGROUNDS } from "@/lib/constants";

export type BoardBg = {
  color?: string | null;      // solid color or null when image is set
  imageUrl?: string | null;   // /api/board-backgrounds/<file>
  overlay?: number;           // 0..0.9 darkness of the fine overlay
};

interface Props {
  boardId: string;
  value: BoardBg;
  onChanged?: () => void;
}

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err?.error?.message || err?.message || "Request failed");
  }
  return res.json();
}

export function BackgroundPicker({ boardId, value, onChanged }: Props) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (settings: Record<string, unknown>) =>
      jfetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
      onChanged?.();
    },
  });

  const current = React.useMemo<BoardBg>(() => {
    // value.board.settings may be a JSON string
    return value;
  }, [value]);

  const apply = async (patch: Partial<BoardBg>) => {
    const next: BoardBg = {
      color: "color" in patch ? patch.color : current.color,
      imageUrl: "imageUrl" in patch ? patch.imageUrl : current.imageUrl,
      overlay: "overlay" in patch ? patch.overlay : current.overlay,
    };
    // Persisted into board.settings JSON so any field can evolve without
    // schema churn. background stays a plain color for older clients.
    await save.mutateAsync({
      background: next.imageUrl ? "#0b1622" : next.color ?? "#1f2937",
      settings: {
        bgImageUrl: next.imageUrl ?? null,
        bgOverlay: next.overlay ?? 0.45,
        bgColor: next.color ?? null,
      },
    });
  };

  const upload = async (file: File) => {
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await jfetch<{ url: string }>("/api/board-backgrounds", {
        method: "POST",
        body: form,
      });
      await apply({ imageUrl: data.url });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const overlay = current.overlay ?? 0.45;

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        🎨 Background
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-80 border-2 border-outline bg-surface shadow-lg p-3 space-y-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Colors
            </div>
            <div className="flex flex-wrap gap-2">
              {BOARD_BACKGROUNDS.map((bg) => (
                <button
                  key={bg.value}
                  title={bg.label}
                  onClick={async () => { await apply({ color: bg.value, imageUrl: null }); }}
                  className={`h-8 w-8 border-2 ${
                    !current.imageUrl && current.color === bg.value
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: bg.value }}
                />
              ))}
            </div>

            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground pt-1 border-t border-outline">
              Photo
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.currentTarget.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? "Uploading…" : "⬆ Upload image"}
            </Button>
            {current.imageUrl && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => { await apply({ imageUrl: null }); }}
              >
                Remove image
              </Button>
            )}
            {error && <div className="text-xs text-destructive">{error}</div>}

            {current.imageUrl && (
              <>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground pt-1 border-t border-outline">
                  Overlay darkness — keeps text readable
                </div>
                <input
                  type="range"
                  min={0}
                  max={85}
                  value={Math.round(overlay * 100)}
                  onChange={(e) => {
                    // live preview via CSS var on the board root is handled by parent;
                    // persist on release for simplicity:
                  }}
                  onMouseUp={async (e) => {
                    await apply({ overlay: Number(e.currentTarget.value) / 100 });
                  }}
                  onTouchEnd={async (e) => {
                    await apply({ overlay: Number(e.currentTarget.value) / 100 });
                  }}
                  className="w-full accent-primary"
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
