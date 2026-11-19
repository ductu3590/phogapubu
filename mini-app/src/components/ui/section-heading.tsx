// Tiêu đề nhóm món (Stitch m06): vạch trái màu chủ đạo, chữ in hoa, số món bên phải.
// Theme garden: tên mục viết Fraunces 24 thường (không in hoa — dấu tiếng Việt in hoa khó đọc).
export default function SectionHeading({ title, count, id }: { title: string; count?: number; id?: string }) {
  return (
    <div id={id} className="flex items-center gap-2 px-4 pb-2 pt-5 garden:items-baseline garden:px-5 garden:pb-1 garden:pt-[18px]">
      <span className="h-4 w-1 shrink-0 rounded-full bg-primary garden:hidden" aria-hidden />
      <h2 className="g-display min-w-0 flex-1 truncate text-small-m font-bold uppercase tracking-wide text-text-primary garden:text-[24px] garden:normal-case garden:leading-tight garden:tracking-normal">{title}</h2>
      {count !== undefined && <span className="shrink-0 text-xxsmall text-text-secondary garden:text-[13px]">{count} món</span>}
    </div>
  );
}
