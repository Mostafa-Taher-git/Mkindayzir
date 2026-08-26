/**
 * Card attachments: list, upload (multipart), download.
 * Files live server-side under UPLOAD_DIR/card-attachments.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface CardAttachmentsProps {
  cardId: string;
}

function CardAttachments({ cardId }: CardAttachmentsProps) {
  const queryClient = useQueryClient();
  const fileInput = React.useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["card-attachments", cardId],
    queryFn: async () => {
      const res = await fetch(`/api/cards/${cardId}/attachments`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return { attachments: [] };
      return res.json();
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/cards/${cardId}/attachments`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: { message: "Upload failed" } }));
        throw new Error(error.error?.message ?? "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["card-attachments", cardId] });
      queryClient.invalidateQueries({ queryKey: ["card", cardId] });
    },
  });

  const attachments = data?.attachments ?? [];

  return (
    <div className="space-y-2">
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate(f);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="secondary" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
        {upload.isPending ? "Uploading…" : "Add attachment"}
      </Button>
      {upload.isError && (
        <p className="text-xs text-critical">{(upload.error as Error).message}</p>
      )}

      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((a: { id: string; fileName: string; sizeBytes: number; url: string }) => (
            <li key={a.id} className="flex items-center justify-between border border-outline bg-background px-2 py-1.5">
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-sm text-primary hover:underline"
                title={a.fileName}
              >
                {a.fileName}
              </a>
              <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">
                {formatBytes(a.sizeBytes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { CardAttachments };
