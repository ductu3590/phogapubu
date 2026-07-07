// Markdown renderer tối giản cho Điều khoản sử dụng — KHÔNG dùng thư viện ngoài,
// KHÔNG dùng dangerouslySetInnerHTML (React tự escape → an toàn XSS).
// Cú pháp hỗ trợ (đủ cho nhu cầu điều khoản): # / ## tiêu đề (ATX), tiêu đề kiểu
// Setext (dòng kế tiếp toàn === → h2, --- → h3), - hoặc * bullet, **in đậm**,
// [chữ](url), đoạn văn. Dòng kẻ ngang lẻ (===, ---, ___) được bỏ qua.
// Cú pháp lạ → render như văn bản thường.
import { ReactNode } from "react";
import { openWebview } from "zmp-sdk";

// Bỏ dấu gạch chéo ngược thoát ký tự (Markdown escape): "1\." → "1.", "\*" → "*"...
function unescapeMd(s: string): string {
  return s.replace(/\\([^\w\s])/g, "$1");
}

// Parse inline: **đậm** và [text](url). Trả về mảng ReactNode.
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^\s)]+)\)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(unescapeMd(text.slice(lastIndex, m.index)));
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
    nodes.push(unescapeMd(text.slice(lastIndex)));
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

  const pushH2 = (text: string) => {
    const k = key++;
    blocks.push(
      <h2 key={`h2-${k}`} className="mb-1 mt-3 text-medium-m font-bold text-text-primary first:mt-0">
        {renderInline(text, `h2-${k}`)}
      </h2>,
    );
  };
  const pushH3 = (text: string) => {
    const k = key++;
    blocks.push(
      <h3 key={`h3-${k}`} className="mb-1 mt-2.5 text-small-m font-semibold text-text-primary">
        {renderInline(text, `h3-${k}`)}
      </h3>,
    );
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\s+$/, "");

    // Bullet: - hoặc * theo sau bởi khoảng trắng
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      listBuffer.push(bullet[1]);
      continue;
    }
    flushList();

    const trimmed = line.trim();
    if (trimmed === "") continue;

    // Dòng kẻ ngang / gạch chân đứng lẻ (===, ---, ___) → bỏ, không in ra
    if (/^(=|-|_){3,}$/.test(trimmed)) continue;

    // Tiêu đề ATX: ## trước, rồi #
    if (/^##\s+/.test(line)) {
      pushH3(line.replace(/^##\s+/, ""));
      continue;
    }
    if (/^#\s+/.test(line)) {
      pushH2(line.replace(/^#\s+/, ""));
      continue;
    }

    // Tiêu đề Setext: dòng kế tiếp toàn === (h2) hoặc --- (h3)
    const next = i + 1 < lines.length ? lines[i + 1].trim() : "";
    if (/^=+$/.test(next) && next.length >= 3) {
      pushH2(trimmed);
      i += 1; // nuốt dòng gạch chân
      continue;
    }
    if (/^-+$/.test(next) && next.length >= 3) {
      pushH3(trimmed);
      i += 1; // nuốt dòng gạch chân
      continue;
    }

    // Đoạn văn
    const k = key++;
    blocks.push(
      <p key={`p-${k}`} className="my-1.5 text-small text-text-secondary">
        {renderInline(line, `p-${k}`)}
      </p>,
    );
  }
  flushList();

  return <div>{blocks}</div>;
}
