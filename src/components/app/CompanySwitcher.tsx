"use client";
export function CompanySwitcher({
  companies,
  currentId,
  action,
}: {
  companies: { id: string; name: string }[];
  currentId: string;
  action: (fd: FormData) => Promise<void>;
}) {
  if (companies.length < 2) return null;
  return (
    <form action={action}>
      <label className="label" htmlFor="company-switch">Компания</label>
      <select id="company-switch" name="companyId" defaultValue={currentId} className="input py-2" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </form>
  );
}
