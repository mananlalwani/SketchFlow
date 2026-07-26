import React from 'react';
import { AppStatePage } from '@/components/AppStatePage';
import { reportError } from '@/lib/errorReporting';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  eventId?: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Report error to tracking service
    reportError(error, {
      componentStack: errorInfo.componentStack || undefined,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <AppStatePage kind="error" onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}
