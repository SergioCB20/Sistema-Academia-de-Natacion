import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-50 p-4 font-sans text-red-900">
                    <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-red-100">
                        <div className="bg-red-500 p-6 text-white">
                            <h1 className="text-2xl font-bold">Algo salió mal (Application Crashed)</h1>
                            <p className="opacity-90 mt-1">Se ha detectado un error crítico que ha detenido la aplicación.</p>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="bg-red-50 border-l-4 border-red-500 p-4">
                                <h2 className="text-lg font-semibold text-red-700">Error:</h2>
                                <p className="font-mono text-sm mt-1 break-words">
                                    {this.state.error?.message || "Error desconocido"}
                                </p>
                            </div>

                            {this.state.errorInfo && (
                                <div className="mt-4">
                                    <h2 className="text-lg font-semibold text-slate-700 mb-2">Detalles Técnicos (Stack Trace):</h2>
                                    <div className="bg-slate-900 text-slate-200 p-4 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed h-64 overflow-y-auto">
                                        {this.state.errorInfo.componentStack}
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 border-t border-slate-100 flex justify-end">
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
                                >
                                    Recargar Página
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
