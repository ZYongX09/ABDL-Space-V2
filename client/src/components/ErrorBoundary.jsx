import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="empty-state">
          <div className="icon"><i className="fa-solid fa-face-dizzy" /></div>
          <h3>出错了</h3>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-light)' }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            className="btn btn-primary mt-4"
            onClick={() => this.setState(prev => ({ hasError: false, error: null, retryKey: prev.retryKey + 1 }))}
          >
            重试
          </button>
        </div>
      );
    }
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}
