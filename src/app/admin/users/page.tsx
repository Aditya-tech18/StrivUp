/** /admin/users — search accounts and apply account status. */
import { requireAdmin } from "@/lib/auth/requireRole";
import { PageHeader } from "../ui";
import { UsersClient } from "./UsersClient";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { user } = await requireAdmin();
  const { status, q } = await searchParams;
  return (
    <div className="mx-auto measure-console">
      <PageHeader title="Users" subtitle="Search accounts, review reports and apply account status. Every change is logged." />
      <UsersClient currentAdminId={user.id} initialStatus={status ?? ""} initialQuery={q ?? ""} />
    </div>
  );
}
