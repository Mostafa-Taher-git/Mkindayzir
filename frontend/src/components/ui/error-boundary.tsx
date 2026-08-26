import * as React from "react";

interface Props {
  children: React.ReactNode;
  /** Label used in the fallback message to help locate the broken subtree. */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/runtime errors in its subtree so a single broken component
 * can never blank the entire application (the previous "everything gone"
 * symptom). Shows a recoverable message + a reset button instead.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", this.props.label ?? "app", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-lg font-bold text-critical">Something broke in {this.props.label ?? "this view"}.</div>
          <p className="max-w-md text-sm text-muted-foreground">
            The rest of the app is still running. You can reset this view or reload the page.
          </p>
          <pre className="max-w-md overflow-auto rounded border-2 border-outline bg-surface p-2 text-left text-xs">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2">
            <button
              className="rounded border-2 border-outline bg-surface px-3 py-1.5 text-sm underline"
              onClick={this.reset}
            >
              Reset view
            </button>
            <button
              className="rounded border-2 border-accent bg-accent px-3 py-1.5 text-sm text-background"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
