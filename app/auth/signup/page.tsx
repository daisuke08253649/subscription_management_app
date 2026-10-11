import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { isSignupEnabled } from "@/lib/signup";

// SIGNUP_ENABLEDを実行時に評価する（ビルド時に静的化されないようにする）
export const dynamic = "force-dynamic";

export default function SignupPage() {
  if (!isSignupEnabled()) {
    redirect("/auth/login");
  }
  return <SignupForm />;
}
