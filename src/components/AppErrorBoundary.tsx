import React from "react";

interface State { error?: Error }

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    window.localStorage.setItem("hd.lastCrashReport", JSON.stringify({
      occurredAt: new Date().toISOString(),
      message: error.message,
      stack: error.stack ?? "",
      componentStack: info.componentStack ?? "",
    }));
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="fatal-error"><strong>Harness Designer를 계속 실행할 수 없습니다.</strong><p>{this.state.error.message}</p><span>환경설정의 저장 및 복구에서 마지막 오류 보고서를 확인할 수 있습니다.</span><button onClick={() => window.location.reload()}>앱 다시 불러오기</button></main>;
  }
}
