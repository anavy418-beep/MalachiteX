"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { z } from "zod";
import { AuthShell, FieldError } from "@/components/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { friendlyErrorMessage } from "@/lib/errors";

const resetSchema = z
  .object({
    token: z.string().trim().min(10, "Reset token is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm your password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetFormData = z.infer<typeof resetSchema>;
type FormErrors = Partial<Record<keyof ResetFormData, string>>;

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { resetPassword } = useAuth();

  const [formData, setFormData] = useState<ResetFormData>({
    token: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) {
      setFormData((prev) => ({ ...prev, token }));
    }
  }, []);

  function validate(data: ResetFormData): FormErrors {
    const parsed = resetSchema.safeParse(data);

    if (parsed.success) {
      return {};
    }

    const errors: FormErrors = {};

    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof ResetFormData;
      if (!errors[key]) {
        errors[key] = issue.message;
      }
    }

    return errors;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    const errors = validate(formData);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      await resetPassword({
        token: formData.token,
        password: formData.newPassword,
      });

      setSuccess("Password updated successfully. Redirecting to login...");

      setTimeout(() => {
        router.replace("/login");
      }, 1400);
    } catch (error) {
      setFormError(friendlyErrorMessage(error, "Unable to reset your password right now."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Use your reset token and set a strong new MalachiteX password."
      footer={
        <p>
          Need a new token?{" "}
          <Link className="text-emerald-300 hover:text-emerald-200" href="/forgot-password">
            Request another reset token
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="token">Reset token</Label>
          <Input
            id="token"
            name="token"
            value={formData.token}
            onChange={(event) => setFormData((prev) => ({ ...prev, token: event.target.value }))}
            placeholder="paste reset token"
          />
          <FieldError message={fieldErrors.token} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            value={formData.newPassword}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, newPassword: event.target.value }))
            }
            placeholder="Create a strong password"
          />
          <FieldError message={fieldErrors.newPassword} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, confirmPassword: event.target.value }))
            }
            placeholder="Re-enter new password"
          />
          <FieldError message={fieldErrors.confirmPassword} />
        </div>

        {formError ? <Alert variant="error">{formError}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}

        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Updating password..." : "Reset password"}
        </Button>
      </form>
    </AuthShell>
  );
}

