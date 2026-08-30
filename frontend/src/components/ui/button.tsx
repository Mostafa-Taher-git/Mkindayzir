import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default:
          "border-2 border-outline-strong bg-surface-container-high text-foreground chamfer shadow-bevel hover:border-primary hover:bg-primary hover:text-primary-foreground hover:shadow-accent-ring active:translate-y-px uppercase tracking-wider font-mono",
        destructive:
          "border-2 border-outline-strong bg-surface-container-high text-foreground chamfer shadow-bevel hover:border-critical hover:bg-critical hover:text-white hover:shadow-critical-ring active:translate-y-px uppercase tracking-wider font-mono",
        outline:
          "border-2 border-outline bg-transparent text-foreground hover:border-primary hover:text-primary hover:bg-primary/5 active:translate-y-px uppercase tracking-wider font-mono",
        secondary:
          "bg-surface text-foreground border-2 border-outline hover:border-outline-strong hover:bg-surface-container-highest active:translate-y-px uppercase tracking-wider font-mono",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/80 font-mono",
        link: "text-primary underline-offset-4 hover:underline font-mono",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
});
Button.displayName = "Button";
export { Button, buttonVariants };
