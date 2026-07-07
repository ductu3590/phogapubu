// Markdown renderer tối giản cho Điều khoản sử dụng — KHÔNG dùng thư viện ngoài,
// KHÔNG dùng dangerouslySetInnerHTML (React tự escape → an toàn XSS).
// Cú pháp hỗ trợ (đủ cho nhu cầu điều khoản): # / ## tiêu đề, - hoặc * bullet,
// **in đậm**, [chữ](url), đoạn văn. Cú pháp lạ → render như văn bản thường.
import { ReactNode } from "react";
import { openWebview } from "zmp-sdk";

// Parse inline: **đậm** và [text](url). Trả về mảng ReactNode.
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^\s)]+)\)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(text.slice(lastIndex, m.index));
    }
    if (m[1] !== undefined) {
      // **đậm**
      nodes.push(
        <strong key={`${keyBase}-b-${i}`} className="font-semibold text-text-primary">
          {m[1]}
        </strong>,
      );
    } else {
      // [text](url)
      const label = m[2];
      const url = m[3];
      const isHttp = /^https?:\/\//i.test(url);
      nodes.push(
        <button
          key={`${keyBase}-l-${i}`}
          onClick={() => {
            if (isHttp) void openWebview({ url });
          }}
          className="text-primary underline"
        >
          {label}
        </button>,
      );
    }
    lastIndex = re.lastIndex;
    i += 1;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

// Chuyển Markdown nhẹ thành React elements.
export function renderMarkdown(src: string): ReactNode {
  const lines = (src ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const items = listBuffer;
    listBuffer = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="my-1.5 list-disc space-y-1 pl-5">
        {items.map((it, idx) => (
          <li key={idx} className="text-small text-text-secondary">
            {renderInline(it, `li-${key}-${idx}`)}
          </li>
        ))}
      </ul>,
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      listBuffer.push(bullet[1]);
      continue;
    }
    flushList();
    if (line.trim() === "") {
      continue;
    }
    if (/^##\s+/.test(line)) {
      blocks.push(
        <h3 key={`h3-${key++}`} className="mb-1 mt-2.5 text-small-m font-semibold text-text-primary">
          {renderInline(line.replace(/^##\s+/, ""), `h3-${key}`)}
        </h3>,
      );
    } else if (/^#\s+/.test(line)) {
      blocks.push(
        <h2 key={`h2-${key++}`} className="mb-1 mt-3 text-medium-m font-bold text-text-primary first:mt-0">
          {renderInline(line.replace(/^#\s+/, ""), `h2-${key}`)}
        </h2>,
      );
    } else {
      blocks.push(
        <p key={`p-${key++}`} className="my-1.5 text-small text-text-secondary">
          {renderInline(line, `p-${key}`)}
        </p>,
      );
    }
  }
  flushList();

  return <div>{blocks}</div>;
}
