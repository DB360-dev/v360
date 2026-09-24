import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { useMarkMessagesRead, useOrderMessages, useSendMessage } from "@/hooks/useData";
import { fmtDateTime } from "@/lib/format";
import { displayActor, neutralize } from "@/lib/neutral";
import { Spinner, ErrorState } from "@/components/ui/States";
import type { OrderMessage } from "@/lib/types";

interface Props { orderId: string }

function Bubble({ msg, brandName }: { msg: OrderMessage; brandName: string }) {
  const isOwn = msg.sender_type === "brand";
  return (
    <div className={`flex flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${
          isOwn
            ? "rounded-br-sm bg-primary text-primary-fg"
            : "rounded-bl-sm bg-sunken text-ink border border-line"
        }`}
      >
        {neutralize(msg.body)}
      </div>
      <div className="px-1 text-[11.5px] text-faint">
        {isOwn ? brandName : displayActor(msg.sender_label, brandName)} · {fmtDateTime(msg.created_at)}
      </div>
    </div>
  );
}

export function OrderMessages({ orderId }: Props) {
  const { brand } = useActiveBrand();
  const q = useOrderMessages(brand.id, orderId);
  const send = useSendMessage(brand.id, orderId);
  const markRead = useMarkMessagesRead(brand.id, orderId);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [q.data?.length]);

  // Mark admin messages as read when tab opens
  useEffect(() => {
    if (q.data && q.data.some((m) => m.sender_type === "admin" && !m.read_by_brand)) {
      markRead.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const submit = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    send.mutate(body, { onSuccess: () => setText("") });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  if (q.isLoading) return <Spinner label="Loading messages" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const messages = q.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Message list */}
      <div className="flex max-h-[420px] min-h-[200px] flex-col gap-3 overflow-y-auto rounded-lg border border-line bg-surface p-4">
        {messages.length === 0 ? (
          <p className="m-auto text-[13.5px] text-muted">
            No messages yet. Send a message to our team about this order.
          </p>
        ) : (
          messages.map((msg) => (
            <Bubble key={msg.id} msg={msg} brandName={brand.name} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2">
        <textarea
          className="input min-h-[68px] flex-1 resize-none text-[13.5px]"
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={send.isPending}
          rows={3}
        />
        <button
          onClick={submit}
          disabled={!text.trim() || send.isPending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="text-[12px] text-faint">
        Messages are visible to our operations team only.
      </p>
    </div>
  );
}
