import { useTenant } from "@/hooks/useTenant";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface TenantLogoProps {
  className?: string;
  showName?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-9 w-9",
  lg: "h-12 w-12",
};

const textSizeClasses = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-xl",
};

export function TenantLogo({ className, showName = true, size = "md" }: TenantLogoProps) {
  const { tenant, loading } = useTenant();

  if (loading) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className={cn("rounded-lg bg-sidebar-primary/20 animate-pulse", sizeClasses[size])} />
        {showName && <div className="h-5 w-24 bg-sidebar-primary/20 rounded animate-pulse" />}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {tenant?.logo_url ? (
        <img 
          src={tenant.logo_url} 
          alt={`${tenant.name} Logo`}
          className={cn("rounded-lg object-contain", sizeClasses[size])}
        />
      ) : (
        <div className={cn("rounded-lg bg-sidebar-primary flex items-center justify-center", sizeClasses[size])}>
          <Zap className={cn("text-sidebar-primary-foreground", size === "sm" ? "h-4 w-4" : size === "md" ? "h-5 w-5" : "h-7 w-7")} />
        </div>
      )}
      {showName && (
        <span className={cn("font-display font-bold text-sidebar-foreground", textSizeClasses[size])}>
          {tenant?.name || "Energy Hub"}
        </span>
      )}
    </div>
  );
}
