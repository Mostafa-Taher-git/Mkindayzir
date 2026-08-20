"use client";

import { Guide } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

function GuideDetail({ guide, onClose, open }: { guide: Guide | null; onClose: () => void; open: boolean }) {
  if (!guide) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline">{guide.category}</Badge>
            <Badge variant={guide.status === "PUBLISHED" ? "default" : "secondary"}>{guide.status}</Badge>
          </div>
          <DialogTitle>{guide.title}</DialogTitle>
        </DialogHeader>
        <div className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
          {guide.content}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { GuideDetail };
