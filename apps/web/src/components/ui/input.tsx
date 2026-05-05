import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.ComponentPropsWithoutRef<"input">;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm text-zinc-100 shadow-sm outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-blue-600",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
