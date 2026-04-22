"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { z } from "zod";
import { AuthShell, FieldError } from "@/components/auth";
import { friendlyErrorMessage } from "@/lib/errors";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { apiHealthService } from "@/services/api-health.service";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const DEMO_LOGIN = {
  email: process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "alice@p2p.local",
  password: process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "Password@123",
};

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
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoAttempted, setDemoAttempted] = useState(false);

  useEffect(() => {
    if (!isBootstrapping && isAuthenticated) {
      router.replace("/");
      router.refresh();
    }
  }, [isAuthenticated, isBootstrapping, router]);

  useEffect(() => {
    const shouldAutoDemo = new URLSearchParams(window.location.search).get("demo") === "1";
    if (!shouldAutoDemo || demoAttempted || isAuthenticated || isBootstrapping) return;

    setDemoAttempted(true);
    void handleDemoLogin();
  }, [demoAttempted, isAuthenticated, isBootstrapping]);

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
      router.replace("/");
      router.refresh();
    } catch (error) {
      setFormError(friendlyErrorMessage(error, "We could not sign you in. Please check the details and try again."));
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin() {
    setDemoLoading(true);
    setFormError(null);
    setFieldErrors({});

    try {
      await login(DEMO_LOGIN);
      router.replace("/");
      router.refresh();
    } catch (error) {
      setFormData(DEMO_LOGIN);
      const reachability = await apiHealthService.checkReachability();
      if (!reachability.reachable) {
        setFormError("Live account features are temporarily unavailable. Public preview remains available.");
      } else {
        setFormError(
          friendlyErrorMessage(
            error,
            "Demo login failed. Please confirm demo credentials are seeded on the API.",
          ),
        );
      }
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to MalachiteX to continue trading and manage your wallet workspace."
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

        <Button
          className="w-full gap-2"
          type="button"
          variant="outline"
          disabled={loading || demoLoading}
          onClick={handleDemoLogin}
        >
          <Sparkles className="h-4 w-4" />
          {demoLoading ? "Opening demo..." : "Try Demo Account"}
        </Button>

        <Button className="w-full" type="submit" disabled={loading || demoLoading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}

