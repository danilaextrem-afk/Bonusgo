import { MyQr } from "@/components/app/MyQr";
import { qrData } from "@/components/app/qr";
import { PageHeader } from "@/components/app/ui";
import { requireUser } from "@/server/auth/session";
import { issueCustomerToken } from "@/server/loyalty/service";
import { refreshQrAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MyQrPage() {
  const user = await requireUser();
  const { token, expiresAt } = await issueCustomerToken(user.id);
  return (
    <>
      <PageHeader title="Мой QR" subtitle="Один код для всех ваших карт" />
      <div className="card">
        <MyQr initial={{ qr: qrData(`BG1.${token}`), expiresAt: new Date(expiresAt).getTime() }} refresh={refreshQrAction} />
      </div>
    </>
  );
}
