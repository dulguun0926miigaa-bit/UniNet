import { Component } from "react";

export default class AppErrorBoundary extends Component {
  state = { error: null };

  headingRef = null;

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("UniNet UI render failure", error, errorInfo);
  }

  componentDidUpdate(previousProps, previousState) {
    if (!previousState.error && this.state.error) {
      this.headingRef?.focus();
    }
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  retry = () => {
    this.setState({ error: null });
  };

  goHome = () => {
    if (this.props.onGoHome) {
      this.props.onGoHome();
      return;
    }
    window.location.assign("/");
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="font-body grid min-h-screen place-items-center bg-slate-50 px-5 py-12 text-slate-900">
        <section
          className="w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-7 shadow-xl md:p-10"
          role="alert"
          aria-labelledby="app-error-title"
        >
          <p className="text-xs font-bold uppercase tracking-wider text-rose-600">Системийн алдаа</p>
          <h1
            id="app-error-title"
            ref={(node) => { this.headingRef = node; }}
            tabIndex="-1"
            className="font-display mt-3 text-3xl font-bold leading-tight outline-none"
          >
            Энэ хэсгийг харуулахад алдаа гарлаа
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
            Түр зуурын алдаа байж болзошгүй. Дахин оролдох эсвэл аюулгүйгээр нүүр хуудас руу буцна уу.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.retry}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
            >
              Дахин оролдох
            </button>
            <button
              type="button"
              onClick={this.goHome}
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20"
            >
              Нүүр хуудас руу буцах
            </button>
          </div>
        </section>
      </main>
    );
  }
}
