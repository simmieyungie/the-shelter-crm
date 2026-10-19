import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-2">
        {back && (
          <Link
            href={back}
            aria-label="Back"
            className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-muted"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight md:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-subtle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
