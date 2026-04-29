import { cn } from "@/shared/lib/cn";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

const Slider = forwardRef<
  HTMLSpanElement,
  ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-container-high">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-surface-container shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus-glow disabled:pointer-events-none disabled:opacity-50 hover:border-[3px]" />
  </SliderPrimitive.Root>
));
Slider.displayName = "Slider";

export { Slider };
