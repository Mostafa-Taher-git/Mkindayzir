
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PresenceUser } from "@/hooks/use-presence";
import { Badge } from "@/components/ui/badge";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function PresenceDialog({
  open,
  onOpenChange,
  users,
  currentUserId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: PresenceUser[];
  currentUserId: string;
}) {
  const others = users.filter((u) => u.userId !== currentUserId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Viewers</DialogTitle>
          <DialogDescription>
            People currently viewing this item
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.userId} className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatar ?? ""} alt={user.displayName} />
                <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium flex-1">{user.displayName}</span>
              {user.userId === currentUserId && (
                <Badge variant="secondary">You</Badge>
              )}
            </div>
          ))}
          {others.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No one else is viewing this right now.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { PresenceDialog };
