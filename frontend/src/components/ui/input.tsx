import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground bg-input border-outline flex h-9 w-full min-w-0 border bg-surface px-3 py-1 text-base font-mono transition-xs file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-primary focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  );
}

function InputWithIcon({
  className,
  type,
  icon,
  iconPosition = "left",
  ...props
}: React.ComponentProps<"input"> & {
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}) {
  const Comp = icon ? Slot : "div";

  return (
    <div className="relative w-full">
      {icon && iconPosition === "left" && (
        <div className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          {icon}
        </div>
      )}
      <Input
        type={type}
        className={cn(
          icon && iconPosition === "left" && "pl-9",
          icon && iconPosition === "right" && "pr-9",
          className
        )}
        {...props}
      />
      {icon && iconPosition === "right" && (
        <div className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {icon}
        </div>
      )}
    </div>
  );
}

export { Input, InputWithIcon };
