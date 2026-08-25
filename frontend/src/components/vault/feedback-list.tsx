
import { cn } from "@/lib/utils";

interface FeedbackItem {
  id: string;
  helpful: boolean;
  comment: string | null;
  createdAt: string;
}

interface FeedbackListProps {
  feedback: FeedbackItem[];
  onToggleHelpful?: (id: string, helpful: boolean) => void;
}

export function FeedbackList({ feedback, onToggleHelpful }: FeedbackListProps) {
  if (!feedback || feedback.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No feedback yet. Be the first to provide feedback on this note.
      </div>
    );
  }

  const helpfulCount = feedback.filter((f) => f.helpful).length;
  const totalCount = feedback.length;
  const percentage = totalCount > 0 ? Math.round((helpfulCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium">Helpfulness</span>
            <span className="text-muted-foreground">
              {helpfulCount}/{totalCount} ({percentage}%)
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {feedback.map((item) => (
          <div key={item.id} className="border rounded-md p-3">
            <div className="flex items-center justify-between mb-1">
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  item.helpful
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                )}
              >
                {item.helpful ? "Helpful" : "Not Helpful"}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
            {item.comment && (
              <p className="text-sm text-muted-foreground mt-1">{item.comment}</p>
            )}
            {onToggleHelpful && (
              <button
                onClick={() => onToggleHelpful(item.id, !item.helpful)}
                className="text-xs text-primary hover:underline mt-2"
              >
                Toggle helpfulness
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
