import { Component, type ReactNode } from "react";
import { Button } from "@/shared/view/components/ui/button";
import { useAppStore } from "@/stores/useAppStore";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ModeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[SIM-03] 模式组件崩溃", error, info.componentStack);
    useAppStore.getState().updateDebugInfo({
      errors: [...useAppStore.getState().debugInfo.errors, error.message],
    });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    useAppStore.getState().setMode("explore");
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-on-surface-variant">
          <p className="text-sm">当前模式加载失败</p>
          <p className="text-xs text-on-surface-variant/60 max-w-md text-center">
            {this.state.error?.message ?? "未知错误"}
          </p>
          <Button variant="secondary" size="sm" onClick={this.handleReset}>
            返回探索模式
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
