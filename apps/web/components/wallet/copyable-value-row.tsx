"use client";

import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CopyableValueRowProps {
  value: string;
  copied: boolean;
  onCopy: () => void;
  className?: string;
}

export function CopyableValueRow({ value, copied, onCopy, className }: CopyableValueRowProps) {
  return (
    <div className={className}>
      <p className="break-all font-mono text-sm text-slate-100">{value}</p>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onCopy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
