"use client";

import { X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AddressQrModalProps {
  open: boolean;
  onClose: () => void;
  address: string;
  networkLabel: string;
}

export function AddressQrModal({ open, onClose, address, networkLabel }: AddressQrModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <Card className="w-full max-w-sm border-zinc-700 bg-zinc-950">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Deposit QR</CardTitle>
            <CardDescription>{networkLabel}</CardDescription>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 p-0"
            onClick={onClose}
            aria-label="Close QR modal"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="mx-auto w-fit rounded-xl border border-zinc-800 bg-white p-3">
            <QRCodeSVG value={address} size={220} bgColor="#ffffff" fgColor="#0f172a" includeMargin />
          </div>
          <p className="break-all rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 font-mono text-xs text-slate-200">
            {address}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
