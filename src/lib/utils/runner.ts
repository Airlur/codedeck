export interface RunnerPayload {
  title: string;
  code: string;
}

export function createRunnerToken(): string {
  return `runner-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function openRunnerWindow(payload: RunnerPayload): void {
  const token = createRunnerToken();
  const nextWindow = window.open(`/runner.html?token=${encodeURIComponent(token)}`, '_blank');
  if (!nextWindow) return;

  const message = {
    type: 'CODEDECK_RUNNER_RENDER',
    token,
    title: payload.title,
    code: payload.code,
  };

  let retry = 0;
  const maxRetry = 20;

  const cleanup = () => {
    window.removeEventListener('message', onMessage);
    window.clearInterval(timer);
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== nextWindow) return;
    if (event.data?.type !== 'CODEDECK_RUNNER_ACK') return;
    if (event.data?.token !== token) return;
    cleanup();
  };

  window.addEventListener('message', onMessage);

  const timer = window.setInterval(() => {
    nextWindow.postMessage(message, '*');
    retry += 1;
    if (retry >= maxRetry) {
      cleanup();
    }
  }, 100);

  nextWindow.postMessage(message, '*');
}
