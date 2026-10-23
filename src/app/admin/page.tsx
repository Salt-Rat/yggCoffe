import { AdminPanel } from "@/components/admin-panel";
export const metadata = {
  title: "Administração",
  robots: { index: false, follow: false },
};
export default function Admin() {
  return <AdminPanel />;
}
