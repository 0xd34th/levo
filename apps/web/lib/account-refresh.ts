const ACCOUNT_DATA_REFRESH_EVENT = 'levo:account-data-refresh';

export function emitAccountDataRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ACCOUNT_DATA_REFRESH_EVENT));
}

export function subscribeAccountDataRefresh(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleEvent = () => listener();
  window.addEventListener(ACCOUNT_DATA_REFRESH_EVENT, handleEvent);

  return () => {
    window.removeEventListener(ACCOUNT_DATA_REFRESH_EVENT, handleEvent);
  };
}
