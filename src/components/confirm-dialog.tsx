"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

// a reusable confirmation sheet. the confirm action is placed on the LEFT and
// cancel on the RIGHT, as required. sharp corners, black & white only. the
// description must clearly name the item being acted on by the caller.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "delete",
  onConfirm,
}: ConfirmProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm rounded-none">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:justify-start">
          {/* confirm — LEFT */}
          <AlertDialogAction
            onClick={onConfirm}
            className="h-8 px-4 text-xs rounded-none bg-foreground text-background hover:bg-foreground/90 font-medium"
          >
            {confirmLabel}
          </AlertDialogAction>
          {/* cancel — RIGHT */}
          <AlertDialogCancel className="h-8 px-4 text-xs rounded-none border bg-background hover:bg-accent">
            cancel
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
