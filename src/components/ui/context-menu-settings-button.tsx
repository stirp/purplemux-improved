import { Settings } from "lucide-react"
import { cn } from "@/lib/utils"

export default function ContextMenuSettingsButton({ className, label }: { className?: string; label: string }) {
  return <button
    type="button"
    aria-label={label}
    title={label}
    className={cn("flex shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground", className)}
    onDoubleClick={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom,
      }))
    }}
  ><Settings className="h-3.5 w-3.5" /></button>
}

