"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EntityForm, type Field, type FormAction } from "./entity-form";

export function FormDialog({
  title,
  description,
  trigger,
  triggerVariant = "default",
  triggerSize = "default",
  action,
  fields,
  hidden,
  submitLabel,
  columns,
}: {
  title: string;
  description?: string;
  trigger: React.ReactNode;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary" | "link";
  triggerSize?: "default" | "sm" | "lg" | "icon";
  action: FormAction;
  fields: Field[];
  hidden?: Record<string, string>;
  submitLabel?: string;
  columns?: 1 | 2;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className={triggerSize === "default" ? "h-10" : undefined}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <EntityForm action={action} fields={fields} hidden={hidden} submitLabel={submitLabel} onDone={() => setOpen(false)} columns={columns} />
      </DialogContent>
    </Dialog>
  );
}
