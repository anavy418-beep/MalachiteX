"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { AuthShell, FieldError } from "@/components/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { resolveApiRequestUrl } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const DEMO_LOGIN = {
  email: process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "demo@xorviqa.com",
  password: process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "Demo@123456",
};

type LoginFormData = z.infer<typeof loginSchema>;

type FormErrors = Partial<Record<keyof LoginFormData, string>>;
type ApiClientError = Error & {
  status?: number;
  url?: string;
  rawMessage?: string;
  responseBody?: unknown;
};

export const dynamic = "force-dynamic";

function resolveLoginErrorMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const trimmed = rawMessage.trim();
  const meta = error as ApiClientError;

  if (meta.status === 401 || /invalid credentials|incorrect|wrong password/i.test(trimmed)) {
    return "Invalid email or password.";
  }

  if (meta.status === 429 || /too many|rate limit/i.test(trimmed)) {
    return "Too many sign-in attempts. Please wait a moment and try again.";
  }

  if (
    meta.status === 0 ||
    /failed to fetch|networkerror|load failed|timeout|cors|network request failed|fetch failed/i.test(trimmed)
  ) {
    return "Could not connect to the server. Please try again.";
  }

  if (!trimmed) {
    return "We could not sign you in. Please check the details and try again.";
  }

  return trimmed.length > 180 ? "We could not sign you in. Please check the details and try again." : trimmed;
}

function logLoginSubmitError(error: unknown) {
  const meta = error as ApiClientError;
  const resolvedApiUrl = meta.url ?? resolveApiRequestUrl("/auth/login");
  const fallbackMessage = error instanceof Error ? error.message : String(error ?? "");

  console.error("[auth-login] Sign-in request failed", {
    status: typeof meta.status === "number" ? meta.status : null,
    responseMessage: meta.rawMessage ?? fallbackMessage,
    responseBody: meta.responseBody ?? null,
    resolvedApiUrl,
  });
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isBootstrapping } = useAuth();

  function resolveNextPath() {
    if (typeof window === "undefined") return "/";
    const requestedNext = new URLSearchParams(window.location.search).get("next");
    if (requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")) {
      return requestedNext;
    }
    return "/";
  }

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
      router.replace(resolveNextPath());
      router.refresh();
    }
  }, [isAuthenticated, isBootstrapping, router]);

  useEffect(() => {
    const shouldAutoDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
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
      toast.success("Signed in successfully.");
      router.replace(resolveNextPath());
      router.refresh();
    } catch (error) {
      logLoginSubmitError(error);
      setFormError(resolveLoginErrorMessage(error));
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
      toast.success("Demo account signed in.");
      router.replace(resolveNextPath());
      router.refresh();
    } catch (error) {
      logLoginSubmitError(error);
      setFormData(DEMO_LOGIN);
      const resolved = resolveLoginErrorMessage(error);
      setFormError(
        /invalid email or password/i.test(resolved)
          ? "Demo login failed. Please confirm demo credentials are seeded on the API."
          : resolved,
      );
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to Xorviqa to continue trading and manage your wallet workspace."
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

