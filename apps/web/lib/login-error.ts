// Lightweight pub/sub so any sign-in entry point can surface a failure to a
// single global banner, mirroring the window-event pattern in account-refresh.ts.
const LOGIN_ERROR_EVENT = 'levo:login-error';

export function emitLoginError(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>(LOGIN_ERROR_EVENT, { detail: message }));
}

export function subscribeLoginError(listener: (message: string) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleEvent = (event: Event) => listener((event as CustomEvent<string>).detail);
  window.addEventListener(LOGIN_ERROR_EVENT, handleEvent);

  return () => {
    window.removeEventListener(LOGIN_ERROR_EVENT, handleEvent);
  };
}
