"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Message } from "@/types";

function formatTime(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-muted overflow-x-auto rounded-md p-3 text-sm">
      <code>{children as React.ReactNode}</code>
    </pre>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "USER";
  const isSystem = message.role === "SYSTEM";
  const isTool = message.role === "TOOL";

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-muted-foreground bg-muted rounded-full px-3 py-1 text-xs">
          {message.content}
        </span>
      </div>
    );
  }

  if (isTool) {
    return (
      <div className="flex justify-center py-2">
        <Badge variant="outline" className="text-xs">
          Tool: {message.content}
        </Badge>
      </div>
    );
  }

  const toolCalls = message.toolCalls as Record<string, unknown> | undefined;
  const toolResults = message.toolResults as Record<string, unknown> | undefined;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (
        <Avatar className="size-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            AI
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={`flex max-w-[80%] flex-col gap-1 ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        {toolCalls && Object.keys(toolCalls).length > 0 && (
          <div className="text-xs text-muted-foreground">
            Tool call: {JSON.stringify(toolCalls)}
          </div>
        )}
        {toolResults && Object.keys(toolResults).length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Tool result</summary>
            <pre className="bg-muted mt-1 overflow-x-auto rounded p-2">
              {JSON.stringify(toolResults, null, 2)}
            </pre>
          </details>
        )}
        <span className="text-muted-foreground text-xs">
          {formatTime(message.createdAt)}
        </span>
      </div>
      {isUser && (
        <Avatar className="size-8 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
            U
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
          AI
        </AvatarFallback>
      </Avatar>
      <div className="bg-muted rounded-lg px-4 py-3">
        <div className="flex gap-1">
          <span className="bg-foreground/30 h-2 w-2 animate-bounce rounded-full [animation-delay:0ms]" />
          <span className="bg-foreground/30 h-2 w-2 animate-bounce rounded-full [animation-delay:150ms]" />
          <span className="bg-foreground/30 h-2 w-2 animate-bounce rounded-full [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

export { MessageBubble, TypingIndicator };
