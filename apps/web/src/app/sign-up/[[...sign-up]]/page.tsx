import { SignUp } from "@clerk/nextjs";

import { AuthShell } from "@/components/portfolio/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create an account"
      description="You need one to run the agents that connect to your own accounts and data."
    >
      <SignUp />
    </AuthShell>
  );
}
