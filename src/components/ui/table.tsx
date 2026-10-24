import { cx } from "./styles";

// Table grammar on the new tokens. A dense table has nowhere to go at 390px,
// so callers hide secondary columns below `sm` (className="hidden sm:table-cell")
// rather than letting the table scroll sideways.

export function Table({ children, className = "", caption }: { children: React.ReactNode; className?: string; caption?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-xl border border-line-soft bg-surface", className)}>
      <table className="w-full text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="text-[12.5px] text-ink-faint">
      <tr className="border-b border-line-soft">{children}</tr>
    </thead>
  );
}

export function TableHeader({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={cx("px-4 py-3 font-medium", className)}>
      {children}
    </th>
  );
}

export function TableRow({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <tr style={style} className={cx("border-t border-line-soft first:border-t-0 transition-colors hover:bg-surface-2/60", className)}>
      {children}
    </tr>
  );
}

export function TableCell({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={cx("px-4 py-3 align-middle", className)}>{children}</td>;
}
