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

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

type FormErrors = Partial<Record<keyof LoginFormData, string>>;

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isBootstrapping } = useAuth();

  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState("/dashboard");

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/")) {
      setNextPath(next);
    }
  }, []);

  useEffect(() => {
    if (!isBootstrapping && isAuthenticated) {
      router.replace(nextPath);
    }
  }, [isAuthenticated, isBootstrapping, router, nextPath]);

  function validate(data: LoginFormData): FormErrors {
    const parsed = loginSchema.safeParse(data);

    if (parsed.success) {
      return {};
    }

    const errors: FormErrors = {};

    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof LoginFormData;
      if (!errors[key]) {
        errors[key] = issue.message;
      }
    }

    return errors;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors = validate(formData);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      await login(formData);
      router.replace(nextPath);
    } catch (error) {
      setFormError((error as Error).message || "Unable to login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to Malachitex to continue trading and manage your wallet workspace."
      footer={
        <p>
          New to the platform?{" "}
          <Link className="text-emerald-300 hover:text-emerald-200" href="/signup">
            Create an account
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
            onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="trader@example.com"
          />
          <FieldError message={fieldErrors.email} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link className="text-xs text-emerald-300 hover:text-emerald-200" href="/forgot-password">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={formData.password}
            onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Enter your password"
          />
          <FieldError message={fieldErrors.password} />
        </div>

        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
