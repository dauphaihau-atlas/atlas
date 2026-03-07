import { cn } from "./lib/utils"

interface ProgressProps {
  value: number
  className?: string
}

/**
 * Simple progress bar: gray track, primary fill.
 */
export function Progress({ value, className }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-border",
        className
      )}
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}
