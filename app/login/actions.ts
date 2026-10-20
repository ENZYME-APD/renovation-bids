"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NEXT_COOKIE } from "@/lib/supabase/proxy";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

const validEmail = (fd: FormData) => {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email) ? email : null;
};

/** Where to go after signing in: the page that sent the user to /login, else the dashboard. */
async function nextPath() {
  const next = (await cookies()).get(NEXT_COOKIE)?.value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

const friendly = (msg: string) =>
  /rate limit/i.test(msg)
    ? "Too many emails sent in the last hour. Sign in with Google or your password, or try again later."
    : /invalid login credentials/i.test(msg)
      ? "Wrong email or password. If you haven’t set a password yet, use Google or an email link, then set one in Settings → Profile."
      : /provider is not enabled|unsupported provider/i.test(msg)
        ? "Google sign-in isn’t switched on yet. Use your password or an email link."
        : msg;

export async function signInWithPassword(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = validEmail(fd);
  const password = String(fd.get("password") ?? "");
  if (!email) return { status: "error", message: "Enter a valid email address." };
  if (!password) return { status: "error", message: "Enter your password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", message: friendly(error.message) };
  const target = await nextPath();
  (await cookies()).delete(NEXT_COOKIE);
  redirect(target);
}

export async function sendMagicLink(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = validEmail(fd);
  if (!email) return { status: "error", message: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${await siteOrigin()}/auth/callback` } });
  if (error) return { status: "error", message: friendly(error.message) };
  return { status: "sent", message: `Check ${email} for a sign-in link.` };
}

/** Forgot password: an email link that signs you in and opens Settings → Profile to set a new one. */
export async function sendPasswordReset(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = validEmail(fd);
  if (!email) return { status: "error", message: "Enter your email first." };
  const supabase = await createClient();
  (await cookies()).set(NEXT_COOKIE, "/settings?tab=profile&password=1", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 });
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteOrigin()}/auth/callback` });
  if (error) return { status: "error", message: friendly(error.message) };
  return { status: "sent", message: `Check ${email} for a link to set a new password.` };
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteOrigin()}/auth/callback`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(friendly(error?.message ?? "Google sign-in failed."))}`);
  redirect(data.url);
}
