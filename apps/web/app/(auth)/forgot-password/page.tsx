"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { z } from "zod";
import { AuthShell, FieldError } from "@/components/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { friendlyErrorMessage } from "@/lib/errors";

const forgotSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();

  const [formData, setFormData] = useState<ForgotFormData>({ email: "" });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setFormError(null);
    setSuccessMessage(null);
    setDevToken(undefined);

    const parsed = forgotSchema.safeParse(formData);

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }

    setLoading(true);

    try {
      const result = await forgotPassword(formData.email);
      setSuccessMessage("If your account exists, reset instructions have been generated.");
      setDevToken(result.resetToken);
    } catch (error) {
      setFormError(friendlyErrorMessage(error, "Unable to process your reset request right now."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Recover account access"
      subtitle="Request a password reset token to recover your Xorviqa account."
      footer={
        <p>
          Remembered your password?{" "}
          <Link className="text-emerald-300 hover:text-emerald-200" href="/login">
            Back to login
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={(event) => setFormData({ email: event.target.value })}
            placeholder="trader@example.com"
          />
          <FieldError message={fieldError ?? undefined} />
        </div>

        {formError ? <Alert variant="error">{formError}</Alert> : null}
        {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
        {devToken ? (
          <Alert variant="info">
            Dev token: <span className="break-all font-mono text-xs">{devToken}</span>
          </Alert>
        ) : null}

        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Send reset token"}
        </Button>
      </form>
    </AuthShell>
  );
}

