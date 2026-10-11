/**
 * 新規登録の有効/無効。"false"のときのみ無効、未設定は有効。
 * 本番でSupabase側のサインアップを無効化した後は、画面上の導線も
 * 合わせて消すためSIGNUP_ENABLED=falseを設定する（サーバーのみ）
 */
export function isSignupEnabled(): boolean {
  return process.env.SIGNUP_ENABLED !== "false";
}
