import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:shrink-0 font-mono uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary/10 text-primary-light",
        secondary:
          "border-outline bg-muted text-muted-foreground",
        destructive:
          "border-destructive bg-destructive/10 text-destructive",
        outline:
          "border-outline text-foreground",
        active:
          "border-primary bg-primary/20 text-primary-light",
        done:
          "border-outline bg-muted/50 text-muted-foreground",
        pending:
          "border-outline bg-surface text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
