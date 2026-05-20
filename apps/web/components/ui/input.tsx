import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

const largeFormInputSurfaceClass =
  "rounded-[14px] bg-background border border-[color:var(--border)]"
const largeFormInputContentInsetClass = "pl-6"
const largeFormInputPrefixedContentInsetClass = "pl-14"
const largeFormInputPrefixOffsetClass = "left-6"
const largeFormInputInlineInsetClass = "px-6"
const largeFormInputInlineGapClass = "gap-4"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-[12px] border border-[color:var(--border)] bg-transparent px-3 py-1 text-sm transition-colors outline-none placeholder:text-[color:var(--text-fade)] focus-visible:border-[color:var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export {
  Input,
  largeFormInputContentInsetClass,
  largeFormInputInlineGapClass,
  largeFormInputInlineInsetClass,
  largeFormInputPrefixOffsetClass,
  largeFormInputPrefixedContentInsetClass,
  largeFormInputSurfaceClass,
}
