"use client";
import React from 'react';

interface QRErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class QRErrorBoundary extends React.Component<
  { children: React.ReactNode },
  QRErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): QRErrorBoundaryState {
    console.error("QR组件错误:", error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("QR错误边界捕获到错误:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center gap-2 text-red-500">
          <div className="text-xs">QR渲染失败</div>
          <button 
            className="text-xs underline"
            onClick={() => this.setState({ hasError: false })}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
