import { LoginForm } from "@/components/auth/login-form";
import { isSignupEnabled } from "@/lib/signup";

export default async function LoginPage(props: PageProps<"/auth/login">) {
  const searchParams = await props.searchParams;
  const initialError =
    searchParams.error === "reset_link_invalid"
      ? "リンクの有効期限が切れているか、無効です。もう一度パスワード再設定をお試しください"
      : undefined;

  return (
    <LoginForm
      initialError={initialError}
      signupEnabled={isSignupEnabled()}
    />
  );
}
