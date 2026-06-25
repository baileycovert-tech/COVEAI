import { loginRoster } from "../lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const roster = loginRoster();
  return <LoginForm roster={roster} next={searchParams.next || "/"} />;
}
