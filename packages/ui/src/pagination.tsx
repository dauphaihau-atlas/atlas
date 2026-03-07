import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "./lib/utils"

function Pagination({
  className,
  ...props
}: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "flex flex-row items-center gap-1",
        className
      )}
      {...props}
    />
  )
}

function PaginationItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return <li className={cn("", className)} {...props} />
}

type PaginationLinkProps = (
  | (Omit<React.ComponentProps<"a">, "href"> & { href: string })
  | (Omit<React.ComponentProps<"button">, "onClick"> & {
      href?: undefined
      onClick?: () => void
    })
) & {
  isActive?: boolean
  className?: string
}

function PaginationLink({
  className,
  isActive,
  ...props
}: PaginationLinkProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"

  if (props.href !== undefined) {
    return (
      <a
        aria-current={isActive ? "page" : undefined}
        className={cn(
          base,
          isActive && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
          className
        )}
        {...(props as React.ComponentProps<"a">)}
      />
    )
  }
  return (
    <button
      type="button"
      aria-current={isActive ? "page" : undefined}
      className={cn(
        base,
        isActive && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        className
      )}
      {...(props as React.ComponentProps<"button">)}
    />
  )
}

function PaginationPrevious({
  className,
  text = "Previous",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      className={cn("gap-1 pl-2.5 pr-3", className)}
      {...props}
    >
      <ChevronLeft className="size-4" />
      <span className="hidden sm:inline">{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = "Next",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      className={cn("gap-1 pl-3 pr-2.5", className)}
      {...props}
    >
      <span className="hidden sm:inline">{text}</span>
      <ChevronRight className="size-4" />
    </PaginationLink>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
