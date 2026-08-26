/**
 * Storm note editor: distraction-free markdown with autosave, backlinks, and
 * [[wiki-link]] support. Click a red/broken wiki-link to create a new storm.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { useParams, useNavigate } from "react-router-dom";
import { STORM_ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/button";

const DEBOUNCE_MS = 1000;

export default function StormNotePage() {
  const params = useParams();
  const stormId = params.stormId as string;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [body, setBody] = React.useState("");
  const timer = React.useRef<number | null>(null);

  const { data } = useQuery<{ body: string; wikiLinks: string[] }>({
    queryKey: ["storm-note", stormId],
    queryFn: async () => {
      const res = await fetch(`/api/storms/${stormId}/note`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      return res.json() as Promise<{ body: string; wikiLinks: string[] }>;
    },
  });

  React.useEffect(() => {
    if (data?.body) setBody(data.body);
  }, [data?.body]);

  const save = useMutation({
    mutationFn: async (next: string) => {
      const res = await fetch(`/api/storms/${stormId}/note`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: { message: "Save failed" } }))).error?.message ?? "Save failed");
    },
  });

  const fileInput = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState(false);

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/storms/images`, { method: "POST", credentials: "include", body });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? "Upload failed");
      }
      return (await res.json()).url as string;
    },
    onSuccess: (url: string) => {
      setBody((prev) => `${prev}${prev && !prev.endsWith("\n") ? "\n" : ""}![]( ${url} )\n`.replace("![]( ", "!(").replace(" )", ")"));
    },
  });

  const { data: backlinksData } = useQuery<{ index: Record<string, string[]> }>({
    queryKey: ["storm-backlinks"],
    queryFn: async () => {
      const res = await fetch("/api/storms/_backlinks", { credentials: "include", cache: "no-store" });
      if (!res.ok) return { index: {} };
      return res.json() as Promise<{ index: Record<string, string[]> }>;
    },
  });

  const wikiNames = React.useMemo(() => {
    const WIKI = /\[\[([^\]\n]+?)\]\]/g;
    const seen: Record<string, true> = {};
    const out: string[] = [];
    let m;
    while ((m = WIKI.exec(body)) !== null) {
      const name = m[1].trim();
      if (name && !seen[name]) { seen[name] = true; out.push(name); }
    }
    return out;
  }, [body]);

  const unresolved = React.useMemo(() => {
    const index = (backlinksData?.index ?? {}) as Record<string, string[]>;
    return wikiNames.filter((name) => !index[name]?.length);
  }, [wikiNames, backlinksData]);

  React.useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setBody(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save.mutate(next), DEBOUNCE_MS);
  };

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const chars = body.length;
  const dirty = body !== (data?.body ?? "");

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-5xl flex-col p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => navigate(STORM_ROUTES.HOME)}>← Back</Button>
          <Button size="sm" variant="secondary" onClick={() => setPreview((v) => !v)}>{preview ? "Edit" : "Preview"}</Button>
          <Button size="sm" variant="secondary" disabled={uploadImage.isPending} onClick={() => fileInput.current?.click()}>            {uploadImage.isPending ? "Uploading…" : "Image"}
          </Button>
          {uploadImage.isError && (
            <span className="text-xs text-critical">{(uploadImage.error as Error).message}</span>
          )}
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage.mutate(f); e.target.value = ""; }} />
          <span className="text-xs text-muted-foreground font-mono">{dirty ? "unsaved" : "saved"}</span>
          <span className="text-xs text-muted-foreground font-mono">{words} words · {chars} chars</span>
        </div>
        <div className="flex items-center gap-2">
          {unresolved.map((name) => (
            <Button key={name} size="sm" variant="outline" onClick={() => {
              const confirmed = window.confirm(`Create new storm named "${name}"?`);
              if (!confirmed) return;
              // Create then open
              fetch("/api/storms", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
              })
                .then((r) => r.json())
                .then((d) => {
                  if (d?.storm?.id) navigate(`${STORM_ROUTES.HOME}/${d.storm.id}/note`);
                });
            }}>Create “{name}”</Button>
          ))}
        </div>
      </div>

      <input
        className="mt-3 border-b-2 border-outline bg-transparent p-2 text-2xl font-bold outline-none"
        defaultValue={(data?.body ?? "").split("\n")[0] || "Untitled storm"}
        onChange={(e) => {
          const title = e.target.value;
          setBody((prev) => `${title}\n${prev.split("\n").slice(1).join("\n")}`);
        }}
      />

      {preview ? (
        <div className="mt-2 flex-1 overflow-auto rounded border-2 border-outline bg-background p-3 prose prose-invert max-w-none">
          <ReactMarkdown>{body || "_Nothing yet. Write in markdown and link notes with [[name]]."}</ReactMarkdown>
        </div>
      ) : (
        <textarea
          className="mt-2 flex-1 resize-none bg-transparent p-2 font-mono text-sm leading-relaxed outline-none"
          value={body}
          onChange={onChange}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              if (timer.current) window.clearTimeout(timer.current);
              save.mutate(body);
            }
          }}
        />
      )}

      <div className="mt-2 border-t-2 border-outline pt-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Linked notes</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {wikiNames.map((name) => {
            const linked = (backlinksData?.index?.[name]?.length ?? 0) > 0;
            return (
              <span key={name} className={`text-xs ${linked ? "text-primary underline" : "text-critical"}`} title={linked ? "Open linked storm" : "Missing target"}>
                {name}
              </span>
            );
          })}
          {wikiNames.length === 0 && <span className="text-xs text-muted-foreground">Use [[name]] to link notes.</span>}
        </div>
      </div>
    </div>
  );
}
