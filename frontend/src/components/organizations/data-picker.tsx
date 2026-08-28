import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

type Direction = "to_org";

type Preview = {
  projects: { id: string; name: string; key: string }[];
  spaces: { id: string; name: string }[];
  notes: { id: string; title: string }[];
  tickets: { id: string; number: number; subject: string }[];
};

interface DataPickerProps {
  direction: Direction;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (result: { moved: { projects: number; spaces: number; notes: number; tickets: number } }) => void;
}

export function DataPicker({ direction, orgId, open, onOpenChange, onComplete }: DataPickerProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState({
    projectIds: [] as string[],
    spaceIds: [] as string[],
    noteIds: [] as string[],
    ticketIds: [] as string[],
  });

  const { data, isLoading } = useQuery<Preview>({
    queryKey: ["transfers", "preview", direction, orgId],
    queryFn: () => {
      return api.get<Preview>(`/api/transfers/preview?direction=${direction}&orgId=${orgId}`);
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) setSelected({ projectIds: [], spaceIds: [], noteIds: [], ticketIds: [] });
  }, [open]);

  const transfer = useMutation({
    mutationFn: () => api.post(
      "/api/transfers/to-org",
      { orgId, ...selected },
    ),
    onSuccess: (res: any) => {
      toast({
        title: "Moved to organization",
        description: `Projects: ${res?.moved?.projects ?? 0}, Spaces: ${res?.moved?.spaces ?? 0}, Notes: ${res?.moved?.notes ?? 0}, Tickets: ${res?.moved?.tickets ?? 0}`,
      });
      onComplete?.(res?.moved);
      onOpenChange(false);
    },
    onError: (e) => toast({ title: "Transfer failed", description: String(e) }),
  });

  function toggle(key: keyof typeof selected, id: string) {
    setSelected((prev) => {
      const list = prev[key];
      return {
        ...prev,
        [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
      };
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-outline bg-background p-5 shadow-xl max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">
          Bring data to organization
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Select the data you'd like to move into this organization.
        </p>

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : (
          <div className="mt-4 space-y-4">
            <Section title="Projects" count={data.projects.length} selected={selected.projectIds.length}>
              {data.projects.map((p) => (
                <Row
                  key={p.id}
                  label={`${p.key} — ${p.name}`}
                  checked={selected.projectIds.includes(p.id)}
                  onToggle={() => toggle("projectIds", p.id)}
                />
              ))}
              {data.projects.length === 0 && <EmptyRow />}
            </Section>
            <Section title="Spaces" count={data.spaces.length} selected={selected.spaceIds.length}>
              {data.spaces.map((s) => (
                <Row
                  key={s.id}
                  label={s.name}
                  checked={selected.spaceIds.includes(s.id)}
                  onToggle={() => toggle("spaceIds", s.id)}
                />
              ))}
              {data.spaces.length === 0 && <EmptyRow />}
            </Section>
            <Section title="Notes" count={data.notes.length} selected={selected.noteIds.length}>
              {data.notes.map((n) => (
                <Row
                  key={n.id}
                  label={n.title}
                  checked={selected.noteIds.includes(n.id)}
                  onToggle={() => toggle("noteIds", n.id)}
                />
              ))}
              {data.notes.length === 0 && <EmptyRow />}
            </Section>
            <Section title="Tickets" count={data.tickets.length} selected={selected.ticketIds.length}>
              {data.tickets.map((t) => (
                <Row
                  key={t.id}
                  label={`#${t.number} — ${t.subject}`}
                  checked={selected.ticketIds.includes(t.id)}
                  onToggle={() => toggle("ticketIds", t.id)}
                />
              ))}
              {data.tickets.length === 0 && <EmptyRow />}
            </Section>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Btn variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Btn>
          <Btn onClick={() => transfer.mutate()} disabled={transfer.isPending}>
            {transfer.isPending ? "Transferring…" : "Transfer"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Section({ title, count, selected, children }: { title: string; count: number; selected: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground mb-1">
        <span>{title}</span>
        <span>{selected} of {count} selected</span>
      </div>
      <div className="border border-outline rounded divide-y divide-outline max-h-48 overflow-y-auto">{children}</div>
    </div>
  );
}

function Row({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent/40">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="truncate">{label}</span>
    </label>
  );
}

function EmptyRow() {
  return <p className="px-3 py-2 text-xs text-muted-foreground">Nothing here.</p>;
}

type Variant = "primary" | "outline";
function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const { variant, className, ...rest } = props;
  const base = "inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 transition-colors disabled:opacity-50";
  const styles: Record<Variant, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-outline bg-background hover:bg-accent",
  };
  return <button {...rest} className={`${base} ${styles[variant ?? "primary"]} ${className ?? ""}`} />;
}
