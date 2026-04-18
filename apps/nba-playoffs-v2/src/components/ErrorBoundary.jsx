import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("v2 render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="simple-shell">
          <strong>Something went wrong while loading this page.</strong>
          <p>{this.state.error?.message ?? "Unknown render error"}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
