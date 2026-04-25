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

const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
    email: z.string().trim().email("Enter a valid email"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must include at least one uppercase letter")
      .regex(/[0-9]/, "Password must include at least one number"),
    confirmPassword: z.string().min(8, "Confirm your password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof signupSchema>;
type FormErrors = Partial<Record<keyof SignupFormData, string>>;

const SIGNUP_NETWORK_ERROR_MESSAGE = "Could not connect to the server. Please try again.";
const SIGNUP_RETRY_DELAY_MS = 1_200;
const SIGNUP_NETWORK_RETRY_ATTEMPTS = 2;

type ApiClientError = Error & {
  status?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiClientErrorMeta(error: unknown) {
  return error as ApiClientError;
}

function isNetworkFailure(error: unknown, message: string) {
  const meta = getApiClientErrorMeta(error);
  if (typeof meta.status === "number" && meta.status > 0) {
    return false;
  }

  return /failed to fetch|networkerror|load failed|timeout|unreachable|cors origin blocked|health check timeout|network request failed|fetch failed/i.test(
    message,
  );
}

function resolveSignupSubmitErrorMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim();

  if (/already in use|already exists|conflict|409/i.test(message)) {
    return "An account with this email already exists. Please sign in instead.";
  }

  if (/password|weak/i.test(message)) {
    return "Please use a stronger password (at least 8 characters, one uppercase, and one number).";
  }

  if (/validation|invalid|bad request|400/i.test(message)) {
    return "Please review your details and try again.";
  }

  if (!message) {
    return "Unable to create your account right now.";
  }

  return message.length > 180
    ? "Unable to create your account right now."
    : message;
}

export default function SignupPage() {
  const router = useRouter();
  const { signup, isAuthenticated, isBootstrapping } = useAuth();

  const [formData, setFormData] = useState<SignupFormData>({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isBootstrapping && isAuthenticated) {
      router.replace("/");
      router.refresh();
    }
  }, [isAuthenticated, isBootstrapping, router]);

  useEffect(() => {
    // Always start from a clean availability state on mount.
    setSubmitError(null);
  }, []);

  function validate(data: SignupFormData): FormErrors {
    const parsed = signupSchema.safeParse(data);

    if (parsed.success) {
      return {};
    }

    const errors: FormErrors = {};

    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof SignupFormData;
      if (!errors[key]) {
        errors[key] = issue.message;
      }
    }

    return errors;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setSubmitError(null);

    const errors = validate(formData);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      const submitPayload = {
        fullName: formData.fullName,
        email: formData.email,
        password: formData.password,
      };

      let submitFailure: unknown = null;
      let submitRawMessage = "";
      let lastErrorType: "network" | "backend" | "unknown" = "unknown";

      for (let attempt = 1; attempt <= SIGNUP_NETWORK_RETRY_ATTEMPTS; attempt += 1) {
        try {
          await signup(submitPayload);
          setSubmitError(null);
          router.replace("/");
          router.refresh();
          return;
        } catch (error) {
          submitFailure = error;
          submitRawMessage = error instanceof Error ? error.message : String(error ?? "");
          const networkFailure = isNetworkFailure(error, submitRawMessage);
          lastErrorType = networkFailure ? "network" : "backend";

          if (!networkFailure || attempt === SIGNUP_NETWORK_RETRY_ATTEMPTS) {
            break;
          }

          await sleep(SIGNUP_RETRY_DELAY_MS * attempt);
        }
      }

      if (!submitFailure) {
        setSubmitError("Unable to create your account right now.");
        return;
      }

      if (lastErrorType === "network") {
        setSubmitError(SIGNUP_NETWORK_ERROR_MESSAGE);
        return;
      }
      setSubmitError(resolveSignupSubmitErrorMessage(submitFailure));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your Xorviqa account"
      subtitle="Start with secure custody, wallet visibility, and P2P-ready workflows."
      footer={
        <p>
          Already registered?{" "}
          <Link className="text-emerald-300 hover:text-emerald-200" href="/login">
            Sign in
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            value={formData.fullName}
            onChange={(event) => setFormData((prev) => ({ ...prev, fullName: event.target.value }))}
            placeholder="Aarav Sharma"
          />
          <FieldError message={fieldErrors.fullName} />
        </div>

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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={formData.password}
            onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Use at least 8 characters"
          />
          <FieldError message={fieldErrors.password} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, confirmPassword: event.target.value }))
            }
            placeholder="Re-enter your password"
          />
          <FieldError message={fieldErrors.confirmPassword} />
        </div>

        {submitError ? <Alert variant="error">{submitError}</Alert> : null}

        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}

