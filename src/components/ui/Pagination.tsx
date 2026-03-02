interface PaginationProps {
  currentPage: number;
  lastPage: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, lastPage, total, onPageChange }: PaginationProps) {
  if (lastPage <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(lastPage, currentPage + 2);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-gray-500">
        ทั้งหมด <span className="font-medium">{total}</span> รายการ | หน้า{' '}
        <span className="font-medium">{currentPage}</span> จาก{' '}
        <span className="font-medium">{lastPage}</span>
      </p>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-100 disabled:cursor-not-allowed"
        >
          ← ก่อนหน้า
        </button>
        {start > 1 && (
          <>
            <button onClick={() => onPageChange(1)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-100">1</button>
            {start > 2 && <span className="px-2 py-1.5 text-gray-400">…</span>}
          </>
        )}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              p === currentPage ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'
            }`}
          >
            {p}
          </button>
        ))}
        {end < lastPage && (
          <>
            {end < lastPage - 1 && <span className="px-2 py-1.5 text-gray-400">…</span>}
            <button onClick={() => onPageChange(lastPage)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-100">{lastPage}</button>
          </>
        )}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= lastPage}
          className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-100 disabled:cursor-not-allowed"
        >
          ถัดไป →
        </button>
      </div>
    </div>
  );
}
