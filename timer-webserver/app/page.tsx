import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PumpControl from "./components/PumpControl";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const username = session.user.name ?? "";
  const role     = (session.user as any).role as "admin" | "user";

  return (
    <PumpControl
      username={username}
      role={role}
    />
  );
}