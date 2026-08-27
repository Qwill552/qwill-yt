import { createFileRoute } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { QueueApp } from "@/components/queue-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <ThemeProvider>
      <QueueApp />
    </ThemeProvider>
  );
}
