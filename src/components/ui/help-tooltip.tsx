import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HelpTooltipProps {
  text: string;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  iconSize?: number;
}

export function HelpTooltip({ text, className, side = "top", iconSize = 14 }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-help",
            className
          )}
        >
          <HelpCircle style={{ width: iconSize, height: iconSize }} />
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[280px] text-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
