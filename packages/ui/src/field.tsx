"use client"

import * as React from "react"

import { cn } from "./lib/utils"

type FieldContextValue = {
  invalid?: boolean
}

const FieldContext = React.createContext<FieldContextValue | null>(null)

function useFieldContext() {
  return React.useContext(FieldContext)
}

type FieldProps = React.ComponentProps<"div"> & {
  orientation?: "vertical" | "horizontal" | "responsive"
  "data-invalid"?: "" | boolean
}

const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, orientation = "vertical", "data-invalid": dataInvalid, ...props }, ref) => {
    const invalid = dataInvalid === "" || dataInvalid === true
    return (
      <FieldContext.Provider value={{ invalid }}>
        <div
          ref={ref}
          role="group"
          data-slot="field"
          data-invalid={invalid ? "" : undefined}
          data-orientation={orientation}
          className={cn(
            "flex gap-2 data-[orientation=vertical]:flex-col data-[orientation=vertical]:gap-2 data-[orientation=horizontal]:flex-row data-[orientation=horizontal]:items-center data-[orientation=responsive]:flex-col data-[orientation=responsive]:gap-2 @container/field-group/data-[orientation=responsive]:flex-row @container/field-group/data-[orientation=responsive]:items-center",
            className
          )}
          {...props}
        />
      </FieldContext.Provider>
    )
  }
)
Field.displayName = "Field"

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  htmlFor,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="field-label"
      htmlFor={htmlFor}
      className={cn("text-sm font-medium leading-none", className)}
      {...props}
    />
  )
}

function FieldDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

type FieldErrorProps = React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}

function FieldError({ className, errors, children, ...props }: FieldErrorProps) {
  const messages =
    errors != null && errors.length > 0
      ? errors
          .filter((e): e is { message?: string } => e != null && e.message != null)
          .map((e) => e.message as string)
      : null

  if (messages == null || messages.length === 0) {
    if (children == null) return null
    return (
      <div
        data-slot="field-error"
        role="alert"
        className={cn("text-destructive text-sm", className)}
        {...props}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      data-slot="field-error"
      role="alert"
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {messages.length === 1 ? (
        messages[0]
      ) : (
        <ul className="list-disc pl-4">
          {messages.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
  useFieldContext,
}
