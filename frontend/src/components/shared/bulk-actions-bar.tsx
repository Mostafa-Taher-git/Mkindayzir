
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BulkActionsBarProps {
  selectedCount: number;
  onAssign?: () => void;
  onChangeStatus?: () => void;
  onAddLabel?: () => void;
  onDelete?: () => void;
}

function BulkActionsBar({
  selectedCount,
  onAssign,
  onChangeStatus,
  onAddLabel,
  onDelete,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border bg-accent/50 px-3 py-2">
      <span className="text-sm font-medium">{selectedCount} selected</span>
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onAssign && (
            <DropdownMenuItem onClick={onAssign}>Assign</DropdownMenuItem>
          )}
          {onChangeStatus && (
            <DropdownMenuItem onClick={onChangeStatus}>Change Status</DropdownMenuItem>
          )}
          {onAddLabel && (
            <DropdownMenuItem onClick={onAddLabel}>Add Label</DropdownMenuItem>
          )}
          {(onAssign || onChangeStatus || onAddLabel) && onDelete && (
            <DropdownMenuSeparator />
          )}
          {onDelete && (
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { BulkActionsBar };
