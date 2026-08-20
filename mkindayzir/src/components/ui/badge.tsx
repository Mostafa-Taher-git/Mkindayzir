import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:shrink-0 font-mono uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary/10 text-primary",
        secondary:
          "border-mechanical-grey bg-surface-container text-mechanical-grey-light",
        destructive:
          "border-destructive bg-destructive/10 text-destructive",
        outline:
          "border-outline text-on-surface",
        active:
          "border-primary bg-primary/20 text-primary",
        done:
          "border-tertiary bg-tertiary/10 text-tertiary",
        pending:
          "border-secondary bg-secondary/10 text-secondary",
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
