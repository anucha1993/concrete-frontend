import type { Metadata } from "next";
import "./globals.css";
import ToastContainer from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "Stock Concrete - ระบบจัดการคลังคอนกรีต",
  description: "ระบบจัดการสินค้าคอนกรีตสำเร็จรูป รองรับ Barcode/QR Scanner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
