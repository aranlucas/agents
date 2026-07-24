import { SignIn } from "@clerk/nextjs";

import { AuthShell } from "@/components/portfolio/auth-shell";

export default function SignInPage() {
  return (
    <AuthShell
      title="Sign in to the agent console"
      description="Your agents keep their own sessions, saved lists, and connected accounts."
    >
      <SignIn />
    </AuthShell>
  );
}
