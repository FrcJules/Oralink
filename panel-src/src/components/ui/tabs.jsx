import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../../lib/utils.js";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex items-center gap-1 rounded-lg p-1 lb-text-muted bg-[var(--secondary-background-color)]",
        "overflow-x-auto scrollbar-none",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        "data-[state=active]:bg-[var(--card-background-color)] data-[state=active]:text-[var(--lb-brand)] data-[state=active]:shadow-sm",
        "hover:text-[var(--primary-text-color)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content className={cn("mt-4 focus-visible:outline-none", className)} {...props} />;
}
