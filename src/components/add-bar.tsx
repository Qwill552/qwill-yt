import { type FormEvent, useState } from "react";
import { Link2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PriorityToggle } from "@/components/priority-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Priority } from "@/lib/queue-store";
import { extractVideoId } from "@/lib/youtube";

type AddBarProps = {
  busy: boolean;
  onAdd: (url: string, priority: Priority) => Promise<void>;
};

export function AddBar({ busy, onAdd }: AddBarProps) {
  const [url, setUrl] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [pasting, setPasting] = useState(false);

  async function submit(nextUrl: string) {
    const trimmed = nextUrl.trim();
    if (!trimmed || busy) return;
    await onAdd(trimmed, priority);
    setUrl("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(url);
  }

  async function pasteFromClipboard() {
    if (busy || pasting) return;
    if (!navigator.clipboard?.readText) {
      toast.error("Буфер обмена недоступен в этом браузере");
      return;
    }
    setPasting(true);
    try {
      const pasted = (await navigator.clipboard.readText()).trim();
      if (!pasted) {
        toast.error("Буфер обмена пуст");
        return;
      }
      setUrl(pasted);
      if (extractVideoId(pasted)) {
        await submit(pasted);
      }
    } catch {
      toast.error("Разрешите доступ к буферу обмена");
    } finally {
      setPasting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl bg-surface p-2 shadow-border"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => void pasteFromClipboard()}
            disabled={busy || pasting}
            aria-label="Вставить ссылку из буфера обмена"
            title="Вставить из буфера обмена"
            className="absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-center rounded-l-md text-subtle transition-colors duration-150 hover:text-accent focus-visible:text-accent focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none disabled:opacity-40"
          >
            {pasting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" strokeWidth={2} />
            )}
          </button>
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text");
              if (extractVideoId(pasted)) {
                event.preventDefault();
                setUrl(pasted);
                void submit(pasted);
              }
            }}
            placeholder="Вставьте ссылку на YouTube"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            aria-label="Ссылка на YouTube"
            disabled={busy}
            className="h-12 flex-1 rounded-md bg-bg/60 pl-12"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={busy || !url.trim()}
          className="h-12 shrink-0 rounded-md px-5"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Добавить
        </Button>
      </div>
      <div className="flex flex-col gap-2 px-2 pt-2 pb-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-subtle text-sm">Приоритет новой карточки</p>
        <PriorityToggle value={priority} onChange={setPriority} />
      </div>
    </form>
  );
}
