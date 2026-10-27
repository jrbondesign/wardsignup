export type CreatorRow = {
  email: string;
  wardName?: string | null;
  organization?: string | null;
  calling?: string | null;
  events: number;
  sessions: number;
  signups: number;
};

function TextCell({ value, testId }: { value: string | null | undefined; testId: string }) {
  return (
    <td className="py-2.5 pl-3 text-[13px] truncate overflow-hidden" data-testid={testId} title={value ?? undefined}>
      {value ? <span className="text-[#0D2B35]">{value}</span> : <span className="text-[#9BB7C4]">Not set</span>}
    </td>
  );
}

/**
 * Creators table on /admin/metrics: one row per event owner email, with Ward/Unit,
 * Organization and Calling side by side in that order.
 */
export function CreatorsTable({
  creators,
  callingsAvailable = true,
  wardsAvailable = true,
}: {
  creators: CreatorRow[];
  /** False when the server could not read callings (calling migration not applied yet). */
  callingsAvailable?: boolean;
  /** False when the server could not read Ward/Unit (ward migration not applied yet). */
  wardsAvailable?: boolean;
}) {
  if (creators.length === 0) {
    return <p className="text-sm text-[#5A8399]">No creators yet.</p>;
  }
  return (
    <>
      {(!callingsAvailable || !wardsAvailable) && (
        <p className="text-[12px] text-[#5A8399] mb-3" data-testid="identity-unavailable">
          Ward/Unit and Calling will fill in once the database update for them is applied.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed">
          <thead>
            <tr className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] border-b border-[rgba(14,150,176,0.10)]">
              <th className="text-left pb-3 font-semibold w-[24%]">Email</th>
              <th className="text-left pb-3 pl-3 font-semibold">Ward/Unit</th>
              <th className="text-left pb-3 pl-3 font-semibold">Organization</th>
              <th className="text-left pb-3 pl-3 font-semibold">Calling</th>
              <th className="text-right pb-3 pl-3 font-semibold w-16">Events</th>
              <th className="text-right pb-3 pl-3 font-semibold w-14">Sess.</th>
              <th className="text-right pb-3 pl-3 font-semibold w-20">Signups</th>
            </tr>
          </thead>
          <tbody>
            {creators.map((c) => (
              <tr key={c.email} data-testid="creator-row" className="border-b border-[rgba(14,150,176,0.06)] last:border-0">
                <td className="py-2.5 text-[13px] text-[#0D2B35] truncate overflow-hidden" title={c.email}>{c.email}</td>
                <TextCell value={c.wardName} testId="creator-ward" />
                <TextCell value={c.organization} testId="creator-organization" />
                <TextCell value={c.calling} testId="creator-calling" />
                <td className="py-2.5 pl-3 text-right text-[13px] font-semibold text-[#0D2B35] tabular-nums whitespace-nowrap">{c.events}</td>
                <td className="py-2.5 pl-3 text-right text-[13px] text-[#5A8399] tabular-nums whitespace-nowrap">{c.sessions}</td>
                <td className="py-2.5 pl-3 text-right text-[13px] font-semibold text-[#0E96B0] tabular-nums whitespace-nowrap">{c.signups}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
