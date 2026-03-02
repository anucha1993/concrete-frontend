export const metadata = {
  title: 'พิมพ์ใบตัดสต๊อก',
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
