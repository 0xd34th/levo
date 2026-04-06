const CLAIM_DATA_REFRESH_EVENT = 'levo:claim-data-refresh';

export function emitClaimDataRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CLAIM_DATA_REFRESH_EVENT));
}

export function subscribeClaimDataRefresh(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleEvent = () => listener();
  window.addEventListener(CLAIM_DATA_REFRESH_EVENT, handleEvent);

  return () => {
    window.removeEventListener(CLAIM_DATA_REFRESH_EVENT, handleEvent);
  };
}
