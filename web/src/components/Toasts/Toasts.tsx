import { useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { toastsAtom } from "@/store/gameAtoms";

export default function Toasts() {
  const toasts = useAtomValue(toastsAtom);
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "rounded border bg-card/95 px-3 py-1.5 text-xs",
            toast.level === "info" && "border-accent text-accent",
            toast.level === "warn" && "border-primary text-primary",
            toast.level === "error" && "border-destructive text-destructive",
          )}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
