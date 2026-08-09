import { requireLibrarian } from "@/lib/dal";

import { CounterClient } from "./counter-client";

export const metadata = { title: "Counter" };

export default async function CounterPage() {
  await requireLibrarian();
  return <CounterClient />;
}
