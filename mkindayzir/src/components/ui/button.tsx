import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-primary focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default: "metallic-gradient-primary text-on-primary border-2 border-mechanical-grey hover:brightness-110 active:translate-y-px active:border-mechanical-grey-light",
        destructive:
          "bg-destructive text-destructive-foreground border-2 border-mechanical-grey hover:brightness-110 active:translate-y-px",
        outline:
          "border-2 border-outline bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground active:translate-y-px",
        secondary:
          "bg-secondary text-on-secondary border-2 border-mechanical-grey hover:brightness-110 active:translate-y-px",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 chamfer-corners-sm",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5 chamfer-corners-sm",
        lg: "h-10 px-6 has-[>svg]:px-4 chamfer-corners",
        icon: "size-9 chamfer-corners-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
