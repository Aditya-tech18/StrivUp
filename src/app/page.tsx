import { redirect } from "next/navigation";

// Root route redirects to the feed (authenticated shell).
export default function RootPage() {
  redirect("/feed");
}
